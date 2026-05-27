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

export const sparesApi = {
    // --- GLOBAL STORE METHODS ---
    getAllSpares: async () => {
        const response = await api.get('/spares/');
        return response.data;
    },
    getCategories: async () => {
        const response = await api.get('/spares/categories');
        return response.data;
    },
    createSparePart: async (data) => {
        const response = await api.post('/spares/', data);
        return response.data;
    },
    // Spare inward (replaces the removed /spares/restock).
    // Free-form payload: { received_date, supplier_id?, grn_number?, condition?, notes?, items: [{ spare_part_id, qty_received, unit_price?, description? }] }
    // PO-linked payload: { purchase_order_id, received_date, grn_number?, condition?, notes?, items: [{ purchase_order_item_id, qty_received, unit_price? }] }
    createSpareInward: (data, scanFile) =>
        scanFile
            ? api.post('/purchase-department/spare-inwards', buildFormData(data, 'scan', scanFile))
            : api.post('/purchase-department/spare-inwards', data),

    // --- NEW: USER / MECHANIC INVENTORY METHODS ---
    
    // Get the stock currently held by the logged-in user
    getMySpareInventory: async () => {
        const response = await api.get('/spares/my-inventory');
        return response.data;
    },
    // Submit a request to the store for parts/needles
    requestSpares: async (data) => {
        const response = await api.post('/spares/request', data);
        return response.data;
    },

    // --- NEW: STORE MANAGER ISSUANCE METHODS ---
    
    // View all pending requests from users
    getPendingRequests: async () => {
        const response = await api.get('/spares/requests');
        return response.data;
    },
    // Issue parts (moves stock from Main Store -> User Inventory)
    issueSpares: async (requestId, data) => {
        const response = await api.post(`/spares/requests/${requestId}/issue`, data);
        return response.data;
    },

    // --- ANALYTICS (store_manager + factory_admin) ---
    getSparesAnalyticsSummary: (days = 30) =>
        api.get('/spares/analytics/summary', { params: { days } }),
    getSparesConsumption: (params) =>
        api.get('/spares/analytics/consumption', { params }),
    getSparesTopConsumed: (params) =>
        api.get('/spares/analytics/top-consumed', { params }),
    getSpareDrilldown: (spareId, params) =>
        api.get(`/spares/${spareId}/drilldown`, { params }),
    getSparesLedger: (params) =>
        api.get('/spares/ledger', { params }),
};