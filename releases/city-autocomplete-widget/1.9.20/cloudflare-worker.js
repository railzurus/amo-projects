/**
 * Cloudflare Worker — универсальный прокси для ATI API
 *
 * Использование:
 * POST https://your-worker.workers.dev/gw/gis-dict/v1/autocomplete/suggestions
 *
 * Путь после домена воркера добавляется к https://api.ati.su
 */

const ATI_BASE_URL = 'https://api.ati.su';

export default {
    async fetch(request) {
        const origin = request.headers.get('Origin') || '*';
        const headers = {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers });
        }

        try {
            const url = new URL(request.url);
            const path = url.pathname; // например: /gw/gis-dict/v1/autocomplete/suggestions

            if (!path || path === '/') {
                return new Response(JSON.stringify({
                    error: 'Укажите путь к API',
                    example: '/gw/gis-dict/v1/autocomplete/suggestions'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...headers }
                });
            }

            const targetUrl = ATI_BASE_URL + path + url.search;

            const response = await fetch(targetUrl, {
                method: request.method,
                headers: {
                    'Content-Type': request.headers.get('Content-Type') || 'application/json',
                    'Authorization': request.headers.get('Authorization') || ''
                },
                body: request.method !== 'GET' ? await request.text() : undefined
            });

            return new Response(await response.text(), {
                status: response.status,
                headers: { 'Content-Type': 'application/json', ...headers }
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...headers }
            });
        }
    }
};
