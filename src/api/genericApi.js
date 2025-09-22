import api from '../utils/api';

export const genericApi = {
  getAll: (resource) => api.get(`/admin/${resource}`),
  create: (resource, data) => api.post(`/admin/${resource}`, data),
  update: (resource, id, data) => api.put(`/admin/${resource}/${id}`, data),
  delete: (resource, id) => api.delete(`/admin/${resource}/${id}`),
};