/**
 * Yandex Cloud Function — Webhook для Digital Pipeline (Lead Copy)
 *
 * Все настройки приходят в payload через стандартный механизм amoCRM:
 *   action.settings.widget.settings.{access_token, target_pipeline_id, target_status_id, name_template, copy_history, fields_csv}
 *
 * Lead ID:    event.data.id
 * Subdomain:  payload.subdomain
 *
 * Виджет авто-заполняет dp.settings из widget.settings при настройке триггера (см. dpSettings в script.js).
 * Бэкенд stateless — никакого хранилища.
 */

const https = require('https');

module.exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders(), body: '' };
    }

    try {
        let body = event.body || '';
        if (event.isBase64Encoded && body) {
            body = Buffer.from(body, 'base64').toString('utf-8');
        }

        let raw;
        try {
            raw = JSON.parse(body);
        } catch (e) {
            raw = parseFormData(body);
        }

        console.log('=== LEAD COPY DP WEBHOOK ===');
        console.log('Raw body:', body);

        const parsed = parsePayload(raw);
        console.log('Parsed:', JSON.stringify(parsed, null, 2));

        const { leadId, subdomain, settings } = parsed;
        const accessToken = settings.access_token;

        if (!leadId) return response(400, { error: 'lead id not found in payload (event.data.id)' });
        if (!subdomain) return response(400, { error: 'subdomain not found in payload' });
        if (!accessToken) return response(400, { error: 'access_token not found in widget settings (action.settings.widget.settings.access_token)' });

        const pipelineId = parseInt(settings.target_pipeline_id) || 0;
        const statusId = parseInt(settings.target_status_id) || 0;
        if (!pipelineId) return response(400, { error: 'target_pipeline_id is required (configure in widget settings)' });
        if (!statusId) return response(400, { error: 'target_status_id is required (configure in widget settings)' });

        const nameTemplate = settings.name_template || '{name}_Копия';
        const copyHistory = isTruthy(settings.copy_history);
        const selectedFields = (settings.fields_csv || '').split(',').filter(Boolean);

        // 1. Fetch source lead
        const sourceLead = await apiGet(
            subdomain, accessToken,
            `/api/v4/leads/${leadId}?with=contacts,companies,catalog_elements`
        );

        // 2. Build new lead body
        const newName = nameTemplate.replace('{name}', sourceLead.name || '');
        const newLead = {
            name: newName,
            pipeline_id: pipelineId,
            status_id: statusId
        };

        if (selectedFields.includes('__price__') && sourceLead.price) {
            newLead.price = sourceLead.price;
        }
        if (selectedFields.includes('__responsible__') && sourceLead.responsible_user_id) {
            newLead.responsible_user_id = sourceLead.responsible_user_id;
        }

        const customFieldIds = selectedFields
            .filter(f => f.indexOf('__') !== 0)
            .map(f => parseInt(f))
            .filter(id => !isNaN(id));

        if (customFieldIds.length > 0 && sourceLead.custom_fields_values) {
            const fieldsToCopy = sourceLead.custom_fields_values
                .filter(field => customFieldIds.includes(field.field_id))
                .map(field => ({
                    field_id: field.field_id,
                    values: field.values.map(v => {
                        const cv = {};
                        if (v.value !== undefined) cv.value = v.value;
                        if (v.enum_id !== undefined) cv.enum_id = v.enum_id;
                        return cv;
                    })
                }));
            if (fieldsToCopy.length > 0) {
                newLead.custom_fields_values = fieldsToCopy;
            }
        }

        // 3. Create new lead
        const createResp = await apiPost(subdomain, accessToken, '/api/v4/leads', [newLead]);
        const newLeadId = createResp._embedded.leads[0].id;
        console.log('Created new lead:', newLeadId);

        // 4. Secondary tasks (best-effort)
        const tasks = [];

        if (selectedFields.includes('__tags__')
            && sourceLead._embedded
            && sourceLead._embedded.tags
            && sourceLead._embedded.tags.length > 0) {
            const tagNames = sourceLead._embedded.tags.map(t => ({ name: t.name }));
            tasks.push(
                apiPatch(subdomain, accessToken, `/api/v4/leads/${newLeadId}`, { _embedded: { tags: tagNames } })
                    .catch(e => console.error('Tags copy error:', e.message))
            );
        }

        if (selectedFields.includes('__contacts__')
            && sourceLead._embedded
            && sourceLead._embedded.contacts
            && sourceLead._embedded.contacts.length > 0) {
            const contactLinks = sourceLead._embedded.contacts.map(c => ({
                to_entity_id: c.id,
                to_entity_type: 'contacts',
                metadata: { is_main: c.is_main || false }
            }));
            tasks.push(
                apiPost(subdomain, accessToken, `/api/v4/leads/${newLeadId}/link`, contactLinks)
                    .catch(e => console.error('Contacts link error:', e.message))
            );
        }

        if (selectedFields.includes('__companies__')
            && sourceLead._embedded
            && sourceLead._embedded.companies
            && sourceLead._embedded.companies.length > 0) {
            const companyLinks = sourceLead._embedded.companies.map(c => ({
                to_entity_id: c.id,
                to_entity_type: 'companies'
            }));
            tasks.push(
                apiPost(subdomain, accessToken, `/api/v4/leads/${newLeadId}/link`, companyLinks)
                    .catch(e => console.error('Companies link error:', e.message))
            );
        }

        if (copyHistory) {
            tasks.push(
                copyNotes(subdomain, accessToken, leadId, newLeadId)
                    .catch(e => console.error('Notes copy error:', e.message)),
                copyLeadTasks(subdomain, accessToken, leadId, newLeadId)
                    .catch(e => console.error('Tasks copy error:', e.message))
            );
        }

        await Promise.all(tasks);

        return response(200, {
            success: true,
            new_lead_id: newLeadId
        });

    } catch (error) {
        console.error('Webhook error:', error);
        return response(500, { error: error.message });
    }
};

// =============================================
// Payload parsing per amoCRM DP spec
// =============================================

/**
 * amoCRM шлёт x-www-form-urlencoded с ключами вида:
 *   event[data][id]=123
 *   action[settings][widget][settings][access_token]=xxx
 *   subdomain=ivanov
 *
 * Или JSON со структурой:
 *   { event: { data: { id } }, action: { settings: { widget: { settings: {...} } } }, subdomain }
 *
 * Эта функция приводит обе формы к единому виду.
 */
function parsePayload(raw) {
    // Try nested object form first (JSON)
    let leadId = null;
    let subdomain = raw.subdomain || raw.account_domain || raw['account[subdomain]'] || null;
    let widgetSettings = {};

    if (raw.event && raw.event.data && raw.event.data.id) {
        leadId = raw.event.data.id;
    }
    if (raw.action && raw.action.settings && raw.action.settings.widget && raw.action.settings.widget.settings) {
        widgetSettings = raw.action.settings.widget.settings;
    }

    // Try flat form-encoded keys
    if (!leadId) {
        leadId = raw['event[data][id]']
            || raw['leads[status][0][id]']
            || raw['leads[add][0][id]']
            || raw.lead_id
            || raw.element_id
            || (raw.leads && Array.isArray(raw.leads) && raw.leads[0] && raw.leads[0].id)
            || null;
    }

    if (!Object.keys(widgetSettings).length) {
        // Look for action[settings][widget][settings][...] keys
        const prefix = 'action[settings][widget][settings][';
        Object.keys(raw).forEach(key => {
            if (key.startsWith(prefix) && key.endsWith(']')) {
                const fieldName = key.slice(prefix.length, -1);
                widgetSettings[fieldName] = raw[key];
            }
        });
    }

    return {
        leadId: leadId ? parseInt(leadId) : null,
        subdomain: subdomain,
        settings: widgetSettings
    };
}

function parseFormData(body) {
    const result = {};
    const pairs = body.split('&');
    for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key) {
            result[decodeURIComponent(key)] = decodeURIComponent((value || '').replace(/\+/g, ' '));
        }
    }
    return result;
}

function isTruthy(v) {
    return v === '1' || v === 1 || v === true || v === 'Y' || v === 'on' || v === 'true';
}

// =============================================
// Notes & Tasks copy
// =============================================

async function copyNotes(subdomain, token, sourceLeadId, newLeadId) {
    const notesResp = await apiGet(subdomain, token, `/api/v4/leads/${sourceLeadId}/notes?limit=250`);
    const notes = (notesResp && notesResp._embedded && notesResp._embedded.notes) || [];
    if (notes.length === 0) return;

    const copyableTypes = [
        'common', 'call_in', 'call_out', 'sms_in', 'sms_out',
        'service_message', 'message_cashier', 'geolocation',
        'invoice_paid', 'key_action_completed', 'task_result', 'attachment'
    ];

    const copyableNotes = notes
        .filter(note => copyableTypes.includes(note.note_type))
        .map(note => {
            const newNote = { note_type: note.note_type };
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

    if (copyableNotes.length === 0) return;
    await apiPost(subdomain, token, `/api/v4/leads/${newLeadId}/notes`, copyableNotes);
}

async function copyLeadTasks(subdomain, token, sourceLeadId, newLeadId) {
    const tasksResp = await apiGet(
        subdomain, token,
        `/api/v4/tasks?filter[entity_type]=leads&filter[entity_id]=${sourceLeadId}&limit=250`
    );
    const tasks = (tasksResp && tasksResp._embedded && tasksResp._embedded.tasks) || [];
    if (tasks.length === 0) return;

    const newTasks = tasks.map(task => {
        const newTask = {
            text: '[Копия] ' + (task.text || ''),
            entity_id: newLeadId,
            entity_type: 'leads',
            task_type_id: task.task_type_id || 1,
            responsible_user_id: task.responsible_user_id
        };
        if (!task.is_completed && task.complete_till) {
            newTask.complete_till = task.complete_till;
        } else {
            newTask.complete_till = Math.floor(Date.now() / 1000);
        }
        if (task.is_completed && task.result && task.result.text) {
            newTask.result = { text: task.result.text };
        }
        return newTask;
    });

    await apiPost(subdomain, token, '/api/v4/tasks', newTasks);
}

// =============================================
// HTTP utilities
// =============================================

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
                resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) req.write(options.body);
        req.end();
    });
}

async function apiGet(subdomain, token, path) {
    const resp = await makeRequest({
        hostname: `${subdomain}.amocrm.ru`,
        path,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (resp.statusCode === 204) return {};
    if (resp.statusCode >= 400) {
        throw new Error(`API GET ${path} → ${resp.statusCode}: ${resp.body}`);
    }
    return resp.body ? JSON.parse(resp.body) : {};
}

async function apiPost(subdomain, token, path, body) {
    const bodyStr = JSON.stringify(body);
    const resp = await makeRequest({
        hostname: `${subdomain}.amocrm.ru`,
        path,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr)
        },
        body: bodyStr
    });

    if (resp.statusCode >= 400) {
        throw new Error(`API POST ${path} → ${resp.statusCode}: ${resp.body}`);
    }
    return resp.body ? JSON.parse(resp.body) : {};
}

async function apiPatch(subdomain, token, path, body) {
    const bodyStr = JSON.stringify(body);
    const resp = await makeRequest({
        hostname: `${subdomain}.amocrm.ru`,
        path,
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr)
        },
        body: bodyStr
    });

    if (resp.statusCode >= 400) {
        throw new Error(`API PATCH ${path} → ${resp.statusCode}: ${resp.body}`);
    }
    return resp.body ? JSON.parse(resp.body) : {};
}
