import api from '../utils/api';

export const dispatchManagerApi = {
      getDashboardData:  () => api.get('/dispatch/dashboard'), // Simulate API call for dashboard data
    getRollDetailsForBatch: (batchId) => api.get(`/dispatch/batch/${batchId}/rolls`), // Simulate API call for roll details
    submitDispatch: (payload) => api.post('/dispatch/submit', payload), // Simulate API call for submitting dispatch
    getReceiptDetails: (batchId) => api.get(`/dispatch/batch/${batchId}/receipt`), // Simulate API call for receipt details
    getAllReceipts: () => api.get('/dispatch/receipts'), // Simulate API call for all receipts
    closeBatch: (batchId) => api.post('/dispatch/batch/close', { batchId }),
};