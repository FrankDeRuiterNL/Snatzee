#!/bin/bash
# =====================================================================
# Applies the Snatzee schema.
#
# Compose only starts this once db, auth and storage report healthy, so
# GoTrue and storage-api have already created the tables this schema
# attaches its foreign keys and policies to.
#
# Safe to run repeatedly: every migration is idempotent, so it runs on
# each `docker compose up` and picks up new migrations after a git pull.
# =====================================================================
set -euo pipefail

export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL=(psql --host=db --port=5432 --username=postgres --dbname=postgres --no-psqlrc --quiet -v ON_ERROR_STOP=1)

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
"${PSQL[@]}" -f /sql/supabase-compat.sql || fail "supabase-compat.sql failed"

"${PSQL[@]}" -tAc "select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'auth' and p.proname = 'uid'" | grep -q 1 \
  || fail "auth.uid() is still missing — RLS cannot work without it"

echo "Applying Snatzee migrations..."
for file in /migrations/*.sql; do
  echo "  -> $(basename "$file")"
  "${PSQL[@]}" -f "$file" || fail "$(basename "$file") failed"
done

echo ""
echo "Schema is up to date."
