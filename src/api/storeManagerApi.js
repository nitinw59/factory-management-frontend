import api from '../utils/api';

export const storeManagerApi = {
  /**
   * Fetches the main store's current fabric inventory ("Fabric Pool").
   */
  getFabricInventory: () => api.get('/store-manager/fabric-inventory'),

  /**
   * Creates a new fabric stock intake record with all its rolls.
   * @param {object} intakeData - The data for the new intake.
   */
  createFabricIntake: (intakeData) => api.post('/store-manager/fabric-intakes', intakeData),
  
  // --- THIS IS THE FIX ---
  // These functions now call the new shared endpoints that both Admins and Store Managers can access.
  getSuppliers: () => api.get('/shared/supplier'),
  getFabricTypes: () => api.get('/shared/fabric_type'),
  getFabricColors: () => api.get('/shared/fabric_color'),
  getTrimVariants: () => api.get('/shared/trim_item_variants'),
  // --- END OF FIX ---
};

