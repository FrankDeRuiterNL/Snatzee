-- =====================================================================
-- Snatzee — het hele scoreblad bewaren, niet alleen de eindscore
--
-- Een potje kan nu worden ingevuld per onderdeel, met de foto of met de
-- hand. Die dertien waarden zijn wat de speler werkelijk gooide; de
-- eindscore is er maar een optelsom van. Ze horen dus bij het potje, en
-- niet alleen in het scherm waar ze zijn ingevuld.
--
-- Bewaard als jsonb-array van dertien getallen, in bladvolgorde:
--   0-5   enen t/m zessen
--   6-12  three of a kind, carré, full house, kleine straat,
--         grote straat, topscore, chance
-- De vijf totaalrijen staan er niet in: die zijn rekenwerk, en rekenwerk
-- dat je bewaart is rekenwerk dat kan gaan afwijken.
-- =====================================================================

alter table public.score_entries
  add column if not exists sheet jsonb;

-- ---------------------------------------------------------------------
-- De regels van het spel, als functies, zodat de database dezelfde
-- waarheid hanteert als het scherm.
-- ---------------------------------------------------------------------

/** Mag deze waarde in deze rij staan? Rij 0-5 tellen dobbelstenen van
 *  één ogenaantal; de rest is vast of vrij binnen wat vijf stenen
 *  kunnen halen. */
create or replace function public.sheet_value_allowed(p_row integer, p_value integer)
returns boolean
language sql
immutable
as $$
  select case
    when p_value is null or p_value < 0 then false
    when p_row between 0 and 5 then
      p_value % (p_row + 1) = 0 and p_value <= (p_row + 1) * 5
    when p_row in (6, 7, 12) then p_value = 0 or (p_value between 5 and 30)
    when p_row = 8  then p_value in (0, 25)
    when p_row = 9  then p_value in (0, 30)
    when p_row = 10 then p_value in (0, 40)
    when p_row = 11 then p_value in (0, 50)
    else false
  end;
$$;

/** Dertien getallen, elk toegestaan in zijn eigen rij. */
create or replace function public.sheet_is_valid(p_sheet jsonb)
returns boolean
language sql
immutable
as $$
  select p_sheet is not null
     and jsonb_typeof(p_sheet) = 'array'
     and jsonb_array_length(p_sheet) = 13
     and not exists (
       select 1
       from jsonb_array_elements(p_sheet) with ordinality as e(value, position)
       where jsonb_typeof(e.value) <> 'number'
          or not public.sheet_value_allowed((e.position - 1)::int, (e.value)::int)
     );
$$;

/** De eindscore die bij dit blad hoort: bovenste helft, plus 35 bonus
 *  vanaf 63, plus de onderste helft. */
create or replace function public.sheet_total(p_sheet jsonb)
returns integer
language sql
immutable
as $$
  with parts as (
    select
      coalesce(sum((e.value)::int) filter (where e.position <= 6), 0)  as upper,
      coalesce(sum((e.value)::int) filter (where e.position > 6), 0)   as lower
    from jsonb_array_elements(p_sheet) with ordinality as e(value, position)
  )
  select upper + case when upper >= 63 then 35 else 0 end + lower from parts;
$$;

alter table public.score_entries
  drop constraint if exists score_entries_sheet_valid;
alter table public.score_entries
  add constraint score_entries_sheet_valid
  check (sheet is null or public.sheet_is_valid(sheet));

-- Een bewaard blad dat niet op de bewaarde score uitkomt is erger dan
-- geen blad: dan vertelt de historie twee dingen tegelijk.
alter table public.score_entries
  drop constraint if exists score_entries_sheet_matches_score;
alter table public.score_entries
  add constraint score_entries_sheet_matches_score
  check (sheet is null or public.sheet_total(sheet) = score)
  -- Not re-checked against existing rows: 0022 replaces this with a
  -- version that also accepts the Yahtzee bonus, and games saved since
  -- would fail this older form if the file is ever applied again.
  not valid;

-- ---------------------------------------------------------------------
-- De RPC's nemen het blad mee. De oude aanroep zonder blad blijft
-- werken, zodat een app die nog niet is bijgewerkt niet stukgaat.
-- ---------------------------------------------------------------------

-- De oudere vormen moeten eerst weg. Een functie met extra parameters
-- die een standaardwaarde hebben vervangt de oude vorm niet maar staat
-- ernaast, en dan is een aanroep met de oude argumenten niet meer
-- eenduidig: Postgres weigert te kiezen.
drop function if exists public.record_score_entry(integer, boolean, timestamptz, text);
drop function if exists public.record_score_entry(integer, boolean, timestamptz, text, integer);
drop function if exists public.update_score_entry(uuid, integer, boolean, timestamptz, text);
drop function if exists public.update_score_entry(uuid, integer, boolean, timestamptz, text, integer);
-- Ook de vorm zonder p_clear_sheet, voor een database die een eerdere
-- versie van deze migratie al had gedraaid.
drop function if exists public.update_score_entry(uuid, integer, boolean, timestamptz, text, integer, jsonb);

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
  if p_sheet is not null and public.sheet_total(p_sheet) <> p_score then
    raise exception 'Scoreblad telt op tot %, niet tot %',
      public.sheet_total(p_sheet), p_score using errcode = '22023';
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
  if p_sheet is not null and public.sheet_total(p_sheet) <> p_score then
    raise exception 'Scoreblad telt op tot %, niet tot %',
      public.sheet_total(p_sheet), p_score using errcode = '22023';
  end if;

  -- Het blad dat blijft staan moet ook op de nieuwe score uitkomen.
  if p_sheet is null and not coalesce(p_clear_sheet, false) then
    select sheet into v_kept from public.score_entries where id = p_id and user_id = v_me;
    if v_kept is not null and public.sheet_total(v_kept) <> p_score then
      raise exception 'Het bewaarde scoreblad telt op tot %, niet tot %',
        public.sheet_total(v_kept), p_score using errcode = '22023';
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

grant execute on function public.sheet_value_allowed(integer, integer) to anon, authenticated;
grant execute on function public.sheet_is_valid(jsonb) to anon, authenticated;
grant execute on function public.sheet_total(jsonb) to anon, authenticated;
grant execute on function public.record_score_entry(integer, boolean, timestamptz, text, integer, jsonb) to authenticated;
grant execute on function public.update_score_entry(uuid, integer, boolean, timestamptz, text, integer, jsonb, boolean) to authenticated;

-- Het scannen staat nu altijd aan; de ontwikkelvlag is niet meer nodig.
delete from public.app_settings where key = 'scoresheet_scan';

notify pgrst, 'reload schema';
