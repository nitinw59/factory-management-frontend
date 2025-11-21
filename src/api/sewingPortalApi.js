import api from '../utils/api';

export const sewingPortalApi = {
    getMyQueue: () => api.get('/sewing-portal/sewing-part-operator/my-queue'),
    logSewingStatus: (statusData) => {
        console.log("Logging Sewing Status:", statusData);
        return api.post('/sewing-portal/sewing-part-operator/log-status', statusData);
    },
    approveRepairedPieces: (statusData) => api.post('/sewing-portal/sewing-part-operator/approve-repaired',statusData)

};
