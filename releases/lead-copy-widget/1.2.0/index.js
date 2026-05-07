/**
 * Yandex Cloud Function — Webhook для Digital Pipeline
 * Создаёт копию сделки по триггеру DP с настройками, заданными в виджете.
 *
 * Payload (приходит от amoCRM при срабатывании триггера + поля из onSalesbotDesignerSave):
 *   - leads[status][0][id] / event[data][id] / element_id — ID исходной сделки
 *   - account_domain — субдомен amoCRM (передаём из виджета)
 *   - access_token — Bearer-токен amoCRM (передаём из настроек виджета)
 *   - name_template — шаблон имени, например "{name}_Копия"
 *   - pipeline_id, status_id — куда копируем
 *   - copy_history — 1/0, копировать ли примечания и задачи
 *   - fields — список полей через запятую (id кастомных + спецзначения __price__, __responsible__, __tags__, __contacts__, __companies__)
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

        let data;
        try {
            data = JSON.parse(body);
        } catch (e) {
            data = parseFormData(body);
        }

        console.log('=== LEAD COPY DP WEBHOOK ===');
        console.log('Raw body:', body);

        const parsed = parseAmoCRMData(data);
        const leadId = parsed.leadId;
        const subdomain = parsed.subdomain || data.subdomain || data.account_domain;
        const accessToken = data.access_token || '';

        const nameTemplate = data.name_template || '{name}_Копия';
        const pipelineId = parseInt(data.pipeline_id) || 0;
        const statusId = parseInt(data.status_id) || 0;
        const copyHistory = data.copy_history === true
            || data.copy_history === 'true'
            || data.copy_history === '1'
            || data.copy_history === 1;
        const fieldsStr = data.fields || '';
        const selectedFields = fieldsStr ? String(fieldsStr).split(',').filter(Boolean) : [];

        if (!leadId) return response(400, { error: 'lead_id is required' });
        if (!accessToken) return response(400, { error: 'access_token not provided in payload' });
        if (!subdomain) return response(400, { error: 'subdomain is required' });
        if (!pipelineId) return response(400, { error: 'pipeline_id is required' });
        if (!statusId) return response(400, { error: 'status_id is required' });

        // 1. Fetch source lead with linked entities
        const sourceLead = await apiGet(
            subdomain, accessToken,
            `/api/v4/leads/${leadId}?with=contacts,companies,catalog_elements`
        );

        // 2. Build new lead
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

        // 4. Secondary tasks in parallel (best-effort, errors are logged but don't fail the request)
        const tasks = [];

        // Tags
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

        // Contacts
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

        // Companies
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

        // History (notes + tasks)
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
// Payload parsing
// =============================================

function parseAmoCRMData(data) {
    const result = { leadId: null, subdomain: null };

    if (data['leads[status][0][id]']) {
        result.leadId = data['leads[status][0][id]'];
    } else if (data['leads[add][0][id]']) {
        result.leadId = data['leads[add][0][id]'];
    } else if (data['event[data][id]']) {
        result.leadId = data['event[data][id]'];
    } else if (data.lead_id) {
        result.leadId = data.lead_id;
    } else if (data.element_id) {
        result.leadId = data.element_id;
    } else if (data.leads && Array.isArray(data.leads) && data.leads[0]) {
        result.leadId = data.leads[0].id;
    } else if (data.leads && data.leads.status && Array.isArray(data.leads.status) && data.leads.status[0]) {
        result.leadId = data.leads.status[0].id;
    }

    result.subdomain = data.subdomain
        || data.account_domain
        || data['account[subdomain]'];

    return result;
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
