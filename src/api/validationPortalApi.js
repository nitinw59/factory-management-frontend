import api from '../utils/api';

export const validationPortalApi = {
    /**
     * Fetches the queue of batches assigned to the current user's line.
     */
    getMyQueue: () => api.get('/validation-portal/my-queue'),

    /**
     * Fetches the supporting pieces that need validation for a specific batch.
     * @param {string | number} batchId - The ID of the batch.
     */
    getValidationDetails: (batchId) => api.get(`/validation-portal/validation-details/${batchId}`),

    /**
     * Marks a list of cut piece log IDs as 'VALIDATED'.
     * @param {object} payload - The data to send.
     * @param {Array<string|number>} payload.cutPieceLogIds - An array of IDs to validate.
     */
    validatePieces: (payload) => api.post('/validation-portal/validate-pieces', payload),
};
