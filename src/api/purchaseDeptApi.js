import api from '../utils/api';

export const purchaseDeptApi = {
    getRequirements: (params) => api.get('/purchase-department/requirements', { params }),
    raiseRequirement: (data) => api.post('/purchase-department/requirements', data),

    getOrders: (params) => api.get('/purchase-department/orders', { params }),
    createOrder: (data) => api.post('/purchase-department/orders', data),
    updateOrderStatus: (id, status) => api.patch(`/purchase-department/orders/${id}/status`, { status }),
};
