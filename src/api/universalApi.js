import api from '../utils/api'; // Your centralized axios/api instance

export const universalApi = {
    // 1. Core Production Flow
    getWorkstationData: () => api.get('/workstation-universal/queue'),
    logPieceCheck: (validationData) => api.post('/workstation-universal/log-check', validationData),
    approveAlteredPieces: (data) => api.post('/workstation-universal/approve-repair', data),

    // 2. Global Lookups
    getDefectCodes: () => api.get('/workstation-universal/defect-codes'),

    // 3. Manual Overrides / Reconciliations
    checkAndCompleteStages: (data) => api.post('/workstation-universal/check-roll-completion', data),
    checkStageCompletion: (data) => api.post('/workstation-universal/check-stage-completion', data),

    // ------------------------------------------------------------------------
    // Optional / Future Expansion Routes (Generalized for any department)
    // ------------------------------------------------------------------------
    getAlteredPieces: () => api.get('/workstation-universal/altered-pieces'),
    getCompletedPieces: () => api.get('/workstation-universal/completed-pieces'),
    getPieceDetails: (pieceId) => api.get(`/workstation-universal/piece-details/${pieceId}`),
    getPieceHistory: (pieceId) => api.get(`/workstation-universal/piece-history/${pieceId}`),
    getStatistics: () => api.get('/workstation-universal/statistics'),
    getBatchQCSummary: () => api.get('/workstation-universal/summary'),
    checkCompletion: (data) => api.post('/workstation-universal/check-completion', data),

    // Checker summary: pending rework count + today's rework count
    getCheckerStats: () => api.get('/workstation-universal/checker-stats'),
    // Today's work log for export (scans done by logged-in user today)
    getTodayWork: (date) => api.get('/workstation-universal/today-work', { params: date ? { date } : {} }),
};