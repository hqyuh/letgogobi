#!/bin/bash
# Runner that invokes per-mode tests (one file each in tests/).
# Usage:
#   bash replication/test.sh            # run all 4 modes in sequence
#   bash replication/test.sh sync       # run one: async|semi|sync|quorum|lag
set -e
cd "$(dirname "$0")/tests"

case "${1:-all}" in
  async|semi|sync|quorum|lag) bash "./$1.sh" ;;
  all)
    bash ./async.sh
    bash ./semi.sh
    bash ./sync.sh
    bash ./quorum.sh
    ;;
  *) echo "Invalid argument: $1 (choose: async|semi|sync|quorum|lag, or empty = all)"; exit 1 ;;
esac
