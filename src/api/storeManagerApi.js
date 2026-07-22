

import api from '../utils/api';

export const storeManagerApi = {
    // Fabric
    getFabricInventory: () => api.get('/store-manager/fabric-inventory'),
    createFabricIntake: (data) => api.post('/store-manager/fabric-intake', data),
    getFabricIntakeFormData: () => api.get('/store-manager/form-data/fabric-intake'),
    getFabricIntakeById: (intakeId) => api.get(`/store-manager/fabric-intake/${intakeId}`),
    updateFabricIntake: (intakeId, data) => api.put(`/store-manager/fabric-intake/${intakeId}`, data),
    getFabricRollsByPO: (poId) => api.get(`/store-manager/fabric-stock/po/${poId}`),
    getFabricRollsBySOP: (sopId) => api.get(`/store-manager/fabric-stock/sop/${sopId}`),
    getAvailableRollsForRequirement: (reqId) => api.get(`/store-manager/fabric-requirements/${reqId}/available-rolls`),
    getInStockFabricRolls: () => api.get('/store-manager/fabric-rolls/in-stock'),
    updateFabricRoll: (rollId, data) => api.put(`/store-manager/fabric-rolls/${rollId}`, data),
    deleteFabricRoll: (rollId) => api.delete(`/store-manager/fabric-rolls/${rollId}`),
    // Shared departments master — plain array of { id, name, is_overhead, created_at }
    getDepartments: () => api.get('/shared/departments'),
    // Trims
    getAllTrimItems: () => api.get('/store-manager/trim-items'),
    getVariantsByTrimItem: (trimItemId) => api.get(`/store-manager/trim-item-variants/${trimItemId}`),

    // Trim Orders
    getAllTrimOrders: (params) => api.get('/store-manager/trim-orders', { params }),
    getTrimOrdersKPIs: () => api.get('/store-manager/trim-orders/kpis'),
    getTrimOrderDetails: (orderId) => api.get(`/store-manager/trim-orders/${orderId}`),
    fulfillWithVariant: (data) => api.post('/store-manager/trim-orders/fulfill-with-variant', data),
    getTrimOrderSummary: async (orderId) => api.get(`/store-manager/trim-orders/${orderId}/summary`),
    getOrderReferenceData: (orderId) => api.get(`/store-manager/trim-orders/${orderId}/reference-data`),
    getVariantsByItem: (itemId) => api.get(`/store-manager/trim-item-variants/${itemId}`),

    // Generic resources needed for forms
    getSuppliers: () => api.get('/shared/supplier'),
    getFabricTypes: () => api.get('/shared/fabric_type'),
    getFabricColors: () => api.get('/shared/fabric_color'),


    updateTrimOrder: (orderId, data) => api.put(`/store-manager/trim-orders/${orderId}`, data),
    recheckMissingItems: (orderId) => api.post(`/store-manager/trim-orders/${orderId}/recheck`),
    recomputeTrimItem: (orderId, trimItemId) =>
        api.post(`/store-manager/trim-orders/${orderId}/trim-items/${trimItemId}/recompute`),

    autoFulfillOrder: (orderId) => api.post(`/store-manager/trim-orders/${orderId}/auto-fulfill`),



    autoFulfillSubstitutes: (orderId) => api.post(`/store-manager/trim-orders/${orderId}/auto-fulfill-substitutes`),
    revertFulfillment: (logId) => api.delete(`/store-manager/trim-fulfillments/${logId}`),

    // Kit custody (loader pickup flow)
    markKitReady: (orderId) => api.post(`/store-manager/trim-orders/${orderId}/mark-ready`),
    unmarkKitReady: (orderId) => api.post(`/store-manager/trim-orders/${orderId}/unmark-ready`),

    // Force close / re-open (store_manager, factory_admin). Close stashes the prior status;
    // re-open restores it. Both 409 when the state doesn't allow the action.
    forceCloseTrimOrder: (orderId, data) => api.post(`/store-manager/trim-orders/${orderId}/force-close`, data),
    forceOpenTrimOrder: (orderId) => api.post(`/store-manager/trim-orders/${orderId}/force-open`),


    // Billing  
    getTrimBillsForOrder: (orderId) => api.get(`/store-manager/trim-orders/${orderId}/bills`),
    saveTrimBill: (orderId, data) => api.post(`/store-manager/trim-orders/${orderId}/bills`, data),


    // Trim reservations browser (store-manager scope; release uses planningApi.deleteTrimReservation)
    getTrimReservations: (params) => api.get('/store-manager/trim-reservations', { params }),

    // Barcode
    markBatchBarcodePrinted: (data) => api.post('/store-manager/batch-barcode-printed', data),

    //spares billing
    getPendingRequests: () => api.get('/spare-issuance/spares/pending-requests'),
    getFactoryUsers: () => api.get('/spare-issuance/factory-users'),
    getStoreSparesInventory: () => api.get('/spare-issuance/spares/inventory'),
    generateInvoice: (data) => api.post('/spare-issuance/spares/generate-invoice', data),
    getInvoices: () => api.get('/spare-issuance/spares/invoices')

};
