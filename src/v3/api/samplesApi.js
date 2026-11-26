import api from '../../utils/api';

// Samples (26 Nov 2026, migration 91): fabric and trims for PP, size set and other samples — backend
// routes/v3/samplesRoutes.js (/api/v3/samples). The trims go on a trim order of kind SAMPLE (trimKitsApi: kits, hand over).
export const samplesApi = {
    permissions: () => api.get('/v3/samples/permissions'),
    types: (all) => api.get('/v3/samples/types', { params: all ? { all: 1 } : undefined }),
    createType: (data) => api.post('/v3/samples/types', data),
    updateType: (id, data) => api.put(`/v3/samples/types/${id}`, data),
    orderLines: (q) => api.get('/v3/samples/order-lines', { params: { q: q || undefined } }),
    lineGrid: (lineId) => api.get(`/v3/samples/order-lines/${lineId}/grid`),
    list: (params) => api.get('/v3/samples', { params }),
    get: (id) => api.get(`/v3/samples/${id}`),
    create: (data) => api.post('/v3/samples', data),                       // { order_line_id, sample_type_id, round_no, needed_by, notes, cells: [{ colour_id, size_id, qty }] }
    update: (id, data) => api.put(`/v3/samples/${id}`, data),
    submit: (id) => api.post(`/v3/samples/${id}/submit`),
    cancel: (id, reason) => api.post(`/v3/samples/${id}/cancel`, { reason }),
    close: (id, reason) => api.post(`/v3/samples/${id}/close`, { reason }),
    fabricLine: (id, lineId, data) => api.put(`/v3/samples/${id}/fabric/${lineId}`, data),   // { qty, reason }
    fabricRolls: (id) => api.get(`/v3/samples/${id}/fabric-rolls`),
    fabricIssue: (id, data) => api.post(`/v3/samples/${id}/fabric-issue`, data),             // { received_by_name, note, own_roll_reason, rolls: [{ roll_id, qty }] }
    returns: (id, data) => api.post(`/v3/samples/${id}/returns`, data),                      // { reason, lines: [{ issue_line_id, qty }] }
};
