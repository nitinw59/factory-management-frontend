import api from '../utils/api';

export const auditLogApi = {
  /**
   * Fetches the most recent audit logs.
   */
  getLogs: () => api.get('/admin/audit-logs'),
};
