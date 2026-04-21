# Основные сущности amoCRM API v4

## Оглавление
- Сделки (Leads)
- Контакты (Contacts)
- Компании (Companies)
- Задачи (Tasks)
- Связи сущностей (Entity Links)
- Теги (Tags)
- Комплексное добавление

---

## Сделки (Leads)

### Список сделок
```
GET /api/v4/leads
```
GET-параметры: `with` (string), `page` (int), `limit` (int, max 250), `query` (string/int), `filter` (object), `order` (object — поля: created_at, updated_at, id; значения: asc, desc)

Параметры with: `catalog_elements`, `is_price_modified_by_robot`, `loss_reason`, `contacts`, `only_deleted`, `source_id`

Модель сделки:
- `id` (int) — ID сделки
- `name` (string) — Название
- `price` (int) — Бюджет
- `responsible_user_id` (int) — Ответственный
- `group_id` (int) — Группа ответственного
- `status_id` (int) — ID статуса (этапа воронки)
- `pipeline_id` (int) — ID воронки
- `loss_reason_id` (int) — ID причины отказа
- `source_id` (int) — ID источника (нужен with=source_id)
- `created_by` (int), `updated_by` (int)
- `created_at` (int), `updated_at` (int), `closed_at` (int) — Unix Timestamp
- `closest_task_at` (int) — Ближайшая задача
- `is_deleted` (bool)
- `custom_fields_values` (array|null) — Доп. поля
- `score` (int|null)
- `_embedded[tags]`, `_embedded[contacts]`, `_embedded[companies]`, `_embedded[catalog_elements]`

HTTP коды: 200 (ОК), 204 (нет данных), 401 (не авторизован), 402 (не оплачен)

### Получение сделки по ID
```
GET /api/v4/leads/{id}
```

### Добавление сделок
```
POST /api/v4/leads
Content-Type: application/json
```
Тело — массив объектов сделок. До 250 за запрос.

Пример:
```json
[
    {
        "name": "Сделка для примера",
        "price": 20000,
        "status_id": 142,
        "pipeline_id": 31,
        "responsible_user_id": 123,
        "custom_fields_values": [
            {
                "field_id": 294471,
                "values": [
                    {"value": "Наш продукт"}
                ]
            }
        ],
        "_embedded": {
            "tags": [{"name": "Тег"}]
        }
    }
]
```

### Комплексное добавление сделок (с контактом и компанией)
```
POST /api/v4/leads/complex
Content-Type: application/json
```
Позволяет за один запрос создать сделку + контакт + компанию с привязкой.

Пример:
```json
[
    {
        "name": "Сделка",
        "price": 20000,
        "_embedded": {
            "contacts": [
                {
                    "first_name": "Иван",
                    "last_name": "Иванов",
                    "custom_fields_values": [
                        {
                            "field_code": "PHONE",
                            "values": [{"value": "+79999999999", "enum_code": "WORK"}]
                        },
                        {
                            "field_code": "EMAIL",
                            "values": [{"value": "ivan@example.com", "enum_code": "WORK"}]
                        }
                    ]
                }
            ],
            "companies": [
                {"name": "ООО Тест"}
            ]
        }
    }
]
```

### Редактирование сделок
```
PATCH /api/v4/leads
PATCH /api/v4/leads/{id}
```
Пакетно — массив объектов с `id`. Одиночно — объект без массива.

Пример — переместить сделку в другой статус:
```json
[
    {
        "id": 54886,
        "status_id": 143,
        "pipeline_id": 31
    }
]
```

---

## Контакты (Contacts)

### Список контактов
```
GET /api/v4/contacts
```
GET-параметры: `with`, `page`, `limit` (max 250), `query`, `filter`, `order` (поля: updated_at, id)

Параметры with: `catalog_elements`, `leads`, `customers`

Модель контакта:
- `id`, `name`, `first_name`, `last_name`
- `responsible_user_id`, `group_id`
- `created_by`, `updated_by`
- `created_at`, `updated_at` (Unix Timestamp)
- `is_deleted` (bool)
- `closest_task_at`
- `custom_fields_values` (array|null)
- `_embedded[tags]`, `_embedded[companies]`, `_embedded[leads]`, `_embedded[customers]`

### Получение контакта по ID
```
GET /api/v4/contacts/{id}
```

### Добавление контактов
```
POST /api/v4/contacts
```
Пример:
```json
[
    {
        "first_name": "Пётр",
        "last_name": "Смирнов",
        "custom_fields_values": [
            {
                "field_code": "PHONE",
                "values": [{"value": "+79001112233", "enum_code": "WORK"}]
            },
            {
                "field_code": "EMAIL",
                "values": [{"value": "petr@example.com", "enum_code": "WORK"}]
            }
        ],
        "tags_to_add": [{"name": "Новый клиент"}]
    }
]
```

### Редактирование контактов
```
PATCH /api/v4/contacts
PATCH /api/v4/contacts/{id}
```
Поддерживает `tags_to_add` и `tags_to_delete` для управления тегами.

### Привязка чатов к контактам
```
POST /api/v4/contacts/chats
```
Чат может быть привязан только к 1 контакту. Требует прав администратора.

---

## Компании (Companies)

### Список компаний
```
GET /api/v4/companies
```
GET-параметры: `with`, `page`, `limit` (max 250), `query`, `filter`, `order` (поля: updated_at, id)

Параметры with: `catalog_elements`, `leads`, `customers`, `contacts`

Модель компании:
- `id`, `name`
- `responsible_user_id`, `group_id`
- `created_by`, `updated_by`
- `created_at`, `updated_at` (Unix Timestamp)
- `is_deleted` (bool)
- `closest_task_at`
- `custom_fields_values` (array|null)
- `_embedded[tags]`, `_embedded[contacts]`, `_embedded[leads]`, `_embedded[customers]`

### Получение компании по ID
```
GET /api/v4/companies/{id}
```

### Добавление компаний
```
POST /api/v4/companies
```

### Редактирование компаний
```
PATCH /api/v4/companies
PATCH /api/v4/companies/{id}
```

---

## Задачи (Tasks)

Задача — самостоятельная сущность, может быть привязана к сделке, контакту, компании, покупателю. Обязательно: ответственный + дата выполнения. Стандартные типы: 1 — Звонок, 2 — Встреча.

### Список задач
```
GET /api/v4/tasks
```
Фильтры: `responsible_user_id`, `is_completed` (0/1), `task_type`, `entity_type` (leads/contacts/companies/customers), `entity_id`, `id`, `updated_at`

Сортировка: `created_at`, `complete_till`, `id`

Модель задачи:
- `id`, `created_by`, `updated_by`
- `created_at`, `updated_at` (Unix Timestamp)
- `responsible_user_id`, `group_id`
- `entity_id` (int), `entity_type` (string)
- `is_completed` (bool)
- `task_type_id` (int)
- `text` (string) — описание
- `duration` (int) — длительность в секундах
- `complete_till` (int) — Unix Timestamp срока
- `result` (object) — результат, `result[text]`

### Получение задачи по ID
```
GET /api/v4/tasks/{id}
```

### Добавление задач
```
POST /api/v4/tasks
```
Пример:
```json
[
    {
        "task_type_id": 1,
        "text": "Позвонить клиенту",
        "complete_till": 1588885140,
        "entity_id": 9785,
        "entity_type": "leads",
        "responsible_user_id": 504141
    }
]
```

### Редактирование задач
```
PATCH /api/v4/tasks
PATCH /api/v4/tasks/{id}
```

### Выполнение задачи
```
PATCH /api/v4/tasks/{id}
```
Передать `is_completed: true` и `result[text]`.

---

## Связи сущностей (Entity Links)

Позволяет связывать контакты, компании, сделки и покупатели между собой.

### Получение связей
```
GET /api/v4/{entity_type}/{entity_id}/links
```
entity_type: `leads`, `contacts`, `companies`, `customers`

### Привязка
```
POST /api/v4/{entity_type}/{entity_id}/links
```
Пример — привязать контакт к сделке:
```json
[
    {
        "to_entity_id": 10853,
        "to_entity_type": "contacts",
        "metadata": {
            "is_main": true
        }
    }
]
```

### Отвязка
```
POST /api/v4/{entity_type}/{entity_id}/unlink
```
```json
[
    {
        "to_entity_id": 10853,
        "to_entity_type": "contacts"
    }
]
```

---

## Теги (Tags)

### Список тегов
```
GET /api/v4/{entity_type}/tags
```
entity_type: `leads`, `contacts`, `companies`, `customers`

### Добавление тегов
```
POST /api/v4/{entity_type}/tags
```
Пример:
```json
[
    {"name": "Важный клиент"},
    {"name": "VIP"}
]
```

Для работы с тегами у конкретной сущности используй поля `tags_to_add` и `tags_to_delete` при создании/редактировании сущности.
