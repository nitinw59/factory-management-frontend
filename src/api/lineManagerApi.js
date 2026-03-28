import api from '../utils/api';

// In lineManagerApi.js
export const lineManagerApi = {
    getMyLineStaffAndCosting: (date) => api.get(`/line-manager/my-line/staff/${date}`),
    logHourlyOutput: (data) => api.post('/line-manager/my-line/log-output', data),
    getOutputAnalytics: (date) => api.get(`/line-manager/my-line/output/analytics/${date}`),
    
};