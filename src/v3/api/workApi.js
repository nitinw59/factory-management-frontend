import api from '../../utils/api';

// Version 3.0 navigation helpers — backend routes/v3/workRoutes.js (/api/v3).
export const workApi = {
    myWork: () => api.get('/v3/my-work'),
    approvals: () => api.get('/v3/approvals'),
    orderSummary: (id) => api.get(`/v3/orders/${id}/summary`),
    search: (q) => api.get('/v3/search', { params: { q } }),
};
