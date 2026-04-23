import api from '../utils/api';

export const dispatchManagerApi = {
    getDashboardData:       ()               => api.get('/dispatch/dashboard'),
    getBatchDetail:         (batchId)        => api.get(`/dispatch/batch/${batchId}/detail`),
    submitDispatch:         (payload)        => api.post('/dispatch/submit', payload),
    closeBatch:             (batchId)        => api.post('/dispatch/batch/close', { batchId }),
    getReceiptByNumber:     (receiptNumber)  => api.get(`/dispatch/receipt/${receiptNumber}`),
    getAllReceipts:          ()               => api.get('/dispatch/receipts'),
    // legacy — keep for old pages that may still reference them
    getRollDetailsForBatch: (batchId)        => api.get(`/dispatch/batch/${batchId}/detail`),
};