import api from '../utils/api';

export const productApi = {
  /**
   * Fetches all data needed for the product creation form's dropdowns.
   */
  getFormData: () => api.get('/product/products/form-data'),

  /**
   * Fetches all products for the main list view, including nested materials.
   */
  getAll: () => api.get('/product/products'),

  /**
   * Creates a new product along with its required materials.
   * @param {object} productData - The complete product and materials data.
   */
  create: (productData) => api.post('/product/products', productData),

  /**
   * Updates an existing product and its materials list.
   * @param {string} id - The ID of the product.
   * @param {object} productData - The updated data.
   */
  update: (id, productData) => api.put(`/product/products/${id}`, productData),

  /**
   * Deletes a product and all its associated materials.
   * @param {string} id - The ID of the product to delete.
   */
  delete: (id) => api.delete(`/product/products/${id}`),
  getById: (id) => api.get(`/product/products/${id}`),
  
};

