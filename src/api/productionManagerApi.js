import api from '../utils/api';

export const productionManagerApi = {
  /**
   * Fetches all data needed for the 'Create Batch' form's dropdowns.
   */
  getFormData: () => api.get('/production-manager/production-batches/form-data'),

  /**
   * Creates a new production batch.
   * @param {object} batchData - The complete batch data.
   */
  create: (batchData) => api.post('/production-manager/production-batches', batchData),

  /**
   * Fetches all existing production batches.
   */
  getAll: () => api.get('/production-manager/production-batches'),


 getFabricTypes: () => api.get('/shared/fabric_type'),

  /**
   * Fetches all available fabric colors for the form filters.
   */
  getFabricColors: () => api.get('/shared/fabric_color'),
};

