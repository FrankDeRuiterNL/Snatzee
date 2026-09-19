-- =====================================================================
-- Snatzee — normal Yahtzees move onto the score entry
--
-- A normal Yahtzee is now something you report as part of a finished
-- game ("I scored 312 and threw 2 Yahtzees"), not a standalone event.
-- A Yahtzee thrown on the first roll stays a standalone event, because
-- it is registered the moment it happens rather than afterwards.
--
--   total Yahtzees          = sum(score_entries.yahtzee_count)
--   first-roll Yahtzees     = count(yahtzee_events where FIRST_ROLL)
--
-- These two are deliberately independent: a first-roll Yahtzee is not
-- added to the per-game total, because the player already counts it
-- themselves when they enter the game's result.
-- =====================================================================

alter table public.score_entries
  add column if not exists yahtzee_count integer not null default 0;

do $$ begin
  alter table public.score_entries
    add constraint score_entries_yahtzee_count_check check (yahtzee_count >= 0);
exception when duplicate_object then null; end $$;

create index if not exists score_entries_user_yahtzee_idx
  on public.score_entries (user_id)
  where yahtzee_count > 0;

-- ---------------------------------------------------------------------
-- Migrate the existing NORMAL events onto score entries.
--
-- Each event is attached to that player's game closest in time, which is
-- the best available guess now that the link was never recorded. Events
-- belonging to a player with no games at all cannot be placed anywhere,
-- so they are left untouched and still counted by the view below —
-- nothing is thrown away.
-- ---------------------------------------------------------------------
with placed as (
  select
    ye.id as event_id,
    (
      select se.id
      from public.score_entries se
      where se.user_id = ye.user_id
      order by abs(extract(epoch from (se.played_at - ye.created_at)))
      limit 1
    ) as entry_id
  from public.yahtzee_events ye
  where ye.event_type = 'NORMAL'
),
tallied as (
  select entry_id, count(*)::int as extra
  from placed
  where entry_id is not null
  group by entry_id
)
update public.score_entries se
set yahtzee_count = se.yahtzee_count + t.extra
from tallied t
where se.id = t.entry_id;

delete from public.yahtzee_events ye
where ye.event_type = 'NORMAL'
  and exists (select 1 from public.score_entries se where se.user_id = ye.user_id);

-- ---------------------------------------------------------------------
-- user_statistics
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
  -- Per-game totals, plus any legacy event that could not be placed.
  coalesce(s.yahtzee_total, 0) + coalesce(y.legacy_normal_count, 0) as yahtzee_count,
  coalesce(y.first_roll_yahtzee_count, 0)      as first_roll_yahtzee_count,
  case
    when coalesce(s.games_played, 0) = 0 then 0
    else round((coalesce(s.wins, 0)::numeric * 100) / s.games_played, 1)
  end                                          as win_rate,
  coalesce(a.achievement_count, 0)             as achievement_count,
  lvl.key                                      as level_key,
  lvl.name                                     as level_name,
  lvl.emoji                                    as level_emoji,
  lvl.min_games                                as level_min_games,
  nxt.name                                     as next_level_name,
  nxt.emoji                                    as next_level_emoji,
  nxt.min_games                                as next_level_min_games,
  case
    when nxt.min_games is null then null
    else nxt.min_games - coalesce(s.games_played, 0)
  end                                          as games_to_next_level
from public.profiles p
left join lateral (
  select
    count(*)                        as games_played,
    count(*) filter (where is_win)  as wins,
    round(avg(score)::numeric, 1)   as average_score,
    max(score)                      as highest_score,
    min(score)                      as lowest_score,
    max(played_at)                  as last_played_at,
    sum(yahtzee_count)::int         as yahtzee_total
  from public.score_entries se
  where se.user_id = p.id
) s on true
left join lateral (
  select
    count(*) filter (where event_type = 'FIRST_ROLL') as first_roll_yahtzee_count,
    count(*) filter (where event_type = 'NORMAL')     as legacy_normal_count
  from public.yahtzee_events ye
  where ye.user_id = p.id
) y on true
left join lateral (
  select count(*) as achievement_count
  from public.user_achievements ua
  where ua.user_id = p.id
) a on true
left join lateral (
  select pl.* from public.player_levels pl
  where pl.min_games <= coalesce(s.games_played, 0)
  order by pl.min_games desc
  limit 1
) lvl on true
left join lateral (
  select pl.* from public.player_levels pl
  where pl.min_games > coalesce(s.games_played, 0)
  order by pl.min_games asc
  limit 1
) nxt on true;

alter view public.user_statistics set (security_invoker = off);
grant select on public.user_statistics to anon, authenticated;

-- get_user_statistics() was dropped by the cascade above.
create or replace function public.get_user_statistics(p_username text)
returns public.user_statistics
language sql
stable
security definer
set search_path = public
as $$
  select * from public.user_statistics where lower(username) = lower(p_username);
$$;
grant execute on function public.get_user_statistics(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Score entry RPCs now carry the game's Yahtzee count.
-- ---------------------------------------------------------------------
create or replace function public.record_score_entry(
  p_score         integer,
  p_is_win        boolean default false,
  p_played_at     timestamptz default now(),
  p_note          text default null,
  p_yahtzee_count integer default 0
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

  select max(score) into v_prev_high from public.score_entries where user_id = v_me;
  v_before := array(select achievement_id from public.user_achievements where user_id = v_me);

  insert into public.score_entries (user_id, score, is_win, played_at, note, yahtzee_count)
  values (v_me, p_score, coalesce(p_is_win, false), coalesce(p_played_at, now()),
          nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_yahtzee_count, 0))
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
  p_yahtzee_count integer default 0
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
  if coalesce(p_yahtzee_count, 0) < 0 then
    raise exception 'Aantal Yahtzees kan niet negatief zijn' using errcode = '22023';
  end if;

  v_before := array(select achievement_id from public.user_achievements where user_id = v_me);

  update public.score_entries
  set score         = p_score,
      is_win        = coalesce(p_is_win, false),
      played_at     = coalesce(p_played_at, played_at),
      note          = nullif(btrim(coalesce(p_note, '')), ''),
      yahtzee_count = coalesce(p_yahtzee_count, 0)
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

grant execute on function public.record_score_entry(integer, boolean, timestamptz, text, integer) to authenticated;
grant execute on function public.update_score_entry(uuid, integer, boolean, timestamptz, text, integer) to authenticated;

-- The old four/five-argument signatures would otherwise linger and be
-- picked over the new ones by PostgREST.
drop function if exists public.record_score_entry(integer, boolean, timestamptz, text);
drop function if exists public.update_score_entry(uuid, integer, boolean, timestamptz, text);

-- ---------------------------------------------------------------------
-- Only first-roll Yahtzees are standalone events from now on.
-- ---------------------------------------------------------------------
create or replace function public.record_yahtzee(
  p_event_type public.yahtzee_event_type default 'FIRST_ROLL'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_before uuid[];
  v_event  public.yahtzee_events;
  v_total  int;
  v_first  int;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  if coalesce(p_event_type, 'FIRST_ROLL') <> 'FIRST_ROLL' then
    raise exception 'Gewone Yahtzees horen bij een potje, niet als los event'
      using errcode = '22023';
  end if;

  v_before := array(select achievement_id from public.user_achievements where user_id = v_me);

  insert into public.yahtzee_events (user_id, event_type)
  values (v_me, 'FIRST_ROLL')
  returning * into v_event;

  perform public.evaluate_achievements(v_me, v_event.id);

  select yahtzee_count, first_roll_yahtzee_count
  into v_total, v_first
  from public.user_statistics where user_id = v_me;

  return jsonb_build_object(
    'event',                    to_jsonb(v_event),
    'yahtzee_count',            coalesce(v_total, 0),
    'first_roll_yahtzee_count', coalesce(v_first, 0),
    'unlocked',                 public.achievements_since(v_me, v_before)
  );
end;
$$;

grant execute on function public.record_yahtzee(public.yahtzee_event_type) to authenticated;

-- ---------------------------------------------------------------------
-- Achievements: "n Yahtzees in one day" now reads the per-game counts.
-- ---------------------------------------------------------------------
create or replace function public.evaluate_achievements(p_user uuid, p_source uuid default null)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats  public.user_statistics%rowtype;
  v_rec    record;
  v_type   text;
  v_ok     boolean;
  v_tmp    int;
begin
  if p_user is null then
    return;
  end if;

  select * into v_stats from public.user_statistics where user_id = p_user;
  if not found then
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
    v_type := v_rec.criteria ->> 'type';
    v_ok := false;

    case v_type
      when 'games_played' then
        v_ok := v_stats.games_played >= (v_rec.criteria ->> 'gte')::int;

      when 'wins' then
        v_ok := v_stats.wins >= (v_rec.criteria ->> 'gte')::int;

      when 'highest_score' then
        v_ok := coalesce(v_stats.highest_score, -1) >= (v_rec.criteria ->> 'gte')::int;

      when 'low_score' then
        v_ok := v_stats.lowest_score is not null
            and v_stats.lowest_score <= (v_rec.criteria ->> 'lte')::int;

      when 'yahtzee_count' then
        v_ok := v_stats.yahtzee_count >= (v_rec.criteria ->> 'gte')::int;

      when 'first_roll_count' then
        v_ok := v_stats.first_roll_yahtzee_count >= (v_rec.criteria ->> 'gte')::int;

      when 'win_streak' then
        v_ok := public.longest_win_streak(p_user) >= (v_rec.criteria ->> 'gte')::int;

      when 'score_streak' then
        v_ok := public.longest_score_streak(p_user, (v_rec.criteria ->> 'min_score')::int)
                >= (v_rec.criteria ->> 'gte')::int;

      when 'win_rate' then
        v_ok := v_stats.games_played >= coalesce((v_rec.criteria ->> 'min_games')::int, 1)
            and v_stats.win_rate >= (v_rec.criteria ->> 'gte')::numeric;

      when 'games_in_day' then
        select coalesce(max(c), 0) into v_tmp
        from (
          select count(*) as c
          from public.score_entries
          where user_id = p_user
          group by date_trunc('day', played_at at time zone 'Europe/Amsterdam')
        ) t;
        v_ok := v_tmp >= (v_rec.criteria ->> 'gte')::int;

      when 'distinct_days' then
        select count(distinct date_trunc('day', played_at at time zone 'Europe/Amsterdam'))
        into v_tmp
        from public.score_entries where user_id = p_user;
        v_ok := v_tmp >= (v_rec.criteria ->> 'gte')::int;

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
        v_ok := v_tmp >= (v_rec.criteria ->> 'gte')::int;

      when 'night_game' then
        v_ok := exists (
          select 1 from public.score_entries
          where user_id = p_user
            and extract(hour from (played_at at time zone 'Europe/Amsterdam'))
                between coalesce((v_rec.criteria ->> 'from_hour')::int, 0)
                    and coalesce((v_rec.criteria ->> 'to_hour')::int, 5)
        );

      when 'exact_score' then
        v_ok := exists (
          select 1 from public.score_entries
          where user_id = p_user and score = (v_rec.criteria ->> 'value')::int
        );

      when 'notes_count' then
        select count(*) into v_tmp
        from public.score_entries
        where user_id = p_user and note is not null and char_length(btrim(note)) > 0;
        v_ok := v_tmp >= (v_rec.criteria ->> 'gte')::int;

      when 'friends_count' then
        select count(*) into v_tmp from public.friend_ids(p_user);
        v_ok := v_tmp >= (v_rec.criteria ->> 'gte')::int;

      when 'groups_count' then
        select count(*) into v_tmp from public.group_members where user_id = p_user;
        v_ok := v_tmp >= (v_rec.criteria ->> 'gte')::int;

      when 'comeback' then
        v_ok := exists (
          select 1 from (
            select score, lag(score) over (order by played_at, created_at) as prev
            from public.score_entries where user_id = p_user
          ) t
          where t.prev is not null
            and t.prev <= (v_rec.criteria ->> 'low')::int
            and t.score >= (v_rec.criteria ->> 'high')::int
        );

      else
        v_ok := false;
    end case;

    if v_ok then
      insert into public.user_achievements (user_id, achievement_id, source_id)
      values (p_user, v_rec.id, p_source)
      on conflict (user_id, achievement_id) do nothing;
      return next v_rec.id;
    end if;
  end loop;
end;
$$;

grant execute on function public.evaluate_achievements(uuid, uuid) to authenticated;
