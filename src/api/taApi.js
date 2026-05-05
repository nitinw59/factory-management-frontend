import api from '../utils/api';

export const taApi = {
    getFormData: ()                         => api.get('/ta/form-data'),

    // Timeline
    getTimeline:        (params)            => api.get('/ta/timeline', { params }),
    getTimelineItem:    (id)                => api.get(`/ta/timeline/${id}`),
    createTimelineItem: (data)              => api.post('/ta/timeline', data),
    updateTimelineItem: (id, data)          => api.put(`/ta/timeline/${id}`, data),
    deleteTimelineItem: (id)                => api.delete(`/ta/timeline/${id}`),

    // Procurement
    getProcurement:        (params)         => api.get('/ta/procurement', { params }),
    getProcurementEvent:   (id)             => api.get(`/ta/procurement/${id}`),
    createProcurementEvent:(data)           => api.post('/ta/procurement', data),
    updateProcurementEvent:(id, data)       => api.put(`/ta/procurement/${id}`, data),
    deleteProcurementEvent:(id)             => api.delete(`/ta/procurement/${id}`),

    // Messages
    getMessages: (entityType, entityId)     => api.get('/ta/messages', { params: { entity_type: entityType, entity_id: entityId } }),
    sendMessage: (formData)                 => api.post('/ta/messages', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    deleteMessage:(id)                      => api.delete(`/ta/messages/${id}`),
};
