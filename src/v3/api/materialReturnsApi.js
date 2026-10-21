import api from '../../utils/api';

// Version 3.0 return slips — cutting room back to the store with custody (21 Oct 2026) — backend
// routes/v3/materialReturnRoutes.js (/api/v3/material-returns).
export const materialReturnsApi = {
    permissions: () => api.get('/v3/material-returns/permissions'),
    list: (params) => api.get('/v3/material-returns', { params }),
    orders: () => api.get('/v3/material-returns/orders'),
    candidates: (orderId) => api.get(`/v3/material-returns/orders/${orderId}/candidates`),
    get: (id) => api.get(`/v3/material-returns/${id}`),
    draft: (orderId, lines) => api.post('/v3/material-returns/draft', { order_id: orderId, lines }),   // the order's draft (made if none) + lines
    update: (id, notes) => api.put(`/v3/material-returns/${id}`, { notes }),
    addLines: (id, lines) => api.post(`/v3/material-returns/${id}/lines`, { lines }),
    removeLine: (id, lineId) => api.delete(`/v3/material-returns/${id}/lines/${lineId}`),
    submit: (id) => api.post(`/v3/material-returns/${id}/submit`),
    recall: (id, reason) => api.post(`/v3/material-returns/${id}/recall`, { reason }),
    cancel: (id, reason) => api.post(`/v3/material-returns/${id}/cancel`, { reason }),
    sendBack: (id, reason) => api.post(`/v3/material-returns/${id}/send-back`, { reason }),
    receive: (id, lines, note) => api.post(`/v3/material-returns/${id}/receive`, { lines, note }),   // lines: [{ line_id, received, qty?, reason?, note? }]
};
