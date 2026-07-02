#!/bin/bash
# Test REPLICATION LAG (pause replay on replica1). Run: bash replication/tests/lag.sh
cd "$(dirname "$0")"
source ./common.sh

line; echo "TEST REPLICATION LAG (pause replay on replica1)"; line

echo "- Switch to ASYNC (so pausing replay won't block the primary)"
set_mode "" "on"

echo "- PAUSE replay on replica1 (simulate a slow replica)"
docker exec "$REPLICA1" psql -U "$PG_USER" -d "$PG_DB" -c "SELECT pg_wal_replay_pause()" >/dev/null

echo "- Write 5000 rows on primary"
$P -c "SET client_min_messages=warning; CREATE TABLE IF NOT EXISTS demo(id serial primary key, v text, created_at timestamptz default now())" >/dev/null
$P -c "INSERT INTO demo(v) SELECT 'lag-'||g FROM generate_series(1,5000) g" >/dev/null
sleep 3

echo "- LAG from PRIMARY:"
docker exec "$PRIMARY" psql -U "$PG_USER" -d "$PG_DB" -c "
  SELECT application_name, replay_lag,
         pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) AS bytes_behind
  FROM pg_stat_replication ORDER BY application_name"
echo "- Row count: primary=$($P -c 'SELECT count(*) FROM demo') | replica1=$($R1 -c 'SELECT count(*) FROM demo') (behind) | replica2=$($R2 -c 'SELECT count(*) FROM demo')"

echo "- RESUME replay -> replica1 catches up"
docker exec "$REPLICA1" psql -U "$PG_USER" -d "$PG_DB" -c "SELECT pg_wal_replay_resume()" >/dev/null
sleep 3
echo "- After resume: replica1=$($R1 -c 'SELECT count(*) FROM demo') rows, bytes_behind=$($P -c "SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) FROM pg_stat_replication WHERE application_name='replica1'")"

echo "- Restore SYNC mode"
set_mode "FIRST 1 (replica1, replica2)" "remote_apply"
line; echo "Lag test done."
