# Вебхуки amoCRM

## Оглавление
- Подписка через API
- Формат входящих вебхуков
- Возможные события
- Обработка и retry-политика
- Примеры данных

---

## Подписка через API

Максимум 100 вебхуков в аккаунте. Один вебхук может быть подписан на несколько событий. Требуются права администратора.

### Список вебхуков
```
GET /api/v4/webhooks
```
Фильтр: `filter[destination]` — точный URL

### Подписка
```
POST /api/v4/webhooks
Content-Type: application/json

{
    "destination": "https://example.com/webhook",
    "settings": ["add_lead", "update_lead", "status_lead"]
}
```
HTTP 201 — создано. Если вебхук с таким URL уже есть — обновится.

### Отписка
```
DELETE /api/v4/webhooks
Content-Type: application/json

{"destination": "https://example.com/webhook"}
```
HTTP 204 — удалено.

---

## Формат входящих вебхуков

**ВАЖНО**: Вебхук приходит в формате `x-www-form-urlencoded` (НЕ JSON!). 

Структура данных:
```
{entity: {action: {0: {поля сущности}}}}
```
Для удаления:
```
{entity: {action: "id"}}
```

В PHP данные доступны через:
```php
$data = $_POST;
// или
$data = json_decode(file_get_contents('php://input'), true);
```

В Node.js/Express:
```javascript
app.use(express.urlencoded({ extended: true }));
app.post('/webhook', (req, res) => {
    const data = req.body;
    res.status(200).send('OK');
});
```

В Python/Flask:
```python
@app.route('/webhook', methods=['POST'])
def handle_webhook():
    data = request.form.to_dict(flat=False)
    # или для JSON body:
    # data = request.get_json(force=True)
    return 'OK', 200
```

---

## Возможные события

| Событие | Описание |
|---------|----------|
| `add_lead` | Добавлена сделка |
| `update_lead` | Сделка изменена |
| `delete_lead` | Удалена сделка |
| `status_lead` | У сделки сменился статус |
| `restore_lead` | Сделка восстановлена |
| `responsible_lead` | Смена ответственного сделки |
| `note_lead` | Примечание в сделке |
| `add_contact` | Добавлен контакт |
| `update_contact` | Контакт изменён |
| `delete_contact` | Удалён контакт |
| `restore_contact` | Контакт восстановлен |
| `responsible_contact` | Смена ответственного контакта |
| `note_contact` | Примечание в контакте |
| `add_company` | Добавлена компания |
| `update_company` | Компания изменена |
| `delete_company` | Удалена компания |
| `restore_company` | Компания восстановлена |
| `responsible_company` | Смена ответственного компании |
| `note_company` | Примечание в компании |
| `add_customer` | Добавлен покупатель |
| `update_customer` | Покупатель изменен |
| `delete_customer` | Удален покупатель |
| `responsible_customer` | Смена ответственного покупателя |
| `note_customer` | Примечание у покупателя |
| `add_task` | Добавлена задача |
| `update_task` | Задача изменена |
| `delete_task` | Удалена задача |
| `responsible_task` | Смена ответственного задачи |
| `add_talk` | Добавлена беседа |
| `update_talk` | Беседа изменена |
| `add_chat_template_review` | Шаблон WhatsApp на одобрение |

---

## Обработка и retry-политика

- Таймаут ответа: **2 секунды** максимум
- Успешный ответ: HTTP код от 100 до 299
- При невалидном ответе — retry:
  - 2-я попытка: через 5 минут (коды 0-99, 300+)
  - 3-я попытка: через 15 минут (коды 0-99, 300+)
  - 4-я попытка: через 15 минут (коды 499, 500-599)
  - 5-я попытка: через 1 час (коды 499, 500-599)
- **Автоотключение**: если за 2 часа 100+ невалидных откликов И последний тоже невалидный — вебхук отключается

**Рекомендация**: обрабатывай вебхук максимально быстро. Если нужна длительная обработка — складывай в очередь и отвечай 200 сразу.

---

## Примеры данных в вебхуках

### Смена статуса сделки
```json
{
    "leads": {
        "status": {
            "0": {
                "id": "25399013",
                "name": "Lead title",
                "old_status_id": "7039101",
                "status_id": "142",
                "price": "0",
                "responsible_user_id": "123123",
                "last_modified": "1413554372",
                "modified_user_id": "123123",
                "created_user_id": "123123",
                "date_create": "1413554349",
                "account_id": "7039099",
                "custom_fields": [
                    {"id": "427183", "name": "Field", "values": ["value"]}
                ]
            }
        }
    }
}
```

### Создание контакта
```json
{
    "contacts": {
        "add": [
            {
                "id": "10952709",
                "name": "Контакт",
                "responsible_user_id": "123123",
                "date_create": "1684402722",
                "custom_fields": [
                    {
                        "id": "575809",
                        "name": "Телефон",
                        "values": [{"value": "+76665554433", "enum": "311321"}],
                        "code": "PHONE"
                    }
                ],
                "type": "contact"
            }
        ]
    }
}
```

### Обновление задачи (завершение)
```json
{
    "task": {
        "update": [
            {
                "0": {
                    "id": "11122233",
                    "element_id": "33322211",
                    "element_type": "2",
                    "task_type": "1",
                    "status": "1",
                    "action_close": "1",
                    "result": {"id": "155155155", "text": "Success"}
                }
            }
        ]
    },
    "account": {"subdomain": "test"}
}
```

### Отличие контакта от компании в вебхуках
При создании/удалении контакта и компании — оба приходят в ключе `contacts`. Различаются полем `type`:
- `"type": "contact"` — контакт
- `"type": "company"` — компания
