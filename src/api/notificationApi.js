import api from '../utils/api';

export const notificationApi = {
  getMyNotifications: (params = {}) =>
    api.get('shared/notifications/my-notifications', { params }),

  markAsRead: (notificationId) =>
    api.put(`shared/notifications/my-notifications/${notificationId}/mark-read`),

  markAllRead: () =>
    api.put('shared/notifications/mark-all-read'),

  getLogs: (params = {}) =>
    api.get('shared/notifications/logs', { params }),
};
