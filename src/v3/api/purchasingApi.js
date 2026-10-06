import api from '../../utils/api';

// Version 3.0 purchasing — backend routes/v3/purchasingRoutes.js (/api/v3/purchasing).
export const purchasingApi = {
    permissions: () => api.get('/v3/purchasing/permissions'),
    states: () => api.get('/v3/purchasing/states'),

    suppliers: (params) => api.get('/v3/purchasing/suppliers', { params }),
    createSupplier: (data) => api.post('/v3/purchasing/suppliers', data),
    updateSupplier: (id, data) => api.put(`/v3/purchasing/suppliers/${id}`, data),

    openRequisitionLines: () => api.get('/v3/purchasing/requisition-lines'),
    orders: (params) => api.get('/v3/purchasing/purchase-orders', { params }),
    order: (id) => api.get(`/v3/purchasing/purchase-orders/${id}`),
    createOrder: (data) => api.post('/v3/purchasing/purchase-orders', data),
    updateOrder: (id, data) => api.put(`/v3/purchasing/purchase-orders/${id}`, data),
    addLines: (id, lines, reason) => api.post(`/v3/purchasing/purchase-orders/${id}/lines`, { lines, reason }),
    updateLine: (id, lineId, data) => api.put(`/v3/purchasing/purchase-orders/${id}/lines/${lineId}`, data),
    removeLine: (id, lineId, reason) => api.delete(`/v3/purchasing/purchase-orders/${id}/lines/${lineId}`, { data: reason ? { reason } : undefined }),
    issue: (id) => api.post(`/v3/purchasing/purchase-orders/${id}/issue`),
    cancel: (id, reason) => api.post(`/v3/purchasing/purchase-orders/${id}/cancel`, { reason }),
    shortClose: (id, reason) => api.post(`/v3/purchasing/purchase-orders/${id}/short-close`, { reason }),

    // Goods receipt (GRN) — only against issued POs
    receivablePos: (params) => api.get('/v3/purchasing/receiving/pos', { params }),
    receivingView: (poId) => api.get(`/v3/purchasing/receiving/pos/${poId}`),
    createGrn: (data) => api.post('/v3/purchasing/grns', data),
    grns: (params) => api.get('/v3/purchasing/grns', { params }),
    grn: (id) => api.get(`/v3/purchasing/grns/${id}`),
    grnAction: (id, action, reason) => api.post(`/v3/purchasing/grns/${id}/${action}`, reason ? { reason } : undefined),
    uploadGrnDocument: (id, file) => { const fd = new FormData(); fd.append('file', file); return api.post(`/v3/purchasing/grns/${id}/documents`, fd); },
    // Returns to supplier (from an approved GRN)
    returnable: (grnId) => api.get(`/v3/purchasing/grns/${grnId}/returnable`),
    returnNotes: (params) => api.get('/v3/purchasing/return-notes', { params }),
    returnNote: (id) => api.get(`/v3/purchasing/return-notes/${id}`),
    createReturnNote: (data) => api.post('/v3/purchasing/return-notes', data),

    // Supplier invoices (three-way match)
    billable: (supplierId) => api.get('/v3/purchasing/invoices/billable', { params: { supplier_id: supplierId } }),
    checkInvoice: (data) => api.post('/v3/purchasing/invoices/check', data),
    invoices: (params) => api.get('/v3/purchasing/invoices', { params }),
    invoice: (id) => api.get(`/v3/purchasing/invoices/${id}`),
    createInvoice: (data) => api.post('/v3/purchasing/invoices', data),
    cancelInvoice: (id, reason) => api.post(`/v3/purchasing/invoices/${id}/cancel`, { reason }),
    uploadInvoiceDocument: (id, file) => { const fd = new FormData(); fd.append('file', file); return api.post(`/v3/purchasing/invoices/${id}/documents`, fd); },

    report: (name, params) => api.get(`/v3/purchasing/reports/${name}`, { params }),

    settings: () => api.get('/v3/purchasing/settings'),
    saveSettings: (data) => api.put('/v3/purchasing/settings', data),

    uploadDocument: (id, file, displayName) => {
        const fd = new FormData();
        fd.append('file', file);
        if (displayName) fd.append('display_name', displayName);
        return api.post(`/v3/purchasing/purchase-orders/${id}/documents`, fd);
    },
};
