#!/bin/bash
set -euo pipefail

# Start Ivory (original entrypoint behaviour)
cd /opt/ivory || exit
export GIN_MODE=release
export IVORY_STATIC_FILES_PATH="./web"
./service/ivory &
IVORY_PID=$!

cleanup() {
  kill "$IVORY_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Bootstrap cluster + Postgres credentials (idempotent, every container start)
if python3 /setup/ivory_setup.py; then
  echo "Ivory bootstrap complete"
else
  echo "Ivory bootstrap failed (UI still running)" >&2
fi

wait "$IVORY_PID"
