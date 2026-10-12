#!/bin/sh
# Пишем crontab из BACKUP_SCHEDULE и запускаем crond.
# Вывод бэкапа направляем в stdout контейнера, чтобы он был в docker logs / Dozzle.
set -eu

SCHEDULE="${BACKUP_SCHEDULE:-0 0 * * *}"
env | grep -E '^(PG|S3_|RCLONE_|LOCAL_RETENTION)' | while IFS='=' read -r key value; do
    printf "export %s='%s'\n" "$key" "$(printf '%s' "$value" | sed "s/'/'\\\\''/g")"
done > /etc/backup.env
echo "$SCHEDULE . /etc/backup.env && /usr/local/bin/backup.sh > /proc/1/fd/1 2>&1" > /etc/crontabs/root

printf '{"ts":"%s","level":"info","service":"pg-backup","msg":"Scheduled: %s (UTC)"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SCHEDULE"

exec crond -f -l 8
