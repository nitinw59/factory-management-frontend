import api from '../utils/api';

// Garment label printing (2.0): print queue, roll / single prints, voids,
// printer + print agent setup. Labels are printed by the print agent on the
// BarTender PC; a job is PRINTED only when the agent confirms it.
export const labelPrintingApi = {
    getPrinters: () => api.get('/label-printing/printers'),
    getBatchLabels: (batchId) => api.get(`/label-printing/batches/${batchId}`),
    getBatchGarments: (batchId) => api.get(`/label-printing/batches/${batchId}/garments`),
    getBatchSummaries: (batchIds) => api.get('/label-printing/batches/summary', { params: { ids: batchIds.join(',') } }),
    lookupGarment: (uid) => api.get('/label-printing/garments/lookup', { params: { uid } }),

    listJobs: (params) => api.get('/label-printing/jobs', { params }),
    getJob: (jobId) => api.get(`/label-printing/jobs/${jobId}`),
    printRoll: ({ batchId, rollId, printerId, reprint = false, reason }) =>
        api.post('/label-printing/jobs/roll', { batch_id: batchId, fabric_roll_id: rollId, printer_id: printerId || undefined, reprint, reason }),
    printSingle: ({ garmentUid, printerId, reason }) =>
        api.post('/label-printing/jobs/single', { garment_uid: garmentUid, printer_id: printerId || undefined, reason }),
    cancelJob: (jobId, reason) => api.post(`/label-printing/jobs/${jobId}/cancel`, { reason }),
    retryJob: (jobId, printerId) => api.post(`/label-printing/jobs/${jobId}/retry`, { printer_id: printerId || undefined }),
    voidRoll: ({ batchId, rollId, reason }) => api.post('/label-printing/rolls/void', { batch_id: batchId, fabric_roll_id: rollId, reason }),

    // Admin
    listAgents: () => api.get('/label-printing/admin/agents'),
    createAgent: (name) => api.post('/label-printing/admin/agents', { name }),
    updateAgent: (agentId, data) => api.put(`/label-printing/admin/agents/${agentId}`, data),
    newAgentToken: (agentId) => api.post(`/label-printing/admin/agents/${agentId}/token`),
    listAllPrinters: () => api.get('/label-printing/admin/printers'),
    createPrinter: (data) => api.post('/label-printing/admin/printers', data),
    updatePrinter: (printerId, data) => api.put(`/label-printing/admin/printers/${printerId}`, data),
};

export const LABEL_VIEW_ROLES = ['factory_admin', 'cutting_manager', 'cutting_operator', 'production_manager', 'store_manager'];
export const LABEL_PRINT_ROLES = ['factory_admin', 'cutting_manager', 'cutting_operator', 'production_manager'];
export const LABEL_VOID_ROLES = ['factory_admin', 'cutting_manager', 'production_manager'];
