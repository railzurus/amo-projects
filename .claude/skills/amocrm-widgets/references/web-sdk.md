# Web SDK и JS SDK amoCRM

## Оглавление
- JS SDK — глобальные методы
- SDK карточки (card_sdk)
- Механизм работы виджета
- Переменные окружения
- Системные модули
- Тёмная тема
- Левое меню
- Персональная страница

---

## JS SDK — глобальные методы

### Уведомления
```javascript
// Всплывающее уведомление о звонке
APP.notifications.add_call(n_data);

// Уведомление об ошибке
APP.notifications.add_error(n_data, callbacks);
```

### Статус online пользователей
```javascript
// Все пользователи
APP.sdk.showUserStatus(); // {123: true, 456: false, ...}

// Конкретный пользователь
APP.sdk.showUserStatus(userId); // true или false
```

### Статус звонка
```javascript
// Установить статус
APP.sdk.setCallStatus(status);
// status: 'connected', 'disconnected', 'talking', 'ringing'

// Получить статус
APP.sdk.getCallStatus(); // текущий статус
```

---

## SDK карточки (card_sdk)

Область `card_sdk` позволяет встраивать виджет прямо в тело карточки сущности (не в правую колонку).

Доступные методы объекта `AMOCRM.data`:
- `AMOCRM.data.current_card.id` — ID текущей сущности
- `AMOCRM.data.current_card` — объект текущей карточки

### Работа с полями через SDK Card
```javascript
// Получить контейнер для виджета в карточке
var container = document.querySelector('.linked-forms__group-wrapper');

// Вставить свой блок
var myBlock = document.createElement('div');
myBlock.className = 'my-widget-card-block';
myBlock.innerHTML = '<h3>Мой блок</h3><p>Данные виджета</p>';
container.appendChild(myBlock);
```

---

## Механизм работы виджета

### Жизненный цикл

1. Система загружает виджеты при переходе на страницу
2. Для каждого виджета в текущей области вызывается `render()`
3. Если render вернул `true`, параллельно вызываются `init()` и `bind_actions()`
4. При переходе на другую страницу/область вызывается `destroy()`
5. На новой странице цикл повторяется (если `init_once: false`)

### init_once

- `false` (по умолчанию): render/init/bind_actions вызываются при каждом переходе между областями
- `true`: render/init/bind_actions вызываются один раз за сеанс. Подходит для телефонии (WebSocket) и виджетов с постоянным контекстом

### Определение текущей области
```javascript
var area = self.system().area;
// Значения: 'ccard', 'lcard', 'comcard', 'cucard', 'clist', 'llist', 'tlist', 'settings', ...

switch(area) {
    case 'ccard':
        // Логика для карточки контакта
        break;
    case 'lcard':
        // Логика для карточки сделки
        break;
    case 'clist':
        // Логика для списка контактов
        break;
}
```

---

## Переменные окружения

Доступны через шорт-теги в manifest.json (`description`) и через JS:

| Шорт-тег | JS доступ | Описание |
|-----------|-----------|----------|
| `#HOST#` | `AMOCRM.constant('base_domain')` | Текущий хост |
| `#SUBDOMAIN#` | `AMOCRM.constant('account_subdomain')` | Субдомен |
| `#LOGIN#` | `AMOCRM.constant('user_login')` | Логин пользователя |
| `#ACCOUNT_ID#` | `AMOCRM.constant('account_id')` | ID аккаунта |
| `#USER_ID#` | `AMOCRM.constant('user_id')` | ID пользователя |

Дополнительные константы:
```javascript
AMOCRM.constant('account_subdomain'); // 'mycompany'
AMOCRM.constant('account_id');        // 12345
AMOCRM.constant('user_id');           // 67890
AMOCRM.constant('user_login');        // 'admin@company.com'
```

---

## Системные модули

amoCRM предоставляет ряд системных модулей, которые можно подключать через `define`:

```javascript
define(['jquery', 'underscore', 'lib/components/base/modal'], function($, _, Modal) {
    // ...
});
```

### Доступные модули
- `jquery` — jQuery
- `underscore` — Underscore.js
- `lib/components/base/modal` — модальные окна
- `twigjs` — шаблонизатор Twig для JS

### Twig-шаблоны (render_template)
```javascript
var html = self.render_template({
    ref: '/tmpl/controls/button.twig',
    data: {
        text: 'Моя кнопка',
        class_name: 'my-btn-class'
    }
});
```

Доступные системные шаблоны:
- `/tmpl/controls/button.twig` — кнопка
- `/tmpl/controls/input.twig` — поле ввода
- `/tmpl/controls/textarea.twig` — текстовая область
- `/tmpl/controls/checkbox.twig` — чекбокс
- `/tmpl/controls/select.twig` — выпадающий список

---

## Тёмная тема

amoCRM поддерживает тёмную тему. Виджет должен корректно выглядеть в обеих темах.

### CSS-переменные для тёмной темы
Используй CSS-переменные вместо хардкод-цветов:

