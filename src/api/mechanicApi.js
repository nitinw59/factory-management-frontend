import api from '../utils/api';

export const mechanicApi = {
    
     reportBreakdown: (data) =>
        api.post('/complaints', data),

    getMyComplaints: () =>
        api.get('/complaints/my'),

    verifyRepair: (data) =>
        api.post('/complaints/verify', data),

    getOpenComplaints: () =>
        api.get('/complaints/open'),

    getComplaintHistory: (complaintId) =>
        api.get(`/complaints/${complaintId}/history`),

    // ================================
    // MECHANIC ACTIONS
    // ================================

    performMaintenance: (data) =>
        api.post('/maintenance/perform', data),
    


     getMyCompletedTasks: async () => {
        const response = await api.get('/maintenance/my-completed');
        return response.data;
    },
    // ================================
    // DIRECT MAINTENANCE LOGS
    // ================================

    addMaintenanceLog: (logData) =>
        api.post('/assets/maintenance', logData),

    deleteMaintenanceLog: (logId) =>
        api.delete(`/assets/maintenance/${logId}`),

  
    
    
    
    
   
    /**
     * Fetches the list of available spare parts for the "Add Spare" selector.
     */
    getAllSpares: async () => {
        const response = await api.get('/assets/spares');
        return response.data;
    },




   
    // getAssetHistoryByQR: async (qrId) => {
    //     const response = await api.get(`/assets/assets/by-qr/${qrId}`);
    //     return response.data;
    // }






};