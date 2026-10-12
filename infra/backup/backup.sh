#!/bin/sh
# Бэкап всех баз PostgreSQL. Ручной запуск:
#   docker compose exec pg-backup backup.sh
set -eu

BACKUP_DIR=/backups
TS=$(date -u +%Y%m%d-%H%M%S)
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-3}"
S3_RETENTION_DAYS="${S3_RETENTION_DAYS:-30}"

log() {
    level=$1; shift
    msg=$(printf '%s' "$*" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')
    printf '{"ts":"%s","level":"%s","service":"pg-backup","msg":"%s"}\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$level" "$msg"
}

fail() {
    log error "Backup FAILED: $*"
    exit 1
}

log info "Backup started ($TS)"

DATABASES=$(psql -d postgres -At -c "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'") \
    || fail "cannot list databases"

pg_dumpall --globals-only > "$BACKUP_DIR/globals-$TS.sql" 2>/tmp/err || fail "globals: $(cat /tmp/err)"

for db in $DATABASES; do
    file="$BACKUP_DIR/$db-$TS.dump"
    pg_dump -Fc -d "$db" -f "$file" 2>/tmp/err || fail "$db: $(cat /tmp/err)"
    log info "Dumped $db ($(du -h "$file" | cut -f1))"
done

if [ -n "${S3_BUCKET:-}" ]; then
    rclone copy "$BACKUP_DIR" "s3:$S3_BUCKET/$S3_PREFIX" --include "*-$TS.*" 2>/tmp/err \
        || fail "upload to S3: $(cat /tmp/err)"
    rclone delete "s3:$S3_BUCKET/$S3_PREFIX" --min-age "${S3_RETENTION_DAYS}d" 2>/tmp/err \
        || log warn "S3 cleanup failed: $(cat /tmp/err)"
    log info "Uploaded to s3:$S3_BUCKET/$S3_PREFIX"
else
    log warn "S3_BUCKET is empty — backup is stored on this server only"
fi

find "$BACKUP_DIR" -type f -mtime +"$LOCAL_RETENTION_DAYS" -delete

log info "Backup finished ($TS)"
