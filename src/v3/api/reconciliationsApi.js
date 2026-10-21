import api from '../../utils/api';

// Version 3.0 reconciliations (20 Oct 2026, phase 6) — backend routes/v3/reconciliationRoutes.js (/api/v3/reconciliations).
export const reconciliationsApi = {
    permissions: () => api.get('/v3/reconciliations/permissions'),
    list: (params) => api.get('/v3/reconciliations', { params }),
    candidates: (kind) => api.get('/v3/reconciliations/candidates', { params: { kind } }),
    get: (id) => api.get(`/v3/reconciliations/${id}`),
    generate: (data) => api.post('/v3/reconciliations/generate', data),   // { kind, order_id | batch_id + stage_type_id | kit_id }
    approve: (id, note) => api.post(`/v3/reconciliations/${id}/approve`, { note }),
    sendBack: (id, reason) => api.post(`/v3/reconciliations/${id}/send-back`, { reason }),
    acknowledge: (id, data) => api.post(`/v3/reconciliations/${id}/acknowledge`, data),   // { note?, approve? }
};
