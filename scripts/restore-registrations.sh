#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP="${1:-}"
if [[ -z "$BACKUP" || ! -f "$BACKUP" ]]; then
  echo "Usage: CONFIRM_RESTORE=YES bash scripts/restore-registrations.sh <backup.jsonl>" >&2
  exit 2
fi
if [[ "${CONFIRM_RESTORE:-}" != "YES" ]]; then
  echo "Refusing to restore without CONFIRM_RESTORE=YES." >&2
  exit 2
fi
BACKUP="$(cd "$(dirname "$BACKUP")" && pwd)/$(basename "$BACKUP")"
node "$ROOT/scripts/verify-registration-store.mjs" "$BACKUP"

# Preserve the current store before replacing it.
bash "$ROOT/scripts/backup-registrations.sh" "$ROOT/backups/pre-restore"

RESTART=0
TMP_CHECK="$(mktemp)"
cleanup() {
  local code=$?
  if [[ "$RESTART" == "1" ]]; then docker compose start summit >/dev/null || true; fi
  rm -f "$TMP_CHECK"
  exit "$code"
}
trap cleanup EXIT

if docker compose ps --status running --services | grep -qx summit; then
  docker compose stop summit >/dev/null
  RESTART=1
fi

# The one-off container mounts the same named data volume without starting the web service.
cat "$BACKUP" | docker compose run --rm --no-deps -T --entrypoint sh summit -c \
  'umask 077; cat > /data/registrations.jsonl.restore.tmp && mv /data/registrations.jsonl.restore.tmp /data/registrations.jsonl'

docker compose run --rm --no-deps -T --entrypoint sh summit -c \
  'if [ -f /data/registrations.jsonl ]; then cat /data/registrations.jsonl; fi' > "$TMP_CHECK"
node "$ROOT/scripts/verify-registration-store.mjs" "$TMP_CHECK"
cmp -s "$BACKUP" "$TMP_CHECK"
echo "Restore verified successfully."
