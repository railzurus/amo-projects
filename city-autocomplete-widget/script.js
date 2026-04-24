define(['jquery'], function($) {
    var CustomWidget = function() {
        var self = this;
        var debounceTimers = {};
        var processedFields = [];
        var fieldNameToId = {};
        var fieldIdToType = {};
        var fieldIdToValue = {};
        var dictionaryCache = {};
        var multiselectValues = {};
        var codeFieldsGroupId = null;
        var CODE_FIELDS_GROUP_NAME = 'Коды ATI';
        var leadFieldValues = {};
        var saveTimer = null;
        var validationObservers = [];

        var SHARED_CONTAINER_ID = 'zurus-widget-container';
        var SHARED_SUBMENU_ID = 'zurus-widget-submenu';
        var ATP_CLIENT_ID = 'atp-client';
        var ATP_CLIENT_SUBMENU_ID = 'atp-client-submenu';
        var ATI_WIDGET_ID = 'ati-cargo';
        var EVENT_NS = '.atiWidget';

        function escapeSelector(str) {
            return String(str).replace(/["\\]/g, '\\$&');
        }

        // Маппинг полей для отправки в ATI
        var CARGO_FIELD_MAPPING = {
            // Статичные значения
            'cargo_application.payment.type': { static: 'rate-request' },
            'cargo_application.route.loading.dates.type': { static: 'from-date' },
            'cargo_application.route.loading.cargos.0.id': { static: '1' },
            'cargo_application.route.loading.location.type': { static: 'manual' },
            'cargo_application.route.unloading.location.type': { static: 'manual' },
            'cargo_application.payment.rate_with_vat_available': { static: true },
            'cargo_application.payment.rate_without_vat_available': { static: true },
            'cargo_application.route.loading.cargos.0.weight.type': { static: 'tons' },

            // ID сделки
            'cargo_application.external_id': { source: 'lead_id' },

            // Тип загрузки (из поля или автоматически)
            'cargo_application.truck.load_type': { field: 'Загрузка_код', type: 'string', default: 'ftl' },

            // Поля из amoCRM (массивы чисел)
            'cargo_application.contacts': { field: 'Транспортные менеджеры_код', type: 'intArray' },
            'cargo_application.truck.body_types': { field: 'Тип кузова_код', type: 'intArray' },
            'cargo_application.truck.body_loading.types': { field: 'Способ погрузки_код', type: 'intArray' },

            // Числовые поля
            'cargo_application.truck.adr': { field: 'ADR', type: 'int' },
            'cargo_application.truck.temperature.to': { field: 'Температура, до', type: 'int' },
            'cargo_application.truck.temperature.from': { field: 'Температура, от', type: 'int' },
            'cargo_application.route.loading.location.city_id': { field: 'Город погрузки_код', type: 'int' },
            'cargo_application.route.unloading.location.city_id': { field: 'Город выгрузки_код', type: 'int' },
            'cargo_application.route.loading.cargos.0.packaging.type': { field: 'Тип упаковки_код', type: 'int' },
            'cargo_application.route.loading.cargos.0.weight.quantity': { field: 'Вес тонн', type: 'float' },
            'cargo_application.route.loading.cargos.0.volume.quantity': { field: 'Объем м3', type: 'float' },
            'cargo_application.route.loading.cargos.0.packaging.quantity': { field: 'Количество упаковок', type: 'int' },

            // Булевы поля (0/1 или true/false)
            'cargo_application.truck.requirements.road_train': { field: 'Сцепка', type: 'bool' },
            'cargo_application.truck.requirements.logging_truck': { field: 'Коники', type: 'bool' },
            'cargo_application.truck.requirements.air_suspension': { field: 'Пневмоход', type: 'bool' },

            // Даты (ISO формат)
            'cargo_application.route.loading.dates.first_date': { field: 'Дата погрузки', type: 'date' },
            'cargo_application.route.loading.dates.last_date': { field: 'Дата погрузки', type: 'date' },
            'cargo_application.route.unloading.dates.first_date': { field: 'Дата выгрузки', type: 'date' },

            // Текстовые поля
            'cargo_application.route.loading.cargos.0.name': { field: 'Наименование груза', type: 'string' },
            'cargo_application.route.loading.location.address': { field: 'Адрес погрузки', type: 'string', default: 'указать адрес' },
            'cargo_application.route.unloading.location.address': { field: 'Адрес выгрузки', type: 'string', default: 'указать адрес' }
        };

        // Поля для валидации (не входят в маппинг, но нужны для проверок)
        var VALIDATION_FIELDS = ['Тип кузова_код', 'Объем м3', 'Тип упаковки_код', 'Количество упаковок'];

        // Конфигурация полей
        var FIELD_CONFIGS = {
            'город': {
                type: 'autocomplete',
                apiPath: '/gw/gis-dict/v1/autocomplete/suggestions',
                method: 'POST',
                minChars: 3,
                getRequestData: function(query, settings) {
                    return JSON.stringify({
                        limit: settings.limit || '10',
                        prefix: query
                    });
                },
                parseResponse: function(response) {
                    return (response.suggestions || []).map(function(item) {
                        return {
                            name: item.address || '',
                            code: (item.city && item.city.id) ? item.city.id : '',
                            subtitle: (item.region && item.region.name) ? item.region.name : ''
                        };
                    });
                }
            },
            'тип кузова': {
                type: 'multiselect',
                apiPath: '/v1.0/dictionaries/carTypes',
                method: 'GET',
                parseResponse: function(response) {
                    return (response || []).map(function(item) {
                        return {
                            name: item.Name || '',
                            code: item.TypeId || ''
                        };
                    });
                }
            },
            'способ погрузки': {
                type: 'multiselect',
                apiPath: '/v1.0/dictionaries/loadingTypes',
                method: 'GET',
                parseResponse: function(response) {
                    return (response || []).map(function(item) {
                        return {
                            name: item.Name || '',
                            code: item.Id || ''
                        };
                    });
                }
            },
            'транспортные менеджеры': {
                type: 'multiselect',
                apiPath: '/v1.0/firms/contacts',
                method: 'GET',
                parseResponse: function(response) {
                    return (response || []).filter(function(item) {
                        return item.is_deleted === false;
                    }).map(function(item) {
                        var subtitleParts = [];
                        if (item.position) subtitleParts.push(item.position);
                        if (item.mobile) subtitleParts.push(item.mobile);
                        return {
                            name: item.name || '',
                            code: item.id || '',
                            subtitle: subtitleParts.join(' • ')
                        };
                    });
                }
            },
            'тип упаковки': {
                type: 'select',
                apiPath: '/v1.0/dictionaries/packTypes',
                method: 'GET',
                parseResponse: function(response) {
                    return (response || []).map(function(item) {
                        return {
                            name: item.Name || '',
                            code: item.Id || ''
                        };
                    });
                }
            },
            'загрузка': {
                type: 'select',
                hardcoded: true,
                items: [
                    { name: 'Отдельной машиной', code: 'ftl' },
                    { name: 'Отдельной машиной или догрузом', code: 'dont-care' }
                ]
            }
        };

        this.callbacks = {
            render: function() {
                return true;
            },

            init: function() {
                var area = self.system().area;

                if (area !== 'lcard') {
                    return true;
                }

                waitForCardFields(function() {
                    loadCustomFieldsAndReplace();
                });

                // Рендерим кнопку отправки в правой колонке
                waitForWidgetContainer(function() {
                    renderSendButton();
                });

                return true;
            },

            bind_actions: function() {
                var area = self.system().area;
                if (area !== 'lcard') {
                    return true;
                }

                var settings = self.get_settings();
                var lang = self.i18n('userLang');

                $(document).on('input' + EVENT_NS, '.ati-field__input[data-field-type="autocomplete"]', function() {
                    var $input = $(this);
                    var fieldId = $input.data('field-id');
                    var fieldName = $input.data('field-name');
                    var configKey = $input.data('config-key');
                    var query = $input.val().trim();
                    var $dropdown = $input.siblings('.ati-field__dropdown');
                    var config = FIELD_CONFIGS[configKey];

                    if (debounceTimers[fieldId]) {
                        clearTimeout(debounceTimers[fieldId]);
                    }

                    if (query.length < (config.minChars || 3)) {
                        $dropdown.html('<div style="padding:10px; color:#999; font-size:12px;">' + (lang.minChars || 'Введите минимум 3 символа') + '</div>');
                        $dropdown.show();
                        return;
                    }

                    $dropdown.html('<div style="padding:10px; color:#999; font-size:12px;">' + (lang.loading || 'Загрузка...') + '</div>');
                    $dropdown.show();

                    debounceTimers[fieldId] = setTimeout(function() {
                        fetchData(config, query, settings)
                            .done(function(response) {
                                var items = config.parseResponse(response);
                                renderDropdown($dropdown, items, fieldId, fieldName, config.type);
                            })
                            .fail(function() {
                                $dropdown.html('<div style="padding:10px; color:#c62828; font-size:12px;">' + (lang.error || 'Ошибка загрузки') + '</div>');
                            });
                    }, 300);
                });

                $(document).on('click' + EVENT_NS, '.ati-field__input[data-field-type="select"], .ati-field__input[data-field-type="multiselect"]', function() {
                    var $input = $(this);
                    var fieldId = $input.data('field-id');
                    var fieldName = $input.data('field-name');
                    var configKey = $input.data('config-key');
                    var fieldType = $input.data('field-type');
                    var $dropdown = $input.siblings('.ati-field__dropdown');
                    var config = FIELD_CONFIGS[configKey];

                    if ($dropdown.is(':visible')) {
                        $dropdown.hide();
                        return;
                    }

                    // Закрываем все другие dropdown'ы
                    $('.ati-field__dropdown').not($dropdown).hide();

                    // Для hardcoded списков используем items из конфига
                    if (config.hardcoded && config.items) {
                        dictionaryCache[configKey] = config.items;
                        renderDropdown($dropdown, config.items, fieldId, fieldName, fieldType);
                        $dropdown.show();
                        return;
                    }

                    if (dictionaryCache[configKey]) {
                        renderDropdown($dropdown, dictionaryCache[configKey], fieldId, fieldName, fieldType);
                        $dropdown.show();
                        return;
                    }

                    $dropdown.html('<div style="padding:10px; color:#999; font-size:12px;">' + (lang.loading || 'Загрузка...') + '</div>');
                    $dropdown.show();

                    fetchData(config, null, settings)
                        .done(function(response) {
                            var items = config.parseResponse(response);
                            dictionaryCache[configKey] = items;
                            renderDropdown($dropdown, items, fieldId, fieldName, fieldType);
                        })
                        .fail(function() {
                            $dropdown.html('<div style="padding:10px; color:#c62828; font-size:12px;">' + (lang.error || 'Ошибка загрузки') + '</div>');
                        });
                });

                $(document).on('click' + EVENT_NS, '.ati-field__item', function(e) {
                    e.stopPropagation();
                    var $item = $(this);
                    var name = $item.data('name');
                    var code = $item.data('code');
                    var fieldId = $item.data('field-id');
                    var fieldName = $item.data('field-name');
                    var fieldType = $item.data('field-type');

                    var $container = $item.closest('.ati-field');
                    var $input = $container.find('.ati-field__input');
                    var $dropdown = $container.find('.ati-field__dropdown');

                    if (fieldType === 'multiselect') {
                        if (!multiselectValues[fieldId]) {
                            multiselectValues[fieldId] = [];
                        }

                        var existingIndex = multiselectValues[fieldId].findIndex(function(v) {
                            return String(v.code) === String(code);
                        });

                        if (existingIndex >= 0) {
                            multiselectValues[fieldId].splice(existingIndex, 1);
                        } else {
                            multiselectValues[fieldId].push({ name: name, code: code });
                        }

                        // Обновляем визуал чекбокса
                        updateItemCheckbox($item, existingIndex < 0);
                        updateMultiselectDisplay(fieldId, fieldName);
                        saveMultiselectFields(fieldId, fieldName);
                    } else {
                        $input.val(name);
                        $dropdown.hide();
                        saveFields(fieldId, fieldName, name, code);
                    }
                });

                $(document).on('click' + EVENT_NS, '.ati-field__tag-remove', function(e) {
                    e.stopPropagation();
                    var $tag = $(this).closest('.ati-field__tag');
                    var $container = $tag.closest('.ati-field');
                    var fieldId = $container.data('field-id');
                    var fieldName = $container.find('.ati-field__input').data('field-name');
                    var code = String($tag.data('code'));

                    if (multiselectValues[fieldId]) {
                        multiselectValues[fieldId] = multiselectValues[fieldId].filter(function(v) {
                            return String(v.code) !== code;
                        });

                        // Обновляем чекбокс в dropdown если он открыт
                        var $dropdown = $container.find('.ati-field__dropdown');
                        var $item = $dropdown.find('.ati-field__item').filter(function() { return String($(this).data('code')) === code; });
                        if ($item.length) {
                            updateItemCheckbox($item, false);
                        }

                        updateMultiselectDisplay(fieldId, fieldName);
                        saveMultiselectFields(fieldId, fieldName);
                    }
                });

                $(document).on('click' + EVENT_NS + '_outside', function(e) {
                    if (!$(e.target).closest('.ati-field').length) {
                        $('.ati-field__dropdown').hide();
                    }
                });

                $(document).on('focus' + EVENT_NS, '.ati-field__input[data-field-type="autocomplete"]', function() {
                    var $dropdown = $(this).siblings('.ati-field__dropdown');
                    if ($dropdown.children().length > 0) {
                        $dropdown.show();
                    }
                });

                return true;
            },

            settings: function() {},
            onSave: function() { return true; },

            destroy: function() {
                $(document).off(EVENT_NS).off(EVENT_NS + '_outside');
                if (saveTimer) clearTimeout(saveTimer);
                validationObservers.forEach(function(o) { o.disconnect(); });
                validationObservers = [];

                processedFields.forEach(function(fieldId) {
                    $('[data-field-id="' + fieldId + '"]').not('.ati-field').show();
                    $('.ati-field[data-field-id="' + fieldId + '"]').remove();
                });
                processedFields = [];
                fieldNameToId = {};
                dictionaryCache = {};
                multiselectValues = {};

                // Убираем свой пункт из клиентского подменю
                $('#' + ATP_CLIENT_SUBMENU_ID + ' [data-widget="' + ATI_WIDGET_ID + '"]').remove();

                // Если клиентское подменю пустое — убираем его
                var $atpSubmenu = $('#' + ATP_CLIENT_SUBMENU_ID);
                if ($atpSubmenu.length && $atpSubmenu.children().length === 0) {
                    $('[data-client="' + ATP_CLIENT_ID + '"]').remove();
                    $atpSubmenu.remove();
                }

                // Если общее подменю пустое — убираем весь контейнер
                var $submenu = $('#' + SHARED_SUBMENU_ID);
                if ($submenu.length && $submenu.children().length === 0) {
                    $('#' + SHARED_CONTAINER_ID).remove();
                }
            },

            // Digital Pipeline - настройки действия
            dpSettings: function() {
                var lang = self.i18n('dp') || {};

                // Простой UI без настроек - всё работает автоматически
                var html =
                    '<div class="ati-dp-settings" style="padding: 20px;">' +
                        '<div style="display: flex; align-items: center; margin-bottom: 15px;">' +
                            '<div style="width: 40px; height: 40px; background: linear-gradient(135deg, #4c8bf5, #2d5aa0); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">' +
                                '<span style="color: #fff; font-size: 18px; font-weight: bold;">ATI</span>' +
                            '</div>' +
                            '<div>' +
                                '<div style="font-size: 15px; font-weight: 600; color: #333;">' +
                                    (lang.name || 'Отправить в ATI.SU') +
                                '</div>' +
                                '<div style="font-size: 12px; color: #888;">Татавтотранс</div>' +
                            '</div>' +
                        '</div>' +
                        '<div style="font-size: 13px; color: #666; line-height: 1.5;">' +
                            (lang.description || 'Автоматически создаёт заявку на груз в ATI.SU на основе данных сделки.') +
                        '</div>' +
                        '<div style="margin-top: 15px; padding: 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #4c8bf5;">' +
                            '<div style="font-size: 12px; color: #555;">' +
                                '<strong>Обязательные поля сделки:</strong><br>' +
                                '• Город погрузки, Город выгрузки<br>' +
                                '• Тип кузова, Дата погрузки<br>' +
                                '• Вес тонн, Транспортные менеджеры' +
                            '</div>' +
                        '</div>' +
                    '</div>';

                return html;
            },

            // Digital Pipeline - сохранение настроек
            onSalesbotDesignerSave: function(handler_code, params) {
                var settings = self.get_settings();

                // Возвращаем конфигурацию с настройками виджета
                // Эти данные будут отправлены на webhook при срабатывании
                return JSON.stringify({
                    handler_code: handler_code || 'ati_send_' + Date.now(),
                    action: 'send_to_ati',
                    ati_api_key: settings.api_key,
                    access_token: settings.access_token,
                    proxy_url: settings.api_url,
                    account_domain: AMOCRM.constant('account').subdomain
                });
            }
        };

        function loadCustomFieldsAndReplace() {
            var leadId = AMOCRM.data.current_card.id;

            $.when(
                $.ajax({ url: '/api/v4/leads/custom_fields?limit=250', method: 'GET' }),
                $.ajax({ url: '/api/v4/leads/' + leadId, method: 'GET' })
            ).done(function(fieldsResponse, leadResponse) {
                var fields = fieldsResponse[0]._embedded ? fieldsResponse[0]._embedded.custom_fields : [];
                var leadData = leadResponse[0];

                fields.forEach(function(field) {
                    fieldNameToId[field.name] = field.id;
                    fieldIdToType[field.id] = field.type;
                    if (field.code) {
                        fieldNameToId[field.code] = field.id;
                    }
                });

                if (leadData.custom_fields_values) {
                    leadData.custom_fields_values.forEach(function(cf) {
                        if (cf.values && cf.values.length > 0) {
                            fieldIdToValue[cf.field_id] = cf.values[0].value;
                        }
                    });
                }

                // Сохраняем значения полей по имени для отправки в ATI
                fields.forEach(function(field) {
                    var value = fieldIdToValue[field.id];
                    if (value !== undefined) {
                        leadFieldValues[field.name] = value;
                    }
                });

                findAndReplaceFields();
            }).fail(function() {
                findAndReplaceFields();
            });
        }

        function findAndReplaceFields() {
            var lang = self.i18n('userLang');

            $('.linked-form__field').each(function() {
                var $field = $(this);

                var $label = $field.find('.linked-form__field__label span');
                if (!$label.length) {
                    $label = $field.find('.linked-form__field__label-text');
                }
                var labelText = $label.text().trim();
                var labelLower = labelText.toLowerCase();

                if (labelLower.indexOf('_код') !== -1 || labelLower.indexOf('_old') !== -1) {
                    return;
                }

                var configKey = null;
                for (var key in FIELD_CONFIGS) {
                    if (labelLower.indexOf(key) !== -1) {
                        configKey = key;
                        break;
                    }
                }

                if (!configKey) {
                    return;
                }

                var config = FIELD_CONFIGS[configKey];

                var fieldId = $field.data('id') || $field.data('field-id');
                if (!fieldId) {
                    var $input = $field.find('input');
                    if ($input.length) {
                        var inputName = $input.attr('name') || '';
                        var match = inputName.match(/CFV\[(\d+)\]/);
                        if (match) {
                            fieldId = match[1];
                        }
                    }
                }

                if (!fieldId || processedFields.indexOf(String(fieldId)) !== -1) {
                    return;
                }

                var currentValue = getFieldValue(fieldId, $field);

                $field.hide();
                processedFields.push(String(fieldId));

                var placeholder = config.type === 'autocomplete'
                    ? (lang.placeholder || 'Начните вводить...')
                    : 'Выберите...';

                var isSelectType = config.type === 'select' || config.type === 'multiselect';

                var dropdownStyle = 'display:none; position:absolute; top:100%; left:0; right:0; max-height:250px; overflow-y:auto; background:#fff; border:1px solid #ccc; border-top:none; border-radius:0 0 3px 3px; z-index:1000; box-shadow:0 2px 5px rgba(0,0,0,0.1);';

                var $customField = $(
                    '<div class="ati-field linked-form__field" data-field-id="' + fieldId + '" style="position:relative;">' +
                        '<div class="linked-form__field__label">' +
                            '<span class="linked-form__field__label-text">' + escapeHtml(labelText) + '</span>' +
                        '</div>' +
                        '<div class="linked-form__field__value" style="position:relative;">' +
                            (config.type === 'multiselect' ? '<div class="ati-field__tags" style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px;"></div>' : '') +
                            '<input type="text" class="ati-field__input" ' +
                                'data-field-id="' + fieldId + '" ' +
                                'data-field-name="' + escapeHtml(labelText) + '" ' +
                                'data-field-type="' + config.type + '" ' +
                                'data-config-key="' + configKey + '" ' +
                                'placeholder="' + placeholder + '" ' +
                                (config.type !== 'multiselect' ? 'value="' + escapeHtml(currentValue) + '" ' : '') +
                                (isSelectType ? 'readonly ' : '') +
                                'style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:3px; font-size:13px; box-sizing:border-box;' +
                                (isSelectType ? ' cursor:pointer; background:#fff; background-image:url(\'data:image/svg+xml,%3Csvg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'12\\\' height=\\\'12\\\' viewBox=\\\'0 0 12 12\\\'%3E%3Cpath fill=\\\'%23666\\\' d=\\\'M6 8L1 3h10z\\\'/%3E%3C/svg%3E\'); background-repeat:no-repeat; background-position:right 10px center; padding-right:30px;' : '') + '">' +
                            '<div class="ati-field__dropdown" style="' + dropdownStyle + '"></div>' +
                        '</div>' +
                    '</div>'
                );

                $field.after($customField);

                watchValidation($field, $customField);

                // Инициализируем мультиселект
                if (config.type === 'multiselect') {
                    if (currentValue) {
                        initMultiselectFromValue(fieldId, labelText, currentValue, configKey);
                    } else {
                        // Пробуем мигрировать из _old поля
                        migrateFromOldField(fieldId, labelText, configKey);
                    }
                }

                // Для select и autocomplete - миграция если поле пустое
                if ((config.type === 'select' || config.type === 'autocomplete') && !currentValue) {
                    migrateFromOldFieldSimple(fieldId, labelText, configKey, $customField.find('.ati-field__input'));
                }

                ensureCodeField(labelText, fieldId, currentValue, configKey, $customField.find('.ati-field__input'));
            });
        }

        function getFieldValue(fieldId, $field) {
            var apiValue = fieldIdToValue[parseInt(fieldId)];

            if (apiValue !== undefined && apiValue !== null) {
                if (typeof apiValue === 'string') {
                    return apiValue;
                } else if (apiValue && typeof apiValue === 'object') {
                    return apiValue.address || apiValue.value || '';
                }
            }

            var $select = $field.find('select');
            var $inputEl = $field.find('input');
            if ($select.length) {
                var val = $select.find('option:selected').text() || '';
                if (val === $select.find('option:first').text()) {
                    return '';
                }
                return val;
            } else if ($inputEl.length) {
                return $inputEl.val() || '';
            }
            return '';
        }

        function ensureCodeField(fieldName, fieldId, currentValue, configKey, $input) {
            var codeFieldName = fieldName + '_код';
            var codeFieldId = fieldNameToId[codeFieldName];
            var config = FIELD_CONFIGS[configKey];

            if (!codeFieldId) {
                createCodeField(codeFieldName, function(newFieldId) {
                    if (newFieldId) {
                        fieldNameToId[codeFieldName] = newFieldId;
                        fieldIdToType[newFieldId] = 'text';

                        if (currentValue && config.type !== 'multiselect') {
                            autoMigrate(fieldId, fieldName, currentValue, configKey, $input);
                        }
                    }
                });
            } else if (currentValue && config.type !== 'multiselect') {
                var codeValue = fieldIdToValue[codeFieldId];
                if (!codeValue) {
                    autoMigrate(fieldId, fieldName, currentValue, configKey, $input);
                }
            }
        }

        function fetchData(config, query, settings) {
            // Проверка обязательных параметров - возвращаем пустой результат вместо ошибки
            if (!config || !config.apiPath) {
                return $.Deferred().resolve([]).promise();
            }

            var apiUrl = (settings.api_url || '').trim().replace(/\/$/, '');
            var url = apiUrl + config.apiPath;

            var ajaxOptions = {
                url: url,
                method: config.method,
                headers: {
                    'Authorization': 'Bearer ' + settings.api_key
                }
            };

            if (config.method === 'POST' && config.getRequestData) {
                ajaxOptions.contentType = 'application/json';
                ajaxOptions.data = config.getRequestData(query, settings);
            }

            return $.ajax(ajaxOptions);
        }

        function ensureCodeFieldsGroup(callback) {
            // Если уже знаем ID группы — сразу возвращаем
            if (codeFieldsGroupId) {
                callback(codeFieldsGroupId);
                return;
            }

            // Ищем существующую группу
            $.ajax({
                url: '/api/v4/leads/custom_fields/groups',
                method: 'GET',
                success: function(response) {
                    var groups = response._embedded ? response._embedded.custom_field_groups : [];
                    var existingGroup = groups.find(function(g) {
                        return g.name === CODE_FIELDS_GROUP_NAME;
                    });

                    if (existingGroup) {
                        codeFieldsGroupId = existingGroup.id;
                        callback(codeFieldsGroupId);
                    } else {
                        // Создаём новую группу
                        $.ajax({
                            url: '/api/v4/leads/custom_fields/groups',
                            method: 'POST',
                            contentType: 'application/json',
                            data: JSON.stringify([{
                                name: CODE_FIELDS_GROUP_NAME
                            }]),
                            success: function(createResponse) {
                                if (createResponse._embedded && createResponse._embedded.custom_field_groups && createResponse._embedded.custom_field_groups[0]) {
                                    codeFieldsGroupId = createResponse._embedded.custom_field_groups[0].id;
                                }
                                callback(codeFieldsGroupId);
                            },
                            error: function() {
                                callback(null);
                            }
                        });
                    }
                },
                error: function() {
                    callback(null);
                }
            });
        }

        function createCodeField(fieldName, callback) {
            ensureCodeFieldsGroup(function(groupId) {
                var fieldData = {
                    name: fieldName,
                    type: 'text'
                };

                if (groupId) {
                    fieldData.group_id = groupId;
                }

                $.ajax({
                    url: '/api/v4/leads/custom_fields',
                    method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify([fieldData]),
                    success: function(response) {
                        if (response._embedded && response._embedded.custom_fields && response._embedded.custom_fields[0]) {
                            callback(response._embedded.custom_fields[0].id);
                        } else {
                            callback(null);
                        }
                    },
                    error: function() {
                        callback(null);
                    }
                });
            });
        }

        function autoMigrate(fieldId, fieldName, currentValue, configKey, $input) {
            var settings = self.get_settings();
            var config = FIELD_CONFIGS[configKey];

            // Проверяем что config существует и имеет apiPath
            if (!config || !config.apiPath) {
                return;
            }

            if (config.type === 'autocomplete') {
                var tempConfig = Object.assign({}, config);
                tempConfig.getRequestData = function(query) {
                    return JSON.stringify({ limit: '1', prefix: query });
                };

                fetchData(tempConfig, currentValue, settings)
                    .done(function(response) {
                        var items = config.parseResponse(response);
                        if (items.length > 0) {
                            $input.val(items[0].name);
                            saveFields(fieldId, fieldName, items[0].name, items[0].code, true);
                        }
                    });
            } else if (config.type === 'select') {
                fetchData(config, null, settings)
                    .done(function(response) {
                        var items = config.parseResponse(response);
                        dictionaryCache[configKey] = items;

                        var found = items.find(function(item) {
                            return item.name.toLowerCase() === currentValue.toLowerCase();
                        });

                        if (found) {
                            saveFields(fieldId, fieldName, found.name, found.code, true);
                        }
                    });
            }
        }

        function initMultiselectFromValue(fieldId, fieldName, currentValue, configKey) {
            var settings = self.get_settings();
            var config = FIELD_CONFIGS[configKey];

            var codeFieldName = fieldName + '_код';
            var codeFieldId = fieldNameToId[codeFieldName];
            var codeValue = codeFieldId ? fieldIdToValue[codeFieldId] : null;

            var loadItems = dictionaryCache[configKey]
                ? $.Deferred().resolve(dictionaryCache[configKey]).promise()
                : fetchData(config, null, settings).then(function(response) {
                    var items = config.parseResponse(response);
                    dictionaryCache[configKey] = items;
                    return items;
                });

            loadItems.then(function(items) {
                multiselectValues[fieldId] = [];

                if (codeValue) {
                    var codes = String(codeValue).split(',').map(function(s) { return s.trim(); });
                    codes.forEach(function(code) {
                        var found = items.find(function(item) {
                            return String(item.code) === code;
                        });
                        if (found) {
                            multiselectValues[fieldId].push({ name: found.name, code: found.code });
                        }
                    });
                } else {
                    var names = currentValue.split(',').map(function(s) { return s.trim(); });
                    names.forEach(function(name) {
                        var found = items.find(function(item) {
                            return item.name.toLowerCase() === name.toLowerCase();
                        });
                        if (found) {
                            multiselectValues[fieldId].push({ name: found.name, code: found.code });
                        }
                    });
                }

                updateMultiselectDisplay(fieldId, fieldName);
            });
        }

        function migrateFromOldField(fieldId, fieldName, configKey) {
            var oldFieldName = fieldName + '_old';
            var oldFieldId = fieldNameToId[oldFieldName];

            if (!oldFieldId) {
                return;
            }

            var oldValue = fieldIdToValue[oldFieldId];
            if (!oldValue) {
                return;
            }

            // Для списков значение может быть объектом с enum_id
            var oldValueText = '';
            if (typeof oldValue === 'string') {
                oldValueText = oldValue;
            } else if (oldValue && oldValue.value) {
                oldValueText = oldValue.value;
            }

            if (!oldValueText) {
                return;
            }

            var settings = self.get_settings();
            var config = FIELD_CONFIGS[configKey];

            var loadItems = dictionaryCache[configKey]
                ? $.Deferred().resolve(dictionaryCache[configKey]).promise()
                : fetchData(config, null, settings).then(function(response) {
                    var items = config.parseResponse(response);
                    dictionaryCache[configKey] = items;
                    return items;
                });

            loadItems.then(function(items) {
                // Ищем совпадение по названию (без учёта регистра)
                var found = items.find(function(item) {
                    return item.name.toLowerCase() === oldValueText.toLowerCase();
                });

                if (found) {
                    multiselectValues[fieldId] = [{ name: found.name, code: found.code }];
                    updateMultiselectDisplay(fieldId, fieldName);
                    // Сохраняем в новое поле
                    saveFields(fieldId, fieldName, found.name, String(found.code), true);
                }
            });
        }

        // Миграция из _old поля для select и autocomplete
        function migrateFromOldFieldSimple(fieldId, fieldName, configKey, $input) {
            var oldFieldName = fieldName + '_old';
            var oldFieldId = fieldNameToId[oldFieldName];

            if (!oldFieldId) {
                return;
            }

            var oldValue = fieldIdToValue[oldFieldId];
            if (!oldValue) {
                return;
            }

            var oldValueText = typeof oldValue === 'string' ? oldValue : (oldValue.value || '');
            if (!oldValueText) {
                return;
            }

            // Устанавливаем значение в input
            $input.val(oldValueText);

            // Вызываем autoMigrate для поиска кода и сохранения
            autoMigrate(fieldId, fieldName, oldValueText, configKey, $input);
        }

        function renderDropdown($dropdown, items, fieldId, fieldName, fieldType) {
            $dropdown.empty();

            if (!items || !items.length) {
                $dropdown.html('<div style="padding:10px; color:#999; font-size:12px;">Ничего не найдено</div>');
                return;
            }

            var selectedCodes = [];
            if (fieldType === 'multiselect' && multiselectValues[fieldId]) {
                selectedCodes = multiselectValues[fieldId].map(function(v) { return String(v.code); });
            }

            items.forEach(function(item) {
                var isSelected = selectedCodes.indexOf(String(item.code)) >= 0;
                var bgColor = isSelected ? '#e3f2fd' : '#fff';

                var $item = $('<div class="ati-field__item"></div>')
                    .data({ name: item.name, code: item.code, 'field-id': fieldId, 'field-name': fieldName, 'field-type': fieldType, selected: isSelected })
                    .attr('style', 'padding:10px; cursor:pointer; border-bottom:1px solid #eee; font-size:13px; background:' + bgColor + ';');

                if (fieldType === 'multiselect') {
                    var checkStyle = isSelected
                        ? 'background:#1976d2; border-color:#1976d2;'
                        : 'background:#fff; border-color:#ccc;';
                    $item.append('<span style="display:inline-block; width:16px; height:16px; border:2px solid; border-radius:3px; margin-right:10px; vertical-align:middle; ' + checkStyle + '"></span>');
                }

                $item.append($('<div style="font-weight:500; display:inline;"></div>').text(item.name));

                if (item.subtitle) {
                    $item.append($('<div style="font-size:11px; color:#999; margin-top:2px;"></div>').text(item.subtitle));
                }

                // Hover эффект (динамический на основе текущего состояния)
                $item.hover(
                    function() {
                        var sel = $(this).data('selected');
                        $(this).css('background-color', sel ? '#bbdefb' : '#f5f5f5');
                    },
                    function() {
                        var sel = $(this).data('selected');
                        $(this).css('background-color', sel ? '#e3f2fd' : '#fff');
                    }
                );

                $dropdown.append($item);
            });

            $dropdown.show();
        }

        function updateItemCheckbox($item, isSelected) {
            var $checkbox = $item.find('span').first();
            if (isSelected) {
                $checkbox.css({
                    'background': '#1976d2',
                    'border-color': '#1976d2'
                });
                $item.css('background', '#e3f2fd');
                $item.data('selected', true);
            } else {
                $checkbox.css({
                    'background': '#fff',
                    'border-color': '#ccc'
                });
                $item.css('background', '#fff');
                $item.data('selected', false);
            }
        }

        function updateMultiselectDisplay(fieldId, fieldName) {
            var $container = $('.ati-field[data-field-id="' + fieldId + '"]');
            var $tagsContainer = $container.find('.ati-field__tags');
            var $input = $container.find('.ati-field__input');

            $tagsContainer.empty();

            var selected = multiselectValues[fieldId] || [];
            selected.forEach(function(item) {
                var $tag = $(
                    '<span class="ati-field__tag" data-code="' + escapeHtml(String(item.code)) + '" ' +
                        'style="display:inline-flex; align-items:center; background:#e3f2fd; color:#1976d2; padding:4px 8px; border-radius:12px; font-size:12px;">' +
                        escapeHtml(item.name) +
                        '<span class="ati-field__tag-remove" style="margin-left:6px; cursor:pointer; font-weight:bold; opacity:0.7; font-size:14px; line-height:1;">×</span>' +
                    '</span>'
                );
                $tagsContainer.append($tag);
            });

            if (selected.length > 0) {
                $tagsContainer.show();
            } else {
                $tagsContainer.hide();
            }

            $input.attr('placeholder', selected.length > 0 ? 'Добавить...' : 'Выберите...');
        }

        function saveMultiselectFields(fieldId, fieldName) {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(function() {
                var selected = multiselectValues[fieldId] || [];
                var names = selected.map(function(v) { return v.name; }).join(', ');
                var codes = selected.map(function(v) { return String(v.code); }).join(',');
                saveFields(fieldId, fieldName, names, codes, true);
            }, 400);
        }

        // Обновляем скрытое поле для валидации и показываем панель сохранения
        function updateHiddenField(fieldId, value) {
            try {
                var $origField = $('input[name*="CFV[' + fieldId + ']"]');
                if (!$origField.length) {
                    $origField = $('select[name*="CFV[' + fieldId + ']"]');
                }
                if (!$origField.length) {
                    $origField = $('textarea[name*="CFV[' + fieldId + ']"]');
                }

                if ($origField.length) {
                    $origField.val(value || '');
                }
            } catch (e) {}
        }

        function saveFields(fieldId, fieldName, value, code, silent) {
            var leadId = AMOCRM.data.current_card.id;
            var codeFieldName = fieldName + '_код';
            var codeFieldId = fieldNameToId[codeFieldName];

            // Обновляем скрытое оригинальное поле для валидации amoCRM
            updateHiddenField(fieldId, value);
            if (codeFieldId) {
                updateHiddenField(codeFieldId, code);
            }

            var customFields = [];

            customFields.push({
                field_id: parseInt(fieldId),
                values: [{ value: value || '' }]
            });

            if (codeFieldId) {
                customFields.push({
                    field_id: parseInt(codeFieldId),
                    values: [{ value: code ? String(code) : '' }]
                });
            }

            $.ajax({
                url: '/api/v4/leads',
                method: 'PATCH',
                contentType: 'application/json',
                data: JSON.stringify([{
                    id: leadId,
                    custom_fields_values: customFields
                }]),
                success: function() {
                    if (!silent && typeof AMOCRM !== 'undefined' && AMOCRM.notifications) {
                        AMOCRM.notifications.show_message({ text: 'Сохранено', type: 'success' });
                    }
                },
                error: function() {
                    if (!silent && typeof AMOCRM !== 'undefined' && AMOCRM.notifications) {
                        AMOCRM.notifications.show_message({ text: 'Ошибка сохранения', type: 'error' });
                    }
                }
            });
        }

        function escapeHtml(text) {
            if (!text) return '';
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function watchValidation($origField, $customField) {
            if (!window.MutationObserver) return;

            var applyState = function() {
                var isInvalid = $origField.hasClass('validation-not-valid');
                var $input = $customField.find('.ati-field__input');
                var $value = $customField.find('.linked-form__field__value');

                if (isInvalid) {
                    $input.css({ 'border-color': '#e53935', 'box-shadow': '0 0 0 1px rgba(229,57,53,0.2)' });

                    // Переносим tooltip amoCRM к нашему полю
                    var $tip = $origField.find('.js-validation-tip').first();
                    if ($tip.length && !$customField.find('.js-validation-tip').length) {
                        var $clonedTip = $tip.clone();
                        $value.append($clonedTip);
                    }
                } else {
                    $input.css({ 'border-color': '', 'box-shadow': '' });
                    $customField.find('.js-validation-tip').remove();
                }
            };

            var observer = new MutationObserver(applyState);
            observer.observe($origField[0], {
                attributes: true,
                attributeFilter: ['class'],
                childList: true,
                subtree: true
            });

            validationObservers.push(observer);
            applyState();
        }

        // === Функции для отправки в ATI ===

        function waitForCardFields(callback, attempts) {
            attempts = attempts || 0;
            if ($('.linked-form__field').length) {
                callback();
                return;
            }
            if (attempts < 30) {
                setTimeout(function() {
                    waitForCardFields(callback, attempts + 1);
                }, 200);
            }
        }

        function waitForWidgetContainer(callback, attempts) {
            attempts = attempts || 0;

            // Ищем контейнер виджетов amoCRM
            var $widgetsContainer = $('.card-widgets__elements');

            if ($widgetsContainer.length) {
                callback($widgetsContainer);
                return;
            }

            // Повторяем попытку
            if (attempts < 20) {
                setTimeout(function() {
                    waitForWidgetContainer(callback, attempts + 1);
                }, 200);
            }
        }

        function ensureZurusContainer($widgetsContainer) {
            var $container = $('#' + SHARED_CONTAINER_ID);

            if ($container.length) {
                return $container;
            }

            var widgetPath = self.params.path || '/upl/' + (self.get_settings().widget_code || '') + '/widget';

            var containerHtml =
                '<div id="' + SHARED_CONTAINER_ID + '" style="margin-bottom:15px; border-radius:4px;">' +
                    '<div id="zurus-widget-header" style="cursor:pointer; user-select:none; border-radius:4px 4px 0 0; position:relative;">' +
                        '<img src="' + widgetPath + '/images/hor_logo.png?v=' + Date.now() + '" style="display:block; width:100%; height:auto;" alt="Татавтотранс">' +
                        '<span class="zurus-widget-arrow" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); font-size:12px; color:#000;">▼</span>' +
                    '</div>' +
                    '<div id="' + SHARED_SUBMENU_ID + '" style="display:none; border:1px solid #e5e5e5; border-top:none; background:#fff;"></div>' +
                '</div>';

            $widgetsContainer.prepend(containerHtml);
            $container = $('#' + SHARED_CONTAINER_ID);

            $(document).off('click.zurusmain').on('click.zurusmain', '#zurus-widget-header', function(e) {
                e.stopPropagation();
                var $submenu = $('#' + SHARED_SUBMENU_ID);
                var $bodies = $container.find('.zurus-widget-body');
                var $arrow = $(this).find('.zurus-widget-arrow');

                if ($submenu.is(':visible') || $bodies.filter(':visible').length) {
                    $submenu.find('[id$="-submenu"]').slideUp(200);
                    $bodies.slideUp(200);
                    $submenu.slideUp(200);
                    $arrow.html('▼');
                    $('.zurus-menu-item-arrow').html('▶');
                    $('.zurus-client-arrow').html('▶');
                } else {
                    $submenu.slideDown(200);
                    $arrow.html('▲');
                }
            });

            return $container;
        }

        function ensureAtpClientMenu($submenu) {
            var $clientItem = $submenu.find('[data-client="' + ATP_CLIENT_ID + '"]');

            if ($clientItem.length) {
                return $('#' + ATP_CLIENT_SUBMENU_ID);
            }

            var clientItemHtml =
                '<div class="zurus-menu-item zurus-client-item" data-client="' + ATP_CLIENT_ID + '" style="padding:10px 15px; cursor:pointer; font-size:14px; color:#333; font-weight:600; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">' +
                    '<span>Татавтотранс</span>' +
                    '<span class="zurus-client-arrow" data-client="' + ATP_CLIENT_ID + '" style="font-size:10px; color:#999;">▶</span>' +
                '</div>';

            var clientSubmenuHtml =
                '<div id="' + ATP_CLIENT_SUBMENU_ID + '" style="display:none; background:#fafafa;"></div>';

            $submenu.append(clientItemHtml);
            $submenu.append(clientSubmenuHtml);

            $(document).off('click.atpclient').on('click.atpclient', '.zurus-client-item[data-client="' + ATP_CLIENT_ID + '"]', function(e) {
                e.stopPropagation();
                var $atpSubmenu = $('#' + ATP_CLIENT_SUBMENU_ID);
                var $arrow = $(this).find('.zurus-client-arrow');

                if ($atpSubmenu.is(':visible')) {
                    $atpSubmenu.slideUp(200);
                    $arrow.html('▶');
                } else {
                    $atpSubmenu.slideDown(200);
                    $arrow.html('▼');
                }
            });

            return $('#' + ATP_CLIENT_SUBMENU_ID);
        }

        function renderSendButton() {
            if ($('.ati-send-button').length) {
                return;
            }

            var $widgetsContainer = $('.card-widgets__elements');
            if (!$widgetsContainer.length) {
                return;
            }

            var $container = ensureZurusContainer($widgetsContainer);
            var $submenu = $('#' + SHARED_SUBMENU_ID);
            var $atpSubmenu = ensureAtpClientMenu($submenu);

            if ($atpSubmenu.find('[data-widget="' + ATI_WIDGET_ID + '"]').length) {
                return;
            }

            var widgetItemHtml =
                '<div class="atp-widget-item" data-widget="' + ATI_WIDGET_ID + '" style="padding:10px 15px 10px 25px;">' +
                '</div>';

            $atpSubmenu.append(widgetItemHtml);
            renderATIContent($atpSubmenu.find('[data-widget="' + ATI_WIDGET_ID + '"]'));
        }

        function renderATIContent($container) {
            var buttonHtml =
                '<button class="ati-send-button" style="' +
                    'width: 100%;' +
                    'padding: 12px 15px;' +
                    'background: #4c8bf5;' +
                    'color: #fff;' +
                    'border: none;' +
                    'border-radius: 4px;' +
                    'cursor: pointer;' +
                    'font-size: 14px;' +
                    'font-weight: 500;' +
                '">' +
                    'Отправить в ATI.SU' +
                '</button>' +
                '<div class="ati-send-status" style="margin-top: 10px; font-size: 12px; display: none;"></div>' +
                '<div class="ati-widget-version" style="margin-top: 8px; font-size: 10px; color: #999; text-align: right;">v' + self.params.version + '</div>';

            $container.html(buttonHtml);

            // Обработчик клика
            $container.find('.ati-send-button').on('click', function() {
                var $btn = $(this);
                var $status = $container.find('.ati-send-status');

                $btn.prop('disabled', true).text('Отправка...');
                $status.hide();

                // Загружаем актуальные данные сделки перед отправкой
                loadLeadDataAndSend($btn, $status);
            });
        }

        function loadLeadDataAndSend($btn, $status) {
            var leadId = AMOCRM.data.current_card.id;

            $.when(
                $.ajax({ url: '/api/v4/leads/custom_fields?limit=250', method: 'GET' }),
                $.ajax({ url: '/api/v4/leads/' + leadId, method: 'GET' })
            ).done(function(fieldsResponse, leadResponse) {
                var fields = fieldsResponse[0]._embedded ? fieldsResponse[0]._embedded.custom_fields : [];
                var leadData = leadResponse[0];

                // Собираем значения по именам полей
                var fieldIdToName = {};
                fields.forEach(function(f) {
                    fieldIdToName[f.id] = f.name;
                });

                var values = {};
                if (leadData.custom_fields_values) {
                    leadData.custom_fields_values.forEach(function(cf) {
                        var name = fieldIdToName[cf.field_id];
                        if (name && cf.values && cf.values.length > 0) {
                            values[name] = cf.values[0].value;
                        }
                    });
                }

                // Проверяем, не была ли сделка уже успешно отправлена
                var alreadySent = values['Отправлено в ATI'];
                if (alreadySent === true || alreadySent === '1' || alreadySent === 1) {
                    $btn.prop('disabled', false).text('Отправить в ATI.SU');
                    $status.css('color', '#ff9800').text('Сделка уже была отправлена в ATI.SU').show();
                    return;
                }

                sendToATI(leadId, values, $btn, $status);
            }).fail(function() {
                $btn.prop('disabled', false).text('Отправить в ATI.SU');
                $status.css('color', '#c62828').text('Ошибка загрузки данных сделки').show();
            });
        }

        function buildCargoPayload(leadId, fieldValues) {
            var payload = { cargo_application: {} };

            // Получаем значения для валидации
            var bodyTypeCode = fieldValues['Тип кузова_код'];
            var volumeM3 = parseFloat(fieldValues['Объем м3']) || 0;
            var packagingTypeCode = parseInt(fieldValues['Тип упаковки_код'], 10);
            var packagingQty = parseInt(fieldValues['Количество упаковок'], 10) || 0;

            // Правило: если Объем м3 < 82, load_type = 'dont-care'
            var forceLoadType = volumeM3 < 82 ? 'dont-care' : null;

            // Правило: если Тип кузова_код = 300, температура обязательна
            var isRefrigerator = String(bodyTypeCode).indexOf('300') !== -1;

            for (var path in CARGO_FIELD_MAPPING) {
                var config = CARGO_FIELD_MAPPING[path];
                var value = null;

                // Получаем значение
                if (config.static !== undefined) {
                    value = config.static;
                } else if (config.source === 'lead_id') {
                    value = String(leadId);
                } else if (config.field) {
                    value = fieldValues[config.field];
                }

                // Применяем default если значение пустое
                if ((value === undefined || value === null || value === '') && config.default !== undefined) {
                    value = config.default;
                }

                // Специальная логика для load_type
                if (path === 'cargo_application.truck.load_type' && forceLoadType) {
                    value = forceLoadType;
                }

                // Специальная логика для температуры
                if (path === 'cargo_application.truck.temperature.from' || path === 'cargo_application.truck.temperature.to') {
                    if (!isRefrigerator && (value === undefined || value === null || value === '')) {
                        continue; // Пропускаем если не рефрижератор и не указано
                    }
                    // Для рефрижератора: если не указано, ставим 0
                    if (isRefrigerator && (value === undefined || value === null || value === '')) {
                        value = 0;
                    }
                }

                // Пропускаем пустые значения (кроме тех что имеют default)
                if (value === undefined || value === null || value === '') {
                    continue;
                }

                // Преобразуем тип
                if (config.type === 'intArray') {
                    value = String(value).split(',').map(function(v) {
                        return parseInt(v.trim(), 10);
                    }).filter(function(v) { return !isNaN(v); });
                    if (value.length === 0) continue;
                } else if (config.type === 'int') {
                    value = parseInt(value, 10);
                    if (isNaN(value)) continue;
                } else if (config.type === 'float') {
                    value = parseFloat(value);
                    if (isNaN(value)) continue;
                } else if (config.type === 'bool') {
                    value = value === true || value === 1 || value === '1' || value === 'true';
                } else if (config.type === 'date') {
                    // Преобразуем дату в ISO формат
                    if (typeof value === 'number') {
                        value = new Date(value * 1000).toISOString();
                    } else if (typeof value === 'string' && !value.includes('T')) {
                        value = new Date(value).toISOString();
                    }
                }

                // Устанавливаем значение по пути
                setNestedValue(payload, path, value);
            }

            // Правило: если Тип упаковки_код != 1 и != 3, Количество упаковок минимум 1
            if (packagingTypeCode && packagingTypeCode !== 1 && packagingTypeCode !== 3) {
                var currentQty = payload.cargo_application.route &&
                    payload.cargo_application.route.loading &&
                    payload.cargo_application.route.loading.cargos &&
                    payload.cargo_application.route.loading.cargos[0] &&
                    payload.cargo_application.route.loading.cargos[0].packaging &&
                    payload.cargo_application.route.loading.cargos[0].packaging.quantity;

                if (!currentQty || currentQty < 1) {
                    setNestedValue(payload, 'cargo_application.route.loading.cargos.0.packaging.quantity', Math.max(packagingQty, 1));
                }
            }

            return payload;
        }

        function setNestedValue(obj, path, value) {
            var parts = path.split('.');
            var current = obj;

            for (var i = 0; i < parts.length - 1; i++) {
                var part = parts[i];
                var nextPart = parts[i + 1];

                // Проверяем, является ли следующая часть индексом массива
                var isArrayIndex = /^\d+$/.test(nextPart);

                if (!current[part]) {
                    current[part] = isArrayIndex ? [] : {};
                }
                current = current[part];
            }

            var lastPart = parts[parts.length - 1];
            current[lastPart] = value;
        }

        function parseATIError(responseData) {
            if (!responseData) return 'Ошибка отправки';

            var resp;
            try {
                // Если это уже объект (jQuery мог автоматически распарсить)
                if (typeof responseData === 'object') {
                    resp = responseData;
                } else if (typeof responseData === 'string') {
                    resp = JSON.parse(responseData);
                } else {
                    return String(responseData);
                }

                // Формат ATI: { error_code, reason, error_list }
                if (resp.error_list && resp.error_list.length > 0) {
                    var errors = resp.error_list.map(function(err) {
                        return err.property + ': ' + err.reason;
                    });
                    return (resp.reason || 'Ошибка валидации') + '\n' + errors.join('\n');
                }

                if (resp.reason) return resp.reason;
                if (resp.message) return resp.message;
                if (resp.error) return resp.error;
                if (resp.errors) return JSON.stringify(resp.errors);

                // Если ничего не нашли, возвращаем как строку
                return typeof responseData === 'string' ? responseData : JSON.stringify(resp);
            } catch (e) {
                return typeof responseData === 'string' ? responseData : 'Ошибка отправки';
            }
        }

        function sendToATI(leadId, fieldValues, $btn, $status) {
            var settings = self.get_settings();
            var payload = buildCargoPayload(leadId, fieldValues);

            var url = settings.api_url.replace(/\/$/, '') + '/v2/cargos';

            $.ajax({
                url: url,
                method: 'POST',
                contentType: 'application/json',
                headers: {
                    'Authorization': 'Bearer ' + settings.api_key
                },
                data: JSON.stringify(payload),
                success: function(response, textStatus, xhr) {
                    $btn.prop('disabled', false).text('Отправить в ATI.SU');

                    // Парсим ответ
                    var respData = response;
                    if (typeof response === 'string' && response) {
                        try {
                            respData = JSON.parse(response);
                        } catch (e) {
                            respData = response;
                        }
                    }

                    var isSuccess = false;
                    var errorMsg = '';

                    // Успех если есть cargo_id или cargo_application_id в ответе
                    if (respData && (respData.cargo_application || respData.cargo_id || respData.cargo_application_id)) {
                        isSuccess = true;
                    } else if (respData && (respData.error_code || respData.error_list || respData.reason)) {
                        // Это ошибка валидации
                        errorMsg = parseATIError(respData);
                    } else if (!respData || respData === '' || respData === '{}') {
                        // Пустой ответ тоже считаем успехом
                        isSuccess = true;
                    }

                    if (isSuccess) {
                        saveATIStatus(leadId, true, '');

                        if (typeof AMOCRM !== 'undefined' && AMOCRM.notifications) {
                            AMOCRM.notifications.show_message({
                                text: 'Заявка успешно отправлена в ATI.SU',
                                type: 'success'
                            });
                        }
                    } else {
                        saveATIStatus(leadId, false, errorMsg);

                        if (typeof AMOCRM !== 'undefined' && AMOCRM.notifications) {
                            AMOCRM.notifications.show_message({
                                text: 'Ошибка ATI.SU (см. поле Ошибки ATI)',
                                type: 'error'
                            });
                        }
                    }
                },
                error: function(xhr) {
                    $btn.prop('disabled', false).text('Отправить в ATI.SU');

                    var responseData = xhr.responseJSON || xhr.responseText;
                    var errorMsg = parseATIError(responseData);

                    saveATIStatus(leadId, false, errorMsg);

                    if (typeof AMOCRM !== 'undefined' && AMOCRM.notifications) {
                        AMOCRM.notifications.show_message({
                            text: 'Ошибка отправки в ATI.SU (см. поле Ошибки ATI)',
                            type: 'error'
                        });
                    }
                }
            });
        }

        function saveATIStatus(leadId, isSuccess, errorMessage) {
            // Сначала получаем или создаём поля статуса
            ensureStatusFields(function(sentFieldId, errorFieldId) {
                if (!sentFieldId && !errorFieldId) {
                    return;
                }

                var customFields = [];

                if (sentFieldId) {
                    customFields.push({
                        field_id: sentFieldId,
                        values: [{ value: isSuccess }]
                    });
                }

                if (errorFieldId && errorMessage) {
                    // Записываем в поле ошибки только если есть сообщение
                    var errorValue = String(errorMessage);
                    if (errorValue.length > 4000) {
                        errorValue = errorValue.substring(0, 3997) + '...';
                    }
                    customFields.push({
                        field_id: errorFieldId,
                        values: [{ value: errorValue }]
                    });
                }

                if (customFields.length === 0) return;

                $.ajax({
                    url: '/api/v4/leads',
                    method: 'PATCH',
                    contentType: 'application/json',
                    data: JSON.stringify([{
                        id: leadId,
                        custom_fields_values: customFields
                    }])
                });
            });
        }

        function ensureStatusFields(callback) {
            var sentFieldName = 'Отправлено в ATI';
            var errorFieldName = 'Ошибки ATI';

            // Проверяем, есть ли уже эти поля
            $.ajax({
                url: '/api/v4/leads/custom_fields?limit=250',
                method: 'GET',
                success: function(response) {
                    var fields = response._embedded ? response._embedded.custom_fields : [];
                    var sentFieldId = null;
                    var errorFieldId = null;

                    fields.forEach(function(f) {
                        if (f.name === sentFieldName) sentFieldId = f.id;
                        if (f.name === errorFieldName) errorFieldId = f.id;
                    });

                    // Если оба поля существуют - возвращаем
                    if (sentFieldId && errorFieldId) {
                        callback(sentFieldId, errorFieldId);
                        return;
                    }

                    // Создаём недостающие поля
                    ensureCodeFieldsGroup(function(groupId) {
                        var fieldsToCreate = [];

                        if (!sentFieldId) {
                            var sentField = { name: sentFieldName, type: 'checkbox' };
                            if (groupId) sentField.group_id = groupId;
                            fieldsToCreate.push(sentField);
                        }

                        if (!errorFieldId) {
                            var errorField = { name: errorFieldName, type: 'textarea' };
                            if (groupId) errorField.group_id = groupId;
                            fieldsToCreate.push(errorField);
                        }

                        if (fieldsToCreate.length === 0) {
                            callback(sentFieldId, errorFieldId);
                            return;
                        }

                        $.ajax({
                            url: '/api/v4/leads/custom_fields',
                            method: 'POST',
                            contentType: 'application/json',
                            data: JSON.stringify(fieldsToCreate),
                            success: function(createResponse) {
                                var created = createResponse._embedded ? createResponse._embedded.custom_fields : [];
                                created.forEach(function(f) {
                                    if (f.name === sentFieldName) sentFieldId = f.id;
                                    if (f.name === errorFieldName) errorFieldId = f.id;
                                });
                                callback(sentFieldId, errorFieldId);
                            },
                            error: function() {
                                callback(sentFieldId, errorFieldId);
                            }
                        });
                    });
                },
                error: function() {
                    callback(null, null);
                }
            });
        }

        return this;
    };

    return CustomWidget;
});
