#!/bin/bash
# Test SEMI-SYNC mode. Run: bash replication/tests/semi.sh
cd "$(dirname "$0")"
source ./common.sh
run_mode "semi" "FIRST 1 (replica1, replica2)" "remote_write"
