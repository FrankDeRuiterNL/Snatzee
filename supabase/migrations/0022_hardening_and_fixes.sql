-- =====================================================================
-- Snatzee — hardening and fixes
--
--  1. Tables that already have a validating RPC are no longer writable
--     directly from the browser. The RLS policies only checked "is this
--     row mine", which let a client insert an already-accepted
--     friendship, join any group (even as owner) without its invite
--     code, or store a score the RPCs would have refused.
--  2. queue_notification() could be called by anyone through the API,
--     which meant pushing any text to any user's lock screen.
--  3. A private profile now hides its scores and achievements in the
--     API as well, not only on the profile page. Aggregate numbers stay
--     visible in the rankings, as the profile page already says.
--  4. Admins no longer read everyone's private notes through RLS; the
--     admin console goes through its own RPCs.
--  5. The Yahtzee bonus: 100 for every Yahtzee after the first, when the
--     Yahtzee box itself holds 50.
--  6. Taking the top score by editing a game notifies too.
--  7. The outbox retries a claim that never completed and prunes itself.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Writes go through the RPCs
-- ---------------------------------------------------------------------

-- friendships: send_friend_request / respond_friend_request / remove_friend
revoke insert, update on public.friendships from anon, authenticated;
drop policy if exists "friendships_insert_as_requester" on public.friendships;
drop policy if exists "friendships_update_as_addressee" on public.friendships;

-- group_members: create_group / join_group / add_group_members
revoke insert, update on public.group_members from anon, authenticated;
drop policy if exists "group_members_insert_self" on public.group_members;

-- groups: create_group
revoke insert, update on public.groups from anon, authenticated;
drop policy if exists "groups_insert_own" on public.groups;
drop policy if exists "groups_update_owner" on public.groups;

-- profiles: created by the signup trigger, never by a client
revoke insert on public.profiles from anon, authenticated;
drop policy if exists "profiles_insert_own" on public.profiles;

-- score_entries: record_score_entry / update_score_entry (delete stays)
revoke insert, update on public.score_entries from anon, authenticated;
drop policy if exists "score_entries_insert_own" on public.score_entries;
drop policy if exists "score_entries_update_own" on public.score_entries;

-- yahtzee_events: record_yahtzee (delete stays)
revoke insert, update on public.yahtzee_events from anon, authenticated;
drop policy if exists "yahtzee_events_insert_own" on public.yahtzee_events;

-- ---------------------------------------------------------------------
-- 2. Only triggers queue notifications
-- ---------------------------------------------------------------------
revoke execute on function public.queue_notification(
  uuid, public.notification_kind, text, text, text, jsonb
) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Private profiles
-- ---------------------------------------------------------------------

-- May the current viewer (possibly signed out) see this player's details?
-- Answers only about the viewer's own relation to them.
create or replace function public.can_view_details(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select not p.is_private from public.profiles p where p.id = p_user), true
  )
  or p_user = auth.uid()
  or (auth.uid() is not null and public.are_friends(auth.uid(), p_user));
$$;

grant execute on function public.can_view_details(uuid) to anon, authenticated;

create or replace view public.public_score_entries
with (security_invoker = off) as
select id, user_id, score, is_win, played_at, created_at
from public.score_entries
where public.can_view_details(user_id);

grant select on public.public_score_entries to anon, authenticated;

drop policy if exists "user_achievements_select_all" on public.user_achievements;
drop policy if exists "user_achievements_select_visible" on public.user_achievements;
create policy "user_achievements_select_visible" on public.user_achievements
  for select using (public.can_view_details(user_id));

-- ---------------------------------------------------------------------
-- 4. Admins moderate through RPCs, not by reading every row
-- ---------------------------------------------------------------------
drop policy if exists "score_entries_admin_all" on public.score_entries;
drop policy if exists "score_entries_admin_delete" on public.score_entries;

-- ---------------------------------------------------------------------
-- 5. The Yahtzee bonus
-- ---------------------------------------------------------------------

-- The sheet's total plus 100 for every Yahtzee after the first, when the
-- Yahtzee box (row 11) holds 50. The one-argument form stays: it is the
-- sheet on its own.
create or replace function public.sheet_total(p_sheet jsonb, p_yahtzees integer)
returns integer
language sql
immutable
as $$
  select public.sheet_total(p_sheet)
       + case
           when (p_sheet ->> 11)::int = 50
             then greatest(coalesce(p_yahtzees, 0) - 1, 0) * 100
           else 0
         end;
