-- =====================================================================
-- Snatzee — friend-request badge and group score notifications
-- =====================================================================

-- A new kind for scores shared with a group.
--
-- Deliberately its own statement: ALTER TYPE ... ADD VALUE commits on its
-- own under psql's autocommit, which is what lets the functions below
-- reference the new label in the same file. Do not wrap this migration in
-- an explicit transaction.
alter type public.notification_kind add value if not exists 'GROUP_SCORE';

-- ---------------------------------------------------------------------
-- The friend-request notification now opens the Verzoeken tab.
--
-- /app/friends landed on the friends list, so someone who tapped the
-- notification still had to find the tab that prompted it.
-- ---------------------------------------------------------------------
create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.status <> 'pending' then
    return null;
  end if;

  select display_name into v_name from public.profiles where id = new.requester_id;

  perform public.queue_notification(
    new.addressee_id,
    'FRIEND_REQUEST',
    'Nieuw vriendschapsverzoek',
    coalesce(v_name, 'Iemand') || ' wil je vriend worden op Snatzee.',
    '/app/friends?tab=requests',
    jsonb_build_object('requester_id', new.requester_id)
  );

  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- How many requests are waiting on me.
--
-- Feeds the badge on the Vrienden tab, so it is called on every page and
-- kept as cheap as possible.
-- ---------------------------------------------------------------------
create or replace function public.pending_friend_request_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.friendships
  where addressee_id = auth.uid()
    and status = 'pending';
$$;

grant execute on function public.pending_friend_request_count() to authenticated;

-- ---------------------------------------------------------------------
-- A group member registered a score.
--
-- One notification per shared group rather than one per person: the
-- ranking position is only meaningful within a group, so someone who
-- shares two groups with the scorer genuinely gets two different facts.
--
-- Rank is by best score within the group, which is the ranking a score
-- entry actually moves.
-- ---------------------------------------------------------------------
create or replace function public.notify_group_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text;
  v_group   record;
  v_rank    integer;
  v_members integer;
  v_body    text;
  v_extra   text;
begin
  select display_name into v_name from public.profiles where id = new.user_id;

  for v_group in
    select g.id, g.name, g.emoji
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.user_id = new.user_id
  loop
    -- Where the scorer now stands among everyone in this group who has
    -- ever registered a score.
    select r.position, r.total
    into v_rank, v_members
    from (
      select
        member.user_id,
        rank() over (order by member.best desc) as position,
        count(*) over () as total
      from (
        select gm.user_id, max(se.score) as best
        from public.group_members gm
        join public.score_entries se on se.user_id = gm.user_id
        where gm.group_id = v_group.id
        group by gm.user_id
      ) member
    ) r
    where r.user_id = new.user_id;

    -- Won, Yahtzees — only mentioned when there is something to mention.
    v_extra := '';
    if new.is_win then
      v_extra := v_extra || ' · gewonnen';
    end if;
    if coalesce(new.yahtzee_count, 0) > 0 then
      v_extra := v_extra || ' · ' || new.yahtzee_count || '× Yahtzee';
    end if;

    v_body := coalesce(v_name, 'Iemand') || ' scoorde ' || new.score || ' punten' || v_extra;

    if v_rank is not null then
      v_body := v_body || ' · nu #' || v_rank || ' van ' || v_members;
    end if;

    -- Everyone else in the group. queue_notification drops the ones with
    -- no device registered, so this does not fill the outbox with rows
    -- that could never be delivered.
    perform public.queue_notification(
      gm.user_id,
      'GROUP_SCORE',
      coalesce(v_group.emoji || ' ', '') || v_group.name,
      v_body,
      '/app/groups/' || v_group.id,
      jsonb_build_object(
        'group_id', v_group.id,
        'user_id', new.user_id,
        'score', new.score,
        'is_win', new.is_win,
        'yahtzee_count', coalesce(new.yahtzee_count, 0),
        'rank', v_rank
      )
    )
    from public.group_members gm
    where gm.group_id = v_group.id
      and gm.user_id <> new.user_id;
  end loop;

  return null;
end;
$$;

drop trigger if exists score_entries_notify_group on public.score_entries;
create trigger score_entries_notify_group
  after insert on public.score_entries
  for each row execute function public.notify_group_score();

notify pgrst, 'reload schema';
