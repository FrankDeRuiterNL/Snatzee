-- =====================================================================
-- Snatzee — core schema
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.yahtzee_event_type as enum ('NORMAL', 'FIRST_ROLL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.friendship_status as enum ('pending', 'accepted', 'declined');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.group_member_role as enum ('owner', 'admin', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.achievement_rarity as enum ('COMMON', 'RARE', 'EPIC', 'LEGENDARY');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Central, configurable app settings
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value, description) values
  ('min_score',                    '0'::jsonb,   'Laagst toegestane eindscore'),
  ('max_score',                    '1575'::jsonb,'Hoogst toegestane eindscore'),
  ('min_games_for_average_ranking','5'::jsonb,   'Minimum aantal potjes voor deelname aan de gemiddelde-ranking'),
  ('low_score_threshold',          '80'::jsonb,  'Grens voor "Dat deed pijn"-achievement')
on conflict (key) do nothing;

create or replace function public.app_setting_int(p_key text, p_default int)
returns int
language sql
stable
as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  username             text not null,
  display_name         text not null,
  avatar_url           text,
  bio                  text,
  onboarding_completed boolean not null default false,
  is_private           boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 40),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 200)
);

create unique index if not exists profiles_username_key on public.profiles (lower(username));
create index if not exists profiles_display_name_idx on public.profiles (lower(display_name));

-- ---------------------------------------------------------------------
-- score_entries — one registered game result per row
-- ---------------------------------------------------------------------
create table if not exists public.score_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  score      integer not null,
  is_win     boolean not null default false,
  played_at  timestamptz not null default now(),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint score_entries_score_range check (score >= 0 and score <= 1575),
  constraint score_entries_note_len check (note is null or char_length(note) <= 280),
  constraint score_entries_not_future check (played_at <= now() + interval '1 day')
);

create index if not exists score_entries_user_id_idx on public.score_entries (user_id);
create index if not exists score_entries_played_at_idx on public.score_entries (played_at desc);
create index if not exists score_entries_score_idx on public.score_entries (score desc);
create index if not exists score_entries_user_played_idx on public.score_entries (user_id, played_at desc);
create index if not exists score_entries_user_score_idx on public.score_entries (user_id, score desc);

-- ---------------------------------------------------------------------
-- yahtzee_events — standalone Yahtzee registrations
-- A FIRST_ROLL row counts as a Yahtzee *and* as a first-roll Yahtzee.
-- ---------------------------------------------------------------------
create table if not exists public.yahtzee_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  event_type public.yahtzee_event_type not null default 'NORMAL',
  created_at timestamptz not null default now()
);

create index if not exists yahtzee_events_user_id_idx on public.yahtzee_events (user_id);
create index if not exists yahtzee_events_created_at_idx on public.yahtzee_events (created_at desc);
create index if not exists yahtzee_events_user_type_idx on public.yahtzee_events (user_id, event_type);

-- ---------------------------------------------------------------------
-- friendships
-- ---------------------------------------------------------------------
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       public.friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- One friendship per pair, regardless of direction.
create unique index if not exists friendships_unique_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);

-- ---------------------------------------------------------------------
-- groups + members
-- ---------------------------------------------------------------------
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  description text,
  image_url   text,
  emoji       text default '🎲',
  invite_code text not null default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_at  timestamptz not null default now(),
  constraint groups_name_len check (char_length(name) between 2 and 40),
  constraint groups_description_len check (description is null or char_length(description) <= 200)
);

create unique index if not exists groups_invite_code_key on public.groups (invite_code);
create index if not exists groups_owner_idx on public.groups (owner_id);

create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      public.group_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);
create index if not exists group_members_group_idx on public.group_members (group_id);

-- ---------------------------------------------------------------------
-- achievements + unlocks
-- ---------------------------------------------------------------------
create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text not null,
  icon        text not null default '🏅',
  rarity      public.achievement_rarity not null default 'COMMON',
  category    text not null default 'games',
  is_secret   boolean not null default false,
  sort_order  integer not null default 100,
  criteria    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists achievements_category_idx on public.achievements (category);

create table if not exists public.user_achievements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  source_id      uuid,
  unique (user_id, achievement_id)
);

create index if not exists user_achievements_user_idx on public.user_achievements (user_id, unlocked_at desc);

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists score_entries_set_updated_at on public.score_entries;
create trigger score_entries_set_updated_at before update on public.score_entries
  for each row execute function public.set_updated_at();

drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at before update on public.friendships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Auto-create a profile for every new auth user.
-- Username gets a safe placeholder; onboarding lets the user pick a real one.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base     text;
  v_username text;
  v_display  text;
  v_suffix   int := 0;
begin
  v_base := lower(regexp_replace(
    coalesce(
      new.raw_user_meta_data ->> 'username',
      split_part(coalesce(new.email, ''), '@', 1),
      'player'
    ), '[^a-z0-9_]', '', 'g'));

  if char_length(v_base) < 3 then
    v_base := 'player';
  end if;
  v_base := substr(v_base, 1, 16);

  v_username := v_base;
  while exists (select 1 from public.profiles where lower(username) = v_username) loop
    v_suffix := v_suffix + 1;
    v_username := substr(v_base, 1, 16) || v_suffix::text;
  end loop;

  v_display := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    v_base
  );

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    v_username,
    substr(v_display, 1, 40),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
