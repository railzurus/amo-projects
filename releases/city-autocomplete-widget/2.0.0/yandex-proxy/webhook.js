/**
 * Yandex Cloud Function — Webhook для Digital Pipeline
 * Получает lead_id от amoCRM и отправляет данные в ATI.SU
 */

const https = require('https');

const ATI_API_HOST = 'api.ati.su';

// ========== НАСТРОЙКИ ==========
// Заполните эти значения вашими данными:
const CONFIG = {
    ATI_API_KEY: process.env.ATI_API_KEY || '',           // API ключ ATI.SU
    AMOCRM_ACCESS_TOKEN: process.env.AMOCRM_ACCESS_TOKEN || '', // Access Token amoCRM
    PROXY_URL: process.env.PROXY_URL || ''                // URL прокси (опционально)
};
// ================================

// Маппинг полей для отправки в ATI (копия из виджета)
const CARGO_FIELD_MAPPING = {
    // Статичные значения
    'cargo_application.payment.type': { static: 'rate-request' },
    'cargo_application.route.loading.dates.type': { static: 'from-date' },
    'cargo_application.route.loading.cargos.0.id': { static: '1' },
    'cargo_application.route.loading.location.type': { static: 'manual' },
    'cargo_application.route.unloading.location.type': { static: 'manual' },
    'cargo_application.payment.rate_with_vat_available': { static: true },
    'cargo_application.payment.rate_without_vat_available': { static: true },
    'cargo_application.route.loading.cargos.0.weight.type': { static: 'tons' },

    // ID сделки
    'cargo_application.external_id': { source: 'lead_id' },

    // Тип загрузки
    'cargo_application.truck.load_type': { field: 'Загрузка_код', type: 'string', default: 'ftl' },

    // Массивы
    'cargo_application.contacts': { field: 'Транспортные менеджеры_код', type: 'intArray' },
    'cargo_application.truck.body_types': { field: 'Тип кузова_код', type: 'intArray' },
    'cargo_application.truck.body_loading.types': { field: 'Способ погрузки_код', type: 'intArray' },

    // Числа
    'cargo_application.truck.adr': { field: 'ADR', type: 'int' },
    'cargo_application.truck.temperature.to': { field: 'Температура, до', type: 'int' },
    'cargo_application.truck.temperature.from': { field: 'Температура, от', type: 'int' },
    'cargo_application.route.loading.location.city_id': { field: 'Город погрузки_код', type: 'int' },
    'cargo_application.route.unloading.location.city_id': { field: 'Город выгрузки_код', type: 'int' },
    'cargo_application.route.loading.cargos.0.packaging.type': { field: 'Тип упаковки_код', type: 'int' },
    'cargo_application.route.loading.cargos.0.weight.quantity': { field: 'Вес тонн', type: 'float' },
    'cargo_application.route.loading.cargos.0.packaging.quantity': { field: 'Количество упаковок', type: 'int' },

    // Булевы
    'cargo_application.truck.requirements.road_train': { field: 'Сцепка', type: 'bool' },
    'cargo_application.truck.requirements.logging_truck': { field: 'Коники', type: 'bool' },
    'cargo_application.truck.requirements.air_suspension': { field: 'Пневмоход', type: 'bool' },

    // Даты
    'cargo_application.route.loading.dates.first_date': { field: 'Дата погрузки', type: 'date' },
    'cargo_application.route.loading.dates.last_date': { field: 'Дата погрузки', type: 'date' },
    'cargo_application.route.unloading.dates.first_date': { field: 'Дата выгрузки', type: 'date' },

    // Текст
    'cargo_application.route.loading.cargos.0.name': { field: 'Наименование груза', type: 'string' },
    'cargo_application.route.loading.location.address': { field: 'Адрес погрузки', type: 'string', default: 'указать адрес' },
    'cargo_application.route.unloading.location.address': { field: 'Адрес выгрузки', type: 'string', default: 'указать адрес' }
};

module.exports.handler = async (event, context) => {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders(),
            body: ''
        };
    }

    try {
        // Парсим входные данные
        let body = event.body || '';
        if (event.isBase64Encoded && body) {
            body = Buffer.from(body, 'base64').toString('utf-8');
        }

        let data;
        try {
            data = JSON.parse(body);
        } catch (e) {
            // Может быть form-urlencoded от amoCRM
            data = parseFormData(body);
        }

        console.log('=== WEBHOOK RECEIVED ===');
        console.log('Raw body:', body);
        console.log('========================');

        // Парсим формат amoCRM Digital Pipeline: event[data][id], subdomain и т.д.
        const parsedData = parseAmoCRMData(data);
        console.log('Parsed amoCRM data:', JSON.stringify(parsedData));

        // Получаем lead_id
        const leadId = parsedData.leadId;

        // Параметры: из CONFIG (env) или из запроса
        const accountDomain = parsedData.subdomain || data.subdomain;
        const accessToken = CONFIG.AMOCRM_ACCESS_TOKEN || getHeader(event.headers, 'x-access-token');
        const atiApiKey = CONFIG.ATI_API_KEY || getHeader(event.headers, 'x-ati-api-key');
        const proxyUrl = CONFIG.PROXY_URL || getHeader(event.headers, 'x-proxy-url');

        console.log('Params:', { leadId, accountDomain, hasAccessToken: !!accessToken, hasAtiKey: !!atiApiKey });

        if (!leadId) {
            return {
                statusCode: 400,
                headers: corsHeaders(),
                body: JSON.stringify({ error: 'lead_id is required' })
            };
        }

        if (!accessToken || !atiApiKey) {
            return {
                statusCode: 400,
                headers: corsHeaders(),
                body: JSON.stringify({ error: 'access_token and ati_api_key are required' })
            };
        }

        // 1. Получаем данные сделки из amoCRM
        const leadData = await fetchLeadData(accountDomain, leadId, accessToken);

        // 2. Проверяем, не была ли сделка уже отправлена
        if (leadData.values['Отправлено в ATI'] === true ||
            leadData.values['Отправлено в ATI'] === '1') {
            return {
                statusCode: 200,
                headers: corsHeaders(),
                body: JSON.stringify({
                    success: false,
                    message: 'Lead already sent to ATI'
                })
            };
        }

        // 3. Формируем payload для ATI
        const payload = buildCargoPayload(leadId, leadData.values);
        console.log('ATI Payload:', JSON.stringify(payload, null, 2));

        // 4. Отправляем в ATI.SU (через прокси или напрямую)
        const atiResult = await sendToATI(payload, atiApiKey, proxyUrl);

        // 5. Обновляем статус в amoCRM
        const isSuccess = atiResult.success;
        const errorMsg = atiResult.error || '';

        await updateLeadStatus(accountDomain, leadId, accessToken, leadData.fieldIds, isSuccess, errorMsg);

        return {
            statusCode: 200,
            headers: corsHeaders(),
            body: JSON.stringify({
                success: isSuccess,
                message: isSuccess ? 'Sent to ATI successfully' : errorMsg,
                cargo_id: atiResult.cargo_id
            })
        };

    } catch (error) {
        console.error('Webhook error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders(),
            body: JSON.stringify({ error: error.message })
        };
    }
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Access-Token, X-ATI-API-Key, X-Proxy-URL',
        'Content-Type': 'application/json'
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

function parseFormData(body) {
    const result = {};
    const pairs = body.split('&');
    for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key) {
            result[decodeURIComponent(key)] = decodeURIComponent(value || '');
        }
    }
    return result;
}

// Парсит данные из формата amoCRM Digital Pipeline
// event[data][id] -> leadId, subdomain -> subdomain и т.д.
function parseAmoCRMData(data) {
    const result = {
        leadId: null,
        subdomain: null,
        eventType: null,
        statusId: null,
        pipelineId: null
    };

    // Ищем lead_id в разных форматах
    if (data['event[data][id]']) {
        result.leadId = data['event[data][id]'];
    } else if (data.lead_id) {
        result.leadId = data.lead_id;
    } else if (data.element_id) {
        result.leadId = data.element_id;
    } else if (data.leads && Array.isArray(data.leads) && data.leads[0]) {
        result.leadId = data.leads[0].id;
    }

    // subdomain
    result.subdomain = data.subdomain || data.account_domain || data['account[subdomain]'];

    // Другие поля
    result.eventType = data['event[type_code]'] || data.event_type;
    result.statusId = data['event[data][status_id]'] || data.status_id;
    result.pipelineId = data['event[data][pipeline_id]'] || data.pipeline_id;

    return result;
}

