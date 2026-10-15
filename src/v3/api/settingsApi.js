import api from '../../utils/api';

// Version 3.0 Settings hub — backend routes/v3/settingsRoutes.js (/api/v3/settings).
export const settingsApi = {
    get: () => api.get('/v3/settings'),
    addresses: () => api.get('/v3/settings/addresses'),
    locations: (area) => api.get('/v3/settings/locations', { params: area ? { area } : undefined }),
    savePurchasing: (d) => api.put('/v3/settings/purchasing', d),
    savePlanning: (d) => api.put('/v3/settings/planning', d),
    saveDocument: (doc, d) => api.put(`/v3/settings/documents/${doc}`, d),
    saveCalendar: (weekly_off) => api.put('/v3/settings/calendar', { weekly_off }),
    addHoliday: (date, name) => api.post('/v3/settings/holidays', { date, name }),
    removeHoliday: (date) => api.delete(`/v3/settings/holidays/${date}`),
    saveExport: (d) => api.put('/v3/settings/export', d),
    saveAddress: (id, d) => (id ? api.put(`/v3/settings/addresses/${id}`, d) : api.post('/v3/settings/addresses', d)),
    saveContact: (id, d) => (id ? api.put(`/v3/settings/contacts/${id}`, d) : api.post('/v3/settings/contacts', d)),
    saveProduction: (d) => api.put('/v3/settings/production', d),
    saveStore: (d) => api.put('/v3/settings/store', d),
    saveLocation: (id, d) => (id ? api.put(`/v3/settings/locations/${id}`, d) : api.post('/v3/settings/locations', d)),
    saveAlerts: (d) => api.put('/v3/settings/alerts', d),
    testAlert: (to) => api.post('/v3/settings/alerts/test', { to }),
    runDaily: () => api.post('/v3/settings/alerts/run-daily'),
};
