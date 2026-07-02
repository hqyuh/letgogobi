#!/bin/bash
# Shared helpers for the test scripts. Sourced by async.sh/semi.sh/sync.sh/quorum.sh/lag.sh
set -e

# Container / connection settings. Override via env vars to target another stack, e.g.
#   PRIMARY_CONTAINER=pg-primary REPLICA1_CONTAINER=pg-replica1 REPLICA2_CONTAINER=pg-replica2 \
#   PG_USER=postgresql PG_DB=kafka_hqh bash replication/tests/sync.sh
PRIMARY="${PRIMARY_CONTAINER:-pg-primary-cc}"
REPLICA1="${REPLICA1_CONTAINER:-pg-replica1-cc}"
REPLICA2="${REPLICA2_CONTAINER:-pg-replica2-cc}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-appdb}"

P="docker exec $PRIMARY psql -U $PG_USER -d $PG_DB -t -A"
R1="docker exec $REPLICA1 psql -U $PG_USER -d $PG_DB -t -A"
R2="docker exec $REPLICA2 psql -U $PG_USER -d $PG_DB -t -A"

line() { echo "============================================================"; }

set_mode() {
  local names="$1" commit="$2"
  docker exec "$PRIMARY" psql -U "$PG_USER" -d "$PG_DB" \
    -c "ALTER SYSTEM SET synchronous_standby_names='$names'" \
    -c "ALTER SYSTEM SET synchronous_commit='$commit'" \
    -c "SELECT pg_reload_conf()" >/dev/null
  sleep 1
}

run_mode() {
  local label="$1" names="$2" commit="$3"
  line
  echo "MODE: $label   (synchronous_commit=$commit, standby_names='${names:-<empty>}')"
  line

  set_mode "$names" "$commit"

  echo "- sync_state:"
  docker exec "$PRIMARY" psql -U "$PG_USER" -d "$PG_DB" \
    -c "SELECT application_name, sync_state FROM pg_stat_replication ORDER BY application_name"

  $P -c "SET client_min_messages=warning; CREATE TABLE IF NOT EXISTS demo(id serial primary key, v text, created_at timestamptz default now())" >/dev/null
  local token="t-$label-$(date +%s)-$RANDOM"
  local timing
  timing=$(docker exec "$PRIMARY" psql -U "$PG_USER" -d "$PG_DB" \
    -c "\timing on" \
    -c "INSERT INTO demo(v) VALUES ('$token')" 2>&1 | grep -i "^Time:" | head -1)
  echo "- INSERT time: ${timing:-N/A}"

  sleep 1
  echo "- replica1 has token -> $($R1 -c "SELECT count(*) FROM demo WHERE v='$token'") | replica2 has token -> $($R2 -c "SELECT count(*) FROM demo WHERE v='$token'")"
  echo "- replica1 lag: $($R1 -c "SELECT coalesce((now()-pg_last_xact_replay_timestamp())::text,'0')")"

  echo "- Try writing on replica (must be rejected):"
  docker exec "$REPLICA1" psql -U "$PG_USER" -d "$PG_DB" -c "INSERT INTO demo(v) VALUES('x')" 2>&1 | grep -i "read-only" || echo "  (!) no read-only error found"
}
