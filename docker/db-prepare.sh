#!/bin/bash
# =====================================================================
# Prepares the database for the Supabase services. Runs on every start,
# before auth, rest and storage.
#
# Why this exists rather than relying on /docker-entrypoint-initdb.d:
# those scripts only run when the data directory is created. If they are
# skipped for any reason, the service roles keep whatever password the
# image shipped with and every service dies with
# "password authentication failed", which is a confusing way to learn
# that an init script did not run. Doing it here makes it idempotent,
# self-healing on an existing volume, and loud when it cannot work.
# =====================================================================
set -euo pipefail

export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL=(psql --host=db --port=5432 --username=postgres --dbname=postgres --no-psqlrc --quiet -v ON_ERROR_STOP=1)

echo "Connecting to the database..."
for attempt in $(seq 1 30); do
  if "${PSQL[@]}" -tAc 'select 1' >/dev/null 2>&1; then
    connected=yes
    break
  fi
  sleep 2
done

if [ "${connected:-no}" != yes ]; then
  cat >&2 <<'MSG'

=====================================================================
Could not authenticate as the "postgres" user.

This almost always means the database volume was created with a
different POSTGRES_PASSWORD than the one now in .env. The password is
only applied when the data directory is first created, so changing it
later leaves the old one in place.

Reset the database and start again (this erases its contents):

    docker compose down -v
    docker compose up -d --build

=====================================================================
MSG
  exit 1
fi

echo "Applying service role passwords..."
# The password travels as a psql variable so it is quoted properly even if it
# contains characters that would otherwise terminate a SQL literal.
"${PSQL[@]}" -v "pw=$POSTGRES_PASSWORD" <<'SQL'
select set_config('snatzee.service_password', :'pw', false);

do $$
declare
  r text;
  pw text := current_setting('snatzee.service_password');
begin
  -- Only the roles this image actually created.
  foreach r in array array[
    'authenticator', 'supabase_auth_admin', 'supabase_storage_admin',
    'supabase_functions_admin', 'pgbouncer', 'supabase_read_only_user'
  ] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('alter role %I with password %L', r, pw);
    end if;
  end loop;
end $$;
SQL

echo "Aligning auth schema ownership..."
"${PSQL[@]}" <<'SQL'
-- GoTrue runs its migrations as supabase_auth_admin and issues
-- CREATE OR REPLACE FUNCTION auth.uid(). That requires ownership, so if
-- the function is owned by another role GoTrue dies with
-- "must be owner of function uid". Handing these to supabase_auth_admin
-- lets its migrations complete; the application's own definitions are
-- re-applied afterwards by supabase-compat.sql.
do $$
declare
  fn text;
begin
  -- postgres needs to be a member of the role to reassign ownership to it.
  begin
    execute 'grant supabase_auth_admin to postgres';
  exception when others then
    raise notice 'Could not grant supabase_auth_admin to postgres: %', sqlerrm;
  end;

  foreach fn in array array['auth.uid()', 'auth.role()', 'auth.email()', 'auth.jwt()'] loop
    if to_regprocedure(fn) is not null then
      begin
        execute format('alter function %s owner to supabase_auth_admin', fn);
      exception when others then
        raise notice 'Could not reassign %: %', fn, sqlerrm;
      end;
    end if;
  end loop;
end $$;
SQL

echo "Letting storage act as the API roles..."
"${PSQL[@]}" <<'SQL'
-- storage-api connects as supabase_storage_admin and runs every request
-- under SET ROLE anon / authenticated / service_role, so RLS on
-- storage.objects applies to the caller. Without membership in those
-- roles, every upload and every public file read fails with
-- "permission denied to set role" — which shows up in the app as broken
-- avatars. The image does not grant this on every setup, so it is made
-- sure of here, on each start.
do $$
declare
  r text;
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then
    return;
  end if;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r)
       and not pg_has_role('supabase_storage_admin', r, 'SET') then
      execute format('grant %I to supabase_storage_admin', r);
    end if;
  end loop;
end $$;
SQL

echo "Database is ready for the Supabase services."
