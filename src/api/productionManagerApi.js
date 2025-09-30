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


 getFabricTypes: () => api.get('/production-manager/fabric_type'),

  /**
   * Fetches all available fabric colors for the form filters.
   */
  getFabricColors: () => api.get('/production-manager/fabric_color'),

  getFactoryLayoutData: () => api.get('/production-manager/factory-layout'),

  /**
   * Updates the sequence and assignment of workstations for a specific production line.
   * Corresponds to: PUT /api/production-manager/production-lines/:lineId/layout
   * @param {number | string} lineId - The ID of the production line to update.
   * @param {number[]} workstationIds - An ordered array of workstation IDs for the new layout.
   */
  updateLineLayout: (lineId, workstationIds) => 
    api.put(`/production-manager/production-lines/${lineId}/layout`, { workstationIds }),
    
};

