import api from '../utils/api'; // Assuming you have a centralized api instance

export const workstationApi = {
  // --- Workstation Types ---
  getWorkstationTypesDetailed: () => api.get('/workstations/workstation-types-detailed'),
  getWorkstationTypesSimple: () => api.get('/workstations/workstation-types'),
  createWorkstationType: (data) => api.post('/workstations/workstation-types', data),
  updateWorkstationType: (id, data) => api.put(`/workstations/workstation-types/${id}`, data),
  deleteWorkstationType: (id) => api.delete(`/workstations/workstation-types/${id}`),

  // --- Workstations ---
  getWorkstationsDetailed: () => api.get('/workstations/workstations-detailed'),
  createWorkstation: (data) => api.post('/workstations/workstations', data),
  updateWorkstation: (id, data) => api.put(`/workstations/workstations/${id}`, data),
  deleteWorkstation: (id) => api.delete(`/workstations/workstations/${id}`),

  // --- Dropdowns ---
  getUsersForDropdown: () => api.get('/workstations/factory-users/dropdown'),
  getPortalsSimple: () => api.get('/shared/portals'),
};

