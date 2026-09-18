-- =====================================================================
-- Roles, schemas and extensions that the Supabase services expect.
--
-- Hosted Supabase ships these; a plain Postgres image does not, so this
-- runs once when the data volume is first created.
-- =====================================================================

create extension if not exists "pgcrypto"  with schema extensions cascade;
create extension if not exists "uuid-ossp" with schema extensions cascade;

-- ---------------------------------------------------------------------
-- API roles. PostgREST logs in as `authenticator` and switches into one
-- of the other three depending on the JWT it is handed.
-- ---------------------------------------------------------------------
do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null; end $$;

do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;

do $$ begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null; end $$;

-- Passwords are set from the environment by 02-passwords.sh.
do $$ begin
  create role authenticator login noinherit;
exception when duplicate_object then null; end $$;

grant anon, authenticated, service_role to authenticator;

-- ---------------------------------------------------------------------
-- Service owners. GoTrue and storage-api run their own migrations, so
-- they each need a role that owns their schema.
-- ---------------------------------------------------------------------
do $$ begin
  create role supabase_auth_admin login noinherit createrole;
exception when duplicate_object then null; end $$;

do $$ begin
  create role supabase_storage_admin login noinherit createrole;
exception when duplicate_object then null; end $$;

create schema if not exists auth    authorization supabase_auth_admin;
create schema if not exists storage authorization supabase_storage_admin;
create schema if not exists extensions;

grant usage on schema public     to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth       to anon, authenticated, service_role;
grant usage on schema storage    to anon, authenticated, service_role;

grant all on schema auth    to supabase_auth_admin;
grant all on schema storage to supabase_storage_admin;

-- The app's migrations create triggers on auth.users and policies on
-- storage.objects, so the owner role needs to reach into both schemas.
grant supabase_auth_admin, supabase_storage_admin to postgres;

-- Everything the app creates later should be reachable by the API roles.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Extensions live in their own schema (as on hosted Supabase), so every
-- role needs it on the search path or gen_random_bytes() and friends are
-- invisible to the application's migrations and functions.
-- ---------------------------------------------------------------------
do $$
declare
  v_path constant text := '"$user", public, extensions';
begin
  execute format('alter database %I set search_path to %s', current_database(), v_path);
  execute format('alter role postgres set search_path to %s', v_path);
  execute format('alter role authenticator set search_path to %s', v_path);
  execute format('alter role anon set search_path to %s', v_path);
  execute format('alter role authenticated set search_path to %s', v_path);
  execute format('alter role service_role set search_path to %s', v_path);
end $$;
