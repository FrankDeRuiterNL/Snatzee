-- =====================================================================
-- Snatzee — achievement engine + seed data
-- Achievements are never inserted by clients; only this SECURITY DEFINER
-- engine writes to user_achievements.
-- =====================================================================

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
        select coalesce(max(c), 0) into v_tmp
        from (
          select count(*) as c
          from public.yahtzee_events
          where user_id = p_user
          group by date_trunc('day', created_at at time zone 'Europe/Amsterdam')
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

-- ---------------------------------------------------------------------
-- Safety net: evaluate on every relevant data change, even when rows are
-- inserted outside the RPCs (seeding, dashboard, admin).
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
    perform public.evaluate_achievements(v_user);
  end if;
  return null;
end;
$$;

drop trigger if exists score_entries_achievements on public.score_entries;
create trigger score_entries_achievements
  after insert or update or delete on public.score_entries
  for each row execute function public.trigger_evaluate_achievements();

drop trigger if exists yahtzee_events_achievements on public.yahtzee_events;
create trigger yahtzee_events_achievements
  after insert or delete on public.yahtzee_events
  for each row execute function public.trigger_evaluate_achievements();

drop trigger if exists friendships_achievements on public.friendships;
create trigger friendships_achievements
  after insert or update on public.friendships
  for each row execute function public.trigger_evaluate_achievements();

drop trigger if exists group_members_achievements on public.group_members;
create trigger group_members_achievements
  after insert on public.group_members
  for each row execute function public.trigger_evaluate_achievements();

-- ---------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------
insert into public.achievements (key, name, description, icon, rarity, category, is_secret, sort_order, criteria) values
  -- Games -------------------------------------------------------------
  ('first_game',    'Eerste worp',      'Speel je eerste potje',                          '🎲', 'COMMON',    'games',  false, 10,  '{"type":"games_played","gte":1}'),
  ('games_10',      'Op dreef',         'Speel 10 potjes',                                '🎯', 'COMMON',    'games',  false, 20,  '{"type":"games_played","gte":10}'),
  ('games_25',      'Verslaafd',        'Speel 25 potjes',                                '🏃', 'RARE',      'games',  false, 30,  '{"type":"games_played","gte":25}'),
  ('games_50',      'Halve eeuw',       'Speel 50 potjes',                                '📈', 'RARE',      'games',  false, 40,  '{"type":"games_played","gte":50}'),
  ('games_100',     'Geen leven',       'Speel 100 potjes',                               '🎲', 'EPIC',      'games',  false, 50,  '{"type":"games_played","gte":100}'),
  ('games_250',     'Veteran',          'Speel 250 potjes',                               '💎', 'LEGENDARY', 'games',  false, 60,  '{"type":"games_played","gte":250}'),
  ('marathon',      'Marathon',         'Speel 5 potjes op één dag',                      '🕹️', 'RARE',      'games',  false, 70,  '{"type":"games_in_day","gte":5}'),
  ('loyal_30',      'Vaste prik',       'Speel op 30 verschillende dagen',                '📅', 'EPIC',      'games',  false, 80,  '{"type":"distinct_days","gte":30}'),

  -- Scores ------------------------------------------------------------
  ('century',       'Century Club',     'Scoor minimaal 100 punten',                      '💯', 'COMMON',    'scores', false, 110, '{"type":"highest_score","gte":100}'),
  ('score_200',     'Tweehonderd',      'Scoor minimaal 200 punten',                      '🚀', 'COMMON',    'scores', false, 120, '{"type":"highest_score","gte":200}'),
  ('high_roller',   'High Roller',      'Scoor 300 punten of hoger',                      '👑', 'RARE',      'scores', false, 130, '{"type":"highest_score","gte":300}'),
  ('score_350',     'Supernova',        'Scoor 350 punten of hoger',                      '🌟', 'EPIC',      'scores', false, 140, '{"type":"highest_score","gte":350}'),
  ('impossible',    'The Impossible',   'Scoor 400 punten of hoger',                      '🧙', 'LEGENDARY', 'scores', false, 150, '{"type":"highest_score","gte":400}'),
  ('hot_streak',    'Lekker bezig',     'Scoor drie keer achter elkaar meer dan 250',     '🔥', 'RARE',      'scores', false, 160, '{"type":"score_streak","gte":3,"min_score":250}'),
  ('consistent',    'Constante factor', 'Scoor vijf keer achter elkaar boven de 200',     '🎚️', 'EPIC',      'scores', false, 170, '{"type":"score_streak","gte":5,"min_score":200}'),
  ('ouch',          'Dat deed pijn',    'Registreer een potje onder de 80 punten',        '😬', 'COMMON',    'scores', false, 180, '{"type":"low_score","lte":80}'),

  -- Yahtzee -----------------------------------------------------------
  ('first_yahtzee', 'Snatzee!',         'Registreer je eerste Yahtzee',                   '🎯', 'COMMON',    'yahtzee', false, 210, '{"type":"yahtzee_count","gte":1}'),
  ('yahtzee_10',    'Dubbele cijfers',  'Registreer 10 Yahtzees',                         '🎲', 'RARE',      'yahtzee', false, 220, '{"type":"yahtzee_count","gte":10}'),
  ('yahtzee_25',    'Yahtzee machine',  'Registreer 25 Yahtzees',                         '🔮', 'EPIC',      'yahtzee', false, 230, '{"type":"yahtzee_count","gte":25}'),
  ('yahtzee_50',    'Dobbeldraak',      'Registreer 50 Yahtzees',                         '🐉', 'LEGENDARY', 'yahtzee', false, 240, '{"type":"yahtzee_count","gte":50}'),
  ('first_try',     'First Try',        'Gooi een Yahtzee in één worp',                   '⚡', 'RARE',      'yahtzee', false, 250, '{"type":"first_roll_count","gte":1}'),
  ('first_try_3',   'Drie keer raak',   'Gooi 3 keer een Yahtzee in één worp',            '⚡', 'EPIC',      'yahtzee', false, 260, '{"type":"first_roll_count","gte":3}'),
  ('first_try_10',  'Onmogelijk geluk', 'Gooi 10 keer een Yahtzee in één worp',           '🌠', 'LEGENDARY', 'yahtzee', false, 270, '{"type":"first_roll_count","gte":10}'),

  -- Wins --------------------------------------------------------------
  ('first_win',     'Eerste overwinning','Win je eerste geregistreerde potje',            '🥇', 'COMMON',    'wins',   false, 310, '{"type":"wins","gte":1}'),
  ('on_fire',       'On Fire',          'Win 3 geregistreerde potjes achter elkaar',      '🔥', 'RARE',      'wins',   false, 320, '{"type":"win_streak","gte":3}'),
  ('winner_winner', 'Winner Winner',    'Win 10 potjes',                                  '🏆', 'RARE',      'wins',   false, 330, '{"type":"wins","gte":10}'),
  ('unstoppable',   'Onstuitbaar',      'Win 5 geregistreerde potjes achter elkaar',      '🏔️', 'EPIC',      'wins',   false, 340, '{"type":"win_streak","gte":5}'),
  ('wins_50',       'Kampioen',         'Win 50 potjes',                                  '👑', 'EPIC',      'wins',   false, 350, '{"type":"wins","gte":50}'),
  ('dominant',      'Dominant',         'Win 60% van minimaal 20 potjes',                 '📊', 'EPIC',      'wins',   false, 360, '{"type":"win_rate","gte":60,"min_games":20}'),

  -- Social ------------------------------------------------------------
  ('clubhouse',     'Clubhuis',         'Word lid van een groep',                         '🏠', 'COMMON',    'social', false, 410, '{"type":"groups_count","gte":1}'),
  ('friend_circle', 'Vriendenclub',     'Maak 5 vrienden op Snatzee',                     '🤝', 'RARE',      'social', false, 420, '{"type":"friends_count","gte":5}'),

  -- Secret ------------------------------------------------------------
  ('lucky_222',     'Driedubbel',       'Scoor precies 222 punten',                       '🍀', 'RARE',      'scores', true,  510, '{"type":"exact_score","value":222}'),
  ('comeback_kid',  'Comeback kid',     'Volg een potje onder 150 direct op met 280+',    '🔁', 'EPIC',      'scores', true,  520, '{"type":"comeback","low":150,"high":280}'),
  ('hattrick',      'Hattrick',         'Gooi 3 Yahtzees op één dag',                     '🎩', 'EPIC',      'yahtzee', true, 530, '{"type":"yahtzee_in_day","gte":3}'),
  ('night_owl',     'Nachtbraker',      'Speel een potje tussen middernacht en 5 uur',    '🦉', 'RARE',      'games',  true,  540, '{"type":"night_game","from_hour":0,"to_hour":4}'),
  ('storyteller',   'Verteller',        'Schrijf een notitie bij 10 potjes',              '✍️', 'RARE',      'games',  true,  550, '{"type":"notes_count","gte":10}')
on conflict (key) do update set
  name        = excluded.name,
  description = excluded.description,
  icon        = excluded.icon,
  rarity      = excluded.rarity,
  category    = excluded.category,
  is_secret   = excluded.is_secret,
  sort_order  = excluded.sort_order,
  criteria    = excluded.criteria;

grant execute on function public.evaluate_achievements(uuid, uuid) to authenticated;
