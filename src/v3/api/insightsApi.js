import api from '../../utils/api';

// Version 3.0 production insights (read only) — backend routes/v3/insightsRoutes.js (/api/v3/insights).
export const insightsApi = {
    wip: () => api.get('/v3/insights/wip'),
    quality: (params) => api.get('/v3/insights/quality', { params }),
    costs: (params) => api.get('/v3/insights/cost', { params }),
    cost: (orderId) => api.get(`/v3/insights/cost/${orderId}`),
};
