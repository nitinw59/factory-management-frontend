import api from '../utils/api';

export const bomApi = {
    // productId is optional — when passed, the response also includes
    // productStages: that product's own product_cycle_flow (Cutting,
    // Preparatory, Sewing, ...), driving the BOM wizard's stage steps.
    getFormData:          (productId) => api.get('/bom/form-data', productId ? { params: { product_id: productId } } : undefined),
    getTrimVariantSizes:  (trimItemId) => api.get(`/bom/trim-items/${trimItemId}/variant-sizes`),
    getAll:       ()            => api.get('/bom'),
    getById:      (bomId)       => api.get(`/bom/${bomId}`),
    create:       (data)        => api.post('/bom', data),
    update:       (bomId, data) => api.put(`/bom/${bomId}`, data),
    remove:       (bomId)       => api.delete(`/bom/${bomId}`),
    submit:     (bomId)        => api.post(`/bom/${bomId}/submit`),
    approve:    (bomId, notes) => api.post(`/bom/${bomId}/approve`, notes ? { notes } : {}),
    reject:     (bomId, notes) => api.post(`/bom/${bomId}/reject`, { notes }),
    archive:    (bomId)        => api.post(`/bom/${bomId}/archive`),
    getHistory: (bomId)        => api.get(`/bom/${bomId}/history`),
    getApprovalPreview: (bomId) => api.get(`/bom/${bomId}/approval-preview`),
    getMeasurementChart:    (bomId)       => api.get(`/bom/${bomId}/measurement-chart`),
    saveMeasurementChart:   (bomId, data) => api.put(`/bom/${bomId}/measurement-chart`, data),
    deleteMeasurementChart: (bomId)       => api.delete(`/bom/${bomId}/measurement-chart`),
    createTrimItem: (data) => api.post('/shared/trim_items', data),
};
