#!/bin/bash
# Runs once when the primary is first initialized (docker-entrypoint-initdb.d).
# Creates the replication role and opens pg_hba for replicas to connect.
set -e

REPL_USER="${REPL_USER:-repluser}"
REPL_PASSWORD="${REPL_PASSWORD:-replpass}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE ${REPL_USER} WITH REPLICATION LOGIN PASSWORD '${REPL_PASSWORD}';
EOSQL

cat >> "$PGDATA/pg_hba.conf" <<EOF

# --- replication access (added by init.sh) ---
host    replication     ${REPL_USER}     0.0.0.0/0     scram-sha-256
host    all             all              0.0.0.0/0     scram-sha-256
EOF

echo "[primary] init done: created role ${REPL_USER} and updated pg_hba.conf"
