

import api from '../utils/api';

export const storeManagerApi = {
    // Shared departments master — plain array of { id, name, is_overhead, created_at }
    getDepartments: () => api.get('/shared/departments'),

    // Unified GRN (Goods Receipt Note) intake — shared across TRIMS/SPARES/FABRIC,
    // so it stays here rather than under fabricStoreApi. See
    // controllers/storeManagerController.js createInventoryIntake (multipart:
    // 'challan_image' file field + inventory_category/supplier_id/challan_number/items).
    getInventoryIntakeFormData: () => api.get('/store-manager/form-data/inventory-intake'),
    createInventoryIntake: (formData) => api.post('/store-manager/inventory-intake', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    getInventoryIntakes: () => api.get('/store-manager/inventory-intakes-list'),
    approveInventoryIntake: (id) => api.patch(`/store-manager/inventory-intake/${id}/approve`),
    rejectInventoryIntake: (id, notes) => api.patch(`/store-manager/inventory-intake/${id}/reject`, { notes }),
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
    // Full-order recompute — reconciles the union of (on-order trims, missing-item trims,
    // and whatever the batch's current BOM/recipe requires), one trim at a time.
    recomputeAllTrims: (orderId) => api.post(`/store-manager/trim-orders/${orderId}/recompute-all`),

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

    // Trim reservations browser (store-manager scope; release uses planningApi.deleteTrimReservation)
    getTrimReservations: (params) => api.get('/store-manager/trim-reservations', { params }),
    // Per-batch consumption breakdown for a reservation — NEEDS BACKEND: expects
    // { sales_order_product_id, trim_item_variant_ids: "1,2,3" } → { data: [{ production_batch_id,
    // batch_code, trim_order_id, trim_order_status, trim_item_variant_id, color_name, color_number,
    // variant_size, quantity_used, used_at }] }. Not implemented server-side yet.
    getTrimReservationUsage: (params) => api.get('/store-manager/trim-reservations/usage', { params }),

    // Barcode
    markBatchBarcodePrinted: (data) => api.post('/store-manager/batch-barcode-printed', data),

    //spares billing
    getPendingRequests: () => api.get('/spare-issuance/spares/pending-requests'),
    getFactoryUsers: () => api.get('/spare-issuance/factory-users'),
    getStoreSparesInventory: () => api.get('/spare-issuance/spares/inventory'),
    generateInvoice: (data) => api.post('/spare-issuance/spares/generate-invoice', data),
    getInvoices: () => api.get('/spare-issuance/spares/invoices')

};
