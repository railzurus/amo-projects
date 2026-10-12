/**
 * Общий HTTP-сервер для функций в формате Yandex Cloud Functions
 *
 * Запускает обработчики виджетов без изменений: превращает HTTP-запрос в событие
 * формата Yandex API Gateway, а ответ функции — обратно в HTTP.
 *
 * Маршруты — переменная ROUTES: "путь=файл" через запятую, "*" — всё остальное.
 *   ati-proxy:    ROUTES="/webhook=webhook.js,*=index.js"
 *   atp-webhook:  ROUTES="*=index.js"
 * GET /healthz отвечает сам сервер.
 *
 * Логи — JSON-строки в stdout. У каждого запроса есть request_id (из заголовка
 * X-Request-Id от Caddy или сгенерированный); он же попадает в логи обработчиков
 * и возвращается клиенту в заголовке X-Request-Id. Токены и ключи в логах маскируются.
 */

const http = require('http');
const path = require('path');
const util = require('util');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const SERVICE_NAME = process.env.SERVICE_NAME || 'yc-runtime';
const HANDLERS_DIR = process.env.HANDLERS_DIR || path.join(__dirname, 'handlers');
const ROUTES_SPEC = process.env.ROUTES || '*=index.js';
const PORT = parseInt(process.env.PORT, 10) || 8080;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_LOGGED_RESPONSE = 2000;

const requestContext = new AsyncLocalStorage();

// ========== ЛОГИРОВАНИЕ ==========

// Обработчики пишут в лог тело запроса amoCRM, а в нём бывает access_token
const SECRET_PATTERNS = [
    // access_token=…, [access_token]=…, "access_token":"…", access_token: '…' (в т.ч. URL-encoded и экранированные)
    /((?:access_token|refresh_token|api_key|ati_api_key|client_secret|password)(?:%5D|\])?\\?["']?\s*(?:[:=]|%3D)\s*\\?["']?)[^&"'\\\s,}]+/gi,
    /(Bearer\s+)[\w.~+/-]+=*/gi,
    // JWT — в таком формате долгосрочные токены amoCRM
    /()eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g
];

function redact(value) {
    if (typeof value !== 'string') return value;
    return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '$1[REDACTED]'), value);
}

function log(level, msg, fields) {
    const ctx = requestContext.getStore();
    const entry = {
        ts: new Date().toISOString(),
        level,
        service: SERVICE_NAME,
        request_id: ctx ? ctx.requestId : undefined,
        msg: redact(msg),
        ...fields
    };
    for (const key of ['stack', 'response', 'query']) {
        entry[key] = redact(entry[key]);
    }
    const line = JSON.stringify(entry) + '\n';
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line);
}

// console.* обработчиков тоже пишем в JSON — с request_id текущего запроса
const CONSOLE_LEVELS = { log: 'info', info: 'info', debug: 'debug', warn: 'warn', error: 'error' };
for (const [method, level] of Object.entries(CONSOLE_LEVELS)) {
    console[method] = (...args) => {
        const error = args.find(arg => arg instanceof Error);
        log(level, util.format(...args.map(arg => arg instanceof Error ? arg.message : arg)),
            error ? { stack: error.stack } : undefined);
    };
}

process.on('uncaughtException', error => {
    log('error', 'Uncaught exception: ' + error.message, { stack: error.stack });
    process.exit(1);
});
process.on('unhandledRejection', reason => {
    log('error', 'Unhandled rejection: ' + (reason && reason.message || reason),
        { stack: reason && reason.stack });
});

// ========== МАРШРУТЫ ==========

function loadRoutes(spec) {
    const routes = spec.split(',').map(item => item.trim()).filter(Boolean).map(item => {
        const [route, file] = item.split('=').map(part => part.trim());
        if (!route || !file) {
            throw new Error(`Invalid ROUTES entry: "${item}"`);
        }
        const name = path.basename(file, '.js');
        return { route, name, handler: require(path.join(HANDLERS_DIR, file)).handler };
    });
    if (!routes.some(r => r.route === '*')) {
        throw new Error('ROUTES must contain a "*" fallback');
    }
    return routes;
}

