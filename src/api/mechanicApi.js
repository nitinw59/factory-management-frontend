import api from '../utils/api';

export const mechanicApi = {
    /**
     * Fetches all tickets with status OPEN, IN_PROGRESS, or RESOLVED.
     * Used for the Mechanic Job Board.
     */
    getOpenComplaints: async () => {
        const response = await api.get('/assets/complaints/open');
        return response.data;
    },

    /**
     * Fetches the list of available spare parts for the "Add Spare" selector.
     */
    getAllSpares: async () => {
        const response = await api.get('/assets/spares');
        return response.data;
    },

    /**
     * Fetches previous maintenance logs for a specific complaint ID.
     */
    getComplaintHistory: async (complaintId) => {
        const response = await api.get(`/assets/complaints/${complaintId}/history`);
        return response.data;
    },

    /**
     * Submits the final maintenance log.
     * @param {object} data - { complaint_id, maintenance_type, description, labor_cost, sparesUsed, next_scheduled_date }
     */
    performMaintenance: async (data) => {
        const response = await api.post('/assets/maintenance/perform', data);
        return response.data;
    }
};