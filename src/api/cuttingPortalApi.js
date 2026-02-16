import api from '../utils/api';

export const cuttingPortalApi = {
  /**
   * Fetches the list of assigned cutting batches for the logged-in user.
   */
  getAssignedBatches: () => api.get('/cutting-portal/assigned-batches'),

    /**
   * Gets the queue of batches assigned to the logged-in cutting operator.
   */
  getMyQueue: () => api.get('/cutting-portal/my-queue'),

  /**
   * Gets the details for a specific roll within a batch for the cutting form.
   * @param {string|number} batchId - The ID of the batch.
   * @param {string|number} rollId - The ID of the fabric roll.
   */
  getBatchDetailsForCutting: (batchId, rollId) => api.get(`/cutting-portal/batch-details/${batchId}/${rollId}`),

  /**
   * Saves the cutting data for a specific roll.
   * @param {object} data - The payload containing batchId, rollId, and cuts array.
   */
  logCutPieces: (data) => api.post('/cutting-portal/log-cut', data),

  getBatchCuttingDetails: (batchId) => api.get(`/cutting-portal/batch-cutting-details/${batchId}`),

  getBatchNumberingDetails: (batchId) => api.get(`/cutting-portal/batch-numbering-details/${batchId}`),

  getDailyReport: () => api.get('/cutting-portal/reports/daily-status'),
    
};

