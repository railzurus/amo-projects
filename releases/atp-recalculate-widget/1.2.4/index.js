/**
 * Yandex Cloud Function — Webhook для Digital Pipeline
 * Пересчитывает дату платежа клиента:
 * Дата платежа = Дата отправки документов клиенту + Отсрочка дней (рабочие дни, без Сб/Вс)
 *
 * Поля ищутся по ИМЕНИ, не по ID:
 *   «Дата отправки документов клиенту» — сделка, date
 *   «Дата платежа клиента» — сделка, date
 *   «Отсрочка дней» — компания, numeric
 */

const https = require('https');

// Имена полей (поиск по имени, не по ID)
const FIELD_NAME_DOC_DATE = 'Дата отправки документов клиенту';
const FIELD_NAME_PAYMENT_DATE = 'Дата платежа клиента';
const FIELD_NAME_DELAY_DAYS = 'Отсрочка дней';

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
            data = parseFormData(body);
        }

        console.log('=== PAYMENT DATE WEBHOOK ===');
        console.log('Raw body:', body);

        // Парсим данные amoCRM
        const parsedData = parseAmoCRMData(data);
        console.log('Parsed data:', JSON.stringify(parsedData));

        const leadId = parsedData.leadId;
        const subdomain = parsedData.subdomain || data.subdomain || data.account_domain;
        // Токен берём из payload DP (виджет передаёт его в onSalesbotDesignerSave),
        // с фоллбэком на env-переменную для обратной совместимости
        const accessToken = data.access_token || process.env.AMOCRM_ACCESS_TOKEN || '';

        if (!leadId) {
            return response(400, { error: 'lead_id is required' });
        }

        if (!accessToken) {
            return response(400, { error: 'access_token not provided in payload and AMOCRM_ACCESS_TOKEN env not set' });
        }

        if (!subdomain) {
            return response(400, { error: 'subdomain is required' });
        }

        // 1. Получаем сделку с привязанными компаниями + маппинг полей сделки
        const [leadData, leadFieldMap] = await Promise.all([
            apiGet(subdomain, accessToken, `/api/v4/leads/${leadId}?with=companies`),
            loadFieldNameToId(subdomain, accessToken, 'leads')
        ]);

        // 2. Ищем дату отправки документов по имени
        const docDateField = findFieldByName(leadData.custom_fields_values, FIELD_NAME_DOC_DATE);

        if (!docDateField) {
            console.log('No doc date found');
            return response(200, {
                success: false,
                error: `Не заполнена «${FIELD_NAME_DOC_DATE}»`
            });
        }

        // 3. Находим field_id для поля «Дата платежа клиента»
        const paymentFieldId = leadFieldMap[FIELD_NAME_PAYMENT_DATE];
        if (!paymentFieldId) {
            return response(200, {
                success: false,
                error: `Поле «${FIELD_NAME_PAYMENT_DATE}» не найдено в сделках`
            });
        }

        // 4. Ищем привязанную компанию
        let companyId = null;
        if (leadData._embedded && leadData._embedded.companies && leadData._embedded.companies.length > 0) {
            companyId = leadData._embedded.companies[0].id;
        }

        if (!companyId) {
            console.log('No company linked');
            return response(200, {
                success: false,
                error: 'К сделке не привязана компания'
            });
        }

        // 5. Получаем компанию
        const companyData = await apiGet(
            subdomain, accessToken,
            `/api/v4/companies/${companyId}`
        );

        // 6. Ищем поле «Отсрочка дней» по имени
        const delayField = findFieldByName(companyData.custom_fields_values, FIELD_NAME_DELAY_DAYS);

        if (!delayField) {
            console.log('No delay days found in company');
            return response(200, {
                success: false,
                error: `Не заполнено поле «${FIELD_NAME_DELAY_DAYS}» в компании`
            });
        }

        const delayDays = parseInt(delayField.value, 10);
        if (isNaN(delayDays)) {
            return response(200, {
                success: false,
                error: `Некорректное значение «${FIELD_NAME_DELAY_DAYS}»: ${delayField.value}`
            });
        }

        // 7. Парсим дату отправки документов
        let docDate;
        const docDateValue = docDateField.value;
        if (typeof docDateValue === 'number') {
            docDate = new Date(docDateValue * 1000);
        } else {
            docDate = new Date(docDateValue);
        }

        if (isNaN(docDate.getTime())) {
            return response(200, {
                success: false,
                error: 'Некорректная дата отправки документов'
            });
        }

        // 8. Рассчитываем дату платежа
        const paymentDate = addBusinessDays(docDate, delayDays);
        // Используем UTC чтобы избежать проблем с часовыми поясами сервера
        const paymentTimestamp = Math.floor(Date.UTC(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate()) / 1000);

        console.log(`Doc date: ${docDate.toISOString()}, Delay: ${delayDays} biz days, Payment: ${paymentDate.toISOString()}`);

        // 9. Сохраняем в сделку
        await apiPatch(subdomain, accessToken, '/api/v4/leads', [{
            id: parseInt(leadId),
            custom_fields_values: [{
                field_id: paymentFieldId,
                values: [{ value: paymentTimestamp }]
            }]
        }]);

        const formatted = `${pad(paymentDate.getDate())}.${pad(paymentDate.getMonth() + 1)}.${paymentDate.getFullYear()}`;

        return response(200, {
            success: true,
            payment_date: formatted,
            payment_timestamp: paymentTimestamp
        });

    } catch (error) {
        console.error('Webhook error:', error);
        return response(500, { error: error.message });
    }
};

// =============================================
// Поиск полей по имени
// =============================================

/**
 * Ищет поле по имени в массиве custom_fields_values
 * amoCRM возвращает field_name в ответе GET /api/v4/leads/{id}
 */
function findFieldByName(customFieldsValues, fieldName) {
    if (!customFieldsValues) return null;

    for (const cf of customFieldsValues) {
        if (cf.field_name === fieldName && cf.values && cf.values.length > 0) {
            return {
                field_id: cf.field_id,
                value: cf.values[0].value
            };
        }
    }
    return null;
}

/**
 * Загружает маппинг имён полей → ID для сущности
 */
async function loadFieldNameToId(subdomain, token, entityType) {
    const resp = await apiGet(subdomain, token, `/api/v4/${entityType}/custom_fields?limit=250`);
    const map = {};
    const fields = (resp._embedded && resp._embedded.custom_fields) || [];
    for (const f of fields) {
        map[f.name] = f.id;
    }
    return map;
}

// =============================================
// Утилиты
// =============================================

function addBusinessDays(startDate, businessDays) {
    const result = new Date(startDate.getTime());
    let added = 0;

    while (added < businessDays) {
        result.setDate(result.getDate() + 1);
        const dayOfWeek = result.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            added++;
        }
    }

    return result;
}

function pad(n) {
    return n < 10 ? '0' + n : String(n);
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };
}

function response(statusCode, body) {
    return {
        statusCode,
        headers: corsHeaders(),
        body: JSON.stringify(body)
    };
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

function parseAmoCRMData(data) {
    const result = {
        leadId: null,
        subdomain: null
    };

    if (data['event[data][id]']) {
        result.leadId = data['event[data][id]'];
    } else if (data.lead_id) {
        result.leadId = data.lead_id;
    } else if (data.element_id) {
        result.leadId = data.element_id;
    } else if (data.leads && Array.isArray(data.leads) && data.leads[0]) {
        result.leadId = data.leads[0].id;
    }

    result.subdomain = data.subdomain || data.account_domain || data['account[subdomain]'];

    return result;
}

// =============================================
// HTTP-клиент
// =============================================

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

async function apiGet(subdomain, token, path) {
    const resp = await makeRequest({
        hostname: `${subdomain}.amocrm.ru`,
        path: path,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (resp.statusCode === 204) {
        return {};
    }

    return JSON.parse(resp.body);
}

async function apiPatch(subdomain, token, path, body) {
    const bodyStr = JSON.stringify(body);
    const resp = await makeRequest({
        hostname: `${subdomain}.amocrm.ru`,
        path: path,
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr)
        },
        body: bodyStr
    });

    if (resp.statusCode >= 400) {
        throw new Error(`API error ${resp.statusCode}: ${resp.body}`);
    }

    return resp.body ? JSON.parse(resp.body) : {};
}