```css
.my-widget {
    color: var(--text-color-primary);
    background: var(--background-color-primary);
    border-color: var(--border-color-primary);
}

.my-widget__title {
    color: var(--text-color-secondary);
}

.my-widget__link {
    color: var(--link-color-primary);
}
```

### Проверка темы из JS
```javascript
var isDark = document.body.classList.contains('page-dark-theme');
```

---

## Левое меню (lmenu)

Виджет может добавить пункт в левое меню навигации amoCRM:

```javascript
// В render callback
render: function() {
    if (self.system().area === 'everywhere' || self.system().area === 'lmenu') {
        // Добавляем пункт меню
        // Обычно через API left_menu или через DOM-манипуляции
    }
    return true;
}
```

---

## Персональная страница виджета

Можно создать отдельную страницу виджета через область `advanced_settings`:

```json
// manifest.json
"locations": ["advanced_settings"],
"advanced": {
    "title": "advanced.title"
}
```

```javascript
// script.js
advancedSettings: function() {
    var $container = $('.advanced-settings__widget-' + self.get_settings().widget_code);
    $container.html('<div class="my-advanced-page">...</div>');
}
```

---

## Digital Pipeline

Виджет может быть триггером в Digital Pipeline.

В manifest.json:
```json
"locations": ["digital_pipeline"],
"dp": {
    "settings": {
        "message": {"name": "dp.message", "type": "text", "required": true}
    },
    "action_multiple": false,
    "webhook_url": "https://your-server.com/dp-webhook"
}
```

В script.js:
```javascript
dpSettings: function() {
    // Настройки виджета в Digital Pipeline
    // Аналог settings, но для DP
}
```

### Salesbot

Виджет может добавлять действия в Salesbot:
```json
"locations": ["salesbot_designer"],
"salesbot_designer": {
    "handler_code": {
        "name": "salesbot.action_name",
        "settings": {
            "param1": {"name": "salesbot.param1", "type": "text"}
        }
    }
}
```

```javascript
onSalesbotDesignerSave: function(handler_code, params) {
    // Сохранение настроек действия Salesbot
    // handler_code — код обработчика
    // params — параметры из settings
    return JSON.stringify({ handler_code: handler_code, params: params });
}
```

---

## Условия виджетов в Salesbot (Salesbot Conditions)

Виджеты могут добавлять свои кастомные условия в блок `condition` Salesbot. Это позволяет интеграциям проверять свои параметры без доработок со стороны amoCRM.

### Настройка в manifest.json

В `locations` должен быть `"salesbot_designer"`. В поле `salesbot_designer` добавляется массив `conditions`:

```json
"salesbot_designer": {
    "conditions": [
        {
            "term1": {
                "id": "{{widget.integration_code.term1_code}}",
                "option": "AD Referral",
                "is_identity_term": true
            },
            "is_chat_condition": true,
            "callback": "https://your-server.com/salesbot/ads",
            "widget_hook": "https://your-server.com/webhooks/salesbot/condition/ads"
        },
        {
            "term1": {
                "id": "{{chat.profile_id}}",
                "option": "Client"
            },
            "term2": [
                {
                    "id": "{{widget.integration_code.term2_code}}",
                    "option": "a follower on Your Network"
                }
            ],
            "widget_hook": "https://your-server.com/webhooks/salesbot/condition/follower"
        }
    ]
}
```

### Структура условия

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `term1` | object | Да | Левая часть условия (что сравнивается) |
| `widget_hook` | string | Да | URL для вебхука при выполнении условия ботом |
| `term2` | array | Нет | Правая часть условия (с чем сравнивается), массив объектов с `id` и `option` |
| `is_chat_condition` | bool | Нет | Маркер: условие относится к чатам |
| `callback` | string | Нет | URL для динамического запроса вариантов term2 |

### term1 — левая часть условия
- `id` — формат `"{{widget.integration_code.term1_code}}"` (widget + код интеграции + код условия)
- `option` — отображаемое название в селекте (нужны переводы в i18n)
- `is_identity_term` — если `true`, используется оператор is/is not вместо equals/contains

### term2 — правая часть условия
Статический массив значений. Если нужны **динамические данные**, используй `callback`:

```json
{"callback": "https://your-server.com/salesbot/get-options"}
```

Запрос приходит с одноразовым токеном. Ответ — массив `[{id, option}]`.

### Механика выполнения

При срабатывании условия бот отправляет POST вебхук на `widget_hook`:
```json
{
    "token": "eyJ0eXAi...",
    "data": {
        "term1": "{{widget.integration_code.term1_code}}",
        "term2": "{{widget.integration_code.term2_code}}",
        "operation": "=",
        "is_chat_condition": "1",
        "term_type": "dynamic",
        "account_id": "124325",
        "contact_id": "1655064249",
        "chat_id": "46c3aa86-...",
        "entity_id": 675189643,
        "entity_type": 2
    },
    "return_url": "https://subdomain.amocrm.ru/api/v4/salesbot/534543/continue/60565"
}
```

Для продолжения бота — POST на `return_url` с `Authorization: Bearer {access_token}`:
```json
{"result": "success"}   // положительное решение
{"result": "fail"}      // отрицательное (любой ответ кроме "success")
```
