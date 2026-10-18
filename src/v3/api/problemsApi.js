import api from '../../utils/api';

// Version 3.0 "Report a problem" — backend routes/v3/problemRoutes.js (/api/v3/problems).
const form = (fields, files) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v != null) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v); });
    (files || []).forEach(f => fd.append('files', f));
    return fd;
};
export const problemsApi = {
    permissions: () => api.get('/v3/problems/permissions'),
    list: (params) => api.get('/v3/problems', { params }),
    get: (id) => api.get(`/v3/problems/${id}`),
    create: (fields, files) => api.post('/v3/problems', form(fields, files)),
    message: (id, body, files) => api.post(`/v3/problems/${id}/messages`, form({ body }, files)),
    triage: (id, body) => api.post(`/v3/problems/${id}/triage`, body),
    confirm: (id) => api.post(`/v3/problems/${id}/confirm`),
    reopen: (id, reason) => api.post(`/v3/problems/${id}/reopen`, { reason }),
    vote: (id) => api.post(`/v3/problems/${id}/vote`),
    admins: () => api.get('/v3/problems-admins'),
    releaseLive: (release) => api.post('/v3/problems/releases/live', { release }),
};
