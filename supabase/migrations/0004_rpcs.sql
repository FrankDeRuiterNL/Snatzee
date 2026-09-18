-- =====================================================================
-- Snatzee — server-side mutation RPCs
-- All validation lives here so the client can never be the only guard.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: achievements unlocked since a snapshot
-- ---------------------------------------------------------------------
create or replace function public.achievements_since(p_user uuid, p_before uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('unlocked_at', ua.unlocked_at)), '[]'::jsonb)
  from public.user_achievements ua
  join public.achievements a on a.id = ua.achievement_id
  where ua.user_id = p_user
    and not (ua.achievement_id = any(coalesce(p_before, array[]::uuid[])));
$$;

-- ---------------------------------------------------------------------
-- Onboarding / profile
-- ---------------------------------------------------------------------
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(btrim(p_username)) ~ '^[a-z0-9_]{3,20}$'
     and not exists (
       select 1 from public.profiles where lower(username) = lower(btrim(p_username))
     );
$$;

create or replace function public.complete_onboarding(
  p_username     text,
  p_display_name text,
  p_avatar_url   text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_un  text := lower(btrim(p_username));
  v_row public.profiles;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  if v_un !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Ongeldige username: gebruik 3-20 tekens (a-z, 0-9, _)' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where lower(username) = v_un and id <> v_me) then
    raise exception 'Deze username is al bezet' using errcode = '23505';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) = 0 then
    raise exception 'Vul een weergavenaam in' using errcode = '22023';
  end if;

  update public.profiles
  set username             = v_un,
      display_name         = substr(btrim(p_display_name), 1, 40),
      avatar_url           = coalesce(nullif(btrim(p_avatar_url), ''), avatar_url),
      onboarding_completed = true
  where id = v_me
  returning * into v_row;

  perform public.evaluate_achievements(v_me);
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- Score entries
-- ---------------------------------------------------------------------
create or replace function public.record_score_entry(
  p_score     integer,
  p_is_win    boolean default false,
  p_played_at timestamptz default now(),
  p_note      text default null
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

  select max(score) into v_prev_high from public.score_entries where user_id = v_me;
  v_before := array(select achievement_id from public.user_achievements where user_id = v_me);

  insert into public.score_entries (user_id, score, is_win, played_at, note)
  values (v_me, p_score, coalesce(p_is_win, false), coalesce(p_played_at, now()),
          nullif(btrim(coalesce(p_note, '')), ''))
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
  p_id        uuid,
  p_score     integer,
  p_is_win    boolean,
  p_played_at timestamptz,
  p_note      text default null
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
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  if p_score is null or p_score < v_min or p_score > v_max then
    raise exception 'Score moet tussen % en % liggen', v_min, v_max using errcode = '22023';
  end if;

  v_before := array(select achievement_id from public.user_achievements where user_id = v_me);

  update public.score_entries
  set score     = p_score,
      is_win    = coalesce(p_is_win, false),
      played_at = coalesce(p_played_at, played_at),
      note      = nullif(btrim(coalesce(p_note, '')), '')
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

-- ---------------------------------------------------------------------
-- Yahtzee events
-- ---------------------------------------------------------------------
create or replace function public.record_yahtzee(
  p_event_type public.yahtzee_event_type default 'NORMAL'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_before   uuid[];
  v_event    public.yahtzee_events;
  v_total    int;
  v_first    int;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;

  v_before := array(select achievement_id from public.user_achievements where user_id = v_me);

  insert into public.yahtzee_events (user_id, event_type)
  values (v_me, coalesce(p_event_type, 'NORMAL'))
  returning * into v_event;

  perform public.evaluate_achievements(v_me, v_event.id);

  select count(*), count(*) filter (where event_type = 'FIRST_ROLL')
  into v_total, v_first
  from public.yahtzee_events where user_id = v_me;

  return jsonb_build_object(
    'event',                    to_jsonb(v_event),
    'yahtzee_count',            v_total,
    'first_roll_yahtzee_count', v_first,
    'unlocked',                 public.achievements_since(v_me, v_before)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------
create or replace function public.send_friend_request(p_user_id uuid)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_existing public.friendships;
  v_row      public.friendships;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  if p_user_id = v_me then
    raise exception 'Je kunt jezelf geen vriendverzoek sturen' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Gebruiker niet gevonden' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.friendships
  where (requester_id = v_me and addressee_id = p_user_id)
     or (requester_id = p_user_id and addressee_id = v_me);

  if found then
    if v_existing.status = 'accepted' then
      return v_existing;
    end if;
    -- Re-open a pending/declined request from the current user's side.
    update public.friendships
    set requester_id = v_me,
        addressee_id = p_user_id,
        status       = case when v_existing.addressee_id = v_me and v_existing.status = 'pending'
                            then 'accepted'::public.friendship_status
                            else 'pending'::public.friendship_status end
    where id = v_existing.id
    returning * into v_row;
    return v_row;
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (v_me, p_user_id, 'pending')
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.respond_friend_request(p_id uuid, p_accept boolean)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.friendships;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;

  update public.friendships
  set status = case when p_accept then 'accepted'::public.friendship_status
                    else 'declined'::public.friendship_status end
  where id = p_id and addressee_id = v_me and status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'Verzoek niet gevonden' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

create or replace function public.remove_friend(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  delete from public.friendships
  where (requester_id = v_me and addressee_id = p_user_id)
     or (requester_id = p_user_id and addressee_id = v_me);
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- search_users — username/display name search with relationship state
-- ---------------------------------------------------------------------
create or replace function public.search_users(p_query text, p_limit integer default 20)
returns table (
  id                uuid,
  username          text,
  display_name      text,
  avatar_url        text,
  games_played      integer,
  friendship_status text,
  friendship_id     uuid,
  is_incoming       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(us.games_played, 0)::int,
    f.status::text,
    f.id,
    (f.addressee_id = auth.uid())
  from public.profiles p
  left join public.user_statistics us on us.user_id = p.id
  left join public.friendships f
    on (f.requester_id = auth.uid() and f.addressee_id = p.id)
    or (f.addressee_id = auth.uid() and f.requester_id = p.id)
  where p.id <> auth.uid()
    and p.onboarding_completed
    and (
      p.username ilike '%' || btrim(coalesce(p_query, '')) || '%'
      or p.display_name ilike '%' || btrim(coalesce(p_query, '')) || '%'
    )
  order by
    (lower(p.username) = lower(btrim(coalesce(p_query, '')))) desc,
    coalesce(us.games_played, 0) desc,
    p.username
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------
create or replace function public.create_group(
  p_name        text,
  p_emoji       text default '🎲',
  p_description text default null,
  p_image_url   text default null
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.groups;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'Groepsnaam moet minimaal 2 tekens zijn' using errcode = '22023';
  end if;

  insert into public.groups (owner_id, name, emoji, description, image_url)
  values (v_me, btrim(p_name), coalesce(nullif(btrim(coalesce(p_emoji, '')), ''), '🎲'),
          nullif(btrim(coalesce(p_description, '')), ''),
          nullif(btrim(coalesce(p_image_url, '')), ''))
  returning * into v_row;

  insert into public.group_members (group_id, user_id, role)
  values (v_row.id, v_me, 'owner');

  return v_row;
end;
$$;

create or replace function public.join_group(p_invite_code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.groups;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;

  select * into v_row from public.groups where upper(invite_code) = upper(btrim(p_invite_code));
  if not found then
    raise exception 'Geen groep gevonden met deze code' using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_row.id, v_me, 'member')
  on conflict (group_id, user_id) do nothing;

  return v_row;
end;
$$;

create or replace function public.add_group_members(p_group_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_count int := 0;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_me and role in ('owner', 'admin')
  ) then
    raise exception 'Alleen beheerders kunnen leden toevoegen' using errcode = '42501';
  end if;

  insert into public.group_members (group_id, user_id, role)
  select p_group_id, u, 'member'
  from unnest(coalesce(p_user_ids, array[]::uuid[])) u
  where exists (select 1 from public.profiles pr where pr.id = u)
  on conflict (group_id, user_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_owner uuid;
  v_next  uuid;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;

  select owner_id into v_owner from public.groups where id = p_group_id;
  if not found then
    raise exception 'Groep niet gevonden' using errcode = 'P0002';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = v_me;

  if v_owner = v_me then
    select user_id into v_next
    from public.group_members
    where group_id = p_group_id
    order by case when role = 'admin' then 0 else 1 end, joined_at
    limit 1;

    if v_next is null then
      delete from public.groups where id = p_group_id;
    else
      update public.groups set owner_id = v_next where id = p_group_id;
      update public.group_members set role = 'owner' where group_id = p_group_id and user_id = v_next;
    end if;
  end if;

  return true;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.groups where id = p_group_id and owner_id = v_me
  ) then
    raise exception 'Alleen de eigenaar kan leden verwijderen' using errcode = '42501';
  end if;
  if p_user_id = v_me then
    raise exception 'Gebruik "groep verlaten" om jezelf te verwijderen' using errcode = '22023';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- Account deletion — removes the auth user, everything cascades.
-- ---------------------------------------------------------------------
create or replace function public.delete_own_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  delete from auth.users where id = v_me;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant execute on function public.achievements_since(uuid, uuid[]) to authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.complete_onboarding(text, text, text) to authenticated;
grant execute on function public.record_score_entry(integer, boolean, timestamptz, text) to authenticated;
grant execute on function public.update_score_entry(uuid, integer, boolean, timestamptz, text) to authenticated;
grant execute on function public.record_yahtzee(public.yahtzee_event_type) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.search_users(text, integer) to authenticated;
grant execute on function public.create_group(text, text, text, text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.delete_own_account() to authenticated;
