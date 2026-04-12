import api from '../utils/api';

export const qcApi = {
    // Defect codes
    getAllDefectCodes: () => api.get('/qc/defect-codes/all'),
    createDefectCode: (data) => api.post('/qc/defect-codes', data),

    // QC Analytics endpoints (require backend implementation)
    getQCSummary:    (params) => api.get('/qc/analytics/summary',     { params }),
    getQCByLine:     (params) => api.get('/qc/analytics/by-line',     { params }),
    getQCByCategory: (params) => api.get('/qc/analytics/by-category', { params }),
    getQCTrend:      (params) => api.get('/qc/analytics/trend',       { params }),
    getQCTopDefects: (params) => api.get('/qc/analytics/top-defects', { params }),
    getQCBatches:    (params) => api.get('/qc/analytics/batches',     { params }),

    // Line type <-> defect code mappings
    getDefectCodesForLineType: (lineTypeId) => api.get(`/qc/line-types/${lineTypeId}/defect-codes`),
    setDefectCodesForLineType: (lineTypeId, defectCodeIds) => api.put(`/qc/line-types/${lineTypeId}/defect-codes`, { defectCodeIds }),
    addDefectCodeToLineType: (lineTypeId, defectCodeId) => api.post(`/qc/line-types/${lineTypeId}/defect-codes/${defectCodeId}`),
    removeDefectCodeFromLineType: (lineTypeId, defectCodeId) => api.delete(`/qc/line-types/${lineTypeId}/defect-codes/${defectCodeId}`),
};
