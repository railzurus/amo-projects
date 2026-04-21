---
name: amocrm-integration
description: >
  Создание серверных интеграций с amoCRM через REST API v4. Используй этот скилл
  всегда, когда пользователь упоминает amoCRM, amocrm, амоцрм, амо срм и хочет
  работать с API: получать/создавать/редактировать сделки, контакты, компании,
  задачи, покупателей, воронки, вебхуки, кастомные поля, события, примечания,
  списки (каталоги), источники, чаты и любые другие сущности amoCRM.
  Также используй при интеграции amoCRM с внешними сервисами (1С, Google Sheets,
  Telegram, и т.д.), при настройке OAuth-авторизации, при работе с вебхуками,
  при написании скриптов синхронизации данных. Если пользователь говорит
  "напиши интеграцию", "синхронизация с амо", "получить сделки из амо",
  "вебхук amoCRM", "подключиться к API амо" — это этот скилл.
  НЕ используй для создания виджетов (JS, manifest.json, script.js) —
  для этого есть отдельный скилл amocrm-widgets.
---

# amoCRM Integration Skill

Этот скилл помогает создавать серверные интеграции с amoCRM через REST API v4.

## Первым делом — собери параметры

Прежде чем писать любой код, ОБЯЗАТЕЛЬНО запроси у пользователя следующие параметры. Без них невозможно создать рабочую интеграцию.

### Обязательные параметры (запроси всегда)

1. **Субдомен аккаунта** — например `mycompany` (из `mycompany.amocrm.ru`). Нужен для формирования базового URL API.
2. **Тип авторизации** — спроси, что удобнее:
   - **Долгоживущий токен** (простая интеграция для одного аккаунта, токен берётся в настройках интеграции)
   - **OAuth 2.0** (для публичных интеграций или когда нужен доступ к чужим аккаунтам)
3. **Язык/фреймворк** — Python, Node.js, PHP или другой. По умолчанию предлагай Python (aiohttp/requests) или Node.js (axios/fetch).
4. **Что именно нужно сделать** — какие сущности, какие операции (CRUD), направление данных.

### Условные параметры (запроси если релевантно)

- **Внешний сервис** — если интеграция двусторонняя, уточни с чем (1С, Google Sheets, Telegram бот, webhook-приёмник и т.д.)
- **Вебхуки** — нужно ли подписываться на события из amoCRM
- **Кастомные поля** — есть ли специфичные поля, которые нужно обрабатывать (попроси ID или enum полей)
- **Воронка и этапы** — если работа со сделками, уточни pipeline_id и status_id при необходимости
- **Лимиты и пагинация** — для массовых операций уточни примерный объём данных

## Базовые правила API amoCRM v4

Прочитай `references/api-overview.md` для полной справки. Ключевые моменты:

- Базовый URL: `https://{subdomain}.amocrm.ru/api/v4/`
- Все запросы требуют заголовок `Authorization: Bearer {access_token}`
- Content-Type для POST/PATCH: `application/json`
- Успешные ответы: `application/hal+json`
- Ошибки: `application/problem+json`
- Лимит: **7 запросов в секунду**, при превышении — HTTP 429
- Пагинация: `?page=1&limit=250` (максимум 250 записей за запрос)
- ID сущностей — всегда int
- Даты — Unix Timestamp (int)

## Структура кода интеграции

При создании интеграции следуй этой структуре:

### 1. Модуль авторизации
Всегда начинай с авторизации. Подробности в `references/auth.md`.

Для долгоживущего токена — просто передавай его в заголовке.
Для OAuth 2.0 — реализуй получение, хранение и автообновление access/refresh токенов.

### 2. API-клиент
Создай обёртку для HTTP-запросов с:
- Автоматической подстановкой токена
- Обработкой rate-limit (429) с retry и backoff
- Обработкой ошибок (401 → обновление токена, 402 → аккаунт не оплачен)
- Пагинацией для GET-списков

### 3. Бизнес-логика
Функции для конкретных операций с сущностями. Справку по эндпоинтам бери из:
- `references/entities.md` — сделки, контакты, компании, задачи
- `references/webhooks.md` — подписка и обработка вебхуков
- `references/custom-fields.md` — работа с дополнительными полями
- `references/advanced.md` — воронки, покупатели, списки, события, источники

### 4. Обработка ошибок
Всегда включай обработку ошибок. Справочник кодов — в `references/api-overview.md`.

## Типовые паттерны

### Получение списка сущностей с пагинацией
```python
async def get_all_leads(client, params=None):
    leads = []
    page = 1
    while True:
        resp = await client.get(f"/api/v4/leads", params={**(params or {}), "page": page, "limit": 250})
        if resp.status == 204:
            break
        data = resp.json()
        leads.extend(data["_embedded"]["leads"])
        if not data.get("_links", {}).get("next"):
            break
        page += 1
    return leads
```

### Пакетное создание/обновление
amoCRM позволяет создавать/обновлять до 250 сущностей за один запрос. Передавай массив объектов в теле POST/PATCH.

### Обработка вебхуков
Вебхук приходит POST-запросом на указанный URL. Тело — form-urlencoded (НЕ JSON). Подробности в `references/webhooks.md`.

### Копирование/создание сущностей с кастомными полями

**ВАЖНО:** При создании или обновлении сущностей с `custom_fields_values` передавай только `field_id` и `values`. API не принимает дополнительные поля (`field_name`, `field_code`, `field_type`, `is_masked`) — они вызовут ошибку 400.

```javascript
// НЕПРАВИЛЬНО — копирование всего объекта поля
newLead.custom_fields_values = currentLead.custom_fields_values;

// ПРАВИЛЬНО — чистим field и values от лишних полей
newLead.custom_fields_values = currentLead.custom_fields_values.map(function(field) {
    // Внутри values оставляем только value и enum_id
    var cleanValues = field.values.map(function(v) {
        var cleanValue = {};
        if (v.value !== undefined) cleanValue.value = v.value;
        if (v.enum_id !== undefined) cleanValue.enum_id = v.enum_id;
        return cleanValue;
    });
    return {
        field_id: field.field_id,
        values: cleanValues
    };
});
```

```python
# Python вариант
def clean_value(v):
    result = {}
    if "value" in v: result["value"] = v["value"]
    if "enum_id" in v: result["enum_id"] = v["enum_id"]
    return result

new_lead["custom_fields_values"] = [
    {
        "field_id": f["field_id"],
        "values": [clean_value(v) for v in f["values"]]
    }
    for f in current_lead["custom_fields_values"]
]
```

**Лишние поля которые нужно удалять:**
- На уровне field: `field_name`, `field_code`, `field_type`, `is_masked`
- На уровне values: `enum_code`

## Антипаттерны — НЕ делай так

- НЕ делай больше 7 запросов в секунду — аккаунт заблокируют
- НЕ храни access_token в коде — используй переменные окружения или хранилище
- НЕ игнорируй refresh token — access_token живёт 24 часа, refresh — 3 месяца
- НЕ забывай про `with` параметр — без него связанные сущности не приходят
- НЕ отправляй пустой массив custom_fields_values — это сбросит поля
- НЕ полагайся на порядок полей в ответе — используй ID полей
- НЕ копируй custom_fields_values целиком — передавай только `field_id` и `values`, иначе ошибка 400

## Когда какой reference читать

| Задача | Reference файл |
|--------|---------------|
| Авторизация, токены, OAuth | `references/auth.md` |
| Сделки, контакты, компании, задачи | `references/entities.md` |
| Вебхуки (подписка + формат) | `references/webhooks.md` |
| Кастомные поля, типы полей | `references/custom-fields.md` |
| Воронки, покупатели, списки, события, источники, чаты | `references/advanced.md` |
| Коды ошибок, лимиты, общие правила API | `references/api-overview.md` |
