-- =====================================================================
-- Snatzee — achievements follow the data back down
--
-- Deleting a score or a 1-worp Yahtzee used to leave every achievement it
-- unlocked in place, so an admin correcting a mistake left the player with
-- a badge the remaining data no longer supports.
--
-- The criteria used to live inside evaluate_achievements, which only ever
-- looked at achievements the player did NOT have. Pulling the rules into
-- their own function lets the same logic answer the opposite question, so
-- unlocking and revoking can never drift apart.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Does this player currently satisfy these criteria?
--
-- Every rule is derived from data that still exists, so this is a true
-- re-computation rather than a log of what once happened.
-- ---------------------------------------------------------------------
create or replace function public.achievement_is_earned(p_user uuid, p_criteria jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_stats public.user_statistics%rowtype;
  v_type  text;
  v_ok    boolean := false;
  v_tmp   int;
begin
  if p_user is null or p_criteria is null then
    return false;
  end if;

  select * into v_stats from public.user_statistics where user_id = p_user;
  if not found then
    return false;
  end if;

  v_type := p_criteria ->> 'type';

  case v_type
    when 'games_played' then
      v_ok := v_stats.games_played >= (p_criteria ->> 'gte')::int;

    when 'wins' then
      v_ok := v_stats.wins >= (p_criteria ->> 'gte')::int;

    when 'highest_score' then
      v_ok := coalesce(v_stats.highest_score, -1) >= (p_criteria ->> 'gte')::int;

    when 'low_score' then
      v_ok := v_stats.lowest_score is not null
          and v_stats.lowest_score <= (p_criteria ->> 'lte')::int;

    when 'yahtzee_count' then
      v_ok := v_stats.yahtzee_count >= (p_criteria ->> 'gte')::int;

    when 'first_roll_count' then
      v_ok := v_stats.first_roll_yahtzee_count >= (p_criteria ->> 'gte')::int;

    when 'win_streak' then
      v_ok := public.longest_win_streak(p_user) >= (p_criteria ->> 'gte')::int;

    when 'score_streak' then
      v_ok := public.longest_score_streak(p_user, (p_criteria ->> 'min_score')::int)
              >= (p_criteria ->> 'gte')::int;

    when 'win_rate' then
      v_ok := v_stats.games_played >= coalesce((p_criteria ->> 'min_games')::int, 1)
          and v_stats.win_rate >= (p_criteria ->> 'gte')::numeric;

    when 'games_in_day' then
      select coalesce(max(c), 0) into v_tmp
      from (
        select count(*) as c
        from public.score_entries
        where user_id = p_user
        group by date_trunc('day', played_at at time zone 'Europe/Amsterdam')
      ) t;
      v_ok := v_tmp >= (p_criteria ->> 'gte')::int;

    when 'distinct_days' then
      select count(distinct date_trunc('day', played_at at time zone 'Europe/Amsterdam'))
      into v_tmp
      from public.score_entries where user_id = p_user;
      v_ok := v_tmp >= (p_criteria ->> 'gte')::int;

    when 'yahtzee_in_day' then
      -- Yahtzees are recorded per game now, so a day's tally is the sum
      -- across that day's games rather than a count of events.
      select coalesce(max(c), 0) into v_tmp
      from (
        select sum(yahtzee_count)::int as c
        from public.score_entries
        where user_id = p_user
        group by date_trunc('day', played_at at time zone 'Europe/Amsterdam')
      ) t;
      v_ok := v_tmp >= (p_criteria ->> 'gte')::int;

    when 'night_game' then
      v_ok := exists (
        select 1 from public.score_entries
        where user_id = p_user
          and extract(hour from (played_at at time zone 'Europe/Amsterdam'))
              between coalesce((p_criteria ->> 'from_hour')::int, 0)
                  and coalesce((p_criteria ->> 'to_hour')::int, 5)
      );

    when 'exact_score' then
      v_ok := exists (
        select 1 from public.score_entries
        where user_id = p_user and score = (p_criteria ->> 'value')::int
      );

    when 'notes_count' then
      select count(*) into v_tmp
      from public.score_entries
      where user_id = p_user and note is not null and char_length(btrim(note)) > 0;
      v_ok := v_tmp >= (p_criteria ->> 'gte')::int;

    when 'friends_count' then
      select count(*) into v_tmp from public.friend_ids(p_user);
      v_ok := v_tmp >= (p_criteria ->> 'gte')::int;

    when 'groups_count' then
      select count(*) into v_tmp from public.group_members where user_id = p_user;
      v_ok := v_tmp >= (p_criteria ->> 'gte')::int;

    when 'comeback' then
      v_ok := exists (
        select 1 from (
          select score, lag(score) over (order by played_at, created_at) as prev
          from public.score_entries where user_id = p_user
        ) t
        where t.prev is not null
          and t.prev <= (p_criteria ->> 'low')::int
          and t.score >= (p_criteria ->> 'high')::int
      );

    else
      v_ok := false;
  end case;
  return coalesce(v_ok, false);
end;
$$;

-- ---------------------------------------------------------------------
-- evaluate_achievements, now delegating the rules.
--
-- Same contract as before: unlock what is newly earned and return the
-- ids, so the callers that celebrate new unlocks keep working.
-- ---------------------------------------------------------------------
create or replace function public.evaluate_achievements(p_user uuid, p_source uuid default null)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
begin
  if p_user is null then
    return;
  end if;

  for v_rec in
    select a.*
    from public.achievements a
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user and ua.achievement_id = a.id
    )
  loop
    if public.achievement_is_earned(p_user, v_rec.criteria) then
      insert into public.user_achievements (user_id, achievement_id, source_id)
      values (p_user, v_rec.id, p_source)
      on conflict (user_id, achievement_id) do nothing;
      return next v_rec.id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Take back what the remaining data no longer supports.
--
-- Returns the ids that were revoked, so a caller can report on it.
-- ---------------------------------------------------------------------
create or replace function public.revoke_stale_achievements(p_user uuid)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
begin
  if p_user is null then
    return;
  end if;

  for v_rec in
    select a.id, a.criteria
    from public.user_achievements ua
    join public.achievements a on a.id = ua.achievement_id
    where ua.user_id = p_user
  loop
    if not public.achievement_is_earned(p_user, v_rec.criteria) then
      delete from public.user_achievements
      where user_id = p_user and achievement_id = v_rec.id;
      return next v_rec.id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Keep the two in step on every data change.
--
-- The existing safety-net trigger only ever unlocked. Revoking first and
-- then evaluating means a delete that invalidates one achievement and a
-- correction that earns another both land in a single pass.
-- ---------------------------------------------------------------------
create or replace function public.trigger_evaluate_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  v_user := coalesce(
    case when tg_op = 'DELETE' then null else (to_jsonb(new) ->> 'user_id')::uuid end,
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'user_id')::uuid else null end
  );

  if v_user is not null then
    -- Only a removal can invalidate something, so the extra pass is
    -- skipped on the far more common insert.
    if tg_op in ('DELETE', 'UPDATE') then
      perform public.revoke_stale_achievements(v_user);
    end if;
    perform public.evaluate_achievements(v_user);
  end if;

  return null;
end;
$$;

-- yahtzee_events was missing UPDATE, so an event edited rather than
-- deleted never re-evaluated at all.
drop trigger if exists yahtzee_events_achievements on public.yahtzee_events;
create trigger yahtzee_events_achievements
  after insert or update or delete on public.yahtzee_events
  for each row execute function public.trigger_evaluate_achievements();

-- group_members likewise only fired on insert, so leaving a group left a
-- groups_count achievement standing.
drop trigger if exists group_members_achievements on public.group_members;
create trigger group_members_achievements
  after insert or delete on public.group_members
  for each row execute function public.trigger_evaluate_achievements();

drop trigger if exists friendships_achievements on public.friendships;
create trigger friendships_achievements
  after insert or update or delete on public.friendships
  for each row execute function public.trigger_evaluate_achievements();

grant execute on function public.achievement_is_earned(uuid, jsonb) to authenticated;
grant execute on function public.evaluate_achievements(uuid, uuid) to authenticated;
grant execute on function public.revoke_stale_achievements(uuid) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- Admin deletes record what they cost the player
--
-- The trigger above already revokes; these rewrites exist so the audit
-- log says which achievements a correction took away. Without that the
-- log shows a score disappearing and a player quietly losing a badge,
-- with nothing tying the two together.
-- =====================================================================

create or replace function public.admin_delete_score_entry(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_row     public.score_entries;
  v_before  uuid[];
  v_revoked text[];
  v_log_id  uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  select * into v_row from public.score_entries where id = p_id;
  if not found then
    return false;
  end if;

  select coalesce(array_agg(achievement_id), array[]::uuid[])
  into v_before
  from public.user_achievements
  where user_id = v_row.user_id;

  insert into public.admin_audit_log
    (admin_user_id, action, target_user_id, entity_type, entity_id, metadata)
  values (
    v_me, 'DELETE_SCORE', v_row.user_id, 'score_entry', v_row.id,
    jsonb_build_object(
      'score', v_row.score,
      'is_win', v_row.is_win,
      'yahtzee_count', v_row.yahtzee_count,
      'played_at', v_row.played_at
    )
  )
  returning id into v_log_id;

  -- The delete trigger revokes and re-evaluates before this returns.
  delete from public.score_entries where id = p_id;

  select coalesce(array_agg(a.name order by a.name), array[]::text[])
  into v_revoked
  from public.achievements a
  where a.id = any(v_before)
    and not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = v_row.user_id and ua.achievement_id = a.id
    );

  if array_length(v_revoked, 1) > 0 then
    update public.admin_audit_log
    set metadata = metadata || jsonb_build_object('revoked_achievements', to_jsonb(v_revoked))
    where id = v_log_id;
  end if;

  return true;
end;
$$;

create or replace function public.admin_delete_first_roll_yahtzee(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_row     public.yahtzee_events;
  v_before  uuid[];
  v_revoked text[];
  v_log_id  uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  select * into v_row
  from public.yahtzee_events
  where id = p_id and event_type = 'FIRST_ROLL';
  if not found then
    return false;
  end if;

  select coalesce(array_agg(achievement_id), array[]::uuid[])
  into v_before
  from public.user_achievements
  where user_id = v_row.user_id;

  insert into public.admin_audit_log
    (admin_user_id, action, target_user_id, entity_type, entity_id, metadata)
  values (
    v_me, 'DELETE_FIRST_ROLL', v_row.user_id, 'yahtzee_event', v_row.id,
    jsonb_build_object('created_at', v_row.created_at)
  )
  returning id into v_log_id;

  delete from public.yahtzee_events where id = p_id;

  select coalesce(array_agg(a.name order by a.name), array[]::text[])
  into v_revoked
  from public.achievements a
  where a.id = any(v_before)
    and not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = v_row.user_id and ua.achievement_id = a.id
    );

  if array_length(v_revoked, 1) > 0 then
    update public.admin_audit_log
    set metadata = metadata || jsonb_build_object('revoked_achievements', to_jsonb(v_revoked))
    where id = v_log_id;
  end if;

  return true;
end;
$$;

grant execute on function public.admin_delete_score_entry(uuid) to authenticated;
grant execute on function public.admin_delete_first_roll_yahtzee(uuid) to authenticated;

notify pgrst, 'reload schema';
