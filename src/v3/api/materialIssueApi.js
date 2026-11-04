import api from '../../utils/api';

// Version 3.0 fabric issue to cutting — backend routes/v3/materialIssueRoutes.js (/api/v3/material-issue).
export const materialIssueApi = {
    permissions: () => api.get('/v3/material-issue/permissions'),
    orders: () => api.get('/v3/material-issue/orders'),
    order: (orderId) => api.get(`/v3/material-issue/orders/${orderId}`),
    issues: (params) => api.get('/v3/material-issue/issues', { params }),
    issuesByOrder: (params) => api.get('/v3/material-issue/issues/by-order', { params }),
    issue: (id) => api.get(`/v3/material-issue/issues/${id}`),
    report: () => api.get('/v3/material-issue/report'),
    create: (data) => api.post('/v3/material-issue/issues', data),
    update: (id, data) => api.put(`/v3/material-issue/issues/${id}`, data),
    submit: (id, data) => api.post(`/v3/material-issue/issues/${id}/submit`, data),
    recall: (id) => api.post(`/v3/material-issue/issues/${id}/recall`, {}),
    cancel: (id, reason) => api.post(`/v3/material-issue/issues/${id}/cancel`, { reason }),
    receive: (id, data) => api.post(`/v3/material-issue/issues/${id}/receive`, data),
    returnMaterial: (id, data) => api.post(`/v3/material-issue/issues/${id}/returns`, data),
};
