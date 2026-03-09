#!/bin/bash
# ────────────────────────────────────────────────────────────────
# Quest 4 – Linux Cron Wrapper Script
# ────────────────────────────────────────────────────────────────
# Add to crontab:
#   crontab -e
#   0 * * * * /absolute/path/to/rpa-pdf-tasks/quest4-linux/scheduler.sh
#
# Or run once manually:
#   bash quest4-linux/scheduler.sh
# ────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$SCRIPT_DIR/logs/cron.log"
ADDRESS="${CRAWL_ADDRESS:-서울특별시 강남구 테헤란로 152}"

mkdir -p "$SCRIPT_DIR/logs"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ── Cron run started ──" >> "$LOG_FILE"

cd "$PROJECT_DIR"

node "$SCRIPT_DIR/crawler-linux.js" \
  --address "$ADDRESS" \
  --output json \
  >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Crawl completed successfully" >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Crawl failed with exit code $EXIT_CODE" >> "$LOG_FILE"
fi

exit $EXIT_CODE
