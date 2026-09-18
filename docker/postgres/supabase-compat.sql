-- =====================================================================
-- Supabase platform helpers for the self-hosted stack.
--
-- Runs after GoTrue and storage-api have completed their own migrations,
-- and before the application schema.
--
-- These are installed unconditionally rather than only when missing,
-- because GoTrue's own migration defines auth.uid() as:
--
--     select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
--
-- which reads only the legacy per-claim GUC. PostgREST runs with
-- PGRST_DB_USE_LEGACY_GUCS=false and publishes the whole token as a JSON
-- object in request.jwt.claims instead, so that definition returns NULL
-- for every request — every RLS policy would silently deny access while
-- looking perfectly healthy.
--
-- The versions below read both shapes, so they are correct whichever
-- style is in use.
--
-- This file is only used by docker compose. Hosted Supabase already
-- provides equivalent helpers and never runs it.
-- =====================================================================

create schema if not exists auth;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text;
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid(), auth.role(), auth.email()
  to anon, authenticated, service_role;

-- storage-api ships this during its own migrations; define it only if a
-- version that does not is in use.
do $$
begin
  if to_regnamespace('storage') is not null
     and to_regprocedure('storage.foldername(text)') is null then
    execute $fn$
      create function storage.foldername(name text) returns text[]
      language sql immutable as 'select string_to_array(name, ''/'')';
    $fn$;
  end if;
end $$;
