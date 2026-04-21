# script.js — JS-виджет amoCRM

## Общая структура

Виджет — AMD-модуль (RequireJS). Объект `CustomWidget` наследует от системного `Widget`.

```javascript
define(['jquery'], function($) {
    var CustomWidget = function() {
        var self = this;
        var system = self.system();
        var langs = self.langs;

        this.callbacks = {
            render: function() { return true; },
            init: function() { return true; },
            bind_actions: function() { return true; },
            settings: function() {},
            onSave: function() {},
            destroy: function() {},
            contacts: { selected: function() {} },
            leads: { selected: function() {} },
            todo: { selected: function() {} },
            dpSettings: function() {},
            advancedSettings: function() {},
            onSalesbotDesignerSave: function(handler_code, params) {},
            onAddAsSource: function(pipeline_id) {},
            onInstall: function() {},
        };
        return this;
    };
    return CustomWidget;
});
```

---

## Callbacks — функции обратного вызова

### render
Первый вызов при загрузке виджета. Здесь отрисовка UI. **ДОЛЖЕН вернуть `true`**, иначе init/bind_actions не запустятся.

### init
Вызывается после render одновременно с bind_actions. Сбор информации, подключение к серверам. **ДОЛЖЕН вернуть `true`**.

### bind_actions
Навешивание обработчиков событий (клики, ввод). **ДОЛЖЕН вернуть `true`**.

### settings
Вызывается при клике на иконку виджета в области настроек. Для показа модального окна.

### onSave
При нажатии "Установить/Сохранить" в настройках. Срабатывает и при отключении (сначала onSave, потом destroy).

### onInstall
Вызывается один раз при первой установке виджета. Для инициализационной логики.

### destroy
При отключении виджета. Убирай DOM-элементы и отключай обработчики. Также вызывается при переходе между областями (если init_once = false).

### contacts.selected / leads.selected / todo.selected
Вызываются при выборе элементов в списке чекбоксами и нажатии на имя виджета в меню.

### dpSettings
Аналог settings, но для области digital_pipeline.

### advancedSettings
Для страницы расширенных настроек (область advanced_settings).

### onSalesbotDesignerSave
При сохранении виджета в конструкторе Salesbot.

### onAddAsSource
При добавлении виджета как источника в воронке.

---

## Свойства и методы объекта Widget (self)

### self.system()
Возвращает объект с системными переменными:
- `self.system().area` — текущая область (`ccard`, `lcard`, `clist`, и т.д.)
- `self.system().subdomain` — субдомен аккаунта
- `self.system().amouser_id` — ID текущего пользователя

### self.i18n(section)
Возвращает объект локализации из i18n файлов:
```javascript
var lang = self.i18n('userLang');
console.log(lang.sendButton); // "Отправить"
```

### self.get_settings()
Возвращает объект настроек виджета (значения полей из settings в manifest.json):
```javascript
var settings = self.get_settings();
var apiKey = settings.api_key;
var widgetCode = settings.widget_code; // код виджета
```

### self.render(data, params)
Рендер шаблона Twig в правой колонке:
```javascript
self.render({
    ref: '/tmpl/controls/button.twig',
    data: {
        text: 'Нажми меня',
        class_name: 'my-button'
    }
}, {
    target: '.card-widgets__widget-' + self.get_settings().widget_code
});
```

### self.render_template(params)
Более низкоуровневый рендеринг:
```javascript
var html = self.render_template({
    ref: '/tmpl/controls/button.twig',
    data: {
        text: 'Кнопка',
        class_name: 'my-btn'
    },
    body: ''
});
```

### self.crm_post(url, data, callback)
POST-запрос к API amoCRM:
```javascript
self.crm_post(
    '/api/v4/leads',
    [{ name: 'Новая сделка', price: 5000 }],
    function(response) { console.log(response); },
    'json'
);
```

### self.set_status(status)
Смена статуса виджета: `install`, `installed`, `not_configured`, `error`

### self.set_settings(settings)
Сохранение настроек виджета

---

## Работа с данными карточки

В области карточки (`ccard`, `lcard`, `comcard`) данные доступны через DOM или AMOCRM.data:

```javascript
// Получение ID текущей сущности
var entityId = AMOCRM.data.current_card.id;

// Получение типа карточки
var entityType = self.system().area; // 'ccard', 'lcard', etc.

// Получение данных через API
$.get('/api/v4/leads/' + entityId + '?with=contacts', function(data) {
    console.log(data);
});
```

---

## Работа со списками (selected)

При выборе чекбоксов в списке:
```javascript
leads: {
    selected: function() {
        var selected = self.list_selected();
        // selected.summary — общая информация
        // selected.selected — массив выбранных элементов

        selected.selected.forEach(function(item) {
            console.log(item.id, item.emails, item.phones);
        });
    }
}
```

---

## Уведомления

### Всплывающее уведомление
```javascript
APP.notifications.add_call({
    from: '+79991112233',
    to: 'Менеджер',
    duration: 65,
    link: 'https://example.com/record.mp3',
    text: 'Входящий звонок',
    date: Math.ceil(Date.now() / 1000),
    element: { id: 12345, type: 'contact' }
});
```

### Уведомление об ошибке
```javascript
APP.notifications.add_error({
    header: self.get_settings().widget_code,
    text: '<p>Описание ошибки</p>',
    date: Math.ceil(Date.now() / 1000)
});
```

---

## Модальные окна

```javascript
// В callback settings
settings: function() {
    // Простое модальное окно
    var modal = new Modal({
        class_name: 'modal-window',
        init: function($modal_body) {
            $modal_body.html('<div>Контент модального окна</div>');
        },
        destroy: function() {}
    });
}
```

---

## Типичный пример — виджет с кнопкой в карточке

```javascript
define(['jquery'], function($) {
    var CustomWidget = function() {
        var self = this;

        this.callbacks = {
            render: function() {
                if (self.system().area === 'ccard' || self.system().area === 'lcard') {
                    var lang = self.i18n('userLang');
                    var widgetArea = '.card-widgets__widget-' + self.get_settings().widget_code;

                    $(widgetArea).html(
                        '<div class="my-widget">' +
                        '<button class="my-widget__btn button-input">' +
                        lang.sendButton +
                        '</button>' +
                        '<div class="my-widget__result"></div>' +
                        '</div>'
                    );
                }
                return true;
            },
            init: function() {
                return true;
            },
            bind_actions: function() {
                var widgetArea = '.card-widgets__widget-' + self.get_settings().widget_code;

                $(document).on('click', widgetArea + ' .my-widget__btn', function() {
                    var entityId = AMOCRM.data.current_card.id;
                    var settings = self.get_settings();

                    $.ajax({
                        url: 'https://your-backend.com/api/process',
                        method: 'POST',
                        data: JSON.stringify({
                            entity_id: entityId,
                            api_key: settings.api_key
                        }),
                        contentType: 'application/json',
                        success: function(response) {
                            $(widgetArea + ' .my-widget__result')
                                .text(self.i18n('userLang').successMessage);
                        },
                        error: function() {
                            $(widgetArea + ' .my-widget__result')
                                .text(self.i18n('userLang').errorMessage);
                        }
                    });
                });
                return true;
            },
            settings: function() {},
            onSave: function() { return true; },
            destroy: function() {},
            contacts: { selected: function() {} },
            leads: { selected: function() {} },
        };
        return this;
    };
    return CustomWidget;
});
```