$$;

grant execute on function public.sheet_total(jsonb, integer) to anon, authenticated;

-- Games saved before the bonus was counted add up without it; both are
-- an honest reading of the same sheet.
alter table public.score_entries
  drop constraint if exists score_entries_sheet_matches_score;
alter table public.score_entries
  add constraint score_entries_sheet_matches_score
  check (
    sheet is null
    or public.sheet_total(sheet) = score
    or public.sheet_total(sheet, yahtzee_count) = score
  );

-- The RPCs check against the bonus-inclusive total.
create or replace function public.record_score_entry(
  p_score         integer,
  p_is_win        boolean default false,
  p_played_at     timestamptz default now(),
  p_note          text default null,
  p_yahtzee_count integer default 0,
  p_sheet         jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_min       int  := public.app_setting_int('min_score', 0);
  v_max       int  := public.app_setting_int('max_score', 1575);
  v_before    uuid[];
  v_entry     public.score_entries;
  v_prev_high int;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  if p_score is null or p_score < v_min or p_score > v_max then
    raise exception 'Score moet tussen % en % liggen', v_min, v_max using errcode = '22023';
  end if;
  if p_played_at > now() + interval '1 day' then
    raise exception 'Datum mag niet in de toekomst liggen' using errcode = '22023';
  end if;
  if coalesce(p_yahtzee_count, 0) < 0 then
    raise exception 'Aantal Yahtzees kan niet negatief zijn' using errcode = '22023';
  end if;
  if p_sheet is not null and not public.sheet_is_valid(p_sheet) then
    raise exception 'Scoreblad is niet geldig' using errcode = '22023';
  end if;
  if p_sheet is not null and public.sheet_total(p_sheet, p_yahtzee_count) <> p_score then
    raise exception 'Scoreblad telt op tot %, niet tot %',
      public.sheet_total(p_sheet, p_yahtzee_count), p_score using errcode = '22023';
  end if;

  select max(score) into v_prev_high from public.score_entries where user_id = v_me;
  v_before := array(select achievement_id from public.user_achievements where user_id = v_me);

  insert into public.score_entries (user_id, score, is_win, played_at, note, yahtzee_count, sheet)
  values (v_me, p_score, coalesce(p_is_win, false), coalesce(p_played_at, now()),
          nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_yahtzee_count, 0), p_sheet)
  returning * into v_entry;

  perform public.evaluate_achievements(v_me, v_entry.id);

  return jsonb_build_object(
    'entry',              to_jsonb(v_entry),
    'unlocked',           public.achievements_since(v_me, v_before),
    'is_personal_record', v_prev_high is null or p_score > v_prev_high
  );
end;
$$;

