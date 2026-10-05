import api from '../../utils/api';

// Version 3.0 material planning — backend routes/v3/planningRoutes.js (/api/v3/planning).
export const planningApi = {
    permissions: () => api.get('/v3/planning/permissions'),
    settings: () => api.get('/v3/planning/settings'),
    saveSettings: (data) => api.put('/v3/planning/settings', data),
    orders: (params) => api.get('/v3/planning/orders', { params }),
    requirements: (orderId) => api.get(`/v3/planning/orders/${orderId}/requirements`),
    recalculate: (orderId, reason) => api.post(`/v3/planning/orders/${orderId}/recalculate`, { reason }),
    readiness: (params) => api.get('/v3/planning/readiness', { params }),
    orderReadiness: (orderId) => api.get(`/v3/planning/orders/${orderId}/readiness`),
    overrideReadiness: (orderId, reason) => api.post(`/v3/planning/orders/${orderId}/readiness-override`, { reason }),
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
    release: (data) => api.post('/v3/planning/allocations/release', data),

    // Buy list and purchase requisitions
    buyList: (params) => api.get('/v3/planning/buy-list', { params }),
    prs: (params) => api.get('/v3/planning/purchase-requisitions', { params }),
    pr: (id) => api.get(`/v3/planning/purchase-requisitions/${id}`),
    createPr: (data) => api.post('/v3/planning/purchase-requisitions', data),
    addPrLines: (id, items) => api.post(`/v3/planning/purchase-requisitions/${id}/lines`, { items }),
    updatePrLine: (id, lineId, data) => api.put(`/v3/planning/purchase-requisitions/${id}/lines/${lineId}`, data),
    removePrLine: (id, lineId) => api.delete(`/v3/planning/purchase-requisitions/${id}/lines/${lineId}`),
    prAction: (id, action, reason) => api.post(`/v3/planning/purchase-requisitions/${id}/${action}`, reason ? { reason } : undefined),
};
