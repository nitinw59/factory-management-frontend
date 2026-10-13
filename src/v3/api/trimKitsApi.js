import api from '../../utils/api';

// Version 3.0 trim kits (2.0's trim orders) — backend routes/v3/trimKitsRoutes.js (/api/v3/trim-kits).
export const trimKitsApi = {
    permissions: () => api.get('/v3/trim-kits/permissions'),
    list: (params) => api.get('/v3/trim-kits', { params }),
    orders: () => api.get('/v3/trim-kits/orders'),
    orderPicture: (orderId, kitId) => api.get(`/v3/trim-kits/orders/${orderId}`, { params: kitId ? { kit_id: kitId } : undefined }),
    lines: () => api.get('/v3/trim-kits/lines'),
    get: (id) => api.get(`/v3/trim-kits/${id}`),
    create: (data) => api.post('/v3/trim-kits', data),
    update: (id, data) => api.put(`/v3/trim-kits/${id}`, data),
    ready: (id) => api.post(`/v3/trim-kits/${id}/ready`),
    unready: (id) => api.post(`/v3/trim-kits/${id}/unready`),
    sendBack: (id, reason) => api.post(`/v3/trim-kits/${id}/send-back`, { reason }),
    sign: (id, data) => api.post(`/v3/trim-kits/${id}/sign`, data),
    close: (id, reason) => api.post(`/v3/trim-kits/${id}/close`, { reason }),
};