create or replace function public.update_score_entry(
  p_id            uuid,
  p_score         integer,
  p_is_win        boolean,
  p_played_at     timestamptz,
  p_note          text default null,
  p_yahtzee_count integer default 0,
  p_sheet         jsonb default null,
  p_clear_sheet   boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_min    int  := public.app_setting_int('min_score', 0);
  v_max    int  := public.app_setting_int('max_score', 1575);
  v_before uuid[];
  v_entry  public.score_entries;
  v_kept   jsonb;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  if p_score is null or p_score < v_min or p_score > v_max then
    raise exception 'Score moet tussen % en % liggen', v_min, v_max using errcode = '22023';
  end if;
  if coalesce(p_yahtzee_count, 0) < 0 then
    raise exception 'Aantal Yahtzees kan niet negatief zijn' using errcode = '22023';
  end if;
  if p_sheet is not null and not public.sheet_is_valid(p_sheet) then
    raise exception 'Scoreblad is niet geldig' using errcode = '22023';
  end if;
  if p_sheet is not null and public.sheet_total(p_sheet, p_yahtzee_count) <> p_score then
    raise exception 'Scoreblad telt op tot %, niet tot %',
      public.sheet_total(p_sheet, p_yahtzee_count), p_score using errcode = '22023';
  end if;

  -- Het blad dat blijft staan moet ook op de nieuwe score uitkomen.
  if p_sheet is null and not coalesce(p_clear_sheet, false) then
    select sheet into v_kept from public.score_entries where id = p_id and user_id = v_me;
    if v_kept is not null and public.sheet_total(v_kept, p_yahtzee_count) <> p_score then
      raise exception 'Het bewaarde scoreblad telt op tot %, niet tot %',
        public.sheet_total(v_kept, p_yahtzee_count), p_score using errcode = '22023';
    end if;
  end if;

  v_before := array(select achievement_id from public.user_achievements where user_id = v_me);

  update public.score_entries
  set score         = p_score,
      is_win        = coalesce(p_is_win, false),
      played_at     = coalesce(p_played_at, played_at),
      note          = nullif(btrim(coalesce(p_note, '')), ''),
      yahtzee_count = coalesce(p_yahtzee_count, 0),
      -- Meegestuurd blad vervangt het oude; niets meesturen laat het
      -- staan, zodat een oude app een blad niet per ongeluk wist. Een
      -- blad weghalen is daarom iets wat je expliciet vraagt — nodig
      -- wanneer iemand een gescand potje daarna met de hand op een
      -- andere eindscore zet, want dan klopt het bewaarde blad niet meer.
      sheet         = case
                        when coalesce(p_clear_sheet, false) then null
                        else coalesce(p_sheet, sheet)
                      end
  where id = p_id and user_id = v_me
  returning * into v_entry;

  if not found then
    raise exception 'Potje niet gevonden' using errcode = 'P0002';
  end if;

  perform public.evaluate_achievements(v_me, v_entry.id);

  return jsonb_build_object(
    'entry',    to_jsonb(v_entry),
    'unlocked', public.achievements_since(v_me, v_before)
  );
end;
$$;

grant execute on function public.record_score_entry(integer, boolean, timestamptz, text, integer, jsonb) to authenticated;
grant execute on function public.update_score_entry(uuid, integer, boolean, timestamptz, text, integer, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Taking the top score, by a new game or by editing one
-- ---------------------------------------------------------------------
create or replace function public.notify_lost_top_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_user  uuid;
  v_prev_score int;
  v_name       text;
begin
  if tg_op = 'UPDATE' and new.score <= old.score then
    return null;
  end if;

  -- Who holds the top score as things stood before this entry. Ties keep
  -- the incumbent: whoever reached the score first holds it.
  select se.user_id, se.score
  into v_prev_user, v_prev_score
  from public.score_entries se
  where se.id <> new.id
  order by se.score desc, se.played_at asc, se.created_at asc
  limit 1;

  if v_prev_user is null or v_prev_user = new.user_id then
    return null;
  end if;

  -- Only an outright pass takes the crown.
  if new.score <= v_prev_score then
    return null;
  end if;

  -- An edited game that was already on top took nothing from anyone.
  if tg_op = 'UPDATE' and old.score > v_prev_score then
    return null;
  end if;

  select display_name into v_name from public.profiles where id = new.user_id;

  perform public.queue_notification(
    v_prev_user,
    'LOST_TOP_SCORE',
    'Je toppositie is overgenomen',
    coalesce(v_name, 'Iemand') || ' scoorde ' || new.score || ' en staat nu bovenaan.',
    '/app/rankings',
    jsonb_build_object('score', new.score, 'by_user_id', new.user_id)
  );

  return null;
end;
$$;

drop trigger if exists score_entries_notify on public.score_entries;
create trigger score_entries_notify
  after insert or update of score on public.score_entries
  for each row execute function public.notify_lost_top_score();

-- ---------------------------------------------------------------------
-- 7. Outbox: retry what never completed, forget what is old
-- ---------------------------------------------------------------------
alter table public.notification_outbox
  add column if not exists attempts integer not null default 0;

create or replace function public.claim_notifications(p_limit integer default 50)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  -- A month of history is plenty to see what went out.
  delete from public.notification_outbox
  where created_at < now() - interval '30 days';

  return query
  update public.notification_outbox o
  set claimed_at = now(),
      attempts   = o.attempts + 1
  where o.id in (
    select id
    from public.notification_outbox
    where (
            claimed_at is null
            -- Claimed by a sender that died before completing it.
            or (sent_at is null and error is null
                and claimed_at < now() - interval '10 minutes'
                and attempts < 3)
          )
      -- Stale news is not worth a late push.
      and created_at > now() - interval '1 day'
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  )
  returning o.*;
end;
$$;

grant execute on function public.claim_notifications(integer) to service_role;
grant delete on public.notification_outbox to service_role;

notify pgrst, 'reload schema';
