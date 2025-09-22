import api from '../utils/api';

export const trimsApi = {
  /**
   * Fetches all aggregated data for the trims analytics dashboard.
   * @returns {Promise<object>}
   */
  getAnalyticsData: () => api.get('/admin/trims/analytics'),
};
