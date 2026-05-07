import api from '../utils/api';

export const planningApi = {
    getFormData:              ()                 => api.get('/planning/form-data'),
    getOrderDetail:           (orderId)          => api.get(`/planning/sales-orders/${orderId}`),
    linkBom:                  (sopId, body)      => api.post(`/planning/sales-order-products/${sopId}/link-bom`, body),
    unlinkBom:                (sopId)            => api.delete(`/planning/sales-order-products/${sopId}/bom`),
    calculateRequirements:    (sopId)            => api.post(`/planning/sales-order-products/${sopId}/calculate-requirements`),
    getRecalculationPreview:  (sopId)            => api.get(`/planning/sales-order-products/${sopId}/recalculation-preview`),
    getRequirements:          (sopId)            => api.get(`/planning/sales-order-products/${sopId}/requirements`),
    // Fabric
    updateFabricRequirement:  (reqId, body)      => api.put(`/planning/fabric-requirements/${reqId}`, body),
    reserveFabric:            (reqId, body)      => api.post(`/planning/fabric-requirements/${reqId}/reservations`, body),
    deleteFabricReservation:  (reservationId)    => api.delete(`/planning/fabric-requirements/reservations/${reservationId}`),
    createFabricPurchase:     (reqId, body)      => api.post(`/planning/fabric-requirements/${reqId}/purchase`, body),
    deleteFabricPurchase:     (purchaseReqId)    => api.delete(`/planning/fabric-purchase-requirements/${purchaseReqId}`),
    // Trim
    updateTrimRequirement:    (reqId, body)      => api.put(`/planning/trim-requirements/${reqId}`, body),
    reserveTrim:              (reqId, body)      => api.post(`/planning/trim-requirements/${reqId}/reservations`, body),
    deleteTrimReservation:    (reservationId)    => api.delete(`/planning/trim-requirements/reservations/${reservationId}`),
    createTrimPurchase:       (reqId, body)      => api.post(`/planning/trim-requirements/${reqId}/purchase`, body),
    deleteTrimPurchase:       (purchaseReqId)    => api.delete(`/planning/trim-purchase-requirements/${purchaseReqId}`),
    updateProductionReadiness: (sopId, readiness) => api.patch(`/planning/sales-order-products/${sopId}/production-readiness`, { readiness }),
};
