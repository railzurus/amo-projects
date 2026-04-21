# Продвинутые сущности amoCRM API v4

## Оглавление
- Воронки и этапы (Pipelines)
- Покупатели (Customers)
- Списки/Каталоги (Catalogs)
- События и примечания (Events & Notes)
- Источники (Sources)
- Неразобранное (Unsorted)
- Звонки (Calls)
- Файлы (Files)

---

## Воронки и этапы (Pipelines)

### Список воронок
```
GET /api/v4/leads/pipelines
```

### Получение воронки по ID
```
GET /api/v4/leads/pipelines/{pipeline_id}
```

### Создание воронки
```
POST /api/v4/leads/pipelines
```
```json
[
    {
        "name": "Новая воронка",
        "is_main": false,
        "is_unsorted_on": true,
        "sort": 20,
        "_embedded": {
            "statuses": [
                {"name": "Первичный контакт", "sort": 10, "color": "#fffeb2"},
                {"name": "Переговоры", "sort": 20, "color": "#fffd7f"}
            ]
        }
    }
]
```

### Редактирование воронки
```
PATCH /api/v4/leads/pipelines/{pipeline_id}
```

### Удаление воронки
```
DELETE /api/v4/leads/pipelines/{pipeline_id}
```
Удалить главную воронку нельзя.

### Этапы (статусы) воронки
```
GET /api/v4/leads/pipelines/{pipeline_id}/statuses
GET /api/v4/leads/pipelines/{pipeline_id}/statuses/{status_id}
POST /api/v4/leads/pipelines/{pipeline_id}/statuses
PATCH /api/v4/leads/pipelines/{pipeline_id}/statuses/{status_id}
DELETE /api/v4/leads/pipelines/{pipeline_id}/statuses/{status_id}
```

Предопределённые статусы (есть во всех воронках):
- `142` — Успешно реализовано
- `143` — Закрыто и не реализовано

Модель статуса: `id`, `name`, `sort`, `is_editable`, `pipeline_id`, `color`, `type` (0 — обычный, 1 — успешно, 2 — неуспешно), `account_id`

---

## Покупатели (Customers)

Функционал покупателей может быть выключен. Проверяй через `GET /api/v4/account`.

### Список покупателей
```
GET /api/v4/customers
```
Фильтры: `filter[id]`, `filter[next_date]`, `filter[created_at]`

### Получение по ID
```
GET /api/v4/customers/{id}
```

### Создание
```
POST /api/v4/customers
```
```json
[
    {
        "name": "Покупатель",
        "next_price": 1000,
        "next_date": 1589648400,
        "responsible_user_id": 504141
    }
]
```

### Редактирование
```
PATCH /api/v4/customers
PATCH /api/v4/customers/{id}
```

### Транзакции покупателей
```
GET /api/v4/customers/{customer_id}/transactions
POST /api/v4/customers/{customer_id}/transactions
DELETE /api/v4/customers/{customer_id}/transactions/{transaction_id}
```

### Статусы покупателей
```
GET /api/v4/customers/statuses
POST /api/v4/customers/statuses
PATCH /api/v4/customers/statuses/{status_id}
DELETE /api/v4/customers/statuses/{status_id}
```

---

## Списки/Каталоги (Catalogs)

### Список каталогов
```
GET /api/v4/catalogs
```

### Получение каталога
```
GET /api/v4/catalogs/{catalog_id}
```

### Создание каталога
```
POST /api/v4/catalogs
```
```json
[
    {
        "name": "Товары",
        "type": "regular",
        "can_add_elements": true,
        "can_link_multiple": true
    }
]
```

### Элементы каталога
```
GET /api/v4/catalogs/{catalog_id}/elements
GET /api/v4/catalogs/{catalog_id}/elements/{element_id}
POST /api/v4/catalogs/{catalog_id}/elements
PATCH /api/v4/catalogs/{catalog_id}/elements
DELETE /api/v4/catalogs/{catalog_id}/elements/{element_id}
```

---

## События и примечания (Events & Notes)

### События (только чтение)
```
GET /api/v4/events
GET /api/v4/events/{event_id}
```
Фильтры: `filter[type]`, `filter[entity]`, `filter[entity_id]`, `filter[created_at]`

### Примечания
```
GET /api/v4/{entity_type}/{entity_id}/notes
POST /api/v4/{entity_type}/{entity_id}/notes
PATCH /api/v4/{entity_type}/{entity_id}/notes
```
entity_type: `leads`, `contacts`, `companies`, `customers`

Типы примечаний: `common` (обычное), `call_in`, `call_out` (звонки), `service_message`, `message_cashier`, `invoice_paid`, `geolocation`, `sms_in`, `sms_out`, `extended_service_message`

Пример — добавить обычное примечание к сделке:
```json
[
    {
        "note_type": "common",
        "params": {
            "text": "Клиент перезвонит завтра"
        }
    }
]
```

Пример — добавить примечание о звонке:
```json
[
    {
        "note_type": "call_in",
        "params": {
            "uniq": "unique_call_id_123",
            "duration": 120,
            "source": "Телефония",
            "link": "https://example.com/call.mp3",
            "phone": "+79001112233"
        }
    }
]
```

---

## Источники (Sources)

```
GET /api/v4/sources
GET /api/v4/sources/{source_id}
POST /api/v4/sources
PATCH /api/v4/sources/{source_id}
DELETE /api/v4/sources/{source_id}
```

Модель: `id`, `name`, `pipeline_id`, `external_id`, `default` (bool), `services` (array)

---

## Неразобранное (Unsorted)

### Список неразобранного
```
GET /api/v4/leads/unsorted
```
Фильтры: `filter[uid]`, `filter[category]` (sip, mail, forms, chats), `filter[pipeline_id]`, `filter[created_at]`

### Создание
```
POST /api/v4/leads/unsorted/{category}
```
category: `sip`, `forms`, `chats`

### Принятие
```
POST /api/v4/leads/unsorted/{uid}/accept
```

### Отклонение
```
DELETE /api/v4/leads/unsorted/{uid}/decline
```

### Привязка к существующим
```
POST /api/v4/leads/unsorted/{uid}/link
```

---

## Звонки (Calls)

Добавление звонка (без привязки к конкретной интеграции телефонии):
```
POST /api/v4/calls
```
```json
[
    {
        "direction": "inbound",
        "uniq": "unique_call_id",
        "duration": 120,
        "source": "Asterisk",
        "link": "https://example.com/record.mp3",
        "phone": "+79001112233",
        "call_result": "Успешный",
        "call_status": 4,
        "responsible_user_id": 504141,
        "created_by": 504141,
        "created_at": 1588885140
    }
]
```

call_status: 1 — оставил сообщение, 2 — перезвонить позже, 3 — нет на месте, 4 — разговор состоялся, 5 — неверный номер, 6 — не дозвонился, 7 — номер занят

---

## Файлы (Files)

### Загрузка файла
```
POST https://drive-{subdomain_hash}.amocrm.ru/v1.0/files
Content-Type: multipart/form-data
```

### Получение файла
```
GET https://drive-{subdomain_hash}.amocrm.ru/v1.0/files/{file_uuid}
```
