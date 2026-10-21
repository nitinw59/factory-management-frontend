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

// Shipped → Closed (20 Oct 2026, phase 7) — backend routes/v3/orderCloseRoutes.js (/api/v3/order-close).
export const orderCloseApi = {
    get: (orderId) => api.get(`/v3/order-close/${orderId}`),
    shortClose: (orderId, lines, reason) => api.post(`/v3/order-close/${orderId}/short-close`, { lines, reason }),
    close: (orderId, body) => api.post(`/v3/order-close/${orderId}/close`, body),          // { note, confirm_warnings, outlet: { handed_by, note, lines } }
    forceClose: (orderId, body) => api.post(`/v3/order-close/${orderId}/force-close`, body), // { reason, note, outlet }
    acknowledge: (orderId, note) => api.post(`/v3/order-close/${orderId}/acknowledge`, { note }),
    reopen: (orderId, reason) => api.post(`/v3/order-close/${orderId}/reopen`, { reason }),
};
