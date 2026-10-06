import api from '../../utils/api';

// Version 3.0 admin for the shared masters (users, customers, sizes — 2.0 tables, the decided
// exception) — backend routes/v3/sharedMastersRoutes.js (/api/v3/admin). Factory admin only.
export const adminApi = {
    users: () => api.get('/v3/admin/users'),
    createUser: (data) => api.post('/v3/admin/users', data),
    updateUser: (id, data) => api.put(`/v3/admin/users/${id}`, data),
    deleteUser: (id) => api.delete(`/v3/admin/users/${id}`),
    customers: () => api.get('/v3/admin/customers'),
    saveCustomer: (id, data) => (id ? api.put(`/v3/admin/customers/${id}`, data) : api.post('/v3/admin/customers', data)),
    deleteCustomer: (id) => api.delete(`/v3/admin/customers/${id}`),
    sizes: () => api.get('/v3/admin/sizes'),
    sizeUsage: (id) => api.get(`/v3/admin/sizes/${id}/usage`),
    saveSize: (id, data) => (id ? api.put(`/v3/admin/sizes/${id}`, data) : api.post('/v3/admin/sizes', data)),
    deleteSize: (id) => api.delete(`/v3/admin/sizes/${id}`),
    log: (entity) => api.get('/v3/admin/shared-log', { params: { entity } }),
    // Extended: 2.0 masters through 2.0's own handlers (same rules), logged in 3.0.
    lines: () => api.get('/v3/admin/lines'),
    line: (id) => api.get(`/v3/admin/lines/${id}`),
    saveLine: (id, data) => (id ? api.put(`/v3/admin/lines/${id}`, data) : api.post('/v3/admin/lines', data)),
    deleteLine: (id) => api.delete(`/v3/admin/lines/${id}`),
    lineLayout: (id) => api.get(`/v3/admin/lines/${id}/layout`),
    saveLineLayout: (id, workstationIds) => api.put(`/v3/admin/lines/${id}/layout`, { workstationIds }),
    lineTypes: () => api.get('/v3/admin/line-types'),
    saveLineType: (id, data) => (id ? api.put(`/v3/admin/line-types/${id}`, data) : api.post('/v3/admin/line-types', data)),
    deleteLineType: (id) => api.delete(`/v3/admin/line-types/${id}`),
    portals: () => api.get('/v3/admin/portals'),
    workstationTypes: () => api.get('/v3/admin/workstation-types'),
    saveWorkstationType: (id, data) => (id ? api.put(`/v3/admin/workstation-types/${id}`, data) : api.post('/v3/admin/workstation-types', data)),
    deleteWorkstationType: (id) => api.delete(`/v3/admin/workstation-types/${id}`),
    workstations: () => api.get('/v3/admin/workstations'),
    workstationUsers: (id) => api.get(`/v3/admin/workstations/${id || 0}/users`),
    saveWorkstation: (id, data) => (id ? api.put(`/v3/admin/workstations/${id}`, data) : api.post('/v3/admin/workstations', data)),
    archiveWorkstation: (id) => api.delete(`/v3/admin/workstations/${id}`),
    defectCodes: () => api.get('/v3/admin/defect-codes'),
    saveDefectCode: (id, data) => (id ? api.put(`/v3/admin/defect-codes/${id}`, data) : api.post('/v3/admin/defect-codes', data)),
    deactivateDefectCode: (id) => api.delete(`/v3/admin/defect-codes/${id}`),
    lineTypeDefects: (lineTypeId) => api.get(`/v3/admin/line-types/${lineTypeId}/defect-codes`),
    setLineTypeDefects: (lineTypeId, defectCodeIds) => api.put(`/v3/admin/line-types/${lineTypeId}/defect-codes`, { defectCodeIds }),
    companyProfile: () => api.get('/v3/admin/company-profile'),
    saveCompanyProfile: (formData) => api.put('/v3/admin/company-profile', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    deleteCompanyImage: (kind) => api.delete(`/v3/admin/company-profile/image/${kind}`),
};

// 2.0 role names (same labels as 2.0 user management).
export const ROLE_LABELS = {
    factory_admin: 'Factory Admin', hr_manager: 'HR Manager', accountant: 'Accountant', production_manager: 'Production Manager',
    line_supervisor: 'Line Supervisor', line_loader: 'Line Loader', cutting_manager: 'Cutting Manager', cutting_operator: 'Cutting Operator',
    preparation_unloader: 'Preparation Unloader', sewing_part_operator: 'Sewing Part Operator', universal_checker: 'Universal Checker',
    garment_checker: 'Garment Checker', quality_manager: 'Quality Manager', numbering_user: 'Numbering User', validation_user: 'Validation User',
    store_manager: 'Store Manager', supplier: 'Supplier', dispatch_officer: 'Dispatch Officer', purchase_manager: 'Purchase Manager',
    fabric_store_manager: 'Fabric Store Manager', merchandiser: 'Merchandiser', sales_manager: 'Sales Manager', mechanic: 'Mechanic',
};
