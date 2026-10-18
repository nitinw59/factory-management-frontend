import api from '../../utils/api';

// Version 3.0 production stage engine — backend routes/v3/productionRoutes.js (/api/v3/production).
export const productionApi = {
    permissions: () => api.get('/v3/production/permissions'),
    station: () => api.get('/v3/production/station'),
    reworkStatus: (stageTypeId, lineId) => api.get('/v3/production/rework-status', { params: { stage_type_id: stageTypeId, line_id: lineId } }),   // Settings → Production thresholds
    defectCodes: (stageTypeId) => api.get('/v3/production/defect-codes', { params: { stage_type_id: stageTypeId } }),
    queue: (stageTypeId) => api.get('/v3/production/queue', { params: { stage_type_id: stageTypeId } }),
    batchStage: (batchId, stageTypeId) => api.get(`/v3/production/batches/${batchId}/stages/${stageTypeId}`),
    check: (data) => api.post('/v3/production/checks', data),
    repair: (data) => api.post('/v3/production/repairs', data),
    bundleCheck: (data) => api.post('/v3/production/bundle-checks', data),
    lines: (stageTypeId) => api.get('/v3/production/lines', { params: { stage_type_id: stageTypeId } }),
    loading: (stageTypeId) => api.get('/v3/production/loading', { params: { stage_type_id: stageTypeId } }),
    pipeline: (params) => api.get('/v3/production/pipeline', { params }),           // line loader board (2.0's pipeline)
    loadHistory: (params) => api.get('/v3/production/load-history', { params }),
    // material replacement, as 2.0 (18 Oct 2026)
    problems: (batchId, stageTypeId) => api.get(`/v3/production/batches/${batchId}/stages/${stageTypeId}/problems`),
    replacements: (params) => api.get('/v3/production/replacements', { params }),
    requestReplacement: (data) => api.post('/v3/production/replacements', data),
    acceptReplacement: (id) => api.post(`/v3/production/replacements/${id}/accept`),
    fulfilReplacement: (id) => api.post(`/v3/production/replacements/${id}/fulfil`),
    cancelReplacement: (id, reason) => api.post(`/v3/production/replacements/${id}/cancel`, { reason }),
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
    // 18 Oct 2026: station tools — why a stage isn't complete / recalculate, undo a check, scan a piece, today's numbers, work log
    stageWhy: (batchId, stageTypeId) => api.get(`/v3/production/batches/${batchId}/stages/${stageTypeId}/why`),
    refresh: (batchId) => api.post(`/v3/production/batches/${batchId}/refresh`),
    revert: (data) => api.post('/v3/production/revert', data),
    pieceLookup: (code, stageTypeId) => api.get('/v3/production/pieces/lookup', { params: { code, stage_type_id: stageTypeId } }),
    myStats: (stageTypeId, lineId) => api.get('/v3/production/my-stats', { params: { stage_type_id: stageTypeId || undefined, line_id: lineId || undefined } }),
    workLog: (params) => api.get('/v3/production/work-log', { params }),
};
