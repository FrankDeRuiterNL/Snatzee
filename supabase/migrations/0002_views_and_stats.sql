-- =====================================================================
-- Snatzee — derived statistics, views and leaderboard functions
-- Nothing derived is stored on profiles; everything is computed here.
-- =====================================================================

-- ---------------------------------------------------------------------
-- user_statistics — one row per profile with all derived numbers.
-- A FIRST_ROLL yahtzee event counts in BOTH yahtzee_count and
-- first_roll_yahtzee_count (single source row, no double bookkeeping).
--
-- Dropped rather than replaced: later migrations add columns to this
-- view, and CREATE OR REPLACE VIEW cannot remove them again. Without the
-- drop, re-running the migrations — which happens on every
-- `docker compose up` — would fail here. The cascade only reaches
-- get_user_statistics(), which this same file recreates below.
-- ---------------------------------------------------------------------
drop view if exists public.user_statistics cascade;

create view public.user_statistics as
select
  p.id                                         as user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  coalesce(s.games_played, 0)                  as games_played,
  coalesce(s.wins, 0)                          as wins,
  coalesce(s.games_played, 0) - coalesce(s.wins, 0) as losses,
  s.average_score,
  s.highest_score,
  s.lowest_score,
  s.last_played_at,
  coalesce(y.yahtzee_count, 0)                 as yahtzee_count,
  coalesce(y.first_roll_yahtzee_count, 0)      as first_roll_yahtzee_count,
  case
    when coalesce(s.games_played, 0) = 0 then 0
    else round((coalesce(s.wins, 0)::numeric * 100) / s.games_played, 1)
  end                                          as win_rate,
  coalesce(a.achievement_count, 0)             as achievement_count
from public.profiles p
left join lateral (
  select
    count(*)                        as games_played,
    count(*) filter (where is_win)  as wins,
    round(avg(score)::numeric, 1)   as average_score,
    max(score)                      as highest_score,
    min(score)                      as lowest_score,
    max(played_at)                  as last_played_at
  from public.score_entries se
  where se.user_id = p.id
) s on true
left join lateral (
  select
    count(*)                                            as yahtzee_count,
    count(*) filter (where event_type = 'FIRST_ROLL')   as first_roll_yahtzee_count
  from public.yahtzee_events ye
  where ye.user_id = p.id
) y on true
left join lateral (
  select count(*) as achievement_count
  from public.user_achievements ua
  where ua.user_id = p.id
) a on true;

-- ---------------------------------------------------------------------
-- public_score_entries — score rows without the private note field,
-- used for other people's profiles and charts.
-- ---------------------------------------------------------------------
create or replace view public.public_score_entries as
select id, user_id, score, is_win, played_at, created_at
from public.score_entries;

-- ---------------------------------------------------------------------
-- Streak helpers
-- ---------------------------------------------------------------------
create or replace function public.longest_win_streak(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with ordered as (
    select is_win, row_number() over (order by played_at, created_at) as rn
    from public.score_entries
    where user_id = p_user
  ),
  grouped as (
    select rn - row_number() over (order by rn) as grp
    from ordered
    where is_win
  )
  select coalesce(max(cnt), 0)::int
  from (select count(*) as cnt from grouped group by grp) t;
$$;

create or replace function public.longest_score_streak(p_user uuid, p_min_score integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with ordered as (
    select score, row_number() over (order by played_at, created_at) as rn
    from public.score_entries
    where user_id = p_user
  ),
  grouped as (
    select rn - row_number() over (order by rn) as grp
    from ordered
    where score >= p_min_score
  )
  select coalesce(max(cnt), 0)::int
  from (select count(*) as cnt from grouped group by grp) t;
$$;

-- ---------------------------------------------------------------------
-- Friend helpers
-- ---------------------------------------------------------------------
create or replace function public.friend_ids(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when requester_id = p_user then addressee_id else requester_id end
  from public.friendships
  where status = 'accepted'
    and (requester_id = p_user or addressee_id = p_user);
$$;

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = p_a and addressee_id = p_b)
        or (requester_id = p_b and addressee_id = p_a))
  );
$$;

create or replace function public.is_group_member(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group and user_id = p_user
  );
$$;

-- ---------------------------------------------------------------------
-- get_leaderboard
--   p_metric: highest_score | average_score | games_played | wins
--             | yahtzee_count | first_roll_yahtzee_count
--   p_scope:  global | friends | group
-- ---------------------------------------------------------------------
create or replace function public.get_leaderboard(
  p_metric   text default 'highest_score',
  p_scope    text default 'global',
  p_group_id uuid default null,
  p_limit    integer default 50
)
returns table (
  rank          bigint,
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  value         numeric,
  games_played  integer,
  is_current_user boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_min_games int := public.app_setting_int('min_games_for_average_ranking', 5);
  v_limit    int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if p_metric not in ('highest_score', 'average_score', 'games_played', 'wins',
                      'yahtzee_count', 'first_roll_yahtzee_count') then
    raise exception 'Unknown leaderboard metric: %', p_metric;
  end if;

  if p_scope = 'group' then
    if p_group_id is null then
      raise exception 'A group id is required for the group scope';
    end if;
    if v_me is null or not public.is_group_member(p_group_id, v_me) then
      raise exception 'Not a member of this group';
    end if;
  end if;

  return query
  with scoped as (
    select us.*
    from public.user_statistics us
    where
      case p_scope
        when 'friends' then
          v_me is not null
          and (us.user_id = v_me or us.user_id in (select public.friend_ids(v_me)))
        when 'group' then
          us.user_id in (select gm.user_id from public.group_members gm where gm.group_id = p_group_id)
        else true
      end
  ),
  valued as (
    select
      s.user_id, s.username, s.display_name, s.avatar_url, s.games_played,
      case p_metric
        when 'highest_score'            then s.highest_score::numeric
        when 'average_score'            then s.average_score
        when 'games_played'             then s.games_played::numeric
        when 'wins'                     then s.wins::numeric
        when 'yahtzee_count'            then s.yahtzee_count::numeric
        when 'first_roll_yahtzee_count' then s.first_roll_yahtzee_count::numeric
      end as value
    from scoped s
    where case
      when p_metric = 'average_score' then s.games_played >= v_min_games
      else true
    end
  ),
  ranked as (
    select
      rank() over (order by v.value desc, v.games_played desc, v.username asc) as rank,
      v.*
    from valued v
    where v.value is not null and v.value > 0
  )
  select
    r.rank,
    r.user_id,
    r.username,
    r.display_name,
    r.avatar_url,
    r.value,
    r.games_played::int,
    (r.user_id = v_me) as is_current_user
  from ranked r
  where r.rank <= v_limit or r.user_id = v_me
  order by r.rank;
end;
$$;

-- ---------------------------------------------------------------------
-- get_home_summary — everything the dashboard needs in one round-trip.
-- ---------------------------------------------------------------------
create or replace function public.get_home_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_stats    public.user_statistics%rowtype;
  v_this     numeric;
  v_prev     numeric;
  v_last10   numeric;
  v_pending  int;
  v_today    int;
begin
  if v_me is null then
    return null;
  end if;

  select * into v_stats from public.user_statistics where user_id = v_me;

  select round(avg(score), 1) into v_this
  from public.score_entries
  where user_id = v_me and played_at >= date_trunc('month', now());

  select round(avg(score), 1) into v_prev
  from public.score_entries
  where user_id = v_me
    and played_at >= date_trunc('month', now()) - interval '1 month'
    and played_at < date_trunc('month', now());

  select round(avg(score), 1) into v_last10
  from (
    select score from public.score_entries
    where user_id = v_me order by played_at desc, created_at desc limit 10
  ) t;

  select count(*) into v_pending
  from public.friendships
  where addressee_id = v_me and status = 'pending';

  select count(*) into v_today
  from public.score_entries
  where user_id = v_me and played_at >= date_trunc('day', now());

  return jsonb_build_object(
    'games_played',             coalesce(v_stats.games_played, 0),
    'wins',                     coalesce(v_stats.wins, 0),
    'win_rate',                 coalesce(v_stats.win_rate, 0),
    'average_score',            v_stats.average_score,
    'highest_score',            v_stats.highest_score,
    'lowest_score',             v_stats.lowest_score,
    'yahtzee_count',            coalesce(v_stats.yahtzee_count, 0),
    'first_roll_yahtzee_count', coalesce(v_stats.first_roll_yahtzee_count, 0),
    'achievement_count',        coalesce(v_stats.achievement_count, 0),
    'average_this_month',       v_this,
    'average_last_month',       v_prev,
    'average_last_10',          v_last10,
    'pending_friend_requests',  v_pending,
    'games_today',              v_today,
    'current_win_streak',       public.longest_win_streak(v_me)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- get_user_statistics — public stats for any profile by username.
-- ---------------------------------------------------------------------
create or replace function public.get_user_statistics(p_username text)
returns public.user_statistics
language sql
stable
security definer
set search_path = public
as $$
  select * from public.user_statistics where lower(username) = lower(p_username);
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant select on public.user_statistics to anon, authenticated;
grant select on public.public_score_entries to anon, authenticated;
grant execute on function public.get_leaderboard(text, text, uuid, integer) to authenticated;
grant execute on function public.get_home_summary() to authenticated;
grant execute on function public.get_user_statistics(text) to anon, authenticated;
grant execute on function public.app_setting_int(text, int) to anon, authenticated;
grant execute on function public.longest_win_streak(uuid) to authenticated;
grant execute on function public.longest_score_streak(uuid, integer) to authenticated;
grant execute on function public.friend_ids(uuid) to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
