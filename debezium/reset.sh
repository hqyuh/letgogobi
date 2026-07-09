#!/bin/sh
set -eu

CONNECTOR="${DEBEZIUM_CONNECTOR:-order-svc-postgres-connector}"
CONNECT_URL="${DEBEZIUM_CONNECT_URL:-http://localhost:8083}"
SLOT_NAME="${DEBEZIUM_SLOT:-debezium_order_svc}"
DB_CONTAINER="${POSTGRES_CONTAINER:-pg1}"
DB_HOST="${POSTGRES_HOST:-haproxy}"
DB_PORT="${POSTGRES_PORT:-5000}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_PASS="${POSTGRES_PASSWORD:-postgres}"
DB_NAME="${POSTGRES_DB:-kafka_hqh}"
CONFIG_FILE="$(cd "$(dirname "$0")" && pwd)/postgres-connector.json"

echo "=== Reset Debezium connector: $CONNECTOR ==="

if curl -sf "$CONNECT_URL/connectors/$CONNECTOR" >/dev/null 2>&1; then
  echo "Stopping connector..."
  curl -sf -X PUT "$CONNECT_URL/connectors/$CONNECTOR/stop" >/dev/null
  sleep 2
  echo "Deleting offsets..."
  curl -sf -X DELETE "$CONNECT_URL/connectors/$CONNECTOR/offsets" >/dev/null || true
  echo "Deleting connector..."
  curl -sf -X DELETE "$CONNECT_URL/connectors/$CONNECTOR" >/dev/null
  sleep 2
fi

echo "Dropping replication slot (if exists)..."
docker exec -e PGPASSWORD="$DB_PASS" "$DB_CONTAINER" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
  "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = '$SLOT_NAME') THEN PERFORM pg_drop_replication_slot('$SLOT_NAME'); END IF; END \$\$;"

echo "Registering connector..."
HTTP_CODE=$(curl -s -o /tmp/debezium-register.json -w "%{http_code}" -X POST "$CONNECT_URL/connectors" \
  -H "Content-Type: application/json" \
  -d @"$CONFIG_FILE")

if [ "$HTTP_CODE" != "201" ] && [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Register failed HTTP $HTTP_CODE"
  cat /tmp/debezium-register.json
  exit 1
fi

echo "Clearing stale offsets from Connect storage..."
curl -sf -X PUT "$CONNECT_URL/connectors/$CONNECTOR/stop" >/dev/null
sleep 2
curl -sf -X DELETE "$CONNECT_URL/connectors/$CONNECTOR/offsets" >/dev/null || true
curl -sf -X PUT "$CONNECT_URL/connectors/$CONNECTOR/resume" >/dev/null

sleep 5
echo ""
echo "=== Status after reset ==="
curl -sf "$CONNECT_URL/connectors/$CONNECTOR/status" | python3 -m json.tool 2>/dev/null || true
echo ""
echo "✅ Reset complete. Create a NEW order to test (snapshot.mode=never)."
echo "   Verify with: pnpm debezium:check"
