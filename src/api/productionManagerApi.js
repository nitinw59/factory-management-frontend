import api from '../utils/api';

export const productionManagerApi = {
  /**
   * Fetches all data needed for the 'Create Batch' form's dropdowns.
   */
  getFormData: () => api.get('/production-batch-api/production-batches/form-data'),

  /**
   * Creates a new production batch.
   * @param {object} batchData - The complete batch data.
   */
  create: (batchData) => api.post('/production-batch-api/production-batches', batchData),

  /**
   * Fetches all existing production batches.
   */
  getAll: () => api.get('/production-batch-api/production-batches'),

  getFabricTypes: () => api.get('/shared/fabric_type'),

  /**
   * Fetches all available fabric colors for the form filters.
   */
  getFabricColors: () => api.get('/shared/fabric_color'),

  getFactoryLayoutData: () => api.get('/production-manager/factory-layout'),

  /**
   * Updates the sequence and assignment of workstations for a specific production line.
   * Corresponds to: PUT /api/production-manager/production-lines/:lineId/layout
   * @param {number | string} lineId - The ID of the production line to update.
   * @param {number[]} workstationIds - An ordered array of workstation IDs for the new layout.
   */
  updateLineLayout: (lineId, workstationIds) => api.put(`/production-manager/production-lines/${lineId}/layout`, { workstationIds }),


  // New function for the modal
  getRollStatusForBatchOnLine: (batchId, lineId) => api.get(`/production-manager/batch/${batchId}/line/${lineId}/rolls`),
  




  // --- NEW: Specific CRUD for Production Lines ---
  getAllProductionLines: () => api.get('/shared/production-lines/production-lines-detailed'), // Endpoint for detailed view
  getProductionLineById: (id) => api.get(`/shared/production-lines/${id}`), // Fetch single for editing
  createProductionLine: (data) => api.post('/shared/production-lines', data),
  updateProductionLine: (id, data) => api.put(`/shared/production-lines/${id}`, data),
  deleteProductionLine: (id) => api.delete(`/shared/production-lines/${id}`),

  // --- NEW: Functions to fetch data for the Production Line Form ---
  getLineTypes: () => api.get('/shared/production_line_types'),
  getLineManagers: () => api.get('/shared/factory_users?role=line_manager'), // Fetch users with 'line_manager' role
  assignManagerToLine: (lineId, managerId) => api.put(`/production-manager/lines/${lineId}/assign-manager`, { managerId }),
  assignLoaderToLine: (lineId, loaderId) => api.put(`/production-manager/lines/${lineId}/assign-loader`, { loaderId }),
  getLinesWithLoaders: () => api.get('/production-manager/lines-with-loaders'),
  // --- NEW: Functions for Editing Production Batches ---


  getBatchForEdit: (batchId) => api.get(`/production-batch-api/production-batches/${batchId}/edit-data`),
  updateBatch: (batchId, batchData) => api.put(`/production-batch-api/production-batches/${batchId}`, batchData),


// WORKFLOW FUNCTIONS
  getWorkflowData: () => api.get('/production-manager/production-workflow-data'),


};

