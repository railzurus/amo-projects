---
name: amocrm-widgets
description: >
  Разработка виджетов для amoCRM — JS-компоненты, работающие внутри интерфейса
  amoCRM в браузере пользователя. Используй этот скилл всегда, когда пользователь
  хочет создать виджет amoCRM, разработать script.js, manifest.json, структуру
  файлов виджета, встроить UI-элемент в карточку сделки/контакта/компании,
  добавить кнопку в список, создать панель в правой колонке, интерфейс настроек
  виджета, работу с областями подключения (areas), WebSDK, JS SDK, использовать
  системные модули, dark theme, init_once, digital pipeline, advanced settings.
  Также используй если упоминаются: "виджет амо", "widget amoCRM", "script.js amo",
  "manifest.json amoCRM", "встроить в карточку amoCRM", "расширение amoCRM",
  "плагин amoCRM", "область видимости виджета", "Web SDK amoCRM",
  "условие в salesbot", "salesbot condition", "кастомное условие бота".
  НЕ используй для серверных интеграций через REST API — для этого есть amocrm-integration.
---

# amoCRM Widgets Skill

Этот скилл помогает создавать виджеты для amoCRM — JS-компоненты, которые работают в браузере внутри интерфейса amoCRM.

## Первым делом — собери параметры

Прежде чем писать код, ОБЯЗАТЕЛЬНО запроси у пользователя:

### Обязательные параметры

1. **Название виджета** — как будет отображаться в интерфейсе
2. **Где отображается виджет** (области подключения) — спроси:
   - Карточка сделки (`lcard`)
   - Карточка контакта (`ccard`)
   - Карточка компании (`comcard`)
   - Карточка покупателя (`cucard`)
   - Правая колонка в списках/карточках
   - Digital pipeline (`digital_pipeline`)
   - Расширенные настройки (`advanced_settings`)
   - Левое меню (`lmenu`)
   - Или несколько областей одновременно
3. **Что виджет должен делать** — показывать данные, отправлять во внешний сервис, кнопки действий, формы ввода и т.д.
4. **Нужен ли бэкенд** — будет ли виджет обращаться к внешнему серверу

### Условные параметры (запроси если релевантно)

- **URL бэкенда** — если виджет взаимодействует с внешним сервисом
- **Настройки виджета** — какие параметры вводит пользователь при установке (API ключ, URL и т.д.)
- **Локализации** — какие языки поддерживать (ru, en, es, pt)
- **init_once** — нужен ли постоянный контекст (например, WebSocket для телефонии)
- **Digital pipeline** — нужна ли интеграция с цифровой воронкой / Salesbot
- **Поддержка тёмной темы** — нужно ли

## Структура виджета

Подробная документация в `references/structure.md`. Краткая структура:

```
widget/
├── manifest.json     ← Описание, настройки, области подключения (ОБЯЗАТЕЛЬНО)
├── script.js         ← Основной JS-файл виджета (ОБЯЗАТЕЛЬНО)
├── style.css         ← Стили (опционально)
├── images/           ← Логотипы (ОБЯЗАТЕЛЬНО)
│   ├── logo_main.png    (400x272)
│   ├── logo_small.png   (108x108)
│   ├── logo.png         (130x100)
│   ├── logo_medium.png  (240x84)
│   ├── logo_min.png     (84x84)
│   └── logo_dp.png      (174x109)
└── i18n/             ← Локализации (ОБЯЗАТЕЛЬНО)
    ├── ru.json
    └── en.json
```

## Каркас script.js

Подробная документация в `references/script-js.md`. Базовая структура:

```javascript
define(['jquery'], function($) {
    var CustomWidget = function() {
        var self = this;
        var system = self.system();
        var langs = self.langs;

        this.callbacks = {
            render: function() {
                // Первый вызов при загрузке. Отрисовка UI.
                // ДОЛЖЕН вернуть true для запуска init/bind_actions
                return true;
            },
            init: function() {
                // Инициализация после render
                // ДОЛЖЕН вернуть true
                return true;
            },
            bind_actions: function() {
                // Навешивание обработчиков событий
                // ДОЛЖЕН вернуть true
                return true;
            },
            settings: function() {
                // Клик на иконку виджета в настройках
            },
            onSave: function() {
                // Нажатие "Установить/Сохранить" в настройках
            },
            destroy: function() {
                // Отключение виджета, очистка DOM
            },
            contacts: { selected: function() {} },
            leads: { selected: function() {} },
            todo: { selected: function() {} },
            dpSettings: function() {},
            advancedSettings: function() {},
            onSalesbotDesignerSave: function(handler_code, params) {},
            onAddAsSource: function(pipeline_id) {},
        };
        return this;
    };
    return CustomWidget;
});
```

### Ключевые правила для callbacks
- `render` → `init` → `bind_actions` — порядок вызова
- Каждый ДОЛЖЕН вернуть `true` для продолжения цепочки
- `settings` — вызывается при клике на виджет в настройках
- `onSave` — при сохранении/установке/отключении
- `destroy` — при отключении или переходе между областями

