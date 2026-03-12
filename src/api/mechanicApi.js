import api from '../utils/api';

export const mechanicApi = {
    reportBreakdown: (data) =>
        api.post('/mechanics/complaints', data),

    getMyComplaints: () =>
        api.get('/mechanics/complaints/my'),

    verifyRepair: (data) =>
        api.post('/mechanics/complaints/verify', data),

    getOpenComplaints: () =>
        api.get('/mechanics/complaints/open'),

    getComplaintHistory: (complaintId) =>
        api.get(`/mechanics/complaints/${complaintId}/history`),
    getAssetHistoryByQR: (qrCode) =>
        api.get(`/maintenance/assets/qr/${qrCode}/history`),


    // ================================
    // MECHANIC ACTIONS
    // ================================

    performMaintenance: (data) =>
        api.post('/mechanics/maintenance/perform', data),


    getMyCompletedTasks: async () => {
        const response = await api.get('/mechanics/maintenance/my-completed');
        return response.data;
    },
    // ================================
    // DIRECT MAINTENANCE LOGS
    // ================================

    addMaintenanceLog: (logData) =>
        api.post('/mechanics/maintenance', logData),

    deleteMaintenanceLog: (logId) =>
        api.delete(`/mechanics/maintenance/${logId}`),

    /**
     * Fetches the list of available spare parts for the "Add Spare" selector.
     */
    getAllSpares: async () => {
        const response = await api.get('/mechanics/spares');
        return response.data;
    },




   
    // getAssetHistoryByQR: async (qrId) => {
    //     const response = await api.get(`/assets/assets/by-qr/${qrId}`);
    //     return response.data;
    // }






};