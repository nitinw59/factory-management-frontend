import api from '../../utils/api';

// The AI helpdesk on "Report a problem" (27 Nov 2026, migration 93) — backend routes/v3/helpdeskRoutes.js (/api/v3/helpdesk).
// The admin settings need the helpdesk password: unlock() returns a 30-minute token, kept in memory only (never stored).
let adminToken = null;
const adminHeaders = () => ({ headers: { 'X-Helpdesk-Admin': adminToken || '' } });
export const helpdeskApi = {
    status: () => api.get('/v3/helpdesk/status'),
    ask: (reportId) => api.post('/v3/helpdesk/ask', { report_id: reportId }),
    run: (id) => api.get(`/v3/helpdesk/runs/${id}`),
    forReport: (reportId) => api.get(`/v3/helpdesk/reports/${reportId}/runs`),
    feedback: (id, solved) => api.post(`/v3/helpdesk/runs/${id}/feedback`, { solved }),
    unlock: async (password) => { const r = await api.post('/v3/helpdesk/admin/unlock', { password }); adminToken = r.data.token; return r; },
    lock: () => { adminToken = null; },
    unlocked: () => Boolean(adminToken),
    admin: () => api.get('/v3/helpdesk/admin', adminHeaders()),
    saveAdmin: (body) => api.put('/v3/helpdesk/admin', body, adminHeaders()),
    password: (current, next) => api.put('/v3/helpdesk/admin/password', { current, next }, adminHeaders()),
};
