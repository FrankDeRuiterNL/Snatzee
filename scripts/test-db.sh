#!/bin/bash
# =====================================================================
# Runs every migration against a throwaway Postgres, twice, and then the
# SQL tests in tests/sql. Used by CI; runnable locally against any
# disposable database:
#
#   DB_HOST=localhost DB_PORT=5432 POSTGRES_PASSWORD=postgres scripts/test-db.sh
#
# Never point this at a real Snatzee database: the tests create users.
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-5432}"
export DB_NAME="${DB_NAME:-postgres}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
export PGPASSWORD="$POSTGRES_PASSWORD"
export COMPAT_SQL="$PWD/docker/postgres/supabase-compat.sql"
export MIGRATIONS_DIR="$PWD/supabase/migrations"

PSQL=(psql --host="$DB_HOST" --port="$DB_PORT" --username=postgres --dbname="$DB_NAME" --no-psqlrc --quiet -v ON_ERROR_STOP=1)

echo "== Supabase stand-in"
"${PSQL[@]}" -f tests/sql/00-supabase-stand-in.sql

echo "== First boot"
bash docker/migrate.sh

echo "== Second boot (must apply nothing and fail nothing)"
output="$(bash docker/migrate.sh)"
echo "$output" | grep -q "0 new migration(s) applied." || { echo "$output"; echo "second boot re-applied migrations"; exit 1; }

echo "== Every migration re-applied once more (an existing install's first boot)"
for file in supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$file" >/dev/null
done

for test in tests/sql/[1-9]*.sql; do
  echo "== $(basename "$test")"
  "${PSQL[@]}" -c "set client_min_messages = warning" -f "$test" >/dev/null
done

echo "All database tests passed."
