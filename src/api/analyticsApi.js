import api from '../utils/api';

export const analyticsApi = {
  getDashboardData: (filters = {}) => api.get('/admin/analytics', { params: filters }),
  getFilterData: () => api.get('/admin/analytics/filters'),
};

