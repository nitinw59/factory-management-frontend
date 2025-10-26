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
};
