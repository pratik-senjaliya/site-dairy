#!/usr/bin/env bash
# Nightly Postgres backup with 30-day retention, for a self-hosted VPS (managed Postgres has its own backups).
# cron: 30 1 * * *  DATABASE_URL=... BACKUP_DIR=/var/backups/site-diary /opt/site-diary/infra/backup.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
DIR="${BACKUP_DIR:-/var/backups/site-diary}"
mkdir -p "$DIR"
FILE="$DIR/site-diary-$(TZ=Asia/Kolkata date +%F-%H%M).dump"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$FILE"
find "$DIR" -name 'site-diary-*.dump' -mtime +30 -delete
echo "backup: $FILE ($(du -h "$FILE" | cut -f1))"
# Restore: pg_restore --clean --no-owner --dbname="$DATABASE_URL" <file>
