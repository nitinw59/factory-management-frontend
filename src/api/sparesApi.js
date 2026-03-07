import api from '../utils/api';

export const sparesApi = {
    // --- GLOBAL STORE METHODS ---
    getAllSpares: async () => {
        const response = await api.get('/spares/');
        return response.data;
    },
    getCategories: async () => {
        const response = await api.get('/spares/categories');
        return response.data;
    },
    createSparePart: async (data) => {
        const response = await api.post('/spares/', data);
        return response.data;
    },
    restockSparePart: async (data) => {
        const response = await api.post('/spares/restock', data);
        return response.data;
    },

    // --- NEW: USER / MECHANIC INVENTORY METHODS ---
    
    // Get the stock currently held by the logged-in user
    getMySpareInventory: async () => {
        const response = await api.get('/spares/my-inventory');
        return response.data;
    },
    // Submit a request to the store for parts/needles
    requestSpares: async (data) => {
        const response = await api.post('/spares/request', data);
        return response.data;
    },

    // --- NEW: STORE MANAGER ISSUANCE METHODS ---
    
    // View all pending requests from users
    getPendingRequests: async () => {
        const response = await api.get('/spares/requests');
        return response.data;
    },
    // Issue parts (moves stock from Main Store -> User Inventory)
    issueSpares: async (requestId, data) => {
        const response = await api.post(`/spares/requests/${requestId}/issue`, data);
        return response.data;
    }
};