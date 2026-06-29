#!/bin/bash
# Test QUORUM SYNC mode. Run: bash replication/tests/quorum.sh
cd "$(dirname "$0")"
source ./common.sh
run_mode "quorum" "ANY 1 (replica1, replica2)" "on"
