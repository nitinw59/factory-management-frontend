import api from '../utils/api'; // Assuming you have a centralized api instance

export const numberingCheckerApi = {
    getMyQueue: () => api.get('/numbering-checker/my-queue'),
    logNumberingCheck: (validationData) => api.post('/numbering-checker/log-check', validationData),
    checkAndCompleteStages: (data) => api.post('/numbering-checker/check-completion', data),
    approveAlteredPieces: (data) => api.post('/numbering-checker/approve-altered', data),
    getAlteredPieces: () => api.get('/numbering-checker/altered-pieces'),
    getCompletedPieces: () => api.get('/numbering-checker/completed-pieces'),
    getPieceDetails: (pieceId) => api.get(`/numbering-checker/piece-details/${pieceId}`),
    getPieceHistory: (pieceId) => api.get(`/numbering-checker/piece-history/${pieceId}`),
    getStatistics: () => api.get('/numbering-checker/statistics'),
    getBatchQCSummary: () => api.get('/numbering-checker/summary'),
};
