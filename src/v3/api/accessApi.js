import api from '../../utils/api';

// Version 3.0 personalised view and extra access — backend routes/v3/accessRoutes.js (/api/v3).
export const accessApi = {
    me: () => api.get('/v3/me'),
    users: () => api.get('/v3/access/users'),
    grants: () => api.get('/v3/access/grants'),
    grant: (data) => api.post('/v3/access/grants', data),
    revoke: (id, reason) => api.post(`/v3/access/grants/${id}/revoke`, { reason }),
};
