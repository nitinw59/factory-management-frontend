import api from '../../utils/api';

// Version 3.0 material planning — backend routes/v3/planningRoutes.js (/api/v3/planning).
export const planningApi = {
    permissions: () => api.get('/v3/planning/permissions'),
    settings: () => api.get('/v3/planning/settings'),
    saveSettings: (data) => api.put('/v3/planning/settings', data),
    orders: (params) => api.get('/v3/planning/orders', { params }),
    requirements: (orderId) => api.get(`/v3/planning/orders/${orderId}/requirements`),
    materialSheet: (orderId) => api.get(`/v3/planning/orders/${orderId}/material-sheet`),   // approved: stored; else an estimate
    recalculate: (orderId, reason) => api.post(`/v3/planning/orders/${orderId}/recalculate`, { reason }),
    readiness: (params) => api.get('/v3/planning/readiness', { params }),
    orderReadiness: (orderId) => api.get(`/v3/planning/orders/${orderId}/readiness`),
    overrideReadiness: (orderId, reason, undertakingId) => api.post(`/v3/planning/orders/${orderId}/readiness-override`, { reason, undertaking_document_id: undertakingId }),
    releaseCheck: (orderId) => api.get(`/v3/planning/orders/${orderId}/release-check`),   // PPM per line, unplanned items (19 Oct 2026)
    fabricRolls: (orderId, itemId) => api.get(`/v3/planning/orders/${orderId}/fabric/${itemId}/rolls`),
    allocateRolls: (data) => api.post('/v3/planning/allocations/rolls', data),
    releaseRolls: (data) => api.post('/v3/planning/allocations/rolls/release', data),
    revokeOverride: (orderId, reason) => api.post(`/v3/planning/orders/${orderId}/readiness-override/revoke`, { reason }),
    milestones: () => api.get('/v3/planning/milestones'),
    orderMilestones: (orderId) => api.get(`/v3/planning/orders/${orderId}/milestones`),
    updateMilestone: (orderId, code, data) => api.put(`/v3/planning/orders/${orderId}/milestones/${code}`, data),
    milestoneTemplates: () => api.get('/v3/planning/milestone-templates'),
    saveMilestoneTemplate: (code, data) => api.put(`/v3/planning/milestone-templates/${code}`, data),
    setLineAllowance: (lineId, data) => api.put(`/v3/planning/order-lines/${lineId}/allowance`, data),
    position: (params) => api.get('/v3/planning/position', { params }),
    positionItem: (kind, itemId) => api.get(`/v3/planning/position/${kind}/${itemId}`),
    allocate: (data) => api.post('/v3/planning/allocations', data),
    allocateFree: (orderId, kind) => api.post(`/v3/planning/orders/${orderId}/allocate-free`, { kind }),   // every item of a kind from free stock
    release: (data) => api.post('/v3/planning/allocations/release', data),

    // Buy list and purchase requisitions
    buyList: (params) => api.get('/v3/planning/buy-list', { params }),
    prs: (params) => api.get('/v3/planning/purchase-requisitions', { params }),
    prCounts: (params) => api.get('/v3/planning/purchase-requisitions-counts', { params }),   // status tabs
    pr: (id) => api.get(`/v3/planning/purchase-requisitions/${id}`),
    createPr: (data) => api.post('/v3/planning/purchase-requisitions', data),
    addPrLines: (id, items, orderId) => api.post(`/v3/planning/purchase-requisitions/${id}/lines`, { items, order_id: orderId || undefined }),
    prOpenItems: (keys) => api.get('/v3/planning/purchase-requisitions-open-items', { params: { keys: keys.join(',') } }),   // items already on requisitions in play
    updatePrLine: (id, lineId, data) => api.put(`/v3/planning/purchase-requisitions/${id}/lines/${lineId}`, data),
    removePrLine: (id, lineId) => api.delete(`/v3/planning/purchase-requisitions/${id}/lines/${lineId}`),
    prAction: (id, action, reason) => api.post(`/v3/planning/purchase-requisitions/${id}/${action}`, reason ? { reason } : undefined),
    approvePr: (id, lines) => api.post(`/v3/planning/purchase-requisitions/${id}/approve`, { lines }),   // per-line APPROVE / REDUCE / REJECT
    closePrLine: (id, lineId, reason) => api.post(`/v3/planning/purchase-requisitions/${id}/lines/${lineId}/close`, { reason }),
    notedPr: (id) => api.post(`/v3/planning/purchase-requisitions/${id}/noted`),
};
