# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Обзор

Рабочее пространство для разработки проектов amoCRM. Содержит скиллы Claude Code для создания интеграций и виджетов.

## Доступные скиллы

### `/amocrm-integration`
Серверные интеграции с amoCRM REST API v4:
- OAuth-авторизация и управление токенами
- CRUD для сделок, контактов, компаний, задач
- Вебхуки (подписка и обработка)
- Кастомные поля
- Синхронизация с внешними сервисами (1С, Google Sheets, Telegram и др.)

Справка: `.claude/skills/amocrm-integration/references/`

### `/amocrm-widgets`
Браузерные виджеты для интерфейса amoCRM:
- Конфигурация manifest.json
- script.js с колбэками (render, init, bind_actions)
- Digital Pipeline и Salesbot
- UI в карточках, списках, настройках

Справка: `.claude/skills/amocrm-widgets/references/`

## Ограничения API amoCRM

- Базовый URL: `https://{subdomain}.amocrm.ru/api/v4/`
- Лимит: **7 запросов в секунду** (HTTP 429 при превышении)
- Пагинация: макс. 250 записей за запрос
- Пакетные операции: макс. 250 сущностей за POST/PATCH
- Даты — Unix Timestamp (int), ID — int
- Макс. 100 вебхуков на аккаунт

## Сборка и релизы виджетов

При сборке виджета для деплоя:

1. Версию брать из `manifest.json` → `widget.version`
2. Создать папку `releases/{widgetname}/{version}/`
3. Положить туда:
   - `{widgetname}_v{semver}.zip` — архив виджета (файлы на первом уровне)
   - Все сопутствующие файлы для Yandex Cloud (функции, воркеры, API Gateway конфиги и т.д.)
4. Архив виджета содержит только файлы для amoCRM: `manifest.json`, `script.js`, `style.css`, `i18n/`, `images/`
5. **ВАЖНО:** НЕ использовать `Compress-Archive` PowerShell — он создаёт пути с обратными слешами (`i18n\ru.json`), amoCRM их не принимает. Собирать ZIP через Node.js или другой инструмент, гарантирующий Unix-слеши (`i18n/ru.json`)
6. Сервер��ые файлы (cloudflare-worker.js, yandex-proxy/) копируются рядом как есть

Пример структуры:
```
releases/
└── city-autocomplete-widget/
    └── 1.9.20/
        ├── city-autocomplete-widget_v1.9.20.zip
        ├── cloudflare-worker.js
        └── yandex-proxy/
            ├── index.js
            ├── webhook.js
            ├── api-gateway.yaml
            ├── package.json
            └── package-webhook.json
```

## Виджеты — важное

- `interface_version` только `2` (v1 устарел)
- Колбэки должны возвращать `true`: `render` → `init` → `bind_actions`
- В ZIP-архиве файлы на первом уровне (не внутри папки)
- Блок `tour` в manifest.json обязателен (с ноября 2019)
- Блок `support` (link или email) обязателен (с ноября 2018)
