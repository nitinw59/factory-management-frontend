import api from '../utils/api'; // Your centralized axios/api instance

export const assemblyApi = {
    // 1. Core DNA Scanning & Validation
    /**
     * Fetches complete garment DNA (all linked components) and verifies 
     * if the batch is active on the user's current production line.
     * @param {string} garmentUid - The unique QR/Barcode serial of the garment.
     */
    getGarmentDetails: (garmentUid) => api.get(`/assembly-portal/garment/${garmentUid}`),

    /**
     * Finalizes the assembly check. Marks the garment status and logs 
     * defects for all child components if rejected/reworked.
     * @param {Object} data - { garmentId, status, defectCodeId }
     */
    processGarmentStatus: (data) => api.post('/assembly-portal/process-status', data),

    // 2. Queue & Work-in-Progress (WIP)
    /**
     * Fetches the list of batches currently "In Progress" on the assembly line.
     */
    getAssemblyQueue: () => api.get('/assembly-portal/queue'),

    /**
     * Fetches readiness statistics for a batch (how many garments have 
     * 100% of their components ready for assembly).
     */
    getBatchReadiness: (batchId) => api.get(`/assembly-portal/batch-readiness/${batchId}`),

    // 3. DNA History & Traceability
    /**
     * Fetches the history of which operators worked on which components 
     * of a specific assembled garment.
     */
    getGarmentHistory: (garmentId) => api.get(`/assembly-portal/garment-history/${garmentId}`),

    /**
     * Fetches all garments in a specific batch that are currently 
     * flagged as 'NEEDS_REWORK' or 'QC_REJECTED'.
     */
    getDefectiveGarments: (batchId) => api.get(`/assembly-portal/defective-garments/${batchId}`),

    // 4. Manual Overrides
    /**
     * Forces a batch handoff to the assembly line (Supervisor only).
     */
    forceBatchHandoff: (batchId) => api.post(`/assembly-portal/force-handoff`, { batchId }),

    getDefectCodes: () => api.get('/qc/defect-codes'),

    getMonitorData: () => api.get('/assembly-portal/monitor'),
    
    // This is the one the monitor page is looking for
    getGarmentTrace: (garmentId) => api.get(`/assembly-portal/garment-trace/${garmentId}`),

    getBatchGarments: (batchId) => api.get(`/assembly-portal/batch-garments/${batchId}`),
    getHistoricScans: () => api.get(`/assembly-portal/historic-scans`),
};