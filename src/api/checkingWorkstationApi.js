import api from '../utils/api'; // Assuming your central axios instance is at '../utils/api'

export const checkingWorkstationApi = {
    /**
     * Gets the queue of batches assigned to the logged-in checking user.
     */
    getMyQueue: () => api.get('/checking-workstation/my-queue'),

    /**
     * Gets the details for a specific roll within a batch for the validation form.
     * @param {string|number} batchId - The ID of the batch.
     * @param {string|number} rollId - The ID of the fabric roll.
     */
    getRollCutDetails: (batchId, rollId) => api.get(`/checking-workstation/batch/${batchId}/roll/${rollId}/details`),

    /**
     * Submits the validation data for a specific roll.
     * @param {object} data - The payload containing batchId, rollId, and validatedPieces array.
     */
   logUnloadProgress: (validationData) => api.post('/checking-workstation/log-unload', validationData),

    // New function to trigger the completion check
    checkAndCompleteStages: (data) => api.post('/checking-workstation/check-completion', data),
};