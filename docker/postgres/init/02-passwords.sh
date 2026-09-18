#!/bin/bash
# =====================================================================
# Gives the service roles the password from the environment.
#
# Kept out of the .sql files so the secret is never written into the
# repository or baked into the image.
# =====================================================================
set -euo pipefail

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
alter role authenticator           with password '${POSTGRES_PASSWORD}';
alter role supabase_auth_admin     with password '${POSTGRES_PASSWORD}';
alter role supabase_storage_admin  with password '${POSTGRES_PASSWORD}';
SQL

echo "Service role passwords configured."