## Каркас manifest.json

Подробная документация в `references/structure.md`. Базовый шаблон:

```json
{
    "widget": {
        "name": "widget.name",
        "description": "widget.description",
        "short_description": "widget.short_description",
        "version": "1.0.0",
        "interface_version": 2,
        "init_once": false,
        "locale": ["ru", "en"],
        "installation": true
    },
    "locations": ["ccard-1", "lcard-1"],
    "tour": {
        "is_enabled": true,
        "slides": {
            "slide_1": "widget.tour_slide_1",
            "slide_2": "widget.tour_slide_2"
        },
        "description": "widget.tour_description"
    },
    "support": {
        "link": "https://support.example.com",
        "email": "support@example.com"
    },
    "settings": {
        "api_key": {
            "name": "settings.api_key",
            "type": "text",
            "required": true
        }
    }
}
```

## Каркас i18n/ru.json

```json
{
    "widget": {
        "name": "Мой виджет",
        "description": "Описание функционала виджета",
        "short_description": "Краткое описание",
        "tour_slide_1": "Описание слайда 1",
        "tour_slide_2": "Описание слайда 2",
        "tour_description": "Описание тура"
    },
    "settings": {
        "api_key": "API ключ"
    }
}
```

## Области подключения (locations)

| Код | Область |
|-----|---------|
| `ccard-1` | Карточка контакта, правая колонка |
| `lcard-1` | Карточка сделки, правая колонка |
| `comcard-1` | Карточка компании, правая колонка |
| `cucard-1` | Карточка покупателя, правая колонка |
| `clist-1` | Список контактов |
| `llist-1` | Список сделок |
| `tlist-1` | Список задач |
| `settings` | Настройки |
| `advanced_settings` | Расширенные настройки |
| `card_sdk` | Виджет в карточке (SDK Card) |
| `digital_pipeline` | Digital Pipeline |
| `catalogs-1` | Каталоги/списки |
| `lead_sources` | Источники сделок |
| `everywhere` | Во всех областях |

## Когда какой reference читать

| Задача | Reference файл |
|--------|---------------|
| manifest.json, структура файлов, images, i18n | `references/structure.md` |
| script.js, callbacks, объект Widget | `references/script-js.md` |
| Web SDK, JS SDK, системные модули, карточка | `references/web-sdk.md` |
| Digital pipeline, Salesbot, условия Salesbot, источники | `references/web-sdk.md` (секция Digital Pipeline и Salesbot Conditions) |

## Нативные CSS классы amoCRM

**ВАЖНО:** Всегда используй стандартные CSS классы amoCRM для UI элементов. Это обеспечивает единый стиль с интерфейсом amoCRM и корректную работу тёмной темы.

### Кнопки

```html
<!-- Синяя кнопка (primary) -->
<button type="button" class="button-input button-input_blue">
    <span class="button-input-inner">
        <span class="button-input-inner__text">Текст кнопки</span>
    </span>
</button>

<!-- Обычная кнопка -->
<button type="button" class="button-input">
    <span class="button-input-inner">
        <span class="button-input-inner__text">Текст кнопки</span>
    </span>
</button>
```

### Чекбоксы

```html
<label class="control-checkbox">
    <div class="control-checkbox__body">
        <input type="checkbox" name="checkbox" value="">
        <span class="control-checkbox__helper"></span>
    </div>
    <div class="control-checkbox__text element__text">Текст чекбокса</div>
</label>
```

### Селекты и инпуты

Для селектов и инпутов используй inline-стили, совместимые с amoCRM:

```html
<select style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:3px; font-size:13px; box-sizing:border-box;">
    <option value="">Выберите...</option>
</select>

<input type="text" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:3px; font-size:13px; box-sizing:border-box;">
```

### Структура формы

```html
<div class="widget-form" style="padding:15px;">
    <div class="widget-form__item" style="margin-bottom:10px;">
        <!-- элемент формы -->
    </div>
</div>
```

### Сообщения

Для сообщений об успехе/ошибке используй собственные классы с цветами:
- Успех: `background-color: #e8f5e9; color: #2e7d32;`
- Ошибка: `background-color: #ffebee; color: #c62828;`
- Инфо: `background-color: #e3f2fd; color: #1565c0;`

## Паттерн: Shared Parent Menu

Когда несколько виджетов от одного разработчика должны отображаться под одной "крышей" (общим логотипом/меню), используй следующий паттерн:

### Константы для идентификации

```javascript
// Общий ID контейнера для всех виджетов разработчика
var SHARED_CONTAINER_ID = 'zurus-widgets-container';
var SHARED_SUBMENU_ID = 'zurus-widgets-submenu';
```

### Логика создания/добавления в меню

```javascript
function getOrCreateSharedContainer(widgetPath) {
    var $widgetsContainer = $('.card-widgets__elements');
    if (!$widgetsContainer.length) return null;

    // Проверяем, есть ли уже общий контейнер от другого виджета
    var $existing = $('#' + SHARED_CONTAINER_ID);
    if ($existing.length) {
        // Контейнер уже есть — просто вернём submenu для добавления пункта
        return {
            container: $existing,
            submenu: $existing.find('#' + SHARED_SUBMENU_ID),
            isNew: false
        };
    }

    // Создаём новый общий контейнер
    var $container = $(
        '<div id="' + SHARED_CONTAINER_ID + '" style="margin-bottom:15px; border-radius:4px;">' +
            '<div id="zurus-widgets-header" style="cursor:pointer; user-select:none; position:relative;">' +
                '<img src="' + widgetPath + '/images/hor_logo.png?v=' + Date.now() + '" style="display:block; width:100%; height:auto;">' +
                '<span class="zurus-widgets-arrow" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); font-size:12px; color:#000;">▼</span>' +
            '</div>' +
            '<div id="' + SHARED_SUBMENU_ID + '" style="display:none; border:1px solid #e5e5e5; border-top:none; background:#fff;"></div>' +
        '</div>'
    );

    $widgetsContainer.prepend($container);

    // Навешиваем обработчик на header
    $(document).off('click.zurusheader').on('click.zurusheader', '#zurus-widgets-header', function(e) {
        e.stopPropagation();
        var $submenu = $('#' + SHARED_SUBMENU_ID);
        var $arrow = $(this).find('.zurus-widgets-arrow');

        // Скрываем все body виджетов при закрытии submenu
        if ($submenu.is(':visible')) {
            $submenu.slideUp(200);
            $('[data-zurus-body]').slideUp(200);
            $arrow.html('▼');
        } else {
            $submenu.slideDown(200);
            $arrow.html('▲');
        }
    });

    return {
        container: $container,
        submenu: $container.find('#' + SHARED_SUBMENU_ID),
        isNew: true
    };
}
```

### Добавление пункта меню

```javascript
function addMenuItemToSubmenu($submenu, widgetId, widgetName) {
    // Проверяем, что такого пункта ещё нет
    if ($submenu.find('[data-widget="' + widgetId + '"]').length) {
        return; // Уже добавлен
    }

    var $menuItem = $(
        '<div class="zurus-menu-item" data-widget="' + widgetId + '" style="padding:10px 15px; cursor:pointer; font-size:14px; color:#333; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">' +
            '<span>' + widgetName + '</span>' +
            '<span class="zurus-item-arrow" data-widget="' + widgetId + '" style="font-size:10px; color:#999;">▶</span>' +
        '</div>'
    );

    $submenu.append($menuItem);

    // Обработчик клика по пункту меню
    $menuItem.on('click', function(e) {
        e.stopPropagation();
        var $body = $('[data-zurus-body="' + widgetId + '"]');
        var $arrow = $(this).find('.zurus-item-arrow');

        // Скрываем все другие body
        $('[data-zurus-body]').not($body).slideUp(200);
        $('.zurus-item-arrow').html('▶');

        if ($body.is(':visible')) {
            $body.slideUp(200);
            $arrow.html('▶');
        } else {
            $body.slideDown(200);
            $arrow.html('▼');
        }
    });
}
```

### Пример использования в виджете

```javascript
function init() {
    var widgetPath = self.params.path || '/upl/' + widgetCode + '/widget';
    var result = getOrCreateSharedContainer(widgetPath);

    if (!result) return; // Контейнер не найден

    // Добавляем свой пункт в меню
    addMenuItemToSubmenu(result.submenu, 'my-widget', self.i18n('widget').name);

    // Создаём body для своего виджета
    var $body = $('<div data-zurus-body="my-widget" style="display:none; border:1px solid #e5e5e5; border-top:none; padding:15px;"></div>');
    result.container.append($body);

    // Теперь $body — контейнер для UI виджета
    renderWidgetUI($body);
}
```

### Для виджетов без UI (только settings)

Если виджет работает через настройки (без UI в карточке), например "Обязательный результат задачи":

```javascript
// manifest.json
{
    "widget": {
        "init_once": true,  // Фоновая работа
        ...
    },
    "locations": ["everywhere"],  // Работает везде
    "settings": {
        "enabled": {
            "name": "settings.enabled",
            "type": "checkbox",
            "required": false
        }
    }
}

// script.js
function initBackgroundFeature() {
    var settings = self.get_settings();
    var isEnabled = settings.enabled === 'Y' || settings.enabled === true || settings.enabled === '1';

    if (!isEnabled) return;

    // Логика работы виджета...
}
```

## Антипаттерны — НЕ делай так

- НЕ забывай `return true` в render/init/bind_actions — без этого виджет не запустится
- НЕ используй interface_version: 1 — это устаревшая версия
- НЕ забывай про tour в manifest.json — обязательно с ноября 2019
- НЕ забывай поля support (link или email) в manifest.json — обязательно
- НЕ делай виртуальные клики на кнопку "Установить" — запрещено
- НЕ скрывай/влияй на рейтинг и отзывы виджета — запрещено для публичных
- НЕ забывай про тёмную тему при вёрстке — используй CSS-переменные
- НЕ создавай кастомные стили для кнопок и чекбоксов — используй нативные классы amoCRM
