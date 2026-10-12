# ATI proxy server

Запуск функций из `yandex-proxy/` (CORS-прокси к api.ati.su и вебхук Digital Pipeline) как обычного HTTP-сервиса в Docker — без Яндекс Облака. Код функций не меняется: `server.js` превращает HTTP-запрос в событие формата Yandex API Gateway.

Развёртывается в составе общей инфраструктуры — см. [infra/README.md](../../infra/README.md). Публичный адрес: `https://api.zurus.tech/ati`.

| Маршрут (внутри контейнера) | Обработчик |
|---|---|
| `POST /webhook` | `yandex-proxy/webhook.js` — Digital Pipeline |
| `GET /healthz` | проверка работоспособности |
| всё остальное | `yandex-proxy/index.js` — прокси к `https://api.ati.su` |

## Переменные окружения

| Переменная | Описание |
|---|---|
| `PORT` | порт сервера, по умолчанию `8080` |
| `SERVICE_NAME` | имя сервиса в логах, по умолчанию `ati-proxy` |
| `ATI_API_KEY` | API-ключ ATI.SU (для вебхука) |
| `AMOCRM_ACCESS_TOKEN` | долгосрочный токен amoCRM (для вебхука) |
| `PROXY_URL` | необязательно; пусто — вебхук обращается к api.ati.su напрямую |

## Логи

JSON-строки в stdout с `request_id` (из заголовка `X-Request-Id` или сгенерированный, возвращается в ответе). Логи обработчиков (`console.log`) тоже переводятся в JSON с тем же `request_id`. По каждому запросу — итоговая строка `"type":"access"`; для ошибок — с телом ответа ATI.

## Локальный запуск

```bash
node server/server.js            # из папки виджета
curl localhost:8080/healthz

docker build -f server/Dockerfile -t ati-proxy .
docker run --rm -p 8080:8080 ati-proxy
```

## Настройки виджета

- В настройках виджета в amoCRM: `api_url` = `https://api.zurus.tech/ati`
- В `manifest.json` → `dp.webhook_url` = `https://api.zurus.tech/ati/webhook`
