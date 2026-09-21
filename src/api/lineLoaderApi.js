import api from '../utils/api';

export const lineLoaderApi = {
  /**
   * Fetches aggregated batch data for the dashboard. With no args, returns
   * every active batch unpaginated (other consumers — JobWorkDashboardPage,
   * DispatchJobWorkPage — rely on this). Pass { limit, offset } to paginate
   * instead (LineLoaderDashboardPage does, to avoid a ~1.6MB/138-batch
   * payload) — the response then carries an `x-has-more` header.
   */
  getDashboardData: (params) => api.get('/line-loader/dashboard', { params }),

  /**
   * Fetches available production lines for a specific line type.
   * @param {number | string} lineTypeId The ID of the line type.
   */
  getLinesByType: (lineTypeId) => api.get(`/line-loader/lines/${lineTypeId}`),
  getLineTypes: () => api.get('/shared/production_line_types'),

  /**
   * Assigns a batch to a production line for a specific step in its cycle.
   * @param {object} data - The assignment data.
   * @param {number} data.batchId - The ID of the production batch.
   * @param {number} data.cycleFlowId - The ID of the product_cycle_flow step.
   * @param {number} data.lineId - The ID of the production line to assign.
   */
  assignLineAndLogRolls: (data) => api.post('/line-loader/assign-line', data),

  /**
   * MODE_2 equivalent: assigns a SIZE (across every roll that carries it) to
   * a production line, instead of a set of rolls.
   * @param {object} data - { batchId, cycleFlowId, lineId, selectedSizes }
   */
  assignLineAndLogSizes: (data) => api.post('/line-loader/assign-line-sizes', data),

  getRollsForBatch: (batchId, cycleFlowId) => api.get(`/line-loader/batch/${batchId}/rolls`, { params: { cycle_flow_id: cycleFlowId } }),
  getSizesForBatch: (batchId, cycleFlowId) => api.get(`/line-loader/batch/${batchId}/sizes`, { params: { cycle_flow_id: cycleFlowId } }),
  checkLineWip: (lineId) => api.get(`/line-loader/check-wip/${lineId}`),
  getAllActiveLineWip: () => api.get('/line-loader/active-lines-wip'),
  checkAndCompleteStage: (batchId, productionLineId) => api.post(`/line-loader/batch/${batchId}/stage/${productionLineId}/check-complete`),
  getCompletedBatches: () => api.get('/line-loader/completed-batches'),
  changeLine: (batchId, cycleFlowId, newLineId) =>
    api.post(`/line-loader/batch/${batchId}/stage/${cycleFlowId}/change-line`, { newLineId }),
};
