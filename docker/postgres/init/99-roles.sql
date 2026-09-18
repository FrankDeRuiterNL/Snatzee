-- =====================================================================
-- Gives the pre-existing Supabase service roles the password from the
-- environment.
--
-- The supabase/postgres image already creates these roles, the auth and
-- storage schemas, the extensions and the auth.uid() helpers — this only
-- sets their credentials, so the secret never lands in the repository.
--
-- Mirrors supabase/docker/volumes/db/roles.sql upstream.
-- =====================================================================

\set pgpass `echo "$POSTGRES_PASSWORD"`

alter user authenticator            with password :'pgpass';
alter user pgbouncer                with password :'pgpass';
alter user supabase_auth_admin      with password :'pgpass';
alter user supabase_functions_admin with password :'pgpass';
alter user supabase_storage_admin   with password :'pgpass';
