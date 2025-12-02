import api from '../utils/api'; // Assuming your api client is at this path

export const assetApi = {
    // =========================================================================
    // 1. ASSETS & TYPES (Existing)
    // =========================================================================

    /**
     * Fetches all asset types (e.g., "Sewing Machine", "Cutting Table").
     */
    getAllAssetTypes: () => api.get('assets/assets/types'),

    /**
     * Creates a new asset type. (Admin only)
     * @param {object} typeData - { type_name, description }
     */
    createAssetType: (typeData) => api.post('assets/assets/types', typeData),

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

    // =========================================================================
    // 2. SPARE PARTS INVENTORY (Store Manager)
    // =========================================================================

    /**
     * Fetches all spare parts categories.
     */
    getSpareCategories: () => api.get('assets/spares/categories'),

    /**
     * Fetches the full list of spare parts with stock levels.
     */
    getAllSpares: () => api.get('assets/spares'),

    /**
     * Creates a new spare part definition.
     * @param {object} data - { name, part_number, category_id, min_threshold, ... }
     */
    createSparePart: (data) => api.post('assets/spares', data),

    /**
     * Updates stock (Restock) or details of a spare part.
     * @param {object} data - { spare_id, qty, new_unit_cost }
     */
    restockSparePart: (data) => api.post('assets/spares/restock', data),

    // =========================================================================
    // 3. COMPLAINTS & BREAKDOWNS (User/Operator)
    // =========================================================================

    /**
     * Reports a machine breakdown.
     * @param {object} data - { asset_qr_id, issue_description, priority }
     */
    reportBreakdown: (data) => api.post('assets/complaints', data),

    /**
     * Fetches complaints reported by the logged-in user.
     */
    getMyComplaints: () => api.get('assets/complaints/my'),

    /**
     * User verifies if the repair was successful.
     * @param {object} data - { complaint_id, is_satisfied, feedback_notes }
     */
    verifyRepair: (data) => api.post('assets/complaints/verify', data),

    // =========================================================================
    // 4. MAINTENANCE WORKFLOW (Mechanic)
    // =========================================================================

    /**
     * Fetches all OPEN or IN_PROGRESS complaints for mechanics to work on.
     */
    getOpenComplaints: () => api.get('assets/complaints/open'),

    /**
     * Fetches the history of maintenance attempts for a specific ticket.
     * @param {number} complaintId 
     */
    getComplaintHistory: (complaintId) => api.get(`assets/complaints/${complaintId}/history`),

    /**
     * Logs a maintenance action (Labor + Spares Used).
     * Replaces simple 'addMaintenanceLog' for breakdown workflows.
     * @param {object} data - { complaint_id, description, sparesUsed: [], ... }
     */
    performMaintenance: (data) => api.post('assets/maintenance/perform', data),

    // --- Legacy / Direct Maintenance Log (Optional) ---

    /**
     * Adds a simple maintenance log entry (e.g. for preventative maintenance without a complaint).
     * @param {object} logData - The maintenance log details.
     */
    addMaintenanceLog: (logData) => api.post('assets/assets/maintenance', logData),

    /**
     * Deletes a specific maintenance log entry. (Admin only)
     * @param {string|number} logId - The primary key (id) of the log entry.
     */
    deleteMaintenanceLog: (logId) => api.delete(`assets/assets/maintenance/${logId}`),
};