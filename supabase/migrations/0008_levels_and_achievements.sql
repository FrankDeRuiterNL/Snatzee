-- =====================================================================
-- Snatzee — player levels, and the named achievement set
-- =====================================================================

-- ---------------------------------------------------------------------
-- Player levels
--
-- A lookup table rather than hard-coded tiers, so the thresholds can be
-- tuned without a deploy — the same approach as app_settings.
-- ---------------------------------------------------------------------
create table if not exists public.player_levels (
  key        text primary key,
  name       text not null,
  emoji      text not null default '🎲',
  min_games  integer not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint player_levels_min_games_check check (min_games >= 0)
);

create unique index if not exists player_levels_min_games_key
  on public.player_levels (min_games);

insert into public.player_levels (key, name, emoji, min_games, sort_order) values
  ('beginner',     'Beginner',             '🙋🏼‍♂️', 0,  10),
  ('recreatief',   'Recreatief Speler',    '👨🏼‍🏭', 10, 20),
  ('hobby',        'Hobby Speler',         '🧑🏼‍🎨', 20, 30),
  ('professioneel','Professioneel Speler', '👨🏼‍💼', 35, 40),
  ('zakelijk',     'Zakelijk Speler',      '👨🏼‍✈️', 50, 50)
on conflict (key) do update set
  name       = excluded.name,
  emoji      = excluded.emoji,
  min_games  = excluded.min_games,
  sort_order = excluded.sort_order;

alter table public.player_levels enable row level security;

drop policy if exists "player_levels_select_all" on public.player_levels;
create policy "player_levels_select_all" on public.player_levels
  for select using (true);

grant select on public.player_levels to anon, authenticated;

-- ---------------------------------------------------------------------
-- user_statistics gains the current level and the next one to aim for.
-- ---------------------------------------------------------------------
create or replace view public.user_statistics as
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
) a on true
-- Highest level whose threshold has been reached.
left join lateral (
  select pl.* from public.player_levels pl
  where pl.min_games <= coalesce(s.games_played, 0)
  order by pl.min_games desc
  limit 1
) lvl on true
-- Lowest level still ahead, if any.
left join lateral (
  select pl.* from public.player_levels pl
  where pl.min_games > coalesce(s.games_played, 0)
  order by pl.min_games asc
  limit 1
) nxt on true;

alter view public.user_statistics set (security_invoker = off);
grant select on public.user_statistics to anon, authenticated;

-- ---------------------------------------------------------------------
-- Achievements: the named set.
--
-- Existing keys are updated in place so unlocks people already earned are
-- preserved; only the presentation and thresholds change.
-- ---------------------------------------------------------------------
insert into public.achievements (key, name, description, icon, rarity, category, is_secret, sort_order, criteria) values
  ('score_200',     'Stabiel',          'Scoor 200 punten of meer',              '😎', 'COMMON',    'scores',  false, 120, '{"type":"highest_score","gte":200}'),
  ('high_roller',   'High Roller',      'Scoor 300 punten of hoger',             '👑', 'RARE',      'scores',  false, 130, '{"type":"highest_score","gte":300}'),
  ('impossible',    'The Impossible',   'Scoor 400 punten of hoger',             '🧙', 'LEGENDARY', 'scores',  false, 150, '{"type":"highest_score","gte":400}'),
  ('first_yahtzee', 'Snatzee!',         'Gooi een Yahtzee',                      '🎯', 'COMMON',    'yahtzee', false, 210, '{"type":"yahtzee_count","gte":1}'),
  ('yahtzee_10',    'Snatzee Pro!',     'Gooi 10 keer een Yahtzee',              '💯', 'RARE',      'yahtzee', false, 220, '{"type":"yahtzee_count","gte":10}'),
  ('yahtzee_20',    'Snatzee Koning!',  'Gooi 20 keer een Yahtzee',              '🤴', 'EPIC',      'yahtzee', false, 230, '{"type":"yahtzee_count","gte":20}'),
  ('first_try',     'Legend',           'Gooi een Yahtzee in één worp',          '🔥', 'RARE',      'yahtzee', false, 250, '{"type":"first_roll_count","gte":1}'),
  ('ouch',          'Hoe dan?',         'Scoor minder dan 100 punten',           '💀', 'COMMON',    'scores',  false, 180, '{"type":"low_score","lte":99}')
on conflict (key) do update set
  name        = excluded.name,
  description = excluded.description,
  icon        = excluded.icon,
  rarity      = excluded.rarity,
  category    = excluded.category,
  is_secret   = excluded.is_secret,
  sort_order  = excluded.sort_order,
  criteria    = excluded.criteria;

-- The 25-Yahtzee tier is superseded by the 20-Yahtzee "Snatzee Koning!".
delete from public.achievements where key = 'yahtzee_25';

-- "Hoe dan?" now triggers below 100 rather than below 80; keep the
-- configurable threshold in step with it.
update public.app_settings
set value = '99'::jsonb, updated_at = now()
where key = 'low_score_threshold';

-- ---------------------------------------------------------------------
-- Re-evaluate everyone: the widened thresholds may unlock achievements
-- that were previously out of reach.
-- ---------------------------------------------------------------------
do $$
declare
  v_user uuid;
begin
  for v_user in select id from public.profiles loop
    perform public.evaluate_achievements(v_user);
  end loop;
end $$;
