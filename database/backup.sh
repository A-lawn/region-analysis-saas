#!/bin/sh
# Daily database backup script — run via cron / docker
# Usage: docker compose exec postgis sh /docker-entrypoint-initdb.d/backup.sh

BACKUP_DIR="/var/lib/postgresql/data/backups"
DB_NAME="${DB_NAME:-region_analysis}"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup..."
pg_dump -U postgres "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "[$(date)] Backup complete: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  echo "[$(date)] Backup FAILED"
  exit 1
fi

# Cleanup old backups (> RETENTION_DAYS)
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Cleaned backups older than $RETENTION_DAYS days"
