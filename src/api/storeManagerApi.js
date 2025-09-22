import api from '../utils/api';

export const storeManagerApi = {
  /**
   * Fetches the main store's current inventory.
   */
  getInventory: () => api.get('/store-manager/inventory'),

  /**
   * Creates a new stock intake request.
   * @param {object} intakeData - The data for the new intake request.
   */
  createStockIntake: (intakeData) => api.post('/store-manager/stock-intakes', intakeData),
  
  // The form will also need data for its dropdowns
  getSuppliers: () => api.get('/admin/supplier'), // Assuming admins and managers can view suppliers
  getTrimVariants: () => api.get('/admin/trim_item_variants'), // And variants
};
