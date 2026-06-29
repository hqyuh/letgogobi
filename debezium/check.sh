#!/bin/sh
set -eu

CONNECTOR="${DEBEZIUM_CONNECTOR:-order-svc-postgres-connector}"
CONNECT_URL="${DEBEZIUM_CONNECT_URL:-http://localhost:8083}"
SLOT_NAME="${DEBEZIUM_SLOT:-debezium_order_svc}"
DB_CONTAINER="${POSTGRES_CONTAINER:-database2}"
DB_USER="${POSTGRES_USER:-postgresql}"
DB_NAME="${POSTGRES_DB:-kafka_hqh}"
TOPIC="${DEBEZIUM_TOPIC:-cdc.order-svc.created.outbox_event}"
KAFKA_CONTAINER="${KAFKA_CONTAINER:-kafka}"
LAG_WARN_BYTES="${DEBEZIUM_LAG_WARN_BYTES:-100000}"

psql_query() {
  docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1"
}

echo "=== Debezium health check ==="
echo ""

SLOT_HEX=$(psql_query "SELECT confirmed_flush_lsn::text FROM pg_replication_slots WHERE slot_name='$SLOT_NAME';" || true)
if [ -z "$SLOT_HEX" ]; then
  echo "Postgres slot '$SLOT_NAME': NOT FOUND"
  PG_LSN=""
  LAG=""
  CURRENT_WAL=""
else
  PG_LSN=$(psql_query "SELECT pg_wal_lsn_diff(confirmed_flush_lsn,'0/0') FROM pg_replication_slots WHERE slot_name='$SLOT_NAME';")
  CURRENT_WAL=$(psql_query "SELECT pg_wal_lsn_diff(pg_current_wal_lsn(),'0/0');")
  LAG=$(psql_query "SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) FROM pg_replication_slots WHERE slot_name='$SLOT_NAME';")
  ACTIVE=$(psql_query "SELECT active FROM pg_replication_slots WHERE slot_name='$SLOT_NAME';")
  echo "Postgres slot:              $SLOT_NAME (active=$ACTIVE)"
  echo "confirmed_flush_lsn (hex):  $SLOT_HEX"
  echo "confirmed_flush_lsn (dec):  $PG_LSN"
  echo "current_wal (dec):          $CURRENT_WAL"
  echo "lag_bytes:                  $LAG"
fi

echo ""

STATUS_JSON=$(curl -sf "$CONNECT_URL/connectors/$CONNECTOR/status" 2>/dev/null || true)
if [ -z "$STATUS_JSON" ]; then
  echo "Debezium connector:         NOT REACHABLE ($CONNECT_URL)"
  CONNECTOR_STATE="UNKNOWN"
  TASK_STATE="UNKNOWN"
  DBZ_LSN="NONE"
else
  CONNECTOR_STATE=$(printf '%s' "$STATUS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['connector']['state'])")
  TASK_STATE=$(printf '%s' "$STATUS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tasks'][0]['state'] if d.get('tasks') else 'NONE')")
  echo "Debezium connector:         $CONNECTOR (connector=$CONNECTOR_STATE, task=$TASK_STATE)"

  OFFSET_JSON=$(curl -sf "$CONNECT_URL/connectors/$CONNECTOR/offsets" 2>/dev/null || true)
  if [ -z "$OFFSET_JSON" ]; then
    DBZ_LSN="NONE"
  else
    DBZ_LSN=$(printf '%s' "$OFFSET_JSON" | python3 -c "import sys,json; o=json.load(sys.stdin).get('offsets',[]); print(o[0]['offset']['lsn'] if o else 'NONE')")
  fi
  echo "Debezium offset lsn (dec):  $DBZ_LSN"
fi

echo ""

TOPIC_OFF=$(docker exec "$KAFKA_CONTAINER" /opt/kafka/bin/kafka-get-offsets.sh \
  --bootstrap-server localhost:9092 \
  --topic "$TOPIC" 2>/dev/null | awk -F: '{print $3}' || true)
echo "Kafka topic:                $TOPIC"
echo "Kafka message count:        ${TOPIC_OFF:-UNKNOWN}"

echo ""
echo "=== Comparison ==="

if [ -z "$PG_LSN" ]; then
  echo "❌ Replication slot not found — connector not running or slot was dropped"
  exit 1
fi

if [ "$DBZ_LSN" = "NONE" ] || [ -z "$DBZ_LSN" ]; then
  echo "❌ Debezium has no offset yet (new connector / WAL not read)"
  exit 1
fi

if [ "$CONNECTOR_STATE" != "RUNNING" ] || [ "$TASK_STATE" != "RUNNING" ]; then
  echo "❌ Connector or task is not RUNNING"
  exit 1
fi

echo "Postgres ($PG_LSN) vs Debezium ($DBZ_LSN):"

if [ "$PG_LSN" = "$DBZ_LSN" ]; then
  echo "  → Same WAL position (hex $SLOT_HEX = decimal $PG_LSN)"
else
  DIFF=$((PG_LSN > DBZ_LSN ? PG_LSN - DBZ_LSN : DBZ_LSN - PG_LSN))
  echo "  → Mismatch of $DIFF bytes — may be flushing; wait a few seconds and retry"
fi

if [ "$DBZ_LSN" -gt "$CURRENT_WAL" ] 2>/dev/null; then
  echo ""
  echo "❌ CRITICAL MISMATCH: Debezium offset ($DBZ_LSN) > current WAL ($CURRENT_WAL)"
  echo "   Common after prisma migrate reset. Run: pnpm debezium:reset"
  exit 1
fi

if [ "$LAG" -gt "$LAG_WARN_BYTES" ] 2>/dev/null; then
  echo ""
  echo "⚠️  High lag ($LAG bytes) — Debezium is behind the database"
  exit 1
fi

if [ "$PG_LSN" = "$DBZ_LSN" ] && [ "$LAG" -le "$LAG_WARN_BYTES" ] 2>/dev/null; then
  echo ""
  echo "✅ IN SYNC: Postgres slot = Debezium offset, low lag ($LAG bytes)"
  exit 0
fi

echo ""
echo "⚠️  Not fully in sync — retry in a few seconds or create a new order to test publish"
exit 1
