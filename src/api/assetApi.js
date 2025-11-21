import api from '../utils/api'; // Assuming your api client is at this path

export const assetApi = {
    // --- Asset Types ---

    /**
     * Fetches all asset types (e.g., "Sewing Machine", "Cutting Table").
     */
    getAllAssetTypes: () => api.get('assets/assets/types'),

    /**
     * Creates a new asset type. (Admin only)
     * @param {object} typeData - { type_name, description }
     */
    createAssetType: (typeData) => api.post('assets/assets/types', typeData),

    // --- Assets ---

    /**
     * Fetches a list of all assets.
     */
    getAllAssets: () => api.get('assets/assets'),

    /**
     * Fetches a single, detailed asset record and its history by its unique QR ID.
     * @param {string} qrId - The asset_qr_id of the asset.
     */
    getAssetByQrId: (qrId) => api.get(`assets/assets/by-qr/${qrId}`),

    /**
     * Creates a new asset record.
     * @param {object} assetData - The complete asset data object from the form.
     */
    createAsset: (assetData) => api.post('assets/assets', assetData),

    /**
     * Updates an existing asset's details.
     * @param {string|number} assetId - The primary key (id) of the asset.
     * @param {object} assetData - The asset data to update.
     */
    updateAsset: (assetId, assetData) => api.put(`assets/assets/${assetId}`, assetData),

    /**
     * Decommissions an asset (soft delete).
     * @param {string|number} assetId - The primary key (id) of the asset.
     */
    decommissionAsset: (assetId) => api.delete(`assets/assets/${assetId}`),

    // --- Maintenance Log ---

    /**
     * Adds a new maintenance log entry for an asset.
     * @param {object} logData - The maintenance log details.
     */
    addMaintenanceLog: (logData) => api.post('assets/assets/maintenance', logData),

    /**
     * Deletes a specific maintenance log entry. (Admin only)
     * @param {string|number} logId - The primary key (id) of the log entry.
     */
    deleteMaintenanceLog: (logId) => api.delete(`assets/assets/maintenance/${logId}`),
};