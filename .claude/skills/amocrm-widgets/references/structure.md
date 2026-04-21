# Структура виджета amoCRM

## Файлы и папки

```
widget/                    ← Корень архива (файлы сразу, НЕ вложенная папка)
├── manifest.json          ← Обязательный. Описание и настройки виджета
├── script.js              ← Обязательный. JS-логика виджета
├── style.css              ← Опционально. Стили
├── images/                ← Обязательный. Логотипы
│   ├── logo_main.png      (400x272) — основной логотип
│   ├── logo_small.png     (108x108) — маленький
│   ├── logo.png           (130x100) — для совместимости
│   ├── logo_medium.png    (240x84)  — средний
│   ├── logo_min.png       (84x84)   — миниатюра
│   └── logo_dp.png        (174x109) — для digital pipeline
└── i18n/                  ← Обязательный. Локализации
    ├── ru.json
    └── en.json
```

**Важно**: в архиве ZIP файлы должны быть на первом уровне (manifest.json, script.js и т.д.), а НЕ внутри папки.

Форматы изображений: png, jpeg, jpg, gif. Макс. размер каждого: 300 КБ.
Кодировка всех файлов: **UTF-8 без BOM**.

---

## manifest.json — полная спецификация

### Блок widget (основные настройки)

| Параметр | Обязательный | Описание |
|----------|-------------|----------|
| `widget.name` | Да | Название (ключ из i18n) |
| `widget.description` | Да | Полное описание (ключ из i18n). Поддерживает HTML и шорт-теги: `#HOST#`, `#SUBDOMAIN#`, `#LOGIN#`, `#API_HASH#`, `#ACCOUNT_ID#`, `#USER_ID#`, `#TOP_LEVEL_DOMAIN#` |
| `widget.short_description` | Да | Краткое описание (ключ из i18n) |
| `widget.version` | Нет | Версия виджета. Рекомендуется увеличивать при каждой загрузке |
| `widget.interface_version` | Нет | Всегда `2` (версия 1 устарела) |
| `widget.init_once` | Нет | `true` — init/bind_actions вызываются 1 раз за сеанс (для телефонии с WebSocket). `false` — при каждом переходе между областями |
| `widget.locale` | Да | Массив кодов языков: `["ru", "en", "es", "pt"]` |
| `widget.installation` | Нет | `true` — показывает окно настроек и кнопку "Установить". `false` — виджет без установки |
| `widget.is_showcase` | Нет | `true` — меняет "Установить" на "Посмотреть" (информационный виджет) |

### Блок support (обязательный с ноября 2018)

```json
"support": {
    "link": "https://support.example.com",
    "email": "support@example.com"
}
```
Минимум одно из полей обязательно.

### Блок locations (области подключения)

Массив строк. Формат: `{area}-{0|1}`, где 1 = использует правую колонку, 0 = не использует.

```json
"locations": ["ccard-1", "lcard-1", "clist-0", "settings"]
```

| Код | Область |
|-----|---------|
| `lcard` | Карточка сделки |
| `ccard` | Карточка контакта |
| `comcard` | Карточка компании |
| `cucard` | Карточка покупателя |
| `llist` | Список сделок |
| `clist` | Список контактов |
| `tlist` | Список задач |
| `culist` | Список покупателей |
| `catalogs` | SDK списков |
| `card_sdk` | SDK карточки |
| `settings` | Настройки |
| `advanced_settings` | Расширенные настройки |
| `digital_pipeline` | Digital Pipeline |
| `salesbot_designer` | Конструктор Salesbot |
| `sms` | Системные SMS |
| `mobile_card` | Мобильные приложения |
| `amoforms` | Веб-формы |
| `whatsapp_modal` | Модальное окно WhatsApp |

### Блок settings (настройки виджета)

Показываются при установке виджета. Ключ = код поля.

```json
"settings": {
    "api_key": {
        "name": "settings.api_key",
        "type": "text",
        "required": true
    },
    "secret": {
        "name": "settings.secret",
        "type": "pass",
        "required": true
    }
}
```

Типы полей: `text`, `pass` (пароль), `users` (список пользователей с 1 полем), `users_lp` (login+password на каждого)

### Блок tour (обязательный с ноября 2019)

```json
"tour": {
    "is_tour": true,
    "tour_images": {
        "ru": ["/images/tour_1_ru.png", "/images/tour_2_ru.png"],
        "en": ["/images/tour_1_en.png", "/images/tour_2_en.png"]
    },
    "tour_description": "widget.tour_description"
}
```

### Блок dp (Digital Pipeline)

```json
"dp": {
    "settings": {
        "message": {"name": "settings.message", "type": "text", "required": true}
    },
    "action_multiple": false,
    "webhook_url": "https://example.com/dp-webhook"
}
```
- `action_multiple` (обязательно) — может ли действие растягиваться на несколько этапов
- `webhook_url` — URL для прямой отправки вебхука

### Блок advanced

```json
"advanced": {
    "title": "advanced.title"
}
```

### Блок salesbot_designer

```json
"salesbot_designer": {
    "handler_code": {
        "name": "salesbot.handler_name",
        "settings": {
            "button_title": {"name": "salesbot.btn", "type": "text", "manual": true},
            "url": {"name": "salesbot.url", "type": "url"}
        }
    }
}
```

---

## i18n — локализации

Файлы `i18n/ru.json`, `i18n/en.json` и т.д. Структура должна быть одинаковой во всех файлах.

Доступ из JS: `self.i18n('obj_name')` — возвращает объект с ключами.

Пример `i18n/ru.json`:
```json
{
    "widget": {
        "name": "Мой виджет",
        "description": "Описание виджета для домена #SUBDOMAIN#",
        "short_description": "Краткое описание",
        "tour_description": "Посмотрите как работает виджет"
    },
    "settings": {
        "api_key": "API ключ",
        "secret": "Секретный ключ"
    },
    "userLang": {
        "sendButton": "Отправить",
        "successMessage": "Данные отправлены",
        "errorMessage": "Ошибка отправки"
    }
}
```

---

## Типовые ошибки

1. **Некорректный JSON** — проверяй синтаксис manifest.json перед загрузкой
2. **Кодировка не UTF-8** — все файлы должны быть UTF-8 без BOM
3. **Папка внутри архива** — файлы должны быть на первом уровне ZIP, не внутри подпапки
4. **Дискредитированные ключи** — если загружен неверный manifest, нужно генерировать новые ключи
5. **Разная структура i18n** — ru.json и en.json должны иметь идентичную структуру ключей
