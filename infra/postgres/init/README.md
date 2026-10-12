SQL- и sh-скрипты из этой папки выполняются один раз — при первом запуске PostgreSQL на пустом томе.
Сюда кладём создание баз и пользователей для сервисов, например `01-integration.sql`:

```sql
CREATE USER integration WITH PASSWORD '...';
CREATE DATABASE integration OWNER integration;
```
