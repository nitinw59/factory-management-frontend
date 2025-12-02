import api from '../utils/api';

export const sparesApi = {
    /**
     * Fetches all spare parts with current stock, cost, and category details.
     */
    getAllSpares: async () => {
        const response = await api.get('/assets/spares');
        return response.data;
    },

    /**
     * Fetches categories for the dropdown (e.g., Electrical, Mechanical).
     */
    getCategories: async () => {
        const response = await api.get('/assets/spares/categories');
        return response.data;
    },

    /**
     * Creates a new spare part definition in the system.
     * @param {object} data - { name, part_number, category_id, min_stock_threshold, unit_cost, location, current_stock }
     */
    createSparePart: async (data) => {
        const response = await api.post('/assets/spares', data);
        return response.data;
    },

    /**
     * Adds stock to an existing part and updates the weighted average cost.
     * @param {object} data - { spare_id, qty, new_unit_cost }
     */
    restockSparePart: async (data) => {
        const response = await api.post('/assets/spares/restock', data);
        return response.data;
    }
};