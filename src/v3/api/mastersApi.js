import api from '../../utils/api';

// Version 3.0 masters — backend routes/v3/mastersRoutes.js (/api/v3/masters).
const base = '/v3/masters';

export const mastersApi = {
    permissions: () => api.get(`${base}/permissions`),

    toneGroups: () => api.get(`${base}/tone-groups`),
    createToneGroup: (data) => api.post(`${base}/tone-groups`, data),
    updateToneGroup: (id, data) => api.put(`${base}/tone-groups/${id}`, data),

    garmentColours: (params) => api.get(`${base}/garment-colours`, { params }),
    createGarmentColour: (data) => api.post(`${base}/garment-colours`, data),
    updateGarmentColour: (id, data) => api.put(`${base}/garment-colours/${id}`, data),
    setGarmentColourTone: (id, toneGroupId) => api.put(`${base}/garment-colours/${id}/tone`, { tone_group_id: toneGroupId }),

    trimTypes: () => api.get(`${base}/trim-types`),
    createTrimType: (data) => api.post(`${base}/trim-types`, data),
    updateTrimType: (id, data) => api.put(`${base}/trim-types/${id}`, data),

    trimItems: (params) => api.get(`${base}/trim-items`, { params }),
    createTrimItem: (data) => api.post(`${base}/trim-items`, data),
    updateTrimItem: (id, data) => api.put(`${base}/trim-items/${id}`, data),
    trimItemLedger: (id) => api.get(`${base}/trim-items/${id}/ledger`),

    postOpeningStock: (lines, note) => api.post(`${base}/trim-stock/opening`, { lines, note }),
    postAdjustment: (data) => api.post(`${base}/trim-stock/adjustment`, data),

    fabricItems: (params) => api.get(`${base}/fabric-items`, { params }),
    createFabricItem: (data) => api.post(`${base}/fabric-items`, data),
    updateFabricItem: (id, data) => api.put(`${base}/fabric-items/${id}`, data),
};

export const apiError = (err, fallback = 'Something went wrong.') =>
    err?.response?.data?.error || err?.response?.data?.message || fallback;
