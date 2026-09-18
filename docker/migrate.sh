#!/bin/sh
# =====================================================================
# Applies the Snatzee schema once GoTrue and storage-api have created
# their own. Safe to run repeatedly: every migration is idempotent.
# =====================================================================
set -eu

export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL="psql --host=db --username=postgres --dbname=postgres --no-psqlrc --quiet -v ON_ERROR_STOP=1"

echo "Waiting for the Supabase services to finish their own migrations..."

# auth.users is created by GoTrue, storage.objects by storage-api. Both
# must exist before the app's foreign keys and policies can be created.
attempt=0
until $PSQL -tAc "select to_regclass('auth.users') is not null
                   and to_regclass('storage.objects') is not null" | grep -q '^t$'; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Timed out waiting for auth.users and storage.objects." >&2
    $PSQL -tAc "select to_regclass('auth.users'), to_regclass('storage.objects')" >&2 || true
    exit 1
  fi
  sleep 2
done

echo "Applying Supabase compatibility helpers..."
$PSQL -f /sql/supabase-compat.sql

echo "Applying Snatzee migrations..."
for file in /migrations/*.sql; do
  echo "  -> $(basename "$file")"
  $PSQL -f "$file"
done

echo "Schema is up to date."
