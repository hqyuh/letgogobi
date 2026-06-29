#!/bin/bash
# Test ASYNC mode. Run: bash replication/tests/async.sh
cd "$(dirname "$0")"
source ./common.sh
run_mode "async" "" "on"
