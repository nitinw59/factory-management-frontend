import api from '../utils/api';

export const genericApi = {
  getAll: (resource) => api.get(`/${resource}`),
  create: (resource, data) => api.post(`/${resource}`, data),
  update: (resource, id, data) => api.put(`/${resource}/${id}`, data),
  delete: (resource, id) => api.delete(`/${resource}/${id}`),
};