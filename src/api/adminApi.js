import api from '../utils/api';

export const adminApi = {
    getAllLines: () => api.get('/admin/lines'),
    createLine: (lineData) => api.post('/admin/lines', lineData),
    updateLine: (id, lineData) => api.put(`/admin/lines/${id}`, lineData)
};