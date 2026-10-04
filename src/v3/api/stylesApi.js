import api from '../../utils/api';

// Version 3.0 stage types and styles — backend routes/v3/stylesRoutes.js (/api/v3).
export const stylesApi = {
    permissions: () => api.get('/v3/styles-permissions'),
    sizes: () => api.get('/v3/sizes'),

    stageTypes: () => api.get('/v3/stage-types'),
    createStageType: (data) => api.post('/v3/stage-types', data),
    updateStageType: (id, data) => api.put(`/v3/stage-types/${id}`, data),

    styles: (params) => api.get('/v3/styles', { params }),
    style: (id) => api.get(`/v3/styles/${id}`),
    createStyle: (data) => api.post('/v3/styles', data),
    updateStyle: (id, data) => api.put(`/v3/styles/${id}`, data),
    setSizes: (id, sizeIds) => api.put(`/v3/styles/${id}/sizes`, { size_ids: sizeIds }),
    setParts: (id, parts) => api.put(`/v3/styles/${id}/parts`, { parts }),
    setRoute: (id, stages) => api.put(`/v3/styles/${id}/route`, { stages }),

    // BOM versions and approval
    styleBoms: (styleId) => api.get(`/v3/styles/${styleId}/boms`),
    createBom: (styleId, copyFromBomId) => api.post(`/v3/styles/${styleId}/boms`, copyFromBomId ? { copy_from_bom_id: copyFromBomId } : {}),
    boms: (params) => api.get('/v3/boms', { params }),
    bom: (id) => api.get(`/v3/boms/${id}`),
    updateBom: (id, data) => api.put(`/v3/boms/${id}`, data),
    setBomColours: (id, colours) => api.put(`/v3/boms/${id}/colours`, { colours }),
    submitBom: (id) => api.post(`/v3/boms/${id}/submit`),
    withdrawBom: (id) => api.post(`/v3/boms/${id}/withdraw`),
    approveBom: (id) => api.post(`/v3/boms/${id}/approve`),
    rejectBom: (id, reason) => api.post(`/v3/boms/${id}/reject`, { reason }),
    archiveBom: (id, reason) => api.post(`/v3/boms/${id}/archive`, { reason }),
    deleteBom: (id) => api.delete(`/v3/boms/${id}`),
    trimCard: (id) => api.get(`/v3/boms/${id}/trim-card`),
    approvalPreview: (id) => api.get(`/v3/boms/${id}/approval-preview`),

    // BOM lines
    bomLines: (bomId) => api.get(`/v3/boms/${bomId}/lines`),
    saveFabricLine: (bomId, lineId, data) => (lineId ? api.put(`/v3/boms/${bomId}/fabric-lines/${lineId}`, data) : api.post(`/v3/boms/${bomId}/fabric-lines`, data)),
    deleteFabricLine: (bomId, lineId) => api.delete(`/v3/boms/${bomId}/fabric-lines/${lineId}`),
    saveTrimLine: (bomId, lineId, data) => (lineId ? api.put(`/v3/boms/${bomId}/trim-lines/${lineId}`, data) : api.post(`/v3/boms/${bomId}/trim-lines`, data)),
    deleteTrimLine: (bomId, lineId) => api.delete(`/v3/boms/${bomId}/trim-lines/${lineId}`),
};
