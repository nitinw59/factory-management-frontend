import api from '../utils/api'; // Assuming you have a centralized api instance

export const numberingCheckerApi = {
    getMyQueue: () => api.get('/numbering-checker/my-queue'),
    logNumberingCheck: (validationData) => api.post('/numbering-checker/log-check', validationData),
    checkAndCompleteStages: (data) => api.post('/numbering-checker/check-completion', data),
};
