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
    pickupReplacement: (id) => api.post(`/v3/production/replacements/${id}/pickup`),               // line loader collected the piece (19 Oct 2026)
    rejectReplacement: (id, reason) => api.post(`/v3/production/replacements/${id}/reject`, { reason }),
    // floor in-charge portal (19 Oct 2026, phase 4)
    floor: () => api.get('/v3/production/floor'),
    floorProblems: (params) => api.get('/v3/production/floor/problems', { params }),
    floorReject: (data) => api.post('/v3/production/floor/reject', data),
    supervisorPin: () => api.get('/v3/production/floor/supervisor-pin'),
    setSupervisorPin: (pin) => api.put('/v3/production/floor/supervisor-pin', { pin }),
    floorMyLines: () => api.get('/v3/production/floor/my-lines'),   // line accountability (20 Oct 2026)
    fulfilReplacement: (id, data) => api.post(`/v3/production/replacements/${id}/fulfil`, data),   // { source: END_BIT | ROLL, end_bit_id | fabric_roll_id, metres } (19 Oct 2026)
    replacementSources: (id) => api.get(`/v3/production/replacements/${id}/sources`),
    cancelReplacement: (id, reason) => api.post(`/v3/production/replacements/${id}/cancel`, { reason }),
    // fabric for a replacement from the store (21 Oct 2026)
    requestReplacementFabric: (id, data) => api.post(`/v3/production/replacements/${id}/fabric-request`, data),   // { metres, note? }
    replacementFabric: (status) => api.get('/v3/production/replacement-fabric', { params: { status } }),
    replacementFabricRolls: (id) => api.get(`/v3/production/replacement-fabric/${id}/rolls`),
    issueReplacementFabric: (id, rollId) => api.post(`/v3/production/replacement-fabric/${id}/issue`, { fabric_roll_id: rollId }),
    cancelReplacementFabric: (id, reason) => api.post(`/v3/production/replacement-fabric/${id}/cancel`, { reason }),
    load: (data) => api.post('/v3/production/loads', data),
    changeLine: (data) => api.post('/v3/production/loads/change-line', data),
    unload: (data) => api.post('/v3/production/loads/unload', data),
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
