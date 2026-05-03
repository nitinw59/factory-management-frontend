import api from '../utils/api';

export const bomApi = {
    getFormData:          ()           => api.get('/bom/form-data'),
    getTrimVariantSizes:  (trimItemId) => api.get(`/bom/trim-items/${trimItemId}/variant-sizes`),
    getAll:       ()            => api.get('/bom'),
    getById:      (bomId)       => api.get(`/bom/${bomId}`),
    create:       (data)        => api.post('/bom', data),
    update:       (bomId, data) => api.put(`/bom/${bomId}`, data),
    remove:       (bomId)       => api.delete(`/bom/${bomId}`),
    submit:     (bomId)        => api.post(`/bom/${bomId}/submit`),
    approve:    (bomId)        => api.post(`/bom/${bomId}/approve`),
    reject:     (bomId, notes) => api.post(`/bom/${bomId}/reject`, { notes }),
    archive:    (bomId)        => api.post(`/bom/${bomId}/archive`),
    getHistory: (bomId)        => api.get(`/bom/${bomId}/history`),
};
