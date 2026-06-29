#!/bin/bash
# Replica entrypoint: on first run, clone data from the primary via pg_basebackup,
# then start as a standby (streaming replication).
set -e

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
PRIMARY_HOST="${PRIMARY_HOST:-pg-primary}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
REPL_USER="${REPL_USER:-repluser}"
REPL_PASSWORD="${REPL_PASSWORD:-replpass}"
APP_NAME="${APP_NAME:-replica}"
SLOT_NAME="${SLOT_NAME:-replica_slot}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[replica:$APP_NAME] empty data dir -> bootstrapping from primary $PRIMARY_HOST"

  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  chmod 0700 "$PGDATA"

  until pg_isready -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$REPL_USER" >/dev/null 2>&1; do
    echo "[replica:$APP_NAME] waiting for primary..."
    sleep 2
  done

  # -R: write standby.signal + primary_conninfo automatically
  # -C -S: create a dedicated replication slot for this replica
  # application_name is part of the conninfo to match synchronous_standby_names
  PGPASSWORD="$REPL_PASSWORD" gosu postgres pg_basebackup \
    -d "host=$PRIMARY_HOST port=$PRIMARY_PORT user=$REPL_USER password=$REPL_PASSWORD application_name=$APP_NAME" \
    -D "$PGDATA" -Fp -Xs -P -R -C -S "$SLOT_NAME"

  echo "[replica:$APP_NAME] basebackup complete."
fi

exec docker-entrypoint.sh postgres
