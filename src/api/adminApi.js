import api from '../utils/api';

export const adminApi = {
    getAllLines: () => api.get('/admin/lines'),
    createLine: (lineData) => api.post('/admin/lines', lineData),
    updateLine: (id, lineData) => api.put(`/admin/lines/${id}`, lineData),

    // Company profile (factory_admin only) — singleton row + four optional images
    getCompanyProfile: () => api.get('/admin/company-profile'),
    saveCompanyProfile: (formData) =>
        api.put('/admin/company-profile', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
    deleteCompanyProfileImage: (kind) =>
        api.delete(`/admin/company-profile/image/${kind}`),
};
