define(['jquery'], function($) {
    var CustomWidget = function() {
        var self = this;
        var widgetCode;
        var currentLead = null;
        var pipelines = [];
        var customFields = [];
        var isLoading = false;
        var $widgetContainer = null;

        this.callbacks = {
            render: function() {
                widgetCode = self.get_settings().widget_code;
                return true;
            },

            init: function() {
                if (self.system().area !== 'lcard') {
                    return true;
                }

                // Ждём появления контейнера
                waitForContainer(function($container) {
                    console.log('[LeadCopyWidget] loaded');
                    $widgetContainer = $container;
                    renderUI();
                    loadData();
                });

                return true;
            },

            bind_actions: function() {
                if (self.system().area !== 'lcard') {
                    return true;
                }

                // Снимаем все предыдущие обработчики чтобы не дублировать
                $(document).off('.leadcopy');

                // Toggle fields dropdown
                $(document).on('click.leadcopy', '.lead-copy-widget__fields-toggle', function(e) {
                    e.stopPropagation();
                    var $dropdown = $(this).siblings('.lead-copy-widget__fields-dropdown');
                    $dropdown.toggle();
                });

                // Close dropdown on outside click
                $(document).on('click.leadcopy', function(e) {
                    if (!$(e.target).closest('.lead-copy-widget-form__item').length) {
                        $('.lead-copy-widget__fields-dropdown').hide();
                    }
                });

                // Handle "All" checkbox
                $(document).on('change.leadcopy', '.lead-copy-widget__field-all', function() {
                    var isChecked = $(this).prop('checked');
                    $('.lead-copy-widget__field-item').prop('checked', isChecked);
                    updateFieldsText();
                });

                // Handle individual field checkboxes
                $(document).on('change.leadcopy', '.lead-copy-widget__field-item', function() {
                    var $items = $('.lead-copy-widget__field-item');
                    var $allCheckbox = $('.lead-copy-widget__field-all');
                    var allChecked = $items.length === $items.filter(':checked').length;
                    $allCheckbox.prop('checked', allChecked);
                    updateFieldsText();
                });

                // Pipeline change - update statuses
                $(document).on('change.leadcopy', '.lead-copy-widget__pipeline-select', function() {
                    var pipelineId = parseInt($(this).val());
                    updateStatusSelect(pipelineId);
                });

                // Copy button click
                $(document).on('click.leadcopy', '.lead-copy-widget__btn', function() {
                    if (!isLoading) {
                        copyLead();
                    }
                });

                return true;
            },

            settings: function() {},
            onSave: function() { return true; },
            destroy: function() {
                $(document).off('.leadcopy');
                $widgetContainer = null;
            }
        };

        function ensureZurusContainer($widgetsContainer) {
            var $container = $('#zurus-widget-container');

            if ($container.length) {
                return $container;
            }

            // Путь к изображению
            var widgetPath = self.params.path || '/upl/' + widgetCode + '/widget';

            // Создаём родительский контейнер
            var containerHtml =
                '<div id="zurus-widget-container" style="margin-bottom:15px; border-radius:4px;">' +
                    '<div id="zurus-widget-header" style="cursor:pointer; user-select:none; border-radius:4px 4px 0 0; position:relative;">' +
                        '<img src="' + widgetPath + '/images/hor_logo.png?v=' + Date.now() + '" style="display:block; width:100%; height:auto;" alt="Zurus">' +
                        '<span class="zurus-widget-arrow" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); font-size:12px; color:#000;">▼</span>' +
                    '</div>' +
                    '<div id="zurus-widget-submenu" style="display:none; border:1px solid #e5e5e5; border-top:none; background:#fff;"></div>' +
                '</div>';

            $widgetsContainer.prepend(containerHtml);
            $container = $('#zurus-widget-container');

            // Обработчик клика по главному заголовку
            $(document).off('click.zurusmain').on('click.zurusmain', '#zurus-widget-header', function(e) {
                e.stopPropagation();
                var $submenu = $('#zurus-widget-submenu');
                var $bodies = $container.find('.zurus-widget-body');
                var $arrow = $(this).find('.zurus-widget-arrow');

                if ($submenu.is(':visible') || $bodies.filter(':visible').length) {
                    // Сворачиваем всё: подменю, клиентские подменю и тела виджетов
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

        function waitForContainer(callback, attempts) {
            attempts = attempts || 0;

            // Ищем родительский контейнер виджетов
            var $widgetsContainer = $('.card-widgets__elements');

            if ($widgetsContainer.length) {

                // Получаем или создаём родительский контейнер Zurus
                var $container = ensureZurusContainer($widgetsContainer);
                var $submenu = $('#zurus-widget-submenu');

                // Проверяем, есть ли уже наш пункт меню
                if ($submenu.find('[data-widget="copy"]').length) {
                    callback($('#lead-copy-widget-body'));
                    return;
                }

                // Добавляем пункт меню
                var menuItemHtml =
                    '<div class="zurus-menu-item" data-widget="copy" style="padding:10px 15px; cursor:pointer; font-size:14px; color:#333; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">' +
                        '<span>Копирование сделки</span>' +
                        '<span class="zurus-menu-item-arrow" data-widget="copy" style="font-size:10px; color:#999;">▶</span>' +
                    '</div>';

                $submenu.append(menuItemHtml);

                // Добавляем контейнер для контента
                var bodyHtml = '<div id="lead-copy-widget-body" class="zurus-widget-body" data-widget="copy" style="display:none; border:1px solid #e5e5e5; border-top:none; overflow:visible;"></div>';
                $container.append(bodyHtml);


                // Клик по пункту меню — показать/скрыть содержимое виджета
                $(document).off('click.leadcopymenuitem').on('click.leadcopymenuitem', '.zurus-menu-item[data-widget="copy"]', function(e) {
                    e.stopPropagation();
                    var $body = $('#lead-copy-widget-body');
                    var $arrow = $(this).find('.zurus-menu-item-arrow');
                    var $otherBodies = $container.find('.zurus-widget-body').not($body);
                    var $otherArrows = $('.zurus-menu-item-arrow').not($arrow);

                    $otherBodies.slideUp(200);
                    $otherArrows.html('▶');

                    if ($body.is(':visible')) {
                        $body.slideUp(200);
                        $arrow.html('▶');
                    } else {
                        $body.slideDown(200);
                        $arrow.html('▼');
                    }
                });

                callback($('#lead-copy-widget-body'));
            } else if (attempts < 50) {

                setTimeout(function() {
                    waitForContainer(callback, attempts + 1);
                }, 100);
            } else {
                console.error('[LeadCopyWidget] card-widgets__elements not found after 50 attempts');
            }
        }

        function renderUI() {
            var lang = self.i18n('userLang');

            $widgetContainer.html(
                '<div class="lead-copy-widget-form" style="padding:15px; overflow:visible;">' +
                    '<div class="lead-copy-widget__loader" style="text-align:center; padding:10px; color:#999;">' + lang.loading + '</div>' +
                    '<div class="lead-copy-widget__content" style="display:none; overflow:visible;">' +
                        // Название сделки
                        '<div class="lead-copy-widget-form__item" style="margin-bottom:10px;">' +
                            '<input type="text" class="lead-copy-widget__name-input" placeholder="' + lang.leadName + '" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:3px; font-size:13px; box-sizing:border-box;">' +
                        '</div>' +
                        // Воронка
                        '<div class="lead-copy-widget-form__item" style="margin-bottom:10px;">' +
                            '<select class="lead-copy-widget__pipeline-select" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:3px; font-size:13px; box-sizing:border-box;">' +
                                '<option value="" hidden="">' + lang.selectPipeline + '</option>' +
                            '</select>' +
                        '</div>' +
                        // Этап
                        '<div class="lead-copy-widget-form__item" style="margin-bottom:10px;">' +
                            '<select class="lead-copy-widget__status-select" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:3px; font-size:13px; box-sizing:border-box;">' +
                                '<option value="" hidden="">' + lang.selectStatus + '</option>' +
                            '</select>' +
                        '</div>' +
                        // Копировать историю
                        '<div class="lead-copy-widget-form__item" style="margin-bottom:10px;">' +
                            '<label class="control-checkbox" style="display:flex; align-items:center;">' +
                                '<div class="control-checkbox__body">' +
                                    '<input type="checkbox" class="lead-copy-widget__copy-history" name="checkbox" value="">' +
                                    '<span class="control-checkbox__helper"></span>' +
                                '</div>' +
                                '<div class="control-checkbox__text element__text">' + lang.copyHistoryShort + '</div>' +
                            '</label>' +
                        '</div>' +
                        // Поля для копирования - выпадающий список с чекбоксами
                        '<div class="lead-copy-widget-form__item" style="margin-bottom:10px; position:relative;">' +
                            '<div class="lead-copy-widget__fields-toggle" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:3px; font-size:13px; box-sizing:border-box; background:#fff; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">' +
                                '<span class="lead-copy-widget__fields-text">' + lang.allFields + '</span>' +
                                '<span style="font-size:10px; color:#999;">▼</span>' +
                            '</div>' +
                            '<div class="lead-copy-widget__fields-dropdown" style="display:none; position:absolute; top:100%; left:0; right:0; max-height:300px; overflow-y:auto; border:1px solid #ccc; border-top:none; border-radius:0 0 3px 3px; background:#fff; z-index:100;">' +
                            '</div>' +
                        '</div>' +
                        // Кнопка
                        '<div class="lead-copy-widget-form__item" style="text-align:center; margin-top:15px;">' +
                            '<button type="button" class="lead-copy-widget__btn" style="padding:10px 30px; background:#f7d94c; color:#000; border:none; border-radius:4px; font-size:14px; font-weight:500; cursor:pointer;">' +
                                lang.copy +
                            '</button>' +
                        '</div>' +
                        '<div class="lead-copy-widget__message" style="margin-top:10px; text-align:center;"></div>' +
                    '</div>' +
                '</div>'
            );
        }

        function loadData() {
            var leadId = AMOCRM.data.current_card.id;
            isLoading = true;

            Promise.all([
                fetchLead(leadId),
                fetchPipelines(),
                fetchCustomFields()
            ]).then(function(results) {
                currentLead = results[0];
                pipelines = results[1];
                customFields = results[2];

                populateUI();
                isLoading = false;

                $('.lead-copy-widget__loader').hide();
                $('.lead-copy-widget__content').show();
            }).catch(function(error) {
                console.error('[LeadCopyWidget] Load error:', error);
                var lang = self.i18n('userLang');
                $('.lead-copy-widget__loader').text(lang.loadError);
                isLoading = false;
            });
        }

        function fetchLead(leadId) {
            return new Promise(function(resolve, reject) {
                $.ajax({
                    url: '/api/v4/leads/' + leadId + '?with=contacts,companies,catalog_elements',
                    method: 'GET',
                    success: resolve,
                    error: reject
                });
            });
        }

        function fetchPipelines() {
            return new Promise(function(resolve, reject) {
                $.ajax({
                    url: '/api/v4/leads/pipelines',
                    method: 'GET',
                    success: function(data) {
                        resolve(data._embedded ? data._embedded.pipelines : []);
                    },
                    error: reject
                });
            });
        }

        function fetchCustomFields() {
            return new Promise(function(resolve, reject) {
                $.ajax({
                    url: '/api/v4/leads/custom_fields?limit=50',
                    method: 'GET',
                    success: function(data) {
                        resolve(data._embedded ? data._embedded.custom_fields : []);
                    },
                    error: reject
                });
            });
        }

        function fetchNotes(leadId) {
            return new Promise(function(resolve, reject) {
                $.ajax({
                    url: '/api/v4/leads/' + leadId + '/notes?limit=250',
                    method: 'GET',
                    success: function(data) {
                        resolve(data && data._embedded && data._embedded.notes ? data._embedded.notes : []);
                    },
                    error: function(xhr) {
                        resolve([]);
                    }
                });
            });
        }

        function populateUI() {
            var lang = self.i18n('userLang');

            // Set default name
            var $nameInput = $('.lead-copy-widget__name-input');
            $nameInput.val(currentLead.name + '_Копия');

            // Populate pipeline select
            var $pipelineSelect = $('.lead-copy-widget__pipeline-select');
            // Keep first placeholder option
            $pipelineSelect.find('option:not(:first)').remove();

            pipelines.forEach(function(pipeline) {
                var selected = pipeline.id === currentLead.pipeline_id ? ' selected' : '';
                $pipelineSelect.append('<option value="' + pipeline.id + '"' + selected + '>' + escapeHtml(pipeline.name) + '</option>');
            });

            // Populate status select
            updateStatusSelect(currentLead.pipeline_id);

            // Populate fields dropdown with checkboxes
            var $dropdown = $('.lead-copy-widget__fields-dropdown');
            $dropdown.empty();

            var standardFields = [
                { id: '__price__', name: lang.price },
                { id: '__responsible__', name: lang.responsible },
                { id: '__tags__', name: lang.tags },
                { id: '__contacts__', name: lang.contacts },
                { id: '__companies__', name: lang.companies }
            ];

            var checkboxStyle = 'display:flex; align-items:center; padding:5px 10px; cursor:pointer; border-bottom:1px solid #eee; font-size:12px;';
            var inputStyle = 'margin-right:8px; cursor:pointer; width:14px; height:14px;';

            // "All fields" checkbox
            $dropdown.append(
                '<label style="' + checkboxStyle + 'font-weight:500; background:#f9f9f9;">' +
                    '<input type="checkbox" class="lead-copy-widget__field-all" checked style="' + inputStyle + '">' +
                    escapeHtml(lang.allFields) +
                '</label>'
            );

            // Custom fields first
            customFields.forEach(function(field) {
                $dropdown.append(
                    '<label style="' + checkboxStyle + '">' +
                        '<input type="checkbox" class="lead-copy-widget__field-item" value="' + field.id + '" checked style="' + inputStyle + '">' +
                        escapeHtml(field.name) +
                    '</label>'
                );
            });

            // Standard fields after
            standardFields.forEach(function(field) {
                $dropdown.append(
                    '<label style="' + checkboxStyle + '">' +
                        '<input type="checkbox" class="lead-copy-widget__field-item" value="' + field.id + '" checked style="' + inputStyle + '">' +
                        escapeHtml(field.name) +
                    '</label>'
                );
            });

            updateFieldsText();
        }

        function updateFieldsText() {
            var lang = self.i18n('userLang');
            var $items = $('.lead-copy-widget__field-item');
            var checkedCount = $items.filter(':checked').length;
            var totalCount = $items.length;

            var text;
            if (checkedCount === 0) {
                text = lang.noFieldsSelected;
            } else if (checkedCount === totalCount) {
                text = lang.allFields;
            } else {
                text = lang.fieldsSelected.replace('{count}', checkedCount);
            }

            $('.lead-copy-widget__fields-text').text(text);
        }

        function updateStatusSelect(pipelineId) {
            var $statusSelect = $('.lead-copy-widget__status-select');
            $statusSelect.empty();

            var pipeline = pipelines.find(function(p) { return p.id === pipelineId; });
            if (pipeline && pipeline._embedded && pipeline._embedded.statuses) {
                pipeline._embedded.statuses.forEach(function(status) {
                    if (status.id !== 142 && status.id !== 143) {
                        var selected = status.id === currentLead.status_id && pipelineId === currentLead.pipeline_id ? ' selected' : '';
                        $statusSelect.append('<option value="' + status.id + '"' + selected + '>' + escapeHtml(status.name) + '</option>');
                    }
                });
            }
        }

        function copyLead() {
            var lang = self.i18n('userLang');

            var newName = $('.lead-copy-widget__name-input').val().trim();
            if (!newName) {
                newName = currentLead.name + '_Копия';
            }

            var pipelineId = parseInt($('.lead-copy-widget__pipeline-select').val());
            var statusId = parseInt($('.lead-copy-widget__status-select').val());
            var copyHistory = $('.lead-copy-widget__copy-history').prop('checked');

            // Get selected fields from checkboxes
            var selectedFields = [];
            $('.lead-copy-widget__field-item:checked').each(function() {
                selectedFields.push($(this).val());
            });

            var newLead = {
                name: newName,
                pipeline_id: pipelineId,
                status_id: statusId
            };

            if (selectedFields.indexOf('__price__') !== -1 && currentLead.price) {
                newLead.price = currentLead.price;
            }

            if (selectedFields.indexOf('__responsible__') !== -1 && currentLead.responsible_user_id) {
                newLead.responsible_user_id = currentLead.responsible_user_id;
            }

            // Теги копируются отдельным запросом после создания сделки
            var copyTags = selectedFields.indexOf('__tags__') !== -1 && currentLead._embedded && currentLead._embedded.tags && currentLead._embedded.tags.length > 0;

            var customFieldIds = selectedFields.filter(function(f) {
                return f.indexOf('__') !== 0;
            }).map(function(f) {
                return parseInt(f);
            });

            if (customFieldIds.length > 0 && currentLead.custom_fields_values) {
                var fieldsToCopy = currentLead.custom_fields_values
                    .filter(function(field) {
                        return customFieldIds.indexOf(field.field_id) !== -1;
                    })
                    .map(function(field) {
                        // Чистим values - оставляем только value и enum_id
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
                if (fieldsToCopy.length > 0) {
                    newLead.custom_fields_values = fieldsToCopy;
                }
            }


            isLoading = true;
            showMessage(lang.copying, 'info');
            $('.lead-copy-widget__btn').prop('disabled', true);

            $.ajax({
                url: '/api/v4/leads',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify([newLead]),
                success: function(response) {
                    var newLeadId = response._embedded.leads[0].id;
                    var promises = [];

                    // Копирование тегов
                    if (copyTags) {
                        var tagNames = currentLead._embedded.tags.map(function(tag) {
                            return { name: tag.name };
                        });
                        promises.push(new Promise(function(resolve) {
                            $.ajax({
                                url: '/api/v4/leads/' + newLeadId,
                                method: 'PATCH',
                                contentType: 'application/json',
                                data: JSON.stringify({ _embedded: { tags: tagNames } }),
                                success: resolve,
                                error: function() { resolve(); }
                            });
                        }));
                    }

                    if (selectedFields.indexOf('__contacts__') !== -1 && currentLead._embedded && currentLead._embedded.contacts) {
                        var contactLinks = currentLead._embedded.contacts.map(function(contact) {
                            return {
                                to_entity_id: contact.id,
                                to_entity_type: 'contacts',
                                metadata: { is_main: contact.is_main || false }
                            };
                        });
                        if (contactLinks.length > 0) {
                            promises.push(linkEntities(newLeadId, contactLinks));
                        }
                    }

                    if (selectedFields.indexOf('__companies__') !== -1 && currentLead._embedded && currentLead._embedded.companies) {
                        var companyLinks = currentLead._embedded.companies.map(function(company) {
                            return {
                                to_entity_id: company.id,
                                to_entity_type: 'companies'
                            };
                        });
                        if (companyLinks.length > 0) {
                            promises.push(linkEntities(newLeadId, companyLinks));
                        }
                    }

                    if (copyHistory) {
                        promises.push(copyLeadHistory(newLeadId));
                    }

                    if (promises.length > 0) {
                        Promise.all(promises).then(function() {
                            finishCopy(newLeadId);
                        }).catch(function(error) {
                            console.error('Error copying related data:', error);
                            finishCopy(newLeadId, true);
                        });
                    } else {
                        finishCopy(newLeadId);
                    }
                },
                error: function(xhr) {
                    console.error('Error creating lead:', xhr);
                    console.error('Response:', xhr.responseText);
                    showMessage(lang.copyError, 'error');
                    isLoading = false;
                    $('.lead-copy-widget__btn').prop('disabled', false);
                }
            });
        }

        function linkEntities(leadId, links) {
            return new Promise(function(resolve, reject) {
                $.ajax({
                    url: '/api/v4/leads/' + leadId + '/link',
                    method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify(links),
                    success: resolve,
                    error: reject
                });
            });
        }

        function copyLeadHistory(newLeadId) {
            // Копируем примечания и задачи параллельно
            return Promise.all([
                copyNotes(newLeadId),
                copyTasks(newLeadId)
            ]);
        }

        function copyNotes(newLeadId) {
            return fetchNotes(currentLead.id).then(function(notes) {
                if (notes.length === 0) return Promise.resolve();

                // Типы примечаний, которые можно копировать
                var copyableTypes = [
                    'common',           // Обычные примечания
                    'call_in',          // Входящий звонок
                    'call_out',         // Исходящий звонок
                    'sms_in',           // Входящее SMS
                    'sms_out',          // Исходящее SMS
                    'service_message',  // Сервисное сообщение
                    'message_cashier',  // Сообщение кассира
                    'geolocation',      // Геолокация
                    'invoice_paid',     // Счёт оплачен
                    'key_action_completed', // Ключевое действие
                    'task_result',      // Результат задачи
                    'attachment'        // Вложение
                ];

                var copyableNotes = notes.filter(function(note) {
                    return copyableTypes.indexOf(note.note_type) !== -1;
                }).map(function(note) {
                    var newNote = { note_type: note.note_type };

                    // Копируем params в зависимости от типа
                    if (note.note_type === 'common' && note.params && note.params.text) {
                        newNote.params = { text: '[Копия] ' + note.params.text };
                    } else if ((note.note_type === 'call_in' || note.note_type === 'call_out') && note.params) {
                        newNote.params = {
                            uniq: 'copy_' + note.id + '_' + Date.now(),
                            duration: note.params.duration || 0,
                            source: note.params.source || '',
                            link: note.params.link || '',
                            phone: note.params.phone || ''
                        };
                    } else if (note.note_type === 'task_result' && note.params && note.params.text) {
                        newNote.params = { text: '[Копия] ' + note.params.text };
                    } else if (note.params) {
                        newNote.params = note.params;
                    }

                    return newNote;
                });

                if (copyableNotes.length === 0) return Promise.resolve();

                return new Promise(function(resolve) {
                    $.ajax({
                        url: '/api/v4/leads/' + newLeadId + '/notes',
                        method: 'POST',
                        contentType: 'application/json',
                        data: JSON.stringify(copyableNotes),
                        success: resolve,
                        error: function(xhr) {
                            console.error('[LeadCopyWidget] Error copying notes:', xhr.responseText);
                            resolve();
                        }
                    });
                });
            });
        }

        function fetchTasks(leadId) {
            return new Promise(function(resolve) {
                $.ajax({
                    url: '/api/v4/tasks?filter[entity_type]=leads&filter[entity_id]=' + leadId + '&limit=250',
                    method: 'GET',
                    success: function(data) {
                        resolve(data && data._embedded && data._embedded.tasks ? data._embedded.tasks : []);
                    },
                    error: function() {
                        resolve([]);
                    }
                });
            });
        }

        function copyTasks(newLeadId) {
            return fetchTasks(currentLead.id).then(function(tasks) {
                if (tasks.length === 0) return Promise.resolve();

                var newTasks = tasks.map(function(task) {
                    var newTask = {
                        text: '[Копия] ' + (task.text || ''),
                        entity_id: newLeadId,
                        entity_type: 'leads',
                        task_type_id: task.task_type_id || 1,
                        responsible_user_id: task.responsible_user_id
                    };

                    // Для невыполненных задач - ставим срок
                    if (!task.is_completed && task.complete_till) {
                        newTask.complete_till = task.complete_till;
                    } else {
                        // Для выполненных - ставим срок на сейчас
                        newTask.complete_till = Math.floor(Date.now() / 1000);
                    }

                    // Копируем результат выполнения если есть
                    if (task.is_completed && task.result && task.result.text) {
                        newTask.result = { text: task.result.text };
                    }

                    return newTask;
                });

                return new Promise(function(resolve) {
                    $.ajax({
                        url: '/api/v4/tasks',
                        method: 'POST',
                        contentType: 'application/json',
                        data: JSON.stringify(newTasks),
                        success: resolve,
                        error: function(xhr) {
                            console.error('[LeadCopyWidget] Error copying tasks:', xhr.responseText);
                            resolve();
                        }
                    });
                });
            });
        }

        function finishCopy(newLeadId, hasWarnings) {
            var lang = self.i18n('userLang');
            isLoading = false;
            $('.lead-copy-widget__btn').prop('disabled', false);

            var message = hasWarnings ? lang.copySuccessWithWarnings : lang.copySuccess;
            showMessage(message, 'success');

            $('.lead-copy-widget__message').append(
                ' <a href="/leads/detail/' + newLeadId + '" target="_blank" class="lead-copy-widget__link">' +
                    lang.openLead +
                '</a>'
            );
        }

        function showMessage(text, type) {
            var $message = $('.lead-copy-widget__message');
            $message.removeClass('lead-copy-widget__message--success lead-copy-widget__message--error lead-copy-widget__message--info');
            $message.addClass('lead-copy-widget__message--' + type);
            $message.html(text);
        }

        function escapeHtml(text) {
            if (!text) return '';
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        return this;
    };

    return CustomWidget;
});
