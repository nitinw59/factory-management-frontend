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

    // Trim substitute clusters (factory_admin only)
    trimClusters: {
        list:       (includeInactive = false) => api.get('/admin/trim-clusters', { params: { include_inactive: includeInactive } }),
        get:        (id) => api.get(`/admin/trim-clusters/${id}`),
        create:     (body) => api.post('/admin/trim-clusters', body),
        update:     (id, body) => api.put(`/admin/trim-clusters/${id}`, body),
        remove:     (id) => api.delete(`/admin/trim-clusters/${id}`),
        setMembers: (id, fabric_color_ids) => api.put(`/admin/trim-clusters/${id}/members`, { fabric_color_ids }),
    },
};
