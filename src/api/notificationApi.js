import api from '../utils/api';

export const notificationApi = {
  /**
   * Fetches the list of unread notifications for the logged-in user.
   * Corresponds to: GET /api/notifications
   */
  getUnread: () => api.get('shared/notifications/my-notifications'),

  /**
   * Marks a specific notification as read.
   * Corresponds to: PUT /api/notifications/:id/mark-read
   * @param {number | string} notificationId - The ID of the notification to update.
   */
  markAsRead: (notificationId) => api.put(`shared/notifications/my-notifications/${notificationId}/mark-read`, {}),
};
