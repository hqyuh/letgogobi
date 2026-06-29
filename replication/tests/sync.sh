#!/bin/bash
# Test SYNC mode. Run: bash replication/tests/sync.sh
cd "$(dirname "$0")"
source ./common.sh
run_mode "sync" "FIRST 1 (replica1, replica2)" "remote_apply"
