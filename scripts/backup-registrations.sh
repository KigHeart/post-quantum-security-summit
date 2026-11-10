#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${1:-$ROOT/backups}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/summit-registrations-$STAMP-$$.jsonl"
TMP="$(mktemp "$BACKUP_DIR/.summit-registrations-XXXXXX")"
RESTART=0

cleanup() {
  local code=$?
  if [[ "$RESTART" == "1" ]]; then docker compose start summit >/dev/null || true; fi
  if [[ -n "$TMP" ]]; then rm -f "$TMP"; fi
  exit "$code"
}
trap cleanup EXIT

if docker compose ps --status running --services | grep -qx summit; then
  docker compose stop summit >/dev/null
  RESTART=1
fi

# A short stop gives a consistent snapshot of the append-only file.
docker compose run --rm --no-deps -T --entrypoint sh summit -c \
  'if [ -f /data/registrations.jsonl ]; then cat /data/registrations.jsonl; fi' > "$TMP"

node "$ROOT/scripts/verify-registration-store.mjs" "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$TARGET"
TMP=""
echo "Backup created: $TARGET"
