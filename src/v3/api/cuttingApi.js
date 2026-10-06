import api from '../../utils/api';

// Version 3.0 cutting — backend routes/v3/cuttingRoutes.js (/api/v3/cutting).
export const cuttingApi = {
    permissions: () => api.get('/v3/cutting/permissions'),
    orders: () => api.get('/v3/cutting/orders'),
    orderLine: (lineId) => api.get(`/v3/cutting/order-lines/${lineId}`),
    batches: (params) => api.get('/v3/cutting/batches', { params }),
    batch: (id) => api.get(`/v3/cutting/batches/${id}`),
    create: (data) => api.post('/v3/cutting/batches', data),
    update: (id, data) => api.put(`/v3/cutting/batches/${id}`, data),
    addRolls: (id, rolls) => api.post(`/v3/cutting/batches/${id}/rolls`, { rolls }),
    removeRoll: (id, rollRowId) => api.delete(`/v3/cutting/batches/${id}/rolls/${rollRowId}`),
    cutRoll: (id, rollRowId, data) => api.post(`/v3/cutting/batches/${id}/rolls/${rollRowId}/cut`, data),
    finalize: (id) => api.post(`/v3/cutting/batches/${id}/finalize`),
    cancel: (id, reason) => api.post(`/v3/cutting/batches/${id}/cancel`, { reason }),
};
