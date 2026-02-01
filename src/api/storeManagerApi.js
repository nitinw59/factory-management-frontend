import api from '../utils/api';

export const storeManagerApi = {
    // Fabric
    getFabricInventory: () => api.get('/store-manager/fabric-inventory'),
    createFabricIntake: (data) => api.post('/store-manager/fabric-intake', data),
    getFabricIntakeFormData: () => api.get('/store-manager/form-data/fabric-intake'),

    // Trims
    getVariantsByTrimItem: (trimItemId) => api.get(`/store-manager/trim-item-variants/${trimItemId}`),

    // Trim Orders
    getAllTrimOrders: () => api.get('/store-manager/trim-orders'),
    getTrimOrderDetails: (orderId) => api.get(`/store-manager/trim-orders/${orderId}`),
    fulfillOrderItem: (data) => api.post('/store-manager/trim-orders/fulfill-item', data),
    fulfillWithVariant: (data) => api.post('/store-manager/trim-orders/fulfill-with-variant', data),
    getTrimOrderSummary: async (orderId) => api.get(`/store-manager/trim-orders/${orderId}/summary`),

    // Trim Intake
    createTrimIntake: (data) => api.post('/store-manager/trim-intake', data),
    getInitialFormData: () => api.get('/store-manager/form-data/trim-intake'),
    getVariantsByItem: (itemId) => api.get(`/store-manager/trim-item-variants/${itemId}`),  
    getTrimStockIntakes: () => api.get('/store-manager/trim-intakes-list'),

    // Generic resources needed for forms
    getSuppliers: () => api.get('/shared/supplier'),
    getFabricTypes: () => api.get('/shared/fabric_type'),
    getFabricColors: () => api.get('/shared/fabric_color'),


    recheckMissingItems: (orderId) => api.post(`/store-manager/trim-orders/${orderId}/recheck`),

    

};
