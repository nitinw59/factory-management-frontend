import api from '../../utils/api';

// Version 3.0 material issue to production — backend routes/v3/materialIssueRoutes.js (/api/v3/material-issue).
export const materialIssueApi = {
    permissions: () => api.get('/v3/material-issue/permissions'),
    orders: () => api.get('/v3/material-issue/orders'),
    order: (orderId) => api.get(`/v3/material-issue/orders/${orderId}`),
    issues: (params) => api.get('/v3/material-issue/issues', { params }),
    issue: (id) => api.get(`/v3/material-issue/issues/${id}`),
    create: (data) => api.post('/v3/material-issue/issues', data),
    returnMaterial: (id, data) => api.post(`/v3/material-issue/issues/${id}/returns`, data),
};
