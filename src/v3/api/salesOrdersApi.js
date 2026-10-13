import api from '../../utils/api';

// Version 3.0 sales orders — backend routes/v3/salesOrdersRoutes.js (/api/v3).
export const salesOrdersApi = {
    permissions: () => api.get('/v3/sales-orders-permissions'),
    customers: () => api.get('/v3/customers'),
    styleOptions: (params) => api.get('/v3/sales-orders/style-options', { params }),   // { q, customer_id, limit }

    orders: (params) => api.get('/v3/sales-orders', { params }),
    order: (id) => api.get(`/v3/sales-orders/${id}`),
    createOrder: (data) => api.post('/v3/sales-orders', data),
    updateOrder: (id, data) => api.put(`/v3/sales-orders/${id}`, data),

    addLine: (id, data) => api.post(`/v3/sales-orders/${id}/lines`, data),
    updateLine: (id, lineId, data) => api.put(`/v3/sales-orders/${id}/lines/${lineId}`, data),
    deleteLine: (id, lineId) => api.delete(`/v3/sales-orders/${id}/lines/${lineId}`),
    cancelLine: (id, lineId, reason) => api.post(`/v3/sales-orders/${id}/lines/${lineId}/cancel`, { reason }),
    moveLineBom: (id, lineId, reason) => api.post(`/v3/sales-orders/${id}/lines/${lineId}/move-bom`, { reason }),

    // Documents (signed PPM sheets, other order documents)
    uploadDocument: (id, { file, doc_type, line_id, display_name, notes }) => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('doc_type', doc_type || 'PPM');
        if (line_id) fd.append('line_id', line_id);
        if (display_name) fd.append('display_name', display_name);
        if (notes) fd.append('notes', notes);
        return api.post(`/v3/sales-orders/${id}/documents`, fd);
    },
    removeDocument: (id, docId, reason) => api.post(`/v3/sales-orders/${id}/documents/${docId}/remove`, { reason }),

    // Flow
    submit: (id) => api.post(`/v3/sales-orders/${id}/submit`),
    withdraw: (id) => api.post(`/v3/sales-orders/${id}/withdraw`),
    approve: (id) => api.post(`/v3/sales-orders/${id}/approve`),
    reject: (id, reason) => api.post(`/v3/sales-orders/${id}/reject`, { reason }),
    cancel: (id, reason) => api.post(`/v3/sales-orders/${id}/cancel`, { reason }),
};
