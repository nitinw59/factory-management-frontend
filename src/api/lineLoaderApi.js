import api from '../utils/api';

export const lineLoaderApi = {
  /**
   * Fetches all aggregated data for the dashboard.
   */
  getDashboardData: () => api.get('/line-loader/dashboard'),

  /**
   * Fetches available production lines for a specific line type.
   * @param {number | string} lineTypeId The ID of the line type.
   */
  getLinesByType: (lineTypeId) => api.get(`/line-loader/lines/${lineTypeId}`),

  /**
   * Assigns a batch to a production line for a specific step in its cycle.
   * @param {object} data - The assignment data.
   * @param {number} data.batchId - The ID of the production batch.
   * @param {number} data.cycleFlowId - The ID of the product_cycle_flow step.
   * @param {number} data.lineId - The ID of the production line to assign.
   */
  assignLineAndLogRolls: (data) => api.post('/line-loader/assign-line', data),
  
  getRollsForBatch: (batchId, cycleFlowId) => api.get(`/line-loader/batch/${batchId}/rolls`, { params: { cycle_flow_id: cycleFlowId } }),
  checkLineWip: (lineId) => api.get(`/line-loader/check-wip/${lineId}`),
  getAllActiveLineWip: () => api.get('/line-loader/active-lines-wip'),
  checkAndCompleteStage: (batchId, productionLineId) => api.post(`/line-loader/batch/${batchId}/stage/${productionLineId}/check-complete`),
  getCompletedBatches: () => api.get('/line-loader/completed-batches'),
};
