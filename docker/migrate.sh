#!/bin/bash
# =====================================================================
# Applies the Snatzee schema.
#
# Compose only starts this once db, auth and storage report healthy, so
# GoTrue and storage-api have already created the tables this schema
# attaches its foreign keys and policies to.
#
# Safe to run repeatedly: each migration file is recorded in
# snatzee_meta.schema_migrations once it has been applied, and is skipped
# from then on. Re-running old files on every boot used to undo changes
# made since (0008 reset the admin-tuned low-score threshold, for one).
#
# A database that predates the tracking table has every file applied
# once more on its first boot with this script, exactly as before, and
# is tracked from then on.
#
# To force a file to run again:
#   docker compose exec db psql -U postgres -c \
#     "delete from snatzee_meta.schema_migrations where filename = '0022_hardening_and_fixes.sql'"
# =====================================================================
set -euo pipefail

export PGPASSWORD="$POSTGRES_PASSWORD"
# The defaults are the compose stack; the database tests point these at a
# throwaway Postgres instead (see scripts/test-db.sh).
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-postgres}"
COMPAT_SQL="${COMPAT_SQL:-/sql/supabase-compat.sql}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"
PSQL=(psql --host="$DB_HOST" --port="$DB_PORT" --username=postgres --dbname="$DB_NAME" --no-psqlrc --quiet -v ON_ERROR_STOP=1)

fail() {
  echo ""
  echo "=====================================================================" >&2
  echo "Migration aborted: $1" >&2
  echo "" >&2
  echo "Current state:" >&2
  "${PSQL[@]}" -tAc "
    select 'auth.users     = ' || coalesce(to_regclass('auth.users')::text, 'MISSING')
    union all
    select 'storage.objects= ' || coalesce(to_regclass('storage.objects')::text, 'MISSING')
    union all
    select 'auth.uid()     = ' || coalesce(to_regprocedure('auth.uid()')::text, 'MISSING')
  " >&2 2>/dev/null || echo "  (could not reach the database)" >&2
  echo "" >&2
  echo "Check the service that owns the missing piece:" >&2
  echo "  docker compose logs auth" >&2
  echo "  docker compose logs storage" >&2
  echo "  docker compose logs db" >&2
  echo "=====================================================================" >&2
  exit 1
}

echo "Verifying the Supabase services have prepared their schemas..."

# Belt and braces: the health checks should already guarantee this, but a
# clear message here beats a confusing failure inside a migration.
for attempt in $(seq 1 30); do
  if "${PSQL[@]}" -tAc "select to_regclass('auth.users') is not null
                          and to_regclass('storage.objects') is not null" 2>/dev/null | grep -q '^t$'; then
    ready=yes
    break
  fi
  sleep 2
done
[ "${ready:-no}" = yes ] || fail "auth.users or storage.objects never appeared"

echo "Applying Supabase compatibility helpers..."
"${PSQL[@]}" -f "$COMPAT_SQL" || fail "supabase-compat.sql failed"

"${PSQL[@]}" -tAc "select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'auth' and p.proname = 'uid'" | grep -q 1 \
  || fail "auth.uid() is still missing — RLS cannot work without it"

echo "Preparing the migration ledger..."
# Its own schema, so PostgREST never exposes it.
"${PSQL[@]}" -c "
  create schema if not exists snatzee_meta;
  revoke all on schema snatzee_meta from public;
  create table if not exists snatzee_meta.schema_migrations (
    filename   text primary key,
    applied_at timestamptz not null default now()
  );
" || fail "could not create snatzee_meta.schema_migrations"

echo "Applying Snatzee migrations..."
applied=0
for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"
  done_already="$("${PSQL[@]}" -tAc "select 1 from snatzee_meta.schema_migrations where filename = '$name'")"
  if [ "$done_already" = "1" ]; then
    continue
  fi
  echo "  -> $name"
  "${PSQL[@]}" -f "$file" || fail "$name failed"
  "${PSQL[@]}" -c "insert into snatzee_meta.schema_migrations (filename) values ('$name') on conflict do nothing" \
    || fail "could not record $name as applied"
  applied=$((applied + 1))
done
echo "  $applied new migration(s) applied."

# PostgREST builds its schema cache when it connects, which happens before
# these migrations run on a first boot. Without this it would keep serving a
# cache that predates every table and function here, and the app would get
# "Could not find the function public.get_leaderboard in the schema cache"
# until something restarted it.
echo "Asking PostgREST to reload its schema cache..."
"${PSQL[@]}" -c "notify pgrst, 'reload schema';" || \
  echo "  (could not notify PostgREST; restart the rest service if the API 404s)" >&2

echo ""
echo "Schema is up to date."
