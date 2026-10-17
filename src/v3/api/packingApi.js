import api from '../../utils/api';

// Version 3.0 packing and dispatch — backend routes/v3/packingRoutes.js (/api/v3/packing).
export const packingApi = {
    permissions: () => api.get('/v3/packing/permissions'),
    orders: (params) => api.get('/v3/packing/orders', { params }),
    order: (orderId) => api.get(`/v3/packing/orders/${orderId}`),
    setTolerance: (orderId, pct) => api.put(`/v3/packing/orders/${orderId}/tolerance`, { ship_tolerance_pct: pct }),
    openCarton: (orderLineId) => api.post('/v3/packing/cartons', { order_line_id: orderLineId }),
    carton: (id) => api.get(`/v3/packing/cartons/${id}`),
    pack: (id, codes) => api.post(`/v3/packing/cartons/${id}/garments`, { codes }),
    unpack: (id, garmentId) => api.delete(`/v3/packing/cartons/${id}/garments/${garmentId}`),
    closeCarton: (id, body) => api.post(`/v3/packing/cartons/${id}/close`, body),
    reopenCarton: (id) => api.post(`/v3/packing/cartons/${id}/reopen`),
    removeCarton: (id) => api.delete(`/v3/packing/cartons/${id}`),
    dispatches: (params) => api.get('/v3/packing/dispatches', { params }),
    dispatch: (id) => api.get(`/v3/packing/dispatches/${id}`),
    createDispatch: (body) => api.post('/v3/packing/dispatches', body),
    updateDispatch: (id, body) => api.put(`/v3/packing/dispatches/${id}`, body),
    confirmDispatch: (id, overReason) => api.post(`/v3/packing/dispatches/${id}/dispatch`, { over_reason: overReason }),
    cancelDispatch: (id, reason) => api.post(`/v3/packing/dispatches/${id}/cancel`, { reason }),
};
