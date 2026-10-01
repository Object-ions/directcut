#!/usr/bin/env bash
# Nightly Directcut snapshot: SQLite DB (safe .backup copy, includes stored
# settings such as the OpenRouter key), media files, and .env if present.
# Output: $BACKUP_DIR/directcut-YYYY-MM-DD.tar.gz (mode 600) — keeps the newest $KEEP.
# Configure via env: DIRECTCUT_DIR (the server/ directory), BACKUP_DIR, KEEP.
set -euo pipefail

SRC=${DIRECTCUT_DIR:-"$(cd "$(dirname "$0")/../server" && pwd)"}
DEST=${BACKUP_DIR:-/var/backups/directcut}
KEEP=${KEEP:-14}
STAMP=$(date -u +%F)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

umask 077
mkdir -p "$DEST"

# Consistent SQLite copy even mid-write (WAL-aware), via the app's own driver.
node -e "
const D = require('$SRC/node_modules/better-sqlite3');
new D('$SRC/data/directcut.db', { readonly: true }).backup('$WORK/directcut.db')
  .then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
"

EXTRA=(media)
[ -f "$SRC/.env" ] && EXTRA+=(.env)
tar -czf "$DEST/directcut-$STAMP.tar.gz" \
  -C "$WORK" directcut.db \
  -C "$SRC" "${EXTRA[@]}"

# Rotate: newest $KEEP stay.
ls -1t "$DEST"/directcut-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "directcut backup ok: $DEST/directcut-$STAMP.tar.gz ($(du -h "$DEST/directcut-$STAMP.tar.gz" | cut -f1))"
