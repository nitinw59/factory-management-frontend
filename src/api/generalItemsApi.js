import api from '../utils/api';

export const generalItemsApi = {
    getItems:       (params) => api.get('/general-items', { params }),
    createItem:     (data)   => api.post('/general-items', data),
    updateItem:     (id, data) => api.patch(`/general-items/${id}`, data),
    getCategories:  ()       => api.get('/general-items/categories'),
    createCategory: (data)   => api.post('/general-items/categories', data),
    getLedger:      (params) => api.get('/general-items/ledger', { params }),
    createIssue:    (data)   => api.post('/general-items/issues', data),
    getIssues:      (params) => api.get('/general-items/issues', { params }),
    exportInventory:     ()     => api.get('/general-items/export'),
    bulkUpdateInventory: (data) => api.post('/general-items/bulk-update', data),
};
