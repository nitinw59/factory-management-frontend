import api from '../utils/api';

export const customerApi = {
    getCustomers: () => api.get('/customer/customers'),
    createCustomer: (data) => api.post('/customer/customers', data),
    
    getSalesOrders: () => api.get('/customer/sales-orders'),
    getSalesOrderDetails: (id) => api.get(`/customer/sales-orders/${id}`),
    createSalesOrder: (data) => api.post('/customer/sales-orders', data),

    // Helpers for dropdowns
    getProducts: () => api.get('/product/products'), 
    getFabricTypes: () => api.get('/shared/fabric_type'),
    getFabricColors: () => api.get('/shared/fabric_color'),
};