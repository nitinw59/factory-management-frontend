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

    getBatchProgressReport: (batchId) => api.get(`/initialization-portal/batch-progress/${batchId}`),

    getDailyReport: (startDate, endDate) => api.get(`/initialization-portal/reports/daily?startDate=${startDate}&endDate=${endDate}`),

    getBatchCuttingDetails: (batchId) => api.get(`/cutting-portal/batch-cutting-details/${batchId}`),



  getBatchForEdit: (batchId) => api.get(`/production-batch-api/production-batches/${batchId}/edit-data`),
  updateBatch: (batchId, batchData) => api.put(`/production-batch-api/production-batches/${batchId}`, batchData),


};
