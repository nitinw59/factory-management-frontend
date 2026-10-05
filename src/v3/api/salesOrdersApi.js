import api from '../../utils/api';

// Version 3.0 sales orders — backend routes/v3/salesOrdersRoutes.js (/api/v3).
export const salesOrdersApi = {
    permissions: () => api.get('/v3/sales-orders-permissions'),
    customers: () => api.get('/v3/customers'),
    styleOptions: () => api.get('/v3/sales-orders/style-options'),

    orders: (params) => api.get('/v3/sales-orders', { params }),
    order: (id) => api.get(`/v3/sales-orders/${id}`),
    createOrder: (data) => api.post('/v3/sales-orders', data),
    updateOrder: (id, data) => api.put(`/v3/sales-orders/${id}`, data),

    addLine: (id, data) => api.post(`/v3/sales-orders/${id}/lines`, data),
    updateLine: (id, lineId, data) => api.put(`/v3/sales-orders/${id}/lines/${lineId}`, data),
    deleteLine: (id, lineId) => api.delete(`/v3/sales-orders/${id}/lines/${lineId}`),
    cancelLine: (id, lineId, reason) => api.post(`/v3/sales-orders/${id}/lines/${lineId}/cancel`, { reason }),
    moveLineBom: (id, lineId, reason) => api.post(`/v3/sales-orders/${id}/lines/${lineId}/move-bom`, { reason }),

    // Flow
    submit: (id) => api.post(`/v3/sales-orders/${id}/submit`),
    withdraw: (id) => api.post(`/v3/sales-orders/${id}/withdraw`),
    approve: (id) => api.post(`/v3/sales-orders/${id}/approve`),
    reject: (id, reason) => api.post(`/v3/sales-orders/${id}/reject`, { reason }),
    cancel: (id, reason) => api.post(`/v3/sales-orders/${id}/cancel`, { reason }),
};
