import api from '../utils/api';

const buildFormData = (data, fileField, file) => {
    const fd = new FormData();
    Object.entries(data || {}).forEach(([k, v]) => {
        if (v == null) return;
        fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
    if (file) fd.append(fileField, file);
    return fd;
};

export const purchaseDeptApi = {
    getRequirements: (params) => api.get('/purchase-department/requirements', { params }),
    raiseRequirement: (data) => api.post('/purchase-department/requirements', data),
    cancelRequirement: (id) => api.patch(`/purchase-department/requirements/${id}/cancel`),

    // PO line items (DRAFT-only)
    addOrderItem:    (poId, body)         => api.post(`/purchase-department/orders/${poId}/items`, body),
    updateOrderItem: (poId, itemId, body) => api.patch(`/purchase-department/orders/${poId}/items/${itemId}`, body),
    deleteOrderItem: (poId, itemId)       => api.delete(`/purchase-department/orders/${poId}/items/${itemId}`),

    getOrders: (params) => api.get('/purchase-department/orders', { params }),
    getOrderById: (id) => api.get(`/purchase-department/orders/${id}`),
    createOrder: (data) => api.post('/purchase-department/orders', data),
    updateOrderStatus: (id, status) => api.patch(`/purchase-department/orders/${id}/status`, { status }),

    // Inwards
    getInwards: (poId) => api.get(`/purchase-department/orders/${poId}/inwards`),
    createInward: (poId, data, scanFile) =>
        scanFile
            ? api.post(`/purchase-department/orders/${poId}/inwards`, buildFormData(data, 'scan', scanFile))
            : api.post(`/purchase-department/orders/${poId}/inwards`, data),
    updateInward: (id, data, scanFile) =>
        scanFile
            ? api.patch(`/purchase-department/inwards/${id}`, buildFormData(data, 'scan', scanFile))
            : api.patch(`/purchase-department/inwards/${id}`, data),
    deleteInward: (id) => api.delete(`/purchase-department/inwards/${id}`),

    // Invoices
    getInvoices: (poId) => api.get(`/purchase-department/orders/${poId}/invoices`),
    createInvoice: (data, scanFile) =>
        scanFile
            ? api.post('/purchase-department/invoices', buildFormData(data, 'scan', scanFile))
            : api.post('/purchase-department/invoices', data),
    updateInvoice: (id, data, scanFile) =>
        scanFile
            ? api.patch(`/purchase-department/invoices/${id}`, buildFormData(data, 'scan', scanFile))
            : api.patch(`/purchase-department/invoices/${id}`, data),
    deleteInvoice: (id) => api.delete(`/purchase-department/invoices/${id}`),
};
