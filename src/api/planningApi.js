import api from '../utils/api';

export const planningApi = {
    getFormData:              ()                 => api.get('/planning/form-data'),
    getOrderDetail:           (orderId)          => api.get(`/planning/sales-orders/${orderId}`),
    linkBom:                  (sopId, body)      => api.post(`/planning/sales-order-products/${sopId}/link-bom`, body),
    unlinkBom:                (sopId)            => api.delete(`/planning/sales-order-products/${sopId}/bom`),
    getSuggestions:           (sopId)            => api.get(`/planning/sales-order-products/${sopId}/quantity-suggestions`),
    finalizeQuantities:       (sopId, body)      => api.post(`/planning/sales-order-products/${sopId}/finalize-quantities`, body),
    calculateRequirements:    (sopId)            => api.post(`/planning/sales-order-products/${sopId}/calculate-requirements`),
    getRecalculationPreview:  (sopId)            => api.get(`/planning/sales-order-products/${sopId}/recalculation-preview`),
    getRequirements:          (sopId)            => api.get(`/planning/sales-order-products/${sopId}/requirements`),
    // Fabric
    updateFabricRequirement:  (reqId, body)      => api.put(`/planning/fabric-requirements/${reqId}`, body),
    reserveFabric:            (reqId, body)      => api.post(`/planning/fabric-requirements/${reqId}/reservations`, body),
    deleteFabricReservation:  (reservationId)    => api.delete(`/planning/fabric-requirements/reservations/${reservationId}`),
    // Removed: createFabricPurchase / deleteFabricPurchase
    // Use purchaseDeptApi.raiseRequirement / cancelRequirement instead.
    // Trim
    updateTrimRequirement:    (reqId, body)      => api.put(`/planning/trim-requirements/${reqId}`, body),
    reserveTrim:              (reqId, body)      => api.post(`/planning/trim-requirements/${reqId}/reservations`, body),
    deleteTrimReservation:    (reservationId)    => api.delete(`/planning/trim-requirements/reservations/${reservationId}`),
    // Removed: createTrimPurchase / deleteTrimPurchase
    // Use purchaseDeptApi.raiseRequirement / cancelRequirement instead.
    updateProductionReadiness: (sopId, readiness) => api.patch(`/planning/sales-order-products/${sopId}/production-readiness`, { readiness }),
};
