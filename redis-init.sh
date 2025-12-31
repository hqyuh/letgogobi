#!/bin/sh

# Start Redis in background with default password
# Create data directory if it doesn't exist
mkdir -p /data
redis-server --save 20 1 --loglevel warning --requirepass "$REDIS_PASSWORD" --appendonly yes --appendfsync everysec --dir /data &
REDIS_PID=$!

# Wait for Redis to be ready
echo "Waiting for Redis to start..."
i=0
while [ $i -lt 30 ]; do
  if redis-cli -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; then
    echo "Redis is ready!"
    break
  fi
  sleep 1
  i=$((i + 1))
done

# Create ACL user with username and password (if not exists)
echo "Creating ACL user: $REDIS_USERNAME"

# Check if user exists and delete if needed
if redis-cli -a "$REDIS_PASSWORD" ACL GETUSER "$REDIS_USERNAME" > /dev/null 2>&1; then
  echo "User $REDIS_USERNAME already exists, updating password..."
  redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ACL DELUSER "$REDIS_USERNAME" 2>/dev/null || true
fi

# Create user with password - use heredoc to properly handle the > prefix
redis-cli -a "$REDIS_PASSWORD" --no-auth-warning <<EOF
ACL SETUSER $REDIS_USERNAME on >$REDIS_PASSWORD ~* &* +@all
EOF

echo "ACL user configured successfully"

# Wait for Redis process
wait $REDIS_PID