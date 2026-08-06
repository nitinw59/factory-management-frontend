import api from '../utils/api';

export const adminApi = {
    getAllLines: () => api.get('/admin/lines'),
    createLine: (lineData) => api.post('/admin/lines', lineData),
    updateLine: (id, lineData) => api.put(`/admin/lines/${id}`, lineData),

    // Company profile — singleton row + four optional images.
    // GET is open to all authenticated roles (store_manager, line_loader, purchase dept, etc.
    // fetch it for optional PDF letterhead branding); write operations remain factory_admin only.
    // skipSessionExpiry kept defensively so a future/edge-case 403 here can't log a user out.
    getCompanyProfile: () => api.get('/admin/company-profile', { skipSessionExpiry: true }),
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
