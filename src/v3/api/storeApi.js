import api from '../../utils/api';

// Version 3.0 store (spares and general items) — backend routes/v3/storeRoutes.js (/api/v3/store).
export const storeApi = {
    permissions: () => api.get('/v3/store/permissions'),

    categories: () => api.get('/v3/store/categories'),
    createCategory: (data) => api.post('/v3/store/categories', data),
    updateCategory: (id, data) => api.put(`/v3/store/categories/${id}`, data),

    items: (params) => api.get('/v3/store/items', { params }),
    item: (id) => api.get(`/v3/store/items/${id}`),
    createItem: (data) => api.post('/v3/store/items', data),
    updateItem: (id, data) => api.put(`/v3/store/items/${id}`, data),

    opening: (lines, note) => api.post('/v3/store/opening', { lines, note }),
    adjust: (data) => api.post('/v3/store/adjustments', data),

    issueTargets: (type, q) => api.get('/v3/store/issue-targets', { params: { type, q } }),
    issues: (params) => api.get('/v3/store/issues', { params }),
    issueRegister: (params) => api.get('/v3/store/issue-lines', { params }),
    issue: (id) => api.get(`/v3/store/issues/${id}`),
    createIssue: (data) => api.post('/v3/store/issues', data),
    returnIssue: (id, data) => api.post(`/v3/store/issues/${id}/returns`, data),

    reorder: (params) => api.get('/v3/store/reorder', { params }),
    createRequisition: (data) => api.post('/v3/store/requisitions', data),
};
