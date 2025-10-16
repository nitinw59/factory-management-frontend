import api from '../utils/api';

export const preparationPortalApi = {
    /**
     * Fetches the queue of batches assigned to the current user's line.
     */
    getMyQueue: () => api.get('/preparation-portal/my-queue'),

    /**
     * Fetches the supporting pieces that need validation for a specific batch.
     * @param {string | number} batchId - The ID of the batch.
     */
    getPreparationDetails: (batchId) => api.get(`/preparation-portal/preparation-details/${batchId}`),

    /**
     * Marks a list of cut piece log IDs as 'PREPARED'.
     * @param {object} payload - The data to send.
     * @param {Array<string|number>} payload.cutPieceLogIds - An array of IDs to prepare.
     */
    preparePieces: (payload) => api.post('/preparation-portal/prepare-pieces', payload),
};