async function fetchLeadData(domain, leadId, accessToken) {
    // Получаем поля и сделку параллельно
    const [fieldsResp, leadResp] = await Promise.all([
        makeRequest({
            hostname: `${domain}.amocrm.ru`,
            path: '/api/v4/leads/custom_fields?limit=250',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        }),
        makeRequest({
            hostname: `${domain}.amocrm.ru`,
            path: `/api/v4/leads/${leadId}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })
    ]);

    const fields = JSON.parse(fieldsResp.body);
    const lead = JSON.parse(leadResp.body);

    // Собираем маппинг полей
    const fieldIdToName = {};
    const fieldNameToId = {};

    if (fields._embedded && fields._embedded.custom_fields) {
        for (const f of fields._embedded.custom_fields) {
            fieldIdToName[f.id] = f.name;
            fieldNameToId[f.name] = f.id;
        }
    }

    // Собираем значения полей
    const values = {};
    if (lead.custom_fields_values) {
        for (const cf of lead.custom_fields_values) {
            const name = fieldIdToName[cf.field_id];
            if (name && cf.values && cf.values.length > 0) {
                values[name] = cf.values[0].value;
            }
        }
    }

    return {
        values,
        fieldIds: fieldNameToId
    };
}

function buildCargoPayload(leadId, fieldValues) {
    const payload = { cargo_application: {} };

    // Валидация
    const bodyTypeCode = fieldValues['Тип кузова_код'];
    const volumeM3 = parseFloat(fieldValues['Объем м3']) || 0;
    const packagingTypeCode = parseInt(fieldValues['Тип упаковки_код'], 10);
    const packagingQty = parseInt(fieldValues['Количество упаковок'], 10) || 0;

    const forceLoadType = volumeM3 < 82 ? 'dont-care' : null;
    const isRefrigerator = String(bodyTypeCode).indexOf('300') !== -1;

    for (const path in CARGO_FIELD_MAPPING) {
        const config = CARGO_FIELD_MAPPING[path];
        let value = null;

        if (config.static !== undefined) {
            value = config.static;
        } else if (config.source === 'lead_id') {
            value = String(leadId);
        } else if (config.field) {
            value = fieldValues[config.field];
        }

        if ((value === undefined || value === null || value === '') && config.default !== undefined) {
            value = config.default;
        }

        if (path === 'cargo_application.truck.load_type' && forceLoadType) {
            value = forceLoadType;
        }

        if (path === 'cargo_application.truck.temperature.from' || path === 'cargo_application.truck.temperature.to') {
            if (!isRefrigerator && (value === undefined || value === null || value === '')) {
                continue;
            }
            if (isRefrigerator && (value === undefined || value === null || value === '')) {
                value = 0;
            }
        }

        if (value === undefined || value === null || value === '') {
            continue;
        }

        // Преобразование типов
        if (config.type === 'intArray') {
            value = String(value).split(',').map(v => parseInt(v.trim(), 10)).filter(v => !isNaN(v));
            if (value.length === 0) continue;
        } else if (config.type === 'int') {
            value = parseInt(value, 10);
            if (isNaN(value)) continue;
        } else if (config.type === 'float') {
            value = parseFloat(value);
            if (isNaN(value)) continue;
        } else if (config.type === 'bool') {
            value = value === true || value === 1 || value === '1' || value === 'true';
        } else if (config.type === 'date') {
            if (typeof value === 'number') {
                value = new Date(value * 1000).toISOString();
            } else if (typeof value === 'string' && !value.includes('T')) {
                value = new Date(value).toISOString();
            }
        }

        setNestedValue(payload, path, value);
    }

    // Правило упаковки
    if (packagingTypeCode && packagingTypeCode !== 1 && packagingTypeCode !== 3) {
        const currentQty = payload.cargo_application?.route?.loading?.cargos?.[0]?.packaging?.quantity;
        if (!currentQty || currentQty < 1) {
            setNestedValue(payload, 'cargo_application.route.loading.cargos.0.packaging.quantity', Math.max(packagingQty, 1));
        }
    }

    return payload;
}

function setNestedValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const nextPart = parts[i + 1];
        const isArrayIndex = /^\d+$/.test(nextPart);

        if (!current[part]) {
            current[part] = isArrayIndex ? [] : {};
        }
        current = current[part];
    }

    current[parts[parts.length - 1]] = value;
}

async function sendToATI(payload, apiKey, proxyUrl) {
    try {
        const hostname = proxyUrl
            ? new URL(proxyUrl).hostname
            : ATI_API_HOST;
        const basePath = proxyUrl
            ? new URL(proxyUrl).pathname.replace(/\/$/, '')
            : '';

        const response = await makeRequest({
            hostname: hostname,
            path: basePath + '/v2/cargos',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(JSON.stringify(payload))
            },
            body: JSON.stringify(payload)
        });

        const respData = JSON.parse(response.body || '{}');

        if (respData.cargo_application || respData.cargo_id) {
            return {
                success: true,
                cargo_id: respData.cargo_id || respData.cargo_application?.cargo_id
            };
        }

        if (respData.error_list || respData.reason || respData.error_code) {
            let errorMsg = respData.reason || 'Ошибка валидации';
            if (respData.error_list && respData.error_list.length > 0) {
                const errors = respData.error_list.map(e => `${e.property}: ${e.reason}`);
                errorMsg += '\n' + errors.join('\n');
            }
            return { success: false, error: errorMsg };
        }

        if (response.statusCode >= 400) {
            return { success: false, error: response.body || 'HTTP Error ' + response.statusCode };
        }

        return { success: true };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function updateLeadStatus(domain, leadId, accessToken, fieldIds, isSuccess, errorMsg) {
    const sentFieldId = fieldIds['Отправлено в ATI'];
    const errorFieldId = fieldIds['Ошибки ATI'];

    if (!sentFieldId && !errorFieldId) {
        return;
    }

    const customFields = [];

    if (sentFieldId) {
        customFields.push({
            field_id: sentFieldId,
            values: [{ value: isSuccess }]
        });
    }

    if (errorFieldId && errorMsg) {
        let errorValue = String(errorMsg);
        if (errorValue.length > 250) {
            errorValue = errorValue.substring(0, 247) + '...';
        }
        customFields.push({
            field_id: errorFieldId,
            values: [{ value: errorValue }]
        });
    }

    if (customFields.length === 0) return;

    await makeRequest({
        hostname: `${domain}.amocrm.ru`,
        path: '/api/v4/leads',
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
            id: parseInt(leadId),
            custom_fields_values: customFields
        }])
    });
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
