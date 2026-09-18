-- =====================================================================
-- Supabase platform helpers — a safety net, not the primary source.
--
-- The supabase/postgres image already ships auth.uid(), auth.role(),
-- auth.jwt() and the storage helpers, so on the standard stack every
-- block below is skipped. They are defined here only so the schema can
-- also be applied to a plain PostgreSQL server, where those helpers do
-- not exist and every RLS policy would fail without them.
-- =====================================================================

create schema if not exists auth;

do $$
begin
  if to_regprocedure('auth.jwt()') is null then
    execute $fn$
      create function auth.jwt() returns jsonb language sql stable as $body$
        select coalesce(
          nullif(current_setting('request.jwt.claim', true), ''),
          nullif(current_setting('request.jwt.claims', true), '')
        )::jsonb;
      $body$;
    $fn$;
    raise notice 'Created auth.jwt() (not a supabase/postgres image)';
  end if;

  if to_regprocedure('auth.uid()') is null then
    execute $fn$
      create function auth.uid() returns uuid language sql stable as $body$
        select coalesce(
          nullif(current_setting('request.jwt.claim.sub', true), ''),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
        )::uuid;
      $body$;
    $fn$;
    raise notice 'Created auth.uid()';
  end if;

  if to_regprocedure('auth.role()') is null then
    execute $fn$
      create function auth.role() returns text language sql stable as $body$
        select coalesce(
          nullif(current_setting('request.jwt.claim.role', true), ''),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
        )::text;
      $body$;
    $fn$;
    raise notice 'Created auth.role()';
  end if;

  if to_regprocedure('auth.email()') is null then
    execute $fn$
      create function auth.email() returns text language sql stable as $body$
        select coalesce(
          nullif(current_setting('request.jwt.claim.email', true), ''),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
        )::text;
      $body$;
    $fn$;
    raise notice 'Created auth.email()';
  end if;

  if to_regprocedure('storage.foldername(text)') is null
     and to_regnamespace('storage') is not null then
    execute $fn$
      create function storage.foldername(name text) returns text[]
      language sql immutable as 'select string_to_array(name, ''/'')';
    $fn$;
    raise notice 'Created storage.foldername()';
  end if;
end $$;

grant usage on schema auth to anon, authenticated, service_role;
