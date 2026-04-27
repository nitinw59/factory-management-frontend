import api from '../utils/api';

export const planningApi = {
    getFormData:      ()              => api.get('/planning/form-data'),
    getOrderDetail:   (orderId)       => api.get(`/planning/sales-orders/${orderId}`),
    linkBom:          (sopId, bomId)  => api.post(`/planning/sales-order-products/${sopId}/link-bom`, { bom_id: bomId }),
    unlinkBom:        (sopId)         => api.delete(`/planning/sales-order-products/${sopId}/bom`),
    getRequirements:  (orderId)       => api.get(`/planning/sales-orders/${orderId}/requirements`),
};
