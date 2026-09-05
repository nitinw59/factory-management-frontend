import api from '../utils/api';

// Fabric roll inventory + the old simple intake path — split out of
// storeManagerApi.js into its own portal (role: fabric_store_manager),
// backed by /api/fabric-store/*. Still called from a few shared components
// rendered outside this portal too (Accounts' FabricIntakeForm.jsx at
// /accounts/fabric-rolls, ProductionWorkflowDashboard.jsx) — the backend
// route list for these endpoints stays broad enough to cover them.
//
// The NEW, GRN-audited way to record fabric intake (challan photo + PO-line
// price-variance check + approval) is storeManagerApi.createInventoryIntake
// with inventory_category: 'FABRIC' — genuinely shared cross-category
// infrastructure, so it stays owned by storeManagerApi.
export const fabricStoreApi = {
    getFabricIntakeFormData: () => api.get('/fabric-store/form-data/fabric-intake'),
    createFabricIntake: (data) => api.post('/fabric-store/fabric-intake', data),
    getFabricInventory: () => api.get('/fabric-store/fabric-inventory'),
    getFabricRollsByPO: (poId) => api.get(`/fabric-store/fabric-stock/po/${poId}`),
    getFabricRollsBySOP: (sopId) => api.get(`/fabric-store/fabric-stock/sop/${sopId}`),
    getAvailableRollsForRequirement: (reqId) => api.get(`/fabric-store/fabric-requirements/${reqId}/available-rolls`),
    getInStockFabricRolls: () => api.get('/fabric-store/fabric-rolls/in-stock'),
    updateFabricRoll: (rollId, data) => api.put(`/fabric-store/fabric-roll/${rollId}`, data),
    deleteFabricRoll: (rollId) => api.delete(`/fabric-store/fabric-roll/${rollId}`),
};
