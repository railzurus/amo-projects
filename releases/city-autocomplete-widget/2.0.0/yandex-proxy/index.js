/**
 * Yandex Cloud Function — CORS Proxy для ATI.SU API
 * Используется через API Gateway
 */

const https = require('https');

const ATI_API_HOST = 'api.ati.su';

module.exports.handler = async (event, context) => {
    const method = event.httpMethod || event.requestContext?.http?.method || 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders(),
            body: ''
        };
    }

    try {
        // Получаем путь
        let path = event.url || event.path || event.rawPath || '/';
        // Убираем query string из path если есть
        if (path.includes('?')) {
            path = path.split('?')[0];
        }
        // Добавляем query string обратно
        const queryString = event.queryStringParameters
            ? '?' + new URLSearchParams(event.queryStringParameters).toString()
            : '';
        const fullPath = path + queryString;

        // Получаем тело запроса
        let body = event.body || '';
        if (event.isBase64Encoded && body) {
            body = Buffer.from(body, 'base64').toString('utf-8');
        }

        // Собираем заголовки для ATI API
        const headers = {
            'Host': ATI_API_HOST,
            'Content-Type': 'application/json'
        };

        // Пробрасываем Authorization
        const authHeader = getHeader(event.headers, 'authorization');
        if (authHeader) {
            headers['Authorization'] = authHeader;
        }

        // Добавляем Content-Length для POST/PATCH
        if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
            headers['Content-Length'] = Buffer.byteLength(body);
        }

        // Делаем запрос к ATI API
        const response = await makeRequest({
            hostname: ATI_API_HOST,
            path: fullPath,
            method: method,
            headers: headers,
            body: body
        });

        return {
            statusCode: response.statusCode,
            headers: corsHeaders(response.headers['content-type']),
            body: response.body
        };

    } catch (error) {
        console.error('Proxy error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders(),
            body: JSON.stringify({ error: error.message })
        };
    }
};

function corsHeaders(contentType) {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400',
        'Content-Type': contentType || 'application/json'
    };
}

function getHeader(headers, name) {
    if (!headers) return null;
    const lower = name.toLowerCase();
    for (const key in headers) {
        if (key.toLowerCase() === lower) {
            return headers[key];
        }
    }
    return null;
}

function makeRequest(options) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: options.hostname,
            path: options.path,
            method: options.method,
            headers: options.headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}
