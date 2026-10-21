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
    finalize: (id, data) => api.post(`/v3/cutting/batches/${id}/finalize`, data || {}),
    unfinalizePreview: (id) => api.get(`/v3/cutting/batches/${id}/unfinalize`),
    unfinalize: (id, reason) => api.post(`/v3/cutting/batches/${id}/unfinalize`, { reason }),
    setPriority: (id, priority, note) => api.put(`/v3/cutting/batches/${id}/priority`, { priority, note }),
    cancel: (id, reason) => api.post(`/v3/cutting/batches/${id}/cancel`, { reason }),
    // fabric end bits (19 Oct 2026, phase 3)
    endBits: (params) => api.get('/v3/cutting/end-bits', { params }),
    endBitsSummary: (status) => api.get('/v3/cutting/end-bits/summary', { params: { status } }),   // by order → fabric × colour (21 Oct 2026)
    endBit: (id) => api.get(`/v3/cutting/end-bits/${id}`),
    replacementRate: () => api.get('/v3/cutting/replacement-rate'),
    writeOffEndBit: (id, reason) => api.post(`/v3/cutting/end-bits/${id}/write-off`, { reason }),
    writeOffSurplus: (orderId, fabricItemId) => api.post(`/v3/cutting/orders/${orderId}/end-bits/write-off-surplus`, { fabric_item_id: fabricItemId }),
    // pocketing / lining (20 Oct 2026)
    pocketing: () => api.get('/v3/cutting/pocketing'),
    pocketingOrder: (orderId) => api.get(`/v3/cutting/pocketing/${orderId}`),
    createLay: (orderId, data) => api.post(`/v3/cutting/pocketing/${orderId}/lays`, data),
    cancelLay: (layId, reason) => api.post(`/v3/cutting/pocketing/lays/${layId}/cancel`, { reason }),
    writeOffPocketing: (orderId, data) => api.post(`/v3/cutting/pocketing/${orderId}/write-off`, data),
    batchPockets: (batchId) => api.get(`/v3/cutting/batches/${batchId}/pockets`),
    handPockets: (batchId) => api.post(`/v3/cutting/batches/${batchId}/pockets`),
    replacePocket: (batchId, data) => api.post(`/v3/cutting/batches/${batchId}/pockets/replace`, data),
    // over-cut above the free limit (20 Oct 2026)
    overCuts: (params) => api.get('/v3/cutting/over-cuts', { params }),
    approveOverCut: (batchId, note) => api.post(`/v3/cutting/over-cuts/${batchId}/approve`, { note }),
    refuseOverCut: (batchId, reason) => api.post(`/v3/cutting/over-cuts/${batchId}/refuse`, { reason }),
};
