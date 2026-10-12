# Инфраструктура api.zurus.tech

Один VPS, Docker Compose. Caddy принимает HTTPS на `api.zurus.tech` и раскладывает запросы по сервисам по префиксу пути. Каждый сервис — отдельный контейнер.

| Путь | Контейнер | Что это |
|---|---|---|
| `/ati/*` | `ati-proxy` | CORS-прокси к ATI.SU и вебхук DP (`city-autocomplete-widget`) |
| `/logs/` | `dozzle` | просмотр логов всех контейнеров, под паролем |
| `/healthz` | caddy | `ok` — Caddy жив |
| — | `postgres` | PostgreSQL 18, только во внутренней сети `db` (профиль `db`) |
| — | `pg-backup` | ночной `pg_dump` всех баз → S3 (профиль `db`) |

Префикс отрезается: запрос `https://api.zurus.tech/ati/v2/cargos` приходит в `ati-proxy` как `/v2/cargos`.

## Развёртывание

Сервер: Ubuntu 22.04+/Debian 12, Docker с compose-плагином. Минимум 1 ГБ RAM, с PostgreSQL — 2 ГБ.

1. DNS: A-запись `api.zurus.tech` → IP сервера. Открыть порты 22, 80, 443 — больше ничего.
2. Склонировать репозиторий, например в `/opt/zurus` (compose собирает сервисы из соседних папок).
3. Заполнить настройки:

```bash
cd /opt/zurus/infra
cp .env.example .env
cp env/ati-proxy.env.example env/ati-proxy.env
# для профиля db — ещё postgres.env и backup.env
docker run --rm caddy:2.11-alpine caddy hash-password --plaintext 'пароль'   # → LOGS_PASSWORD_HASH
```

4. Запустить:

```bash
docker compose up -d --build              # без базы
docker compose --profile db up -d --build # с PostgreSQL и бэкапами
```

5. Проверить: `curl https://api.zurus.tech/ati/healthz` → `ok`.

Обновление после `git pull`: `docker compose up -d --build` (пересоберёт только изменённое).

## Логирование

### Как устроено

- **Все сервисы пишут JSON-строки в stdout**: `ts`, `level`, `service`, `request_id`, `msg` + поля по ситуации. Docker хранит их с ротацией: до 5 файлов по 10 МБ на контейнер, диск не переполнится.
- **Сквозной `request_id`.** Caddy выдаёт каждому запросу UUID, пишет его в свой лог (`request_id`), передаёт сервису в заголовке `X-Request-Id`, сервис ставит его во все свои строки и возвращает клиенту в заголовке ответа `X-Request-Id`. Если менеджер прислал скриншот с ошибкой из DevTools — по этому id находится вся цепочка.
- **Итоговая строка по каждому запросу** (`"type":"access"`): метод, путь, статус, длительность, IP, Origin. Уровень: `info` — успех, `warn` — 4xx или вебхук не смог отправить заявку в ATI, `error` — 5xx.
- **При ошибке в лог попадает тело ответа** (поле `response`, до 2000 символов) — ATI в нём объясняет, что не так с заявкой.
- **Секреты не логируются**: Caddy заменяет `Authorization` на `REDACTED`, сервисы пишут только признак наличия ключа.
- **PostgreSQL** логирует запросы дольше 1 с, изменения схемы и ожидания блокировок. **pg-backup** — начало, размер каждого дампа, выгрузку в S3 и `Backup FAILED: …` при сбое.

### Где смотреть

**В браузере**: `https://api.zurus.tech/logs/` — все контейнеры, поиск, фильтр по уровню, живой поток.

**По SSH**:

```bash
cd /opt/zurus/infra

docker compose logs -f ati-proxy                     # живой поток
docker compose logs --since 1h ati-proxy             # за последний час

# только ошибки и предупреждения
docker compose logs --no-log-prefix ati-proxy | jq -c 'select(.level=="error" or .level=="warn")'

# вся история одного запроса: Caddy + сервис
docker compose logs --no-log-prefix caddy ati-proxy | grep <request_id>

# вебхуки, которые не дошли до ATI, с причиной
docker compose logs --no-log-prefix ati-proxy | jq -c 'select(.route=="webhook" and .level!="info") | {ts, request_id, response}'

# медленные запросы к ATI (> 3 с)
docker compose logs --no-log-prefix ati-proxy | jq -c 'select(.type=="access" and .duration_ms > 3000)'

# результат последних бэкапов
docker compose logs --no-log-prefix pg-backup | tail -20
```

### Частые ситуации

| Симптом в логе | Что значит |
|---|---|
| `401` от ATI в `response` | неверный/просроченный API-ключ ATI в настройках виджета |
| `"route":"webhook"`, `"access_token and ati_api_key are required"` | не заполнен `env/ati-proxy.env` |
| `"route":"webhook"`, `warn`, в `response` — `error_list` | ATI отклонил заявку: в списке поля и причины |
| `Proxy error: Request timeout` | ATI не ответил за 30 с — проблема на стороне ATI или сети |
| `self-signed certificate in certificate chain` | HTTPS перехватывается (антивирус/прокси) — бывает только локально |
| в Caddy-логе запроса нет совсем | запрос не дошёл до сервера: DNS, блокировка, неправильный `api_url` |

## PostgreSQL

- Снаружи недоступна: порт не публикуется, контейнер только в сети `db`. Сервису, которому нужна база, добавить `networks: [web, db]`.
- Базы и пользователи для сервисов — SQL-скрипты в `postgres/init/` (выполняются при первом запуске на пустом томе) или вручную: `docker compose exec postgres psql -U postgres`.
- Доступ для администрирования — через SSH-туннель.

### Бэкапы

Каждую ночь в 03:00 МСК: `pg_dump` каждой базы + роли → `/backups` (хранится 3 дня) → S3 (хранится 30 дней). S3 должен быть **у другого провайдера**, иначе бэкап погибнет вместе с сервером.

```bash
docker compose exec pg-backup backup.sh                       # бэкап вручную
docker compose exec pg-backup ls -lh /backups                 # локальные копии

# восстановление базы из дампа
docker compose exec pg-backup sh -c 'pg_restore -d <db> --clean --if-exists /backups/<db>-<ts>.dump'
```

## Добавить новый сервис

1. Dockerfile в папке сервиса; сервис слушает `PORT` (8080) и пишет JSON-логи в stdout (образец — `city-autocomplete-widget/server/server.js`).
2. В `docker-compose.yml` — блок по образцу `ati-proxy` (`logging: *logging`, сеть `web`, при необходимости `db`), секреты — в `env/<сервис>.env`.
3. В `caddy/Caddyfile` — `handle_path /<сервис>/* { import service <контейнер>:8080 }`.
4. `docker compose up -d --build`.
