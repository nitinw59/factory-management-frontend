import api from '../utils/api';

export const bugReportApi = {
    // 1. Reporter — file + view own reports
    /**
     * Files a new bug report. `formData` must be a FormData instance
     * (title, description, category, severity, page_url, user_agent,
     * app_version, screenshots[] — up to 5 files).
     */
    fileReport: (formData) => api.post('/bug-reports', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),

    getMine: (params = {}) => api.get('/bug-reports/mine', { params }),

    // 2. Detail — owner or admin
    getById: (id) => api.get(`/bug-reports/${id}`),

    // 3. Admin — triage
    getAll: (params = {}) => api.get('/bug-reports', { params }),

    /**
     * @param {Object} data - { status, priority, assigned_to_user_id, notes }
     */
    triage: (id, data) => api.patch(`/bug-reports/${id}`, data),
};
