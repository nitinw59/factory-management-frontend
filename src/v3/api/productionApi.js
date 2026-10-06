import api from '../../utils/api';

// Version 3.0 production stage engine — backend routes/v3/productionRoutes.js (/api/v3/production).
export const productionApi = {
    permissions: () => api.get('/v3/production/permissions'),
    station: () => api.get('/v3/production/station'),
    defectCodes: (stageTypeId) => api.get('/v3/production/defect-codes', { params: { stage_type_id: stageTypeId } }),
    queue: (stageTypeId) => api.get('/v3/production/queue', { params: { stage_type_id: stageTypeId } }),
    batchStage: (batchId, stageTypeId) => api.get(`/v3/production/batches/${batchId}/stages/${stageTypeId}`),
    check: (data) => api.post('/v3/production/checks', data),
    repair: (data) => api.post('/v3/production/repairs', data),
    bundleCheck: (data) => api.post('/v3/production/bundle-checks', data),
    lines: (stageTypeId) => api.get('/v3/production/lines', { params: { stage_type_id: stageTypeId } }),
    loading: (stageTypeId) => api.get('/v3/production/loading', { params: { stage_type_id: stageTypeId } }),
    load: (data) => api.post('/v3/production/loads', data),
    changeLine: (data) => api.post('/v3/production/loads/change-line', data),
    batchGarments: (batchId, stageTypeId) => api.get(`/v3/production/batches/${batchId}/garments/${stageTypeId}`),
    garmentLookup: (code, stageTypeId) => api.get('/v3/production/garments/lookup', { params: { code, stage_type_id: stageTypeId } }),
    garmentCheck: (data) => api.post('/v3/production/garment-checks', data),
    garmentRepair: (data) => api.post('/v3/production/garment-repairs', data),
    recuts: (params) => api.get('/v3/production/recuts', { params }),
    recutRolls: (id) => api.get(`/v3/production/recuts/${id}/rolls`),
    cutRecut: (id, data) => api.post(`/v3/production/recuts/${id}/cut`, data),
    cancelRecut: (id, reason) => api.post(`/v3/production/recuts/${id}/cancel`, { reason }),
};