const routes = loadRoutes(ROUTES_SPEC);

function matchRoute(pathname) {
    return routes.find(r => r.route === pathname) || routes.find(r => r.route === '*');
}

// ========== СЕРВЕР ==========

const server = http.createServer((req, res) => {
    const requestId = sanitizeRequestId(req.headers['x-request-id']) || crypto.randomUUID();
    requestContext.run({ requestId }, () => handleRequest(req, res, requestId));
});

async function handleRequest(req, res, requestId) {
    const startedAt = Date.now();
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname === '/healthz' ? null : matchRoute(url.pathname);
    let result;

    res.setHeader('X-Request-Id', requestId);

    try {
        if (!route) {
            result = { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: 'ok' };
        } else {
            const body = await readBody(req);
            result = await route.handler(buildEvent(req, url, body), {});
        }
    } catch (error) {
        log('error', 'Request failed: ' + error.message, { stack: error.stack });
        result = {
            statusCode: error.statusCode || 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: error.message, request_id: requestId })
        };
    }

    send(res, result);

    if (route) {
        logAccess(req, url, result, route.name, Date.now() - startedAt);
    }
}

// Итоговая строка по запросу; для ошибок — ещё и тело ответа (там причина)
function logAccess(req, url, result, routeName, durationMs) {
    const status = result.statusCode || 200;
    const fields = {
        type: 'access',
        route: routeName,
        method: req.method,
        path: url.pathname,
        query: url.search || undefined,
        status,
        duration_ms: durationMs,
        client_ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        origin: req.headers.origin
    };

    // Вебхуки отвечают 200 и при неудаче, кладя {"success": false} в тело
    let reportedFailure = false;
    if (status === 200 && req.method !== 'OPTIONS') {
        try {
            reportedFailure = JSON.parse(decodeBody(result)).success === false;
        } catch (e) { /* тело не JSON */ }
    }

    if (status >= 400 || reportedFailure) {
        fields.response = truncate(decodeBody(result), MAX_LOGGED_RESPONSE);
    }

    const level = status >= 500 ? 'error' : (status >= 400 || reportedFailure ? 'warn' : 'info');
    log(level, `${req.method} ${url.pathname} ${status} ${durationMs}ms`, fields);
}

// Событие в формате Yandex API Gateway — только поля, которые читают обработчики
function buildEvent(req, url, body) {
    const query = {};
    for (const [key, value] of url.searchParams) {
        query[key] = value;
    }

    return {
        httpMethod: req.method,
        url: url.pathname,
        path: url.pathname,
        headers: req.headers,
        queryStringParameters: url.searchParams.size ? query : null,
        body: body.toString('base64'),
        isBase64Encoded: true
    };
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let tooLarge = false;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                // Остаток тела дочитываем вхолостую, чтобы клиент получил 413, а не обрыв
                if (!tooLarge) {
                    tooLarge = true;
                    chunks.length = 0;
                    const error = new Error('Request body too large');
                    error.statusCode = 413;
                    reject(error);
                }
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function send(res, result) {
    if (res.headersSent) return;
    res.writeHead(result.statusCode || 200, result.headers || {});
    res.end(result.isBase64Encoded ? Buffer.from(result.body || '', 'base64') : (result.body || ''));
}

function decodeBody(result) {
    const body = result.body || '';
    return result.isBase64Encoded ? Buffer.from(body, 'base64').toString('utf-8') : String(body);
}

function truncate(text, max) {
    return text.length > max ? text.slice(0, max) + `… [+${text.length - max} chars]` : text;
}

function sanitizeRequestId(value) {
    return typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : null;
}

server.listen(PORT, () => {
    log('info', `Listening on :${PORT}`, {
        handlers_dir: HANDLERS_DIR,
        routes: routes.map(r => `${r.route}=${r.name}`).join(',')
    });
});

// Корректная остановка при docker stop / перезапуске контейнера
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
        log('info', `Received ${signal}, shutting down`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 10000).unref();
    });
}
