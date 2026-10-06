import api from '../../utils/api';

// Version 3.0 order tracker (read only) — backend routes/v3/orderTrackerRoutes.js (/api/v3/tracker).
export const trackerApi = {
    orders: (params) => api.get('/v3/tracker/orders', { params }),
    order: (id) => api.get(`/v3/tracker/orders/${id}`),
    search: (q) => api.get('/v3/tracker/search', { params: { q } }),
};
