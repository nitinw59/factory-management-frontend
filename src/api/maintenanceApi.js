import api from '../utils/api';

export const maintenanceApi = {

    // ================================
    // PREVENTIVE MAINTENANCE
    // ================================

    getPMTemplates: () =>
        api.get('/maintenance/templates'),

    createPMTemplate: (data) =>
        api.post('/maintenance/templates', data),
    updatePMTemplate: (data) =>
        api.put(`/maintenance/templates/${data.id}`, data),

    createPMSchedule: (data) =>
        api.post('/assets/pm-schedules', data),

    // ✅ NEW: Scheduling Dashboard Endpoints
    getUpcomingTasks: () => 
        api.get('/maintenance/upcoming-tasks'),
        
    getAssetsForBulk: () => 
        api.get('/maintenance/assets-for-bulk'),

    bulkSchedule: (data) => 
        api.post('/maintenance/bulk-schedule', data),


     // ================================
    // ANALYTICS
    // ================================

    getAdminAnalytics: () =>
        api.get('/maintenance/analytics/admin'),
    getUserAnalytics: () =>
        api.get('/maintenance/analytics/user'),

    // ================================
    // COMPLAINTS / BREAKDOWNS
    // ================================

   

};