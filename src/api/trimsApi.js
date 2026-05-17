import api from '../utils/api';

export const trimsApi = {
  /**
   * Fetches all aggregated data for the trims analytics dashboard.
   * @returns {Promise<object>}
   */
    getAnalyticsData: () => api.get('/admin/trims/analytics'),
    getItems: () => api.get('trims/items'),
    createItem: (data) => api.post('trims/items', data),
    updateItem: (id, data) => api.put(`trims/items/${id}`, data),
    deleteItem: (id) => api.delete(`trims/items/${id}`),

    getVariants: (itemId) => api.get(`trims/variants/item/${itemId}`),
    createVariant: (data) => api.post('trims/variants', data),
    updateVariant: (id, data) => api.put(`trims/variants/${id}`, data),
    deleteVariant: (id) => api.delete(`trims/variants/${id}`),

    getSubstitutes: (variantId) => api.get(`trims/substitutes/variant/${variantId}`),
    createSubstitute: (data) => api.post('trims/substitutes', data),
    deleteSubstitute: (id) => api.delete(`trims/substitutes/${id}`),
    
    // For dropdowns
    getColors: () => api.get('shared/fabric_color'),
    getAllVariants: () => api.get('trims/variants-detailed'),

    // Export inventory data
    exportInventory: () => api.get('trims/export'),
    bulkUpdateInventory: (data) => api.post('/trims/bulk-update', data),

    // Manual sync: fills missing (trim_item × fabric_color) variants.
    // Empty body = whole matrix; pass { trim_item_id } and/or { fabric_color_id } to scope.
    syncVariants: (body = {}) => api.post('/trims/variants/sync', body),

    // Substitute clusters — per-trim apply / unapply (factory_admin only)
    clustersOnTrim:  (trimId)                       => api.get(`/admin/trim-items/${trimId}/clusters`),
    applyCluster:    (trimId, clusterId, body = {}) => api.post(`/admin/trim-items/${trimId}/apply-cluster/${clusterId}`, body),
    unapplyCluster:  (trimId, clusterId)            => api.delete(`/admin/trim-items/${trimId}/cluster/${clusterId}`),

    // Stock ledger — per-variant or for every variant of a trim item.
    // Supports source_kind / limit / offset query params.
    getVariantStockLedger: (variantId, params = {}) =>
        api.get(`/trims/variants/${variantId}/stock-ledger`, { params }),
    getItemStockLedger: (itemId, params = {}) =>
        api.get(`/trims/items/${itemId}/stock-ledger`, { params }),
};
