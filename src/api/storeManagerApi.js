

import api from '../utils/api';

export const storeManagerApi = {
    // Fabric
    getFabricInventory: () => api.get('/store-manager/fabric-inventory'),
    createFabricIntake: (data) => api.post('/store-manager/fabric-intake', data),
    getFabricIntakeFormData: () => api.get('/store-manager/form-data/fabric-intake'),
    getFabricIntakeById: (intakeId) => api.get(`/store-manager/fabric-intake/${intakeId}`),
    updateFabricIntake: (intakeId, data) => api.put(`/store-manager/fabric-intake/${intakeId}`, data),
    getFabricRollsByPO: (poId) => api.get(`/store-manager/fabric-stock/po/${poId}`),
    updateFabricRoll: (rollId, data) => api.put(`/store-manager/fabric-roll/${rollId}`, data),
    deleteFabricRoll: (rollId) => api.delete(`/store-manager/fabric-roll/${rollId}`),
    // Trims
    getAllTrimItems: () => api.get('/store-manager/trim-items'),
    getVariantsByTrimItem: (trimItemId) => api.get(`/store-manager/trim-item-variants/${trimItemId}`),

    // Trim Orders
    getAllTrimOrders: (params) => api.get('/store-manager/trim-orders', { params }),
    getTrimOrdersKPIs: () => api.get('/store-manager/trim-orders/kpis'),
    getTrimOrderDetails: (orderId) => api.get(`/store-manager/trim-orders/${orderId}`),
    fulfillOrderItem: (data) => api.post('/store-manager/trim-orders/fulfill-item', data),
    fulfillWithVariant: (data) => api.post('/store-manager/trim-orders/fulfill-with-variant', data),
    getTrimOrderSummary: async (orderId) => api.get(`/store-manager/trim-orders/${orderId}/summary`),
    getOrderReferenceData: (orderId) => api.get(`/store-manager/trim-orders/${orderId}/reference-data`),
    // Trim Intake
    createInventoryIntake: (data) => api.post('/store-manager/inventory-intake', data),
    getInventoryIntakeFormData: () => api.get('/store-manager/form-data/inventory-intake'),
    getVariantsByItem: (itemId) => api.get(`/store-manager/trim-item-variants/${itemId}`),  
    getInventoryIntakes: () => api.get('/store-manager/inventory-intakes-list'),

    // Generic resources needed for forms
    getSuppliers: () => api.get('/shared/supplier'),
    getFabricTypes: () => api.get('/shared/fabric_type'),
    getFabricColors: () => api.get('/shared/fabric_color'),


    recheckMissingItems: (orderId) => api.post(`/store-manager/trim-orders/${orderId}/recheck`),

    autoFulfillOrder: (orderId) => api.post(`/store-manager/trim-orders/${orderId}/auto-fulfill`),



    autoFulfillSubstitutes: (orderId) => api.post(`/store-manager/trim-orders/${orderId}/auto-fulfill-substitutes`),
    revertFulfillment: (logId) => api.delete(`/store-manager/trim-fulfillments/${logId}`),


    // Billing  
    getTrimBillsForOrder: (orderId) => api.get(`/store-manager/trim-orders/${orderId}/bills`),
    saveTrimBill: (orderId, data) => api.post(`/store-manager/trim-orders/${orderId}/bills`, data),


    // Barcode
    markBatchBarcodePrinted: (data) => api.post('/store-manager/batch-barcode-printed', data),

    //spares billing
    getPendingRequests: () => api.get('/spare-issuance/spares/pending-requests'),
    getFactoryUsers: () => api.get('/spare-issuance/factory-users'),
    getStoreSparesInventory: () => api.get('/spare-issuance/spares/inventory'),
    generateInvoice: (data) => api.post('/spare-issuance/spares/generate-invoice', data),
    getInvoices: () => api.get('/spare-issuance/spares/invoices')

};
