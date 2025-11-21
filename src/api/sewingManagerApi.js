import api from '../utils/api'; // Your configured API client

export const sewingManagerApi = {
  /**
   * Fetches the queue of PENDING batches for the manager's line.
   * (Matches initializationPortalController.getDashboardData)
   */
  getDashboardData: () => api.get('/sewing-manager/my-queue'),

  /**
   * Fetches all fabric rolls assigned to a specific batch.
   * (Used by the StartBatchModal)
   */
  getRollsForBatch: (batchId) => api.get(`/sewing-manager/batch-rolls/${batchId}`),

  /**
   * Starts a batch step:
   * - Updates production_batch_progress to 'IN_PROGRESS'
   * - Updates fabric_production_log to 'IN_PROGRESS'
   * - Updates fabric_rolls to 'IN_PRODUCTION'
   * (Matches initializationPortalController.startBatch)
   * @param {object} data - { batchId, cycleFlowId, lineId, selectedRollIds }
   */
  startBatch: (data) => api.post('/sewing-manager/start-batch', data),
};