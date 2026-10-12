# Ночные бэкапы PostgreSQL: pg_dump → /backups → S3 (rclone)
FROM postgres:18-alpine

RUN apk add --no-cache rclone

COPY backup.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
