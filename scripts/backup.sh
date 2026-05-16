#!/bin/sh
# Daily mongodump with 7-day rotation.
# Usage: backup.sh         — single run
#        backup.sh loop    — daemonized loop, dumps once every 24h
set -eu

DB_HOST="${BACKUP_MONGO_HOST:-mongo}"
DB_PORT="${BACKUP_MONGO_PORT:-27017}"
DB_NAME="${BACKUP_MONGO_DB:-alyona_bot}"
OUT_DIR="${BACKUP_OUT_DIR:-/backups}"
KEEP="${BACKUP_KEEP_DAYS:-7}"

mkdir -p "$OUT_DIR"

dump_once() {
  ts="$(date -u +%Y-%m-%d_%H%M%S)"
  archive="$OUT_DIR/$DB_NAME-$ts.archive.gz"
  echo "[backup] $(date -u) starting dump → $archive"
  if mongodump \
        --host="$DB_HOST" --port="$DB_PORT" \
        --db="$DB_NAME" \
        --archive="$archive" --gzip \
        --quiet
  then
    echo "[backup] dump ok ($(du -h "$archive" | cut -f1))"
  else
    echo "[backup] dump FAILED (exit $?)"
    rm -f "$archive"
    return 1
  fi

  # Rotate — keep only the newest $KEEP
  count_to_delete="$(ls -1t "$OUT_DIR"/"$DB_NAME"-*.archive.gz 2>/dev/null | tail -n +$((KEEP + 1)) | wc -l | tr -d ' ')"
  if [ "$count_to_delete" -gt 0 ]; then
    echo "[backup] rotating: removing $count_to_delete old archive(s)"
    ls -1t "$OUT_DIR"/"$DB_NAME"-*.archive.gz | tail -n +$((KEEP + 1)) | xargs rm -f --
  fi
}

case "${1:-once}" in
  once)
    dump_once
    ;;
  loop)
    # Wait a short bit on first start (mongo healthcheck should already be green
    # because of depends_on condition, but extra safety).
    sleep 10
    while true; do
      if ! dump_once; then
        echo "[backup] retrying in 5min"
        sleep 300
        continue
      fi
      sleep 86400
    done
    ;;
  *)
    echo "usage: $0 [once|loop]"
    exit 64
    ;;
esac
