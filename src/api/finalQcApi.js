import api from '../utils/api';

// Pre-dispatch AQL inspection subsystem — see backend routes/finalQcRoutes.js.
export const finalQcApi = {
    createInspection: (data) => api.post('/final-qc/inspections', data),
    getInspections:   (params) => api.get('/final-qc/inspections', { params }),
    getInspection:    (id) => api.get(`/final-qc/inspections/${id}`),
    waiveInspection:  (id, notes) => api.patch(`/final-qc/inspections/${id}/waive`, { notes }),
    closeInspection:  (id, notes) => api.patch(`/final-qc/inspections/${id}/close`, { notes }),
    getGateStatus:    (batchId) => api.get(`/final-qc/gate/${batchId}`),
};
