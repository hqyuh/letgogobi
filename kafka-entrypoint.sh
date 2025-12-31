#!/bin/bash

# Function to create topic if it doesn't exist
create_topic_if_not_exists() {
  local topic=$1
  local partitions=${2:-3}
  
  if /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list 2>/dev/null | grep -q "^${topic}$"; then
    echo "Topic '$topic' already exists, skipping..."
  else
    echo "Creating topic '$topic' with $partitions partitions..."
    /opt/kafka/bin/kafka-topics.sh \
      --bootstrap-server localhost:9092 \
      --create \
      --topic "$topic" \
      --partitions "$partitions" \
      --replication-factor 1 \
      --if-not-exists 2>/dev/null || true
    echo "Topic '$topic' created successfully!"
  fi
}

# Create config directory if it doesn't exist
mkdir -p /opt/kafka/config/kraft

# Generate server.properties from environment variables
cat > /opt/kafka/config/kraft/server.properties <<EOF
# Generated from environment variables
process.roles=${KAFKA_PROCESS_ROLES:-broker,controller}
node.id=${KAFKA_NODE_ID:-1}
controller.quorum.voters=${KAFKA_CONTROLLER_QUORUM_VOTERS:-1@localhost:9093}
listeners=${KAFKA_LISTENERS:-INTERNAL://:9092,EXTERNAL://0.0.0.0:9094,CONTROLLER://:9093}
advertised.listeners=${KAFKA_ADVERTISED_LISTENERS:-INTERNAL://kafka:9092,EXTERNAL://localhost:9094}
listener.security.protocol.map=${KAFKA_LISTENER_SECURITY_PROTOCOL_MAP:-INTERNAL:PLAINTEXT,EXTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT}
inter.broker.listener.name=${KAFKA_INTER_BROKER_LISTENER_NAME:-INTERNAL}
controller.listener.names=${KAFKA_CONTROLLER_LISTENER_NAMES:-CONTROLLER}
log.dirs=${KAFKA_LOG_DIRS:-/var/lib/kafka/data}
offsets.topic.replication.factor=${KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR:-1}
transaction.state.log.replication.factor=${KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR:-1}
transaction.state.log.min.isr=${KAFKA_TRANSACTION_STATE_LOG_MIN_ISR:-1}
group.initial.rebalance.delay.ms=${KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS:-0}
EOF

# Format storage if needed
if [ ! -f /var/lib/kafka/data/meta.properties ]; then
  echo "Formatting Kafka storage..."
  CLUSTER_ID=$(/opt/kafka/bin/kafka-storage.sh random-uuid)
  /opt/kafka/bin/kafka-storage.sh format -t "$CLUSTER_ID" -c /opt/kafka/config/kraft/server.properties --ignore-formatted
else
  echo "Kafka storage already formatted, skipping..."
fi

# Start Kafka server in background
echo "Starting Kafka server..."
/opt/kafka/bin/kafka-server-start.sh /opt/kafka/config/kraft/server.properties &
KAFKA_PID=$!

# Wait for Kafka to be ready
echo "Waiting for Kafka to be ready..."
for i in {1..60}; do
  if /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 > /dev/null 2>&1; then
    echo "Kafka is ready!"
    break
  fi
  sleep 2
done

# Create topics in background
(
  sleep 5  # Give Kafka a bit more time to fully initialize
  echo "Creating Kafka topics..."
  create_topic_if_not_exists "order-svc.created" 3
  create_topic_if_not_exists "order-svc.created.reply" 3
  echo "All topics created successfully!"
) &

# Wait for Kafka process to keep container running
wait $KAFKA_PID