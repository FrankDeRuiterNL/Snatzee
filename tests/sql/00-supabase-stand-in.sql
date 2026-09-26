-- =====================================================================
-- The parts of a Supabase database the migrations lean on, for running
-- them against a plain Postgres in tests: the API roles, auth.users and
-- a minimal storage schema. The real stack gets these from GoTrue and
-- storage-api.
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants everything in public to the API roles by default and
-- leaves RLS and explicit revokes to do the limiting. Tests must start
-- from the same generous default, or a missing revoke would go unnoticed.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid default gen_random_uuid(), bucket_id text, name text
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
language sql as $$ select string_to_array(name, '/') $$;
