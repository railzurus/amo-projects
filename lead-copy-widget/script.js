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

            // Widget settings page — render custom UI on top of auto-rendered fields
            settings: function($modal_body) {
                if (!$modal_body || !$modal_body.length) return true;
                renderSettingsUI($modal_body, 'widget');
                return true;
            },

            onSave: function() {
                // Belt-and-suspenders final sync — live handlers should already keep inputs current
                $('.lead-copy-settings').each(function() {
                    var $modal_body = $(this).closest('.modal_body, form, body').first();
                    if (!$modal_body.length) $modal_body = $(document);
                    syncAllToHiddenInputs($modal_body);
                });
                return true;
            },

            destroy: function() {
                $(document).off('.leadcopy');
                $(document).off('.leadcopysettings');
                $(document).off('.leadcopycard');
                $(document).off('.leadcopydiag');
                $('#lead-copy-widget-card-container').remove();
                $widgetContainer = null;
            },

            // Digital Pipeline — render full editable UI inside trigger config (per-trigger override + token from widget)
            dpSettings: function() {
                var w_code = (self.get_settings() || {}).widget_code;
                var $dp_form = $('.digital-pipeline__short-task_widget-style_' + w_code).parent().parent().find('[data-action=send_widget_hook]');
                if (!$dp_form.length) {
                    $dp_form = $('#widget_settings__fields_wrapper');
                }
                if (!$dp_form.length) {
                    console.warn('[LeadCopyWidget] dpSettings: form container not found');
                    return true;
                }
                renderSettingsUI($dp_form, 'trigger');
                return true;
            }
        };

        function waitForContainer(callback, attempts) {
            attempts = attempts || 0;
            var $widgetsContainer = $('.card-widgets__elements');

            if ($widgetsContainer.length) {
                // Reuse existing self-contained container if already rendered
                var $existing = $('#lead-copy-widget-card-container');
                if ($existing.length) {
                    callback($existing.find('#lead-copy-widget-body'));
                    return;
                }

                var widgetPath = self.params.path || '/upl/' + widgetCode + '/widget';

                // Self-contained menu item: logo header + collapsible body
                var containerHtml =
                    '<div id="lead-copy-widget-card-container" style="margin-bottom:15px; border-radius:4px; overflow:hidden;">' +
                        '<div id="lead-copy-widget-card-header" style="cursor:pointer; user-select:none; position:relative;">' +
                            '<img src="' + widgetPath + '/images/hor_logo.png?v=' + Date.now() + '" style="display:block; width:100%; height:auto;" alt="Lead Copy Widget">' +
                            '<span class="lead-copy-card-arrow" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:12px; color:#000;">▼</span>' +
                        '</div>' +
                        '<div id="lead-copy-widget-body" style="display:none; border:1px solid #e5e5e5; border-top:none; overflow:visible; background:#fff;"></div>' +
                    '</div>';

                $widgetsContainer.prepend(containerHtml);

                // Click on logo toggles widget body
                $(document).off('click.leadcopycard').on('click.leadcopycard', '#lead-copy-widget-card-header', function(e) {
                    e.stopPropagation();
                    var $body = $('#lead-copy-widget-body');
                    var $arrow = $(this).find('.lead-copy-card-arrow');

                    if ($body.is(':visible')) {
                        $body.slideUp(200);
                        $arrow.html('▼');
                    } else {
                        $body.slideDown(200);
                        $arrow.html('▲');
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

        // Paginated fetch of all lead custom fields (handles accounts with >250 fields).
        // amoCRM API caps a single page at 250 — pagination via _links.next.
        function fetchAllLeadCustomFields() {
            return new Promise(function(resolve, reject) {
                var all = [];
                function loadPage(page) {
                    $.ajax({
                        url: '/api/v4/leads/custom_fields?limit=250&page=' + page,
                        method: 'GET',
                        success: function(data) {
                            if (data && data._embedded && data._embedded.custom_fields) {
                                all = all.concat(data._embedded.custom_fields);
                            }
                            if (data && data._links && data._links.next) {
                                loadPage(page + 1);
                            } else {
                                resolve(all);
                            }
                        },
                        error: function(xhr) {
                            // 204/404 на следующей странице — это просто конец, не ошибка
                            if (xhr.status === 204 || xhr.status === 404) {
                                resolve(all);
                            } else if (page > 1 && all.length > 0) {
                                // частичные данные лучше чем ошибка
                                console.warn('[LeadCopyWidget] custom_fields pagination error on page', page, '— returning', all.length, 'collected');
                                resolve(all);
                            } else {
                                reject(xhr);
                            }
                        }
                    });
                }
                loadPage(1);
            });
        }

        function fetchCustomFields() {
            return fetchAllLeadCustomFields();
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

        // =============================================
        // Widget settings page — custom UI rendered over auto-fields
        // =============================================

        function renderSettingsUI($scope, mode) {
            var $modal_body = $scope; // alias: keeps internal references unchanged
            var isTrigger = (mode === 'trigger');
            var lang = self.i18n('settings') || {};
            var langDp = self.i18n('dp') || {};

            // ── DIAGNOSTIC: only in widget context (avoid noise on every DP modal open) ──
            if (!isTrigger) try {
                var allFields = ['access_token', 'target_pipeline_id', 'target_status_id', 'name_template', 'fields_csv', 'copy_history'];
                var savedSettings = self.get_settings() || {};
                var diag = {
                    modalBodyExists: !!($modal_body && $modal_body.length),
                    modalBodyClass: $modal_body && $modal_body.attr ? $modal_body.attr('class') : null,
                    inModalBody: {},
                    inDocument: {},
                    storedValues: {},
                    selfMethods: Object.keys(self).filter(function(k) {
                        return typeof self[k] === 'function' && (k.indexOf('set') === 0 || k.indexOf('save') === 0 || k.indexOf('update') === 0);
                    }),
                    settingsKeys: Object.keys(savedSettings)
                };
                allFields.forEach(function(name) {
                    diag.inModalBody[name] = $modal_body.find('input[name="' + name + '"]').length;
                    diag.inDocument[name] = $('input[name="' + name + '"]').length;
                    var v = savedSettings[name];
                    if (name === 'access_token' && typeof v === 'string' && v.length > 0) {
                        diag.storedValues[name] = '(' + v.length + ' chars: ' + v.substring(0, 12) + '...)';
                    } else {
                        diag.storedValues[name] = v === undefined ? '<undefined>' : (v === '' ? '<empty>' : v);
                    }
                });
                console.log('[LeadCopyWidget DIAG]', JSON.stringify(diag, null, 2));
                window.LCW_DIAG = diag;
            } catch (e) {
                console.warn('[LeadCopyWidget DIAG] failed:', e);
            }

            // Hide auto-rendered rows for the fields we're going to replace
            var fieldsToOverride = ['target_pipeline_id', 'target_status_id', 'name_template', 'fields_csv', 'copy_history'];
            // In trigger mode, also hide access_token (silently autofilled from widget settings)
            if (isTrigger) fieldsToOverride.push('access_token');

            // Hide via off-screen positioning, NOT display:none — amoCRM may skip display:none inputs during save
            var hideStyle = 'position:absolute !important; left:-9999px !important; top:-9999px !important; width:1px !important; height:1px !important; opacity:0 !important; pointer-events:none !important;';
            fieldsToOverride.forEach(function(name) {
                var $input = $modal_body.find('input[name="' + name + '"]');
                if ($input.length) {
                    var $row = $input.closest('.widget_settings_block, .widget_settings_block__item_field, label, li').first();
                    if (!$row.length) $row = $input.parent();
                    $row.attr('style', ($row.attr('style') || '') + ';' + hideStyle);
                }
            });

            // In trigger mode, always autofill access_token from widget global settings (centralized)
            if (isTrigger) {
                var widgetSettings = self.get_settings() || {};
                var $tokenInput = $modal_body.find('input[name="access_token"]');
                if ($tokenInput.length) {
                    $tokenInput.val(widgetSettings.access_token || '').trigger('change').trigger('input');
                    if ($tokenInput[0] && $tokenInput[0].dispatchEvent) {
                        $tokenInput[0].dispatchEvent(new Event('change', { bubbles: true }));
                        $tokenInput[0].dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }

            // Inject backup hidden inputs inside our custom UI — if amoCRM serializes any inputs in the modal, our names will be picked up
            var backupInputsHtml =
                '<div class="lead-copy-settings__backup" style="display:none;">' +
                    '<input type="hidden" name="target_pipeline_id" value="" data-lc-backup="1">' +
                    '<input type="hidden" name="target_status_id" value="" data-lc-backup="1">' +
                    '<input type="hidden" name="name_template" value="" data-lc-backup="1">' +
                    '<input type="hidden" name="fields_csv" value="" data-lc-backup="1">' +
                    '<input type="hidden" name="copy_history" value="" data-lc-backup="1">' +
                '</div>';

            // Build custom UI
            var customHtml =
                '<div class="lead-copy-settings" style="padding:15px 0;">' +
                    '<div class="lead-copy-settings__loader" style="text-align:center; padding:10px; color:#999;">' + (lang.loading || 'Загрузка...') + '</div>' +
                    '<div class="lead-copy-settings__form" style="display:none;">' +
                        // Pipeline
                        '<div class="lead-copy-settings__row" style="margin-bottom:12px;">' +
                            '<label style="display:block; font-size:12px; color:#666; margin-bottom:4px;">' + (lang.target_pipeline_id || 'Воронка назначения') + '</label>' +
                            '<select class="lead-copy-settings__pipeline" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:3px; font-size:13px; box-sizing:border-box;">' +
                                '<option value="">' + (langDp.loading || 'Загрузка...') + '</option>' +
                            '</select>' +
                        '</div>' +
                        // Status
                        '<div class="lead-copy-settings__row" style="margin-bottom:12px;">' +
                            '<label style="display:block; font-size:12px; color:#666; margin-bottom:4px;">' + (lang.target_status_id || 'Этап назначения') + '</label>' +
                            '<select class="lead-copy-settings__status" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:3px; font-size:13px; box-sizing:border-box;">' +
                                '<option value="">' + (langDp.selectPipelineFirst || 'Сначала выберите воронку') + '</option>' +
                            '</select>' +
                        '</div>' +
                        // Name template
                        '<div class="lead-copy-settings__row" style="margin-bottom:12px;">' +
                            '<label style="display:block; font-size:12px; color:#666; margin-bottom:4px;">' + (lang.name_template || 'Шаблон имени копии') + '</label>' +
                            '<input type="text" class="lead-copy-settings__name" placeholder="{name}_Копия" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:3px; font-size:13px; box-sizing:border-box;">' +
                            '<div style="font-size:11px; color:#999; margin-top:3px;">Используйте {name} для подстановки имени исходной сделки</div>' +
                        '</div>' +
                        // Copy history
                        '<div class="lead-copy-settings__row" style="margin-bottom:12px;">' +
                            '<label class="control-checkbox" style="display:flex; align-items:center;">' +
                                '<div class="control-checkbox__body">' +
                                    '<input type="checkbox" class="lead-copy-settings__copy-history" name="checkbox">' +
                                    '<span class="control-checkbox__helper"></span>' +
                                '</div>' +
                                '<div class="control-checkbox__text element__text">' + (lang.copy_history || 'Копировать историю (примечания и задачи)') + '</div>' +
                            '</label>' +
                        '</div>' +
                        // Fields
                        '<div class="lead-copy-settings__row" style="margin-bottom:12px; position:relative;">' +
                            '<label style="display:block; font-size:12px; color:#666; margin-bottom:4px;">' + (lang.fields_csv || 'Поля для копирования') + '</label>' +
                            '<div class="lead-copy-settings__fields-toggle" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:3px; font-size:13px; box-sizing:border-box; background:#fff; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">' +
                                '<span class="lead-copy-settings__fields-text">' + (langDp.allFields || 'Все поля') + '</span>' +
                                '<span style="font-size:10px; color:#999;">▼</span>' +
                            '</div>' +
                            '<div class="lead-copy-settings__fields-dropdown" style="display:none; position:absolute; top:100%; left:0; right:0; max-height:250px; overflow-y:auto; border:1px solid #ccc; border-top:none; border-radius:0 0 3px 3px; background:#fff; z-index:100;">' +
                                '<div style="padding:10px; color:#999; text-align:center;">' + (langDp.loading || 'Загрузка...') + '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            // Place custom UI before the form, scoped to modal body (not document)
            $modal_body.find('.lead-copy-settings').remove();
            $modal_body.find('.lead-copy-settings__backup').remove();
            $modal_body.prepend(customHtml + backupInputsHtml);

            // Stash mode so downstream helpers (applySavedSettings) know context without changing signatures
            $modal_body.data('lcMode', mode);

            // Diagnostic: intercept save-button click and dump input values at save time
            $(document).off('click.leadcopydiag').on('click.leadcopydiag',
                'button.js-widget-install, button.js-widget-update, button.js-widget-save, [data-action=save_widget], .widget_settings__save',
                function() {
                    var dump = {};
                    ['access_token', 'target_pipeline_id', 'target_status_id', 'name_template', 'fields_csv', 'copy_history'].forEach(function(name) {
                        var entries = [];
                        $('input[name="' + name + '"]').each(function() {
                            entries.push({
                                value: $(this).val(),
                                isBackup: !!$(this).attr('data-lc-backup'),
                                visible: $(this).is(':visible'),
                                inForm: $(this).closest('form').length > 0
                            });
                        });
                        dump[name] = entries;
                    });
                    console.log('[LeadCopyWidget SAVE-CLICK]', dump);
                    window.LCW_SAVE = dump;
                });

            loadSettingsData($modal_body);
            bindSettingsActions($modal_body);
        }

        function loadSettingsData($modal_body) {
            var langDp = self.i18n('dp') || {};

            var pPipelines = new Promise(function(resolve, reject) {
                $.ajax({ url: '/api/v4/leads/pipelines', method: 'GET' })
                    .done(function(data) { resolve(data._embedded ? data._embedded.pipelines : []); })
                    .fail(reject);
            });
            var pFields = fetchAllLeadCustomFields();

            Promise.all([pPipelines, pFields]).then(function(results) {
                var pipelinesData = results[0] || [];
                var fieldsData = results[1] || [];

                $modal_body.data('lcPipelines', pipelinesData);
                $modal_body.data('lcCustomFields', fieldsData);

                populateSettingsPipelines($modal_body);
                populateSettingsFields($modal_body);
                applySavedSettings($modal_body);

                $modal_body.find('.lead-copy-settings__loader').hide();
                $modal_body.find('.lead-copy-settings__form').show();
            }).catch(function() {
                $modal_body.find('.lead-copy-settings__loader').text(langDp.loadError || 'Ошибка загрузки данных');
            });
        }

        function populateSettingsPipelines($modal_body) {
            var pipelinesData = $modal_body.data('lcPipelines') || [];
            var $select = $modal_body.find('.lead-copy-settings__pipeline');
            $select.empty();
            pipelinesData.forEach(function(p) {
                $select.append('<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>');
            });
        }

        function populateSettingsStatuses($modal_body, pipelineId, preferredStatusId) {
            var pipelinesData = $modal_body.data('lcPipelines') || [];
            var $select = $modal_body.find('.lead-copy-settings__status');
            var mode = $modal_body.data('lcMode') || 'widget';
            // In trigger mode prefer the saved trigger value; in widget mode read from widget global settings
            var fallbackStatus = 0;
            if (mode === 'trigger') {
                fallbackStatus = parseInt($modal_body.find('input[name="target_status_id"]:not([data-lc-backup])').val()) || 0;
                if (!fallbackStatus) fallbackStatus = parseInt((self.get_settings() || {}).target_status_id) || 0;
            } else {
                fallbackStatus = parseInt((self.get_settings() || {}).target_status_id) || 0;
            }
            var saved = parseInt(preferredStatusId || fallbackStatus) || 0;
            $select.empty();
            var pipeline = pipelinesData.find(function(p) { return p.id === pipelineId; });
            if (pipeline && pipeline._embedded && pipeline._embedded.statuses) {
                pipeline._embedded.statuses.forEach(function(s) {
                    if (s.id !== 142 && s.id !== 143) {
                        var sel = (s.id === saved) ? ' selected' : '';
                        $select.append('<option value="' + s.id + '"' + sel + '>' + escapeHtml(s.name) + '</option>');
                    }
                });
            }
        }

        function populateSettingsFields($modal_body) {
            var langDp = self.i18n('dp') || {};
            var customFieldsData = $modal_body.data('lcCustomFields') || [];
            var $dropdown = $modal_body.find('.lead-copy-settings__fields-dropdown');
            $dropdown.empty();

            var standardFields = [
                { id: '__price__', name: langDp.price || 'Бюджет' },
                { id: '__responsible__', name: langDp.responsible || 'Ответственный' },
                { id: '__tags__', name: langDp.tags || 'Теги' },
                { id: '__contacts__', name: langDp.contacts || 'Контакты' },
                { id: '__companies__', name: langDp.companies || 'Компании' }
            ];

            var checkboxStyle = 'display:flex; align-items:center; padding:5px 10px; cursor:pointer; border-bottom:1px solid #eee; font-size:12px;';
            var inputStyle = 'margin-right:8px; cursor:pointer; width:14px; height:14px;';

            $dropdown.append(
                '<label style="' + checkboxStyle + 'font-weight:500; background:#f9f9f9;">' +
                    '<input type="checkbox" class="lead-copy-settings__field-all" checked style="' + inputStyle + '">' +
                    escapeHtml(langDp.allFields || 'Все поля') +
                '</label>'
            );

            customFieldsData.forEach(function(field) {
                $dropdown.append(
                    '<label style="' + checkboxStyle + '">' +
                        '<input type="checkbox" class="lead-copy-settings__field-item" value="' + field.id + '" checked style="' + inputStyle + '">' +
                        escapeHtml(field.name) +
                    '</label>'
                );
            });

            standardFields.forEach(function(field) {
                $dropdown.append(
                    '<label style="' + checkboxStyle + '">' +
                        '<input type="checkbox" class="lead-copy-settings__field-item" value="' + field.id + '" checked style="' + inputStyle + '">' +
                        escapeHtml(field.name) +
                    '</label>'
                );
            });
        }

        function applySavedSettings($modal_body) {
            var mode = $modal_body.data('lcMode') || 'widget';
            var widgetGlobals = self.get_settings() || {};

            // In widget mode: read from widget global settings.
            // In trigger mode: read from auto-rendered hidden inputs (saved trigger snapshot), fall back to widget globals.
            var stored;
            if (mode === 'trigger') {
                var notBackup = ':not([data-lc-backup])';
                var triggerVals = {
                    target_pipeline_id: $modal_body.find('input[name="target_pipeline_id"]' + notBackup).val(),
                    target_status_id: $modal_body.find('input[name="target_status_id"]' + notBackup).val(),
                    name_template: $modal_body.find('input[name="name_template"]' + notBackup).val(),
                    copy_history: $modal_body.find('input[name="copy_history"]' + notBackup).val(),
                    fields_csv: $modal_body.find('input[name="fields_csv"]' + notBackup).val()
                };
                stored = {
                    target_pipeline_id: triggerVals.target_pipeline_id || widgetGlobals.target_pipeline_id || '',
                    target_status_id: triggerVals.target_status_id || widgetGlobals.target_status_id || '',
                    name_template: triggerVals.name_template || widgetGlobals.name_template || '{name}_Копия',
                    copy_history: (triggerVals.copy_history !== undefined && triggerVals.copy_history !== '') ? triggerVals.copy_history : (widgetGlobals.copy_history || '0'),
                    fields_csv: triggerVals.fields_csv || widgetGlobals.fields_csv || ''
                };
            } else {
                stored = widgetGlobals;
            }

            var savedPipeline = parseInt(stored.target_pipeline_id) || 0;
            var savedStatus = parseInt(stored.target_status_id) || 0;
            var savedName = stored.name_template || '{name}_Копия';
            var savedFields = String(stored.fields_csv || '').split(',').filter(Boolean);
            var savedCopyHistory = stored.copy_history;
            var copyHistoryChecked = (savedCopyHistory === '1' || savedCopyHistory === 1 || savedCopyHistory === 'Y' || savedCopyHistory === 'on' || savedCopyHistory === 'true' || savedCopyHistory === true);

            $modal_body.find('.lead-copy-settings__name').val(savedName);
            $modal_body.find('.lead-copy-settings__copy-history').prop('checked', copyHistoryChecked);

            var pipelinesData = $modal_body.data('lcPipelines') || [];
            var pipelineToSelect = savedPipeline || (pipelinesData[0] && pipelinesData[0].id) || 0;

            $modal_body.find('.lead-copy-settings__pipeline').val(pipelineToSelect);
            populateSettingsStatuses($modal_body, pipelineToSelect, savedStatus);

            // Restore fields selection
            if (savedFields.length > 0) {
                $modal_body.find('.lead-copy-settings__field-item').each(function() {
                    var val = $(this).val();
                    $(this).prop('checked', savedFields.indexOf(val) !== -1);
                });
                $modal_body.find('.lead-copy-settings__field-all').prop('checked',
                    $modal_body.find('.lead-copy-settings__field-item').length ===
                    $modal_body.find('.lead-copy-settings__field-item:checked').length);
            }
            updateSettingsFieldsText($modal_body);

            // Initial sync — push current UI state to hidden inputs so save works
            // even if user doesn't change anything
            syncAllToHiddenInputs($modal_body);
        }

        function updateSettingsFieldsText($modal_body) {
            var langDp = self.i18n('dp') || {};
            var $items = $modal_body.find('.lead-copy-settings__field-item');
            var checked = $items.filter(':checked').length;
            var total = $items.length;
            var text;
            if (checked === 0) text = langDp.noFieldsSelected || 'Поля не выбраны';
            else if (checked === total) text = langDp.allFields || 'Все поля';
            else text = (langDp.fieldsSelected || 'Выбрано полей: {count}').replace('{count}', checked);
            $modal_body.find('.lead-copy-settings__fields-text').text(text);
        }

        function bindSettingsActions($modal_body) {
            $modal_body.off('.leadcopysettings');

            // Pipeline change → repopulate statuses + sync
            $modal_body.on('change.leadcopysettings', '.lead-copy-settings__pipeline', function() {
                var pipelineId = parseInt($(this).val());
                populateSettingsStatuses($modal_body, pipelineId);
                syncAllToHiddenInputs($modal_body);
            });

            // Status change → sync
            $modal_body.on('change.leadcopysettings', '.lead-copy-settings__status', function() {
                syncAllToHiddenInputs($modal_body);
            });

            // Name template change → sync
            $modal_body.on('input.leadcopysettings change.leadcopysettings', '.lead-copy-settings__name', function() {
                syncAllToHiddenInputs($modal_body);
            });

            // Copy history checkbox → sync
            $modal_body.on('change.leadcopysettings', '.lead-copy-settings__copy-history', function() {
                syncAllToHiddenInputs($modal_body);
            });

            // Fields toggle dropdown
            $modal_body.on('click.leadcopysettings', '.lead-copy-settings__fields-toggle', function(e) {
                e.stopPropagation();
                $modal_body.find('.lead-copy-settings__fields-dropdown').toggle();
            });
            $(document).off('click.leadcopysettings').on('click.leadcopysettings', function(e) {
                if (!$(e.target).closest('.lead-copy-settings__fields-toggle, .lead-copy-settings__fields-dropdown').length) {
                    $modal_body.find('.lead-copy-settings__fields-dropdown').hide();
                }
            });

            // All fields checkbox → toggle items + sync
            $modal_body.on('change.leadcopysettings', '.lead-copy-settings__field-all', function() {
                var checked = $(this).prop('checked');
                $modal_body.find('.lead-copy-settings__field-item').prop('checked', checked);
                updateSettingsFieldsText($modal_body);
                syncAllToHiddenInputs($modal_body);
            });
            // Individual field checkbox → update master + sync
            $modal_body.on('change.leadcopysettings', '.lead-copy-settings__field-item', function() {
                var $items = $modal_body.find('.lead-copy-settings__field-item');
                $modal_body.find('.lead-copy-settings__field-all').prop('checked',
                    $items.length === $items.filter(':checked').length);
                updateSettingsFieldsText($modal_body);
                syncAllToHiddenInputs($modal_body);
            });
        }

        // Live-sync custom controls into hidden form inputs (amoCRM reads them on save)
        function syncAllToHiddenInputs($modal_body) {
            var pipelineVal = $modal_body.find('.lead-copy-settings__pipeline').val() || '';
            var statusVal = $modal_body.find('.lead-copy-settings__status').val() || '';
            var nameVal = $modal_body.find('.lead-copy-settings__name').val() || '';
            var copyHistoryVal = $modal_body.find('.lead-copy-settings__copy-history').prop('checked') ? '1' : '0';
            var fieldVals = [];
            $modal_body.find('.lead-copy-settings__field-item:checked').each(function() {
                fieldVals.push($(this).val());
            });

            setHiddenInput($modal_body, 'target_pipeline_id', pipelineVal);
            setHiddenInput($modal_body, 'target_status_id', statusVal);
            setHiddenInput($modal_body, 'name_template', nameVal || '{name}_Копия');
            setHiddenInput($modal_body, 'copy_history', copyHistoryVal);
            setHiddenInput($modal_body, 'fields_csv', fieldVals.join(','));
        }

        function setHiddenInput($scope, name, val) {
            // Write to ALL inputs with this name we can find:
            //   1. Inside our scope (modal_body) — both auto-rendered and our backup
            //   2. Outside scope — anywhere in document (defensive)
            // Excluding our own visible custom controls (e.g. .lead-copy-settings__name)
            var $inScope = $scope.find('input[name="' + name + '"]').not('.lead-copy-settings__name, .lead-copy-settings__copy-history');
            var $inDoc = $('input[name="' + name + '"]').not('.lead-copy-settings__name, .lead-copy-settings__copy-history');

            // Merge unique
            var $all = $inScope.add($inDoc);

            if (!$all.length) {
                console.warn('[LeadCopyWidget] no hidden input found for:', name);
                return;
            }
            $all.val(val).trigger('change').trigger('input');
            // Also dispatch native events — amoCRM models may listen via addEventListener (not jQuery)
            $all.each(function() {
                if (this.dispatchEvent) {
                    this.dispatchEvent(new Event('change', { bubbles: true }));
                    this.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            // Diagnostic: log only on first write per session per field
            window.__lcw_logged = window.__lcw_logged || {};
            if (!window.__lcw_logged[name]) {
                console.log('[LeadCopyWidget] sync', name, '=', val, 'to', $all.length, 'input(s)');
                window.__lcw_logged[name] = true;
            }
        }

        // =============================================
        // Digital Pipeline — auto-fill from widget global settings
        // =============================================

        function autofillDpFromWidgetSettings() {
            var settings = self.get_settings() || {};
            var w_code = settings.widget_code;
            var langDp = self.i18n('dp') || {};

            // Locate the DP trigger config form (per amoCRM docs)
            var $dp_form = $('.digital-pipeline__short-task_widget-style_' + w_code).parent().parent().find('[data-action=send_widget_hook]');
            if (!$dp_form.length) {
                // Fallback to any visible widget settings wrapper inside DP
                $dp_form = $('#widget_settings__fields_wrapper');
            }
            if (!$dp_form.length) return;

            // Normalize copy_history to '1' / '0' string (it lives in a text input now)
            var copyHistRaw = settings.copy_history;
            var copyHistChecked = (copyHistRaw === '1' || copyHistRaw === 'Y' || copyHistRaw === 'on' || copyHistRaw === true || copyHistRaw === 'true');
            var copyHistStr = copyHistChecked ? '1' : '0';

            // Auto-fill DP form fields from widget global settings
            var mapping = {
                'access_token': settings.access_token || '',
                'target_pipeline_id': settings.target_pipeline_id || '',
                'target_status_id': settings.target_status_id || '',
                'name_template': settings.name_template || '{name}_Копия',
                'fields_csv': settings.fields_csv || '',
                'copy_history': copyHistStr
            };
            Object.keys(mapping).forEach(function(name) {
                var $input = $dp_form.find('input[name="' + name + '"]');
                if ($input.length) $input.val(mapping[name]);
            });

            // Hide all rows so admin doesn't have to interact with them, show info instead
            ['access_token', 'target_pipeline_id', 'target_status_id', 'name_template', 'copy_history', 'fields_csv'].forEach(function(name) {
                var $input = $dp_form.find('input[name="' + name + '"]');
                if ($input.length) {
                    var $row = $input.closest('.widget_settings_block, .widget_settings_block__item_field, label, li').first();
                    if (!$row.length) $row = $input.parent();
                    $row.hide();
                }
            });

            // Add info plate (only once)
            if (!$dp_form.find('.lead-copy-dp-info').length) {
                var summaryParts = [];
                summaryParts.push('Воронка: ' + (settings.target_pipeline_id || '—'));
                summaryParts.push('Этап: ' + (settings.target_status_id || '—'));
                summaryParts.push('История: ' + (copyHistChecked ? 'да' : 'нет'));

                var infoHtml =
                    '<div class="lead-copy-dp-info" style="padding:12px 14px; margin:8px 0; background:#e3f2fd; border-radius:6px; color:#1565c0; font-size:13px; line-height:1.4;">' +
                        '<div style="font-weight:600; margin-bottom:6px;">' + (langDp.title || 'Копирование сделки') + '</div>' +
                        '<div style="margin-bottom:8px;">' + (langDp.infoText || 'Настройки берутся из конфигурации виджета. Чтобы изменить — откройте настройки виджета и пересохраните этот триггер.') + '</div>' +
                        '<div style="font-size:11px; color:#1976d2;">' + escapeHtml(summaryParts.join(' · ')) + '</div>' +
                    '</div>';
                $dp_form.prepend(infoHtml);
            }
        }

        return this;
    };

    return CustomWidget;
});
