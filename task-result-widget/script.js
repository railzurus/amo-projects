define(['jquery'], function($) {
    var CustomWidget = function() {
        var self = this;

        this.callbacks = {
            render: function() {
                return true;
            },

            init: function() {
                return true;
            },

            bind_actions: function() {
                initTaskResultRequired();
                return true;
            },

            settings: function() {},

            onSave: function() {
                return true;
            },

            destroy: function() {}
        };

        // === Функционал обязательного результата задачи ===
        function initTaskResultRequired() {
            var lang = self.i18n('userLang');

            // Используем перехват на фазе capture для раннего перехвата
            document.addEventListener('click', function(e) {
                var $target = $(e.target);
                var $button = $target.closest('.js-task-result-button, .card-task__button, button[class*="task-result"]');

                if (!$button.length) {
                    return;
                }

                // Ищем поле результата в карточке задачи
                var $taskCard = $button.closest('.card-task');
                var $resultField = $taskCard.find('.js-task-result-textarea, textarea[name="result"]');

                var resultValue = $resultField.val() ? $resultField.val().trim() : '';

                if (!resultValue) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    // Показываем уведомление
                    if (typeof AMOCRM !== 'undefined' && AMOCRM.notifications) {
                        AMOCRM.notifications.show_message({
                            text: lang.taskResultError || 'Укажите результат выполнения задачи',
                            type: 'error'
                        });
                    } else {
                        alert(lang.taskResultError || 'Укажите результат выполнения задачи');
                    }

                    // Фокусируемся на поле результата
                    if ($resultField.length) {
                        $resultField.focus();
                        $resultField.css('border-color', '#c62828');
                        setTimeout(function() {
                            $resultField.css('border-color', '');
                        }, 3000);
                    }

                    return false;
                }
            }, true);
        }

        return this;
    };

    return CustomWidget;
});
