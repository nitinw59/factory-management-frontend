import api from '../../utils/api';

// Version 3.0 order tracker (read only) — backend routes/v3/orderTrackerRoutes.js (/api/v3/tracker).
export const trackerApi = {
    orders: (params) => api.get('/v3/tracker/orders', { params }),
    order: (id) => api.get(`/v3/tracker/orders/${id}`),
    orderProduction: (id) => api.get(`/v3/tracker/orders/${id}/production`),   // batches × stages (27 Oct 2026)
    production: (params) => api.get('/v3/tracker/production', { params }),        // every order's stages (27 Oct 2026)
    search: (q) => api.get('/v3/tracker/search', { params: { q } }),
};
