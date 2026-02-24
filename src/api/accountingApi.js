import api from '../utils/api';

export const accountingApi = {
  /**
   * Fetches dropdown options (Customers, Products, Fabrics, Colors)
   * for the Create Sales Order form.
   */
  getSalesOrderFormData: () => {
    return api.get('/accounting/sales-orders/form-data');
  },

  /**
   * Creates a new Sales Order.
   * Payload structure:
   * {
   * customerId: 1,
   * orderNumber: "SO-001",
   * deliveryDate: "2024-12-01",
   * items: [ { productId, fabricTypeId, colorId, quantity, sizeRatio } ]
   * }
   */
  createSalesOrder: (data) => {return api.post('/accounting/sales-orders', data);},

  /**
   * Fetches the list of all Sales Orders.
   */
  getAllSalesOrders: () => {return api.get('/accounting/sales-orders');},

  /**
   * (Optional) Fetch a single order by ID if you build an edit/view page later.
   */
  getSalesOrderById: (id) => {return api.get(`/accounting/sales-orders/${id}`);},

  getSalesOrderDetails: (orderId) => {return api.get(`/accounting/sales-orders/${orderId}`);},

  /**
   * (Optional) Update an existing Sales Order.
   * Payload structure would be the same as createSalesOrder.
   */
  updateSalesOrder: (id, data) => {return api.put(`/accounting/sales-orders/${id}`, data);},

  
  createPurchaseOrder: (data) => {return api.post('/accounting/purchase-orders', data);},

  getAllPurchaseOrders: () => {return api.get('/accounting/purchase-orders');},

  getPurchaseOrderById: (id) => {return api.get(`/accounting/purchase-orders/${id}`);},

  getPurchaseOrders: () => {return api.get('/accounting/purchase-orders');},

  updatePurchaseOrder: (id, data) => {return api.put(`/accounting/purchase-orders/${id}`, data);},  
  getPurchaseOrderDetails: (id) => api.get(`/accounting/purchase-orders/${id}`),
  deletePurchaseOrder: (id) => api.delete(`/accounting/purchase-orders/${id}`),
};