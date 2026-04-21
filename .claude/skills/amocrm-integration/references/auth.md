# Авторизация amoCRM API

## Оглавление
- Типы авторизации
- OAuth 2.0 — полный цикл
- Долгоживущие токены
- Обновление токенов
- Хук об отключении интеграции
- Scopes (разрешения)

## Типы авторизации

amoCRM поддерживает два способа авторизации:

### 1. Долгоживущий токен (Long-lived token)
Подходит для простых интеграций под конкретный аккаунт. Создаётся в интерфейсе amoCRM: вкладка "Ключи" → "Сгенерировать токен". Срок действия от 1 дня до 5 лет. НЕ имеет refresh_token — после истечения нужно создавать новый.

Использование: просто передавай в заголовке каждого запроса:
```
Authorization: Bearer {long_lived_token}
```

### 2. OAuth 2.0
Для публичных интеграций и доступа к нескольким аккаунтам.

## OAuth 2.0 — полный цикл

### Шаг 1. Регистрация интеграции
Раздел "амоМаркет" → Создать Интеграцию. После создания появляются:
- **Integration ID** (client_id) — уникальный ID интеграции
- **Secret key** (client_secret) — секретный ключ
- **Redirect URI** — URL для получения authorization code (должен быть HTTPS)

### Шаг 2. Получение Authorization Code
Срок жизни: **20 минут**. Три способа получить:
1. Скопировать из модального окна интеграции (для одного аккаунта)
2. Webhook при установке виджета на Redirect URI
3. Через URL предоставления доступа:
```
https://www.amocrm.ru/oauth?client_id={Integration_ID}&state={csrf_hash}&mode={popup|post_message}
```

После предоставления доступа пользователь перенаправляется на Redirect URI с GET-параметрами:
- `code` — Authorization code
- `referer` — адрес аккаунта (subdomain.amocrm.ru)
- `state` — переданный ранее параметр (для CSRF-проверки)
- `platform` — 1 (amocrm.ru) или 2 (amocrm.com/kommo.com)

### Шаг 3. Обмен code на access_token + refresh_token

```
POST https://{subdomain}.amocrm.ru/oauth2/access_token
Content-Type: application/json

{
    "client_id": "xxxx",
    "client_secret": "xxxx",
    "grant_type": "authorization_code",
    "code": "xxxxxxx",
    "redirect_uri": "https://example.com/callback"
}
```

Ответ:
```json
{
    "token_type": "Bearer",
    "expires_in": 86400,
    "access_token": "xxxxxx",
    "refresh_token": "xxxxx"
}
```

- `access_token` — JWT, живёт **24 часа** (86400 секунд)
- `refresh_token` — живёт **3 месяца**, одноразовый

### Шаг 4. Обновление токена

```
POST https://{subdomain}.amocrm.ru/oauth2/access_token
Content-Type: application/json

{
    "client_id": "xxxx",
    "client_secret": "xxxx",
    "grant_type": "refresh_token",
    "refresh_token": "xxxxx",
    "redirect_uri": "https://example.com/callback"
}
```

Ответ аналогичен шагу 3. ВАЖНО:
- Старый refresh_token после обмена больше не действует
- Обязательно сохраняй новый refresh_token
- Если refresh_token истёк (3 месяца) — нужна повторная авторизация пользователем

### Использование access_token
Добавляй заголовок ко всем запросам:
```
Authorization: Bearer {access_token}
```

## Хук об отключении интеграции

Можно указать URL в настройках интеграции. При отключении придёт GET-запрос с параметрами:
- `account_id` — ID аккаунта
- `client_uuid` — ID интеграции
- `signature` — HMAC-подпись для проверки подлинности

Проверка подписи:
```
signature = HMAC-SHA256(key=client_secret, message="{client_id}|{account_id}")
```

## Scopes (разрешения)

При создании интеграции выбираются минимально необходимые разрешения. Токен имеет права пользователя, предоставившего доступ. Доступные scopes:
- crm — доступ к CRM сущностям
- notifications — уведомления
- files — файлы
- push_notifications — push-уведомления

## Примеры

### Python (requests)
```python
import requests

SUBDOMAIN = "mycompany"
BASE_URL = f"https://{SUBDOMAIN}.amocrm.ru"

def get_tokens(auth_code, client_id, client_secret, redirect_uri):
    resp = requests.post(f"{BASE_URL}/oauth2/access_token", json={
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "authorization_code",
        "code": auth_code,
        "redirect_uri": redirect_uri,
    })
    resp.raise_for_status()
    return resp.json()

def refresh_tokens(refresh_token, client_id, client_secret, redirect_uri):
    resp = requests.post(f"{BASE_URL}/oauth2/access_token", json={
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "redirect_uri": redirect_uri,
    })
    resp.raise_for_status()
    return resp.json()
```

### Node.js (axios)
```javascript
const axios = require('axios');

const SUBDOMAIN = 'mycompany';
const BASE_URL = `https://${SUBDOMAIN}.amocrm.ru`;

async function getTokens(authCode, clientId, clientSecret, redirectUri) {
    const { data } = await axios.post(`${BASE_URL}/oauth2/access_token`, {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: redirectUri,
    });
    return data;
}

async function refreshTokens(refreshToken, clientId, clientSecret, redirectUri) {
    const { data } = await axios.post(`${BASE_URL}/oauth2/access_token`, {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        redirect_uri: redirectUri,
    });
    return data;
}
```
