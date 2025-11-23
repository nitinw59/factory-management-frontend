// api/preparationPortalApi.js (or wherever your API file is located)
import api from '../utils/api';

export const preparationManagerApi = {
    /**
     * Fetches the queue of batches assigned to the current user's line.
     * Includes nested roll and piece preparation status.
     */
    getMyQueue: () => api.get('/preparation-manager/my-queue'),

    /**
     * Starts the overall batch preparation process (sets production_batch_progress to IN_PROGRESS).
     * @param {object} data - The data to send.
     * @param {number} data.batchId - The ID of the batch.
     * @param {number} data.cycleFlowId - The ID of the current cycle flow step.
     */
    startBatchPreparation: (data) => api.post('/preparation-manager/start-batch', data),

    /**
     * Starts the physical preparation work for a specific fabric roll within a batch.
     * Inserts/updates records in preparation_piece_log to 'IN_PROGRESS' for all supporting pieces of that roll.
     * @param {object} data - The data to send.
     * @param {number} data.batchId - The ID of the batch.
     * @param {number} data.rollId - The ID of the fabric roll.
     */
    startPreparationForPieces: (data) => api.post('/preparation-manager/start-roll-preparation', data),

    // --- New/Updated endpoint for marking pieces as COMPLETE ---
    /**
     * Marks a list of preparation piece log IDs as 'COMPLETED'. 
     * This is the final step in the preparation process.
     * NOTE: This endpoint still needs to be built on the backend!
     * @param {object} payload - The data to send.
     * @param {Array<number>} payload.preparationLogIds - An array of preparation_piece_log IDs to complete.
     */
    completePiecesPreparation: (payload) => api.post('/preparation-manager/complete-pieces', payload),

    // --- Deprecated Methods (Removed as per the new workflow) ---
    // getPreparationDetails: (batchId) => api.get(`/preparation-portal/preparation-details/${batchId}`),
    // preparePieces: (payload) => api.post('/preparation-portal/prepare-pieces', payload),
};