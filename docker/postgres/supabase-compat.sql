-- =====================================================================
-- Supabase platform helpers.
--
-- auth.uid() / auth.role() / auth.jwt() are provided by the Supabase
-- platform rather than by GoTrue, so a self-hosted stack has to define
-- them. Every RLS policy in this app depends on auth.uid().
--
-- Runs after GoTrue and storage-api have created their own schemas, and
-- before the application migrations.
-- =====================================================================

create schema if not exists auth;

-- PostgREST puts the verified JWT claims into request.jwt.claims.
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

-- storage-api creates this during its own migrations; define it only if a
-- storage version that does not ship it is in use.
do $$
begin
  if to_regprocedure('storage.foldername(text)') is null then
    execute $fn$
      create function storage.foldername(name text)
      returns text[]
      language sql
      immutable
      as 'select string_to_array(name, ''/'')';
    $fn$;
  end if;
end $$;
