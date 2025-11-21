import api from '../utils/api';
export const assemblyPortalApi = {
    getMyQueue: () => api.get('/assembly-portal/assembly-operator/my-queue'),
    logAssemblyStatus: (statusData) => {
        return api.post('/assembly-portal/assembly-operator/log-status', statusData);
    },
    approveRepairedAssembly: (statusData) => api.post('/assembly-portal/assembly-operator/approve-repaired-pieces',statusData)

};  