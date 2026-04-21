# Кастомные поля amoCRM API v4

## Оглавление
- Получение полей
- Создание полей
- Типы полей
- Примеры заполнения
- Группы полей

---

## Получение полей сущности

```
GET /api/v4/{entity_type}/custom_fields
```
entity_type: `leads`, `contacts`, `companies`, `customers`, `customers/segments`, `catalogs/{catalog_id}`

До 50 полей за запрос. Поддерживает пагинацию и фильтр по типу.

Модель поля:
- `id` (int) — ID поля
- `name` (string) — Название
- `code` (string) — Символьный код (можно использовать вместо ID)
- `type` (string) — Тип поля
- `sort` (int) — Сортировка
- `entity_type` (string) — Тип сущности
- `is_predefined` (bool) — Предустановленное ли
- `is_deletable` (bool) — Можно ли удалить
- `is_api_only` (bool) — Только через API
- `enums` (array|null) — Варианты значений для select/multiselect/radiobutton
- `group_id` (string|null) — ID группы полей
- `currency` (string|null) — Валюта (для monetary)

## Получение поля по ID
```
GET /api/v4/{entity_type}/custom_fields/{field_id}
```

## Создание полей
```
POST /api/v4/{entity_type}/custom_fields
```
Пример — создать текстовое поле для сделок:
```json
[
    {
        "name": "Источник заявки",
        "type": "text",
        "sort": 10
    }
]
```

Пример — создать поле-список:
```json
[
    {
        "name": "Приоритет",
        "type": "select",
        "enums": [
            {"value": "Низкий", "sort": 1},
            {"value": "Средний", "sort": 2},
            {"value": "Высокий", "sort": 3}
        ]
    }
]
```

## Редактирование полей
```
PATCH /api/v4/{entity_type}/custom_fields
PATCH /api/v4/{entity_type}/custom_fields/{field_id}
```

## Удаление поля
```
DELETE /api/v4/{entity_type}/custom_fields/{field_id}
```

---

## Типы полей

| Тип | Название | Контакт | Сделка | Компания | Покупатель | Каталог |
|-----|----------|---------|--------|----------|------------|---------|
| `text` | Текст | ✅ | ✅ | ✅ | ✅ | ✅ |
| `numeric` | Число | ✅ | ✅ | ✅ | ✅ | ✅ |
| `checkbox` | Флаг | ✅ | ✅ | ✅ | ✅ | ✅ |
| `select` | Список | ✅ | ✅ | ✅ | ✅ | ✅ |
| `multiselect` | Мультисписок | ✅ | ✅ | ✅ | ✅ | ✅ |
| `date` | Дата | ✅ | ✅ | ✅ | ✅ | ✅ |
| `url` | Ссылка | ✅ | ✅ | ✅ | ✅ | ✅ |
| `textarea` | Текстовая область | ✅ | ✅ | ✅ | ✅ | ✅ |
| `radiobutton` | Переключатель | ✅ | ✅ | ✅ | ✅ | ✅ |
| `streetaddress` | Короткий адрес | ✅ | ✅ | ✅ | ✅ | ✅ |
| `smart_address` | Адрес | ✅ | ✅ | ✅ | ❌ | ❌ |
| `birthday` | День рождения | ✅ | ✅ | ✅ | ❌ | ❌ |
| `legal_entity` | Юр. лицо | ✅ | ✅ | ✅ | ❌ | ❌ |
| `date_time` | Дата и время | ✅ | ✅ | ✅ | ✅ | ✅ |
| `multitext` | Мультитекст | ✅ | ❌ | ❌ | ❌ | ❌ |
| `price` | Цена | ❌ | ❌ | ❌ | ❌ | ✅ |
| `category` | Категория | ❌ | ❌ | ❌ | ❌ | ✅ |
| `monetary` | Денежное | ✅ | ✅ | ✅ | ❌ | ❌ |
| `file` | Файл | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tracking_data` | Отслеживаемые данные | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## Примеры заполнения полей через API

Все значения передаются в `custom_fields_values`. Можно указать `field_id` или `field_code`.

### text, numeric, textarea, streetaddress, tracking_data
```json
"custom_fields_values": [
    {"field_id": 3, "values": [{"value": "Текстовое значение"}]},
    {"field_id": 103, "values": [{"value": "1.5"}]}
]
```

### checkbox
```json
"custom_fields_values": [
    {"field_id": 5, "values": [{"value": true}]}
]
```

### url
```json
"custom_fields_values": [
    {"field_id": 7, "values": [{"value": "https://example.com"}]}
]
```

### date, date_time, birthday
Значение — Unix Timestamp (int) или строка RFC-3339.
```json
"custom_fields_values": [
    {"field_id": 9, "values": [{"value": 1577836800}]}
]
```

### select, radiobutton
Можно передать `value` (текст), `enum_id` (ID варианта) или `enum_code` (код).
```json
"custom_fields_values": [
    {"field_id": 11, "values": [{"value": "Значение 1"}]},
    {"field_id": 111, "values": [{"enum_id": 17}]}
]
```

### multiselect
Массив из нескольких значений:
```json
"custom_fields_values": [
    {"field_id": 111, "values": [{"enum_id": 17}, {"enum_id": 19}]}
]
```

### multitext (телефон, email) — ТОЛЬКО для контактов
Предопределённые коды: `PHONE`, `EMAIL`. Enum_code: `WORK`, `WORKDD`, `MOB`, `FAX`, `HOME`, `OTHER`, `PRIV`.
```json
"custom_fields_values": [
    {
        "field_code": "PHONE",
        "values": [
            {"value": "+79001112233", "enum_code": "WORK"}
        ]
    },
    {
        "field_code": "EMAIL",
        "values": [
            {"value": "test@example.com", "enum_code": "WORK"}
        ]
    }
]
```

### smart_address
Множественные значения с enum_code: `address_line_1`, `address_line_2`, `city`, `state`, `zip`, `country`.
```json
"custom_fields_values": [
    {
        "field_id": 13,
        "values": [
            {"value": "Николоямская 28/60", "enum_code": "address_line_1"},
            {"value": "Москва", "enum_code": "city"},
            {"value": "109240", "enum_code": "zip"},
            {"value": "RU", "enum_code": "country"}
        ]
    }
]
```

### monetary
```json
"custom_fields_values": [
    {"field_id": 15, "values": [{"value": "1500.00"}]}
]
```

### Сброс значения поля
Передай `null` в values:
```json
"custom_fields_values": [
    {"field_id": 3, "values": null}
]
```

**ВАЖНО**: Не передавай пустой массив `[]` в custom_fields_values — это может привести к ошибке.

---

## Группы полей

### Получение групп
```
GET /api/v4/{entity_type}/custom_fields/groups
```

### Создание группы
```
POST /api/v4/{entity_type}/custom_fields/groups
```
```json
[{"name": "Дополнительная информация", "sort": 100}]
```

### Редактирование группы
```
PATCH /api/v4/{entity_type}/custom_fields/groups/{group_id}
```

### Удаление группы
```
DELETE /api/v4/{entity_type}/custom_fields/groups/{group_id}
```
