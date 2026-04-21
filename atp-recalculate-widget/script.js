define(['jquery'], function($) {
    var CustomWidget = function() {
        var self = this;

        // Имена полей (поиск по имени, не по ID)
        var FIELD_NAME_DOC_DATE = 'Дата отправки документов клиенту';      // сделка, date
        var FIELD_NAME_PAYMENT_DATE = 'Дата платежа клиента';      // сделка, date
        var FIELD_NAME_DELAY_DAYS = 'Отсрочка дней';               // компания, numeric

        // Shared parent menu IDs
        var SHARED_CONTAINER_ID = 'zurus-widget-container';
        var SHARED_SUBMENU_ID = 'zurus-widget-submenu';
        // Client-level submenu (Татавтотранс)
        var ATP_CLIENT_ID = 'atp-client';
        var ATP_CLIENT_SUBMENU_ID = 'atp-client-submenu';
        var WIDGET_ID = 'payment-date';

        this.callbacks = {
            render: function() {
                return true;
            },

            init: function() {
                var area = self.system().area;
                if (area !== 'lcard') {
                    return true;
                }

                waitForWidgetContainer(function() {
                    renderWidgetMenu();
                });

                return true;
            },

            bind_actions: function() {
                return true;
            },

            settings: function() {},
            onSave: function() { return true; },

            destroy: function() {
                // Снимаем обработчики
                $(document).off('click.paymentmenu');
                $(document).off('click.atpclient');

                // Удаляем свой пункт из клиентского подменю
                $('#' + ATP_CLIENT_SUBMENU_ID + ' [data-widget="' + WIDGET_ID + '"]').remove();

                // Если в клиентском подменю не осталось виджетов — удаляем клиентский блок
                var $atpSubmenu = $('#' + ATP_CLIENT_SUBMENU_ID);
                if ($atpSubmenu.length && $atpSubmenu.children().length === 0) {
                    $atpSubmenu.remove();
                    $('#' + SHARED_SUBMENU_ID + ' [data-client="' + ATP_CLIENT_ID + '"]').remove();
                }

                // Если не осталось клиентов — удаляем весь контейнер
                var $submenu = $('#' + SHARED_SUBMENU_ID);
                if ($submenu.length && $submenu.children().length === 0) {
                    $('#' + SHARED_CONTAINER_ID).remove();
                }
            },

            // Digital Pipeline — настройки действия
            dpSettings: function() {
                var lang = self.i18n('dp') || {};

                var html =
                    '<div class="payment-dp-settings" style="padding: 20px;">' +
                        '<div style="display: flex; align-items: center; margin-bottom: 15px;">' +
                            '<div style="width: 40px; height: 40px; background: linear-gradient(135deg, #43a047, #2e7d32); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">' +
                                '<span style="color: #fff; font-size: 16px; font-weight: bold;">₽</span>' +
                            '</div>' +
                            '<div>' +
                                '<div style="font-size: 15px; font-weight: 600; color: #333;">' +
                                    (lang.name || 'Пересчитать дату платежа') +
                                '</div>' +
                                '<div style="font-size: 12px; color: #888;">Татавтотранс</div>' +
                            '</div>' +
                        '</div>' +
                        '<div style="font-size: 13px; color: #666; line-height: 1.5;">' +
                            (lang.description || 'Автоматически рассчитывает дату платежа клиента.') +
                        '</div>' +
                        '<div style="margin-top: 15px; padding: 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #43a047;">' +
                            '<div style="font-size: 12px; color: #555;">' +
                                '<strong>Формула:</strong><br>' +
                                'Дата платежа = Дата отправки документов клиенту + Отсрочка дней (рабочие дни)<br><br>' +
                                '<strong>Поля:</strong><br>' +
                                '• «' + FIELD_NAME_DOC_DATE + '» (сделка)<br>' +
                                '• «' + FIELD_NAME_DELAY_DAYS + '» (компания)<br>' +
                                '• «' + FIELD_NAME_PAYMENT_DATE + '» (сделка)' +
                            '</div>' +
                        '</div>' +
                    '</div>';

                return html;
            },

            // Digital Pipeline — сохранение
            onSalesbotDesignerSave: function(handler_code, params) {
                var settings = self.get_settings();

                return JSON.stringify({
                    handler_code: handler_code || 'payment_date_' + Date.now(),
                    action: 'recalc_payment_date',
                    access_token: settings.access_token,
                    account_domain: AMOCRM.constant('account').subdomain,
                    field_doc_date: FIELD_NAME_DOC_DATE,
                    field_payment_date: FIELD_NAME_PAYMENT_DATE,
                    field_delay_days: FIELD_NAME_DELAY_DAYS
                });
            }
        };

        // =============================================
        // Расчёт рабочих дней
        // =============================================

        /**
         * Прибавляет N рабочих дней к дате (пропускает Сб и Вс)
         */
        function addBusinessDays(startDate, businessDays) {
            var result = new Date(startDate.getTime());
            var added = 0;

            while (added < businessDays) {
                result.setDate(result.getDate() + 1);
                var dayOfWeek = result.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    added++;
                }
            }

            return result;
        }

        /**
         * Ищет значение кастомного поля по имени в массиве custom_fields_values
         * Возвращает { field_id, value } или null
         */
        function findFieldByName(customFieldsValues, fieldName) {
            if (!customFieldsValues) return null;

            for (var i = 0; i < customFieldsValues.length; i++) {
                var cf = customFieldsValues[i];
                if (cf.field_name === fieldName && cf.values && cf.values.length > 0) {
                    return {
                        field_id: cf.field_id,
                        value: cf.values[0].value
                    };
                }
            }
            return null;
        }

        /**
         * Загружает маппинг имён полей → ID для сущности (leads или companies)
         * Возвращает Promise с объектом { name: id, ... }
         */
        function loadFieldNameToId(entityType) {
            var deferred = $.Deferred();

            $.ajax({
                url: '/api/v4/' + entityType + '/custom_fields?limit=250',
                method: 'GET'
            }).done(function(response) {
                var map = {};
                var fields = (response._embedded && response._embedded.custom_fields) || [];
                fields.forEach(function(f) {
                    map[f.name] = f.id;
                });
                deferred.resolve(map);
            }).fail(function() {
                deferred.resolve({});
            });

            return deferred.promise();
        }

        /**
         * Основная логика пересчёта даты платежа
         */
        function recalcPaymentDate(onSuccess, onError) {
            var leadId = AMOCRM.data.current_card.id;
            var lang = self.i18n('userLang');

            // Шаг 1: Получаем сделку с компаниями + маппинг полей сделки
            $.when(
                $.ajax({ url: '/api/v4/leads/' + leadId + '?with=companies', method: 'GET' }),
                loadFieldNameToId('leads')
            ).done(function(leadResponse, leadFieldMap) {
                var leadData = leadResponse[0] || leadResponse;

                // Шаг 2: Ищем дату отправки документов по имени
                var docDateField = findFieldByName(leadData.custom_fields_values, FIELD_NAME_DOC_DATE);

                if (!docDateField) {
                    onError(lang.errorNoDocDate || 'Не заполнена «Дата отправки документов клиенту»');
                    return;
                }

                // Шаг 3: Находим field_id для поля «Дата платежа клиента»
                var paymentFieldId = leadFieldMap[FIELD_NAME_PAYMENT_DATE];
                if (!paymentFieldId) {
                    onError('Поле «' + FIELD_NAME_PAYMENT_DATE + '» не найдено в сделках');
                    return;
                }

                // Шаг 4: Ищем привязанную компанию
                var companyId = null;
                if (leadData._embedded && leadData._embedded.companies && leadData._embedded.companies.length > 0) {
                    companyId = leadData._embedded.companies[0].id;
                }

                if (!companyId) {
                    onError(lang.errorNoCompany || 'К сделке не привязана компания');
                    return;
                }

                // Шаг 5: Получаем данные компании
                $.ajax({
                    url: '/api/v4/companies/' + companyId,
                    method: 'GET'
                }).done(function(companyData) {

                    // Шаг 6: Ищем поле «Отсрочка дней» по имени
                    var delayField = findFieldByName(companyData.custom_fields_values, FIELD_NAME_DELAY_DAYS);

                    if (!delayField) {
                        onError(lang.errorNoDelay || 'Не заполнено поле «Отсрочка дней» в компании');
                        return;
                    }

                    var delayDays = parseInt(delayField.value, 10);
                    if (isNaN(delayDays)) {
                        onError('Некорректное значение «Отсрочка дней»: ' + delayField.value);
                        return;
                    }

                    // Шаг 7: Парсим дату отправки документов
                    var docDate;
                    var docDateValue = docDateField.value;
                    if (typeof docDateValue === 'number') {
                        docDate = new Date(docDateValue * 1000);
                    } else {
                        docDate = new Date(docDateValue);
                    }

                    if (isNaN(docDate.getTime())) {
                        onError('Некорректная дата отправки документов');
                        return;
                    }

                    // Шаг 8: Рассчитываем дату платежа
                    var paymentDate = addBusinessDays(docDate, delayDays);
                    var paymentTimestamp = Math.floor(paymentDate.setHours(0, 0, 0, 0) / 1000);

                    // Шаг 9: Сохраняем в сделку
                    $.ajax({
                        url: '/api/v4/leads',
                        method: 'PATCH',
                        contentType: 'application/json',
                        data: JSON.stringify([{
                            id: leadId,
                            custom_fields_values: [{
                                field_id: paymentFieldId,
                                values: [{ value: paymentTimestamp }]
                            }]
                        }])
                    }).done(function() {
                        onSuccess(paymentDate);
                    }).fail(function() {
                        onError(lang.errorSave || 'Ошибка сохранения');
                    });

                }).fail(function() {
                    onError(lang.errorLoad || 'Ошибка загрузки данных компании');
                });

            }).fail(function() {
                onError(lang.errorLoad || 'Ошибка загрузки данных сделки');
            });
        }

        // =============================================
        // UI — Shared Parent Menu (Татавтотранс)
        // =============================================

        function waitForWidgetContainer(callback, attempts) {
            attempts = attempts || 0;
            var $widgetsContainer = $('.card-widgets__elements');

            if ($widgetsContainer.length) {
                callback($widgetsContainer);
                return;
            }

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

            var settings = self.get_settings();
            var widgetPath = self.params.path || '/upl/' + settings.widget_code + '/widget';

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
                    // Сворачиваем всё: клиентские подменю, тела виджетов, основное подменю
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

            // Пункт «Татавтотранс» в основном подменю Zurus
            var clientItemHtml =
                '<div class="zurus-menu-item zurus-client-item" data-client="' + ATP_CLIENT_ID + '" style="padding:10px 15px; cursor:pointer; font-size:14px; color:#333; font-weight:600; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">' +
                    '<span>Татавтотранс</span>' +
                    '<span class="zurus-client-arrow" data-client="' + ATP_CLIENT_ID + '" style="font-size:10px; color:#999;">▶</span>' +
                '</div>';

            // Подменю виджетов клиента Татавтотранс
            var clientSubmenuHtml =
                '<div id="' + ATP_CLIENT_SUBMENU_ID + '" style="display:none; background:#fafafa;"></div>';

            $submenu.append(clientItemHtml);
            $submenu.append(clientSubmenuHtml);

            // Обработчик раскрытия клиентского подменю
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

        function renderWidgetMenu() {
            var $widgetsContainer = $('.card-widgets__elements');
            if (!$widgetsContainer.length) {
                return;
            }

            if ($('#' + ATP_CLIENT_SUBMENU_ID + ' [data-widget="' + WIDGET_ID + '"]').length) {
                return;
            }

            var $container = ensureZurusContainer($widgetsContainer);
            var $submenu = $('#' + SHARED_SUBMENU_ID);
            var $atpSubmenu = ensureAtpClientMenu($submenu);

            var lang = self.i18n('userLang');

            // Пункт виджета внутри подменю Татавтотранс
            var widgetItemHtml =
                '<div class="atp-widget-item" data-widget="' + WIDGET_ID + '" style="padding:10px 15px 10px 25px; cursor:pointer; font-size:13px; color:#333; border-bottom:1px solid #eee;">' +
                    '<button class="payment-recalc-btn" style="' +
                        'width:100%; padding:10px 12px; background:#43a047; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:500;' +
                    '">' +
                        (lang.btnRecalc || 'Пересчитать') +
                    '</button>' +
                    '<div class="payment-recalc-status" style="margin-top:8px; font-size:12px; display:none;"></div>' +
                '</div>';

            $atpSubmenu.append(widgetItemHtml);

            // Обработчик кнопки «Пересчитать»
            $(document).off('click.paymentmenu').on('click.paymentmenu', '#' + ATP_CLIENT_SUBMENU_ID + ' .payment-recalc-btn', function(e) {
                e.stopPropagation();
                var $btn = $(this);
                var $status = $btn.closest('[data-widget="' + WIDGET_ID + '"]').find('.payment-recalc-status');

                $btn.prop('disabled', true).text(lang.calculating || 'Расчёт...');
                $status.hide();

                recalcPaymentDate(
                    function(paymentDate) {
                        $btn.prop('disabled', false).text(lang.btnRecalc || 'Пересчитать');

                        var formattedDate = formatDate(paymentDate);
                        $status
                            .css({ color: '#2e7d32', background: '#e8f5e9', padding: '8px 12px', borderRadius: '4px' })
                            .html('<strong>' + (lang.success || 'Дата платежа пересчитана') + ':</strong> ' + formattedDate)
                            .show();

                        if (typeof AMOCRM !== 'undefined' && AMOCRM.notifications) {
                            AMOCRM.notifications.show_message({
                                text: (lang.success || 'Дата платежа пересчитана') + ': ' + formattedDate,
                                type: 'success'
                            });
                        }
                    },
                    function(errorMsg) {
                        $btn.prop('disabled', false).text(lang.btnRecalc || 'Пересчитать');
                        $status
                            .css({ color: '#c62828', background: '#ffebee', padding: '8px 12px', borderRadius: '4px' })
                            .text(errorMsg)
                            .show();
                    }
                );
            });
        }

        function formatDate(date) {
            var d = date.getDate();
            var m = date.getMonth() + 1;
            var y = date.getFullYear();
            return (d < 10 ? '0' : '') + d + '.' + (m < 10 ? '0' : '') + m + '.' + y;
        }

        return this;
    };

    return CustomWidget;
});
