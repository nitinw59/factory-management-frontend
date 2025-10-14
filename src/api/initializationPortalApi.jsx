import api from '../utils/api';

export const initializationPortalApi = {
    getDashboardData: () => api.get('/initialization-portal/dashboard'),
    receiveRoll: (rollId) => api.post('/initialization-portal/receive-roll', { rollId }),
    startBatch: (data) => api.post('/initialization-portal/start-batch', data),

    // Re-using line loader APIs for the modal
    getLinesByType: (lineTypeId) => api.get(`/initialization-portal/lines/${lineTypeId}`),
    getRollsForBatch: (batchId) => api.get(`/initialization-portal/batch/${batchId}/rolls`),
    

    // Alter Pieces Dashboard
    getAlterPiecesData: () => api.get('/initialization-portal/alter-dashboard'),
    rejectAltered: (data) => api.post('/initialization-portal/reject-altered', data),


};
