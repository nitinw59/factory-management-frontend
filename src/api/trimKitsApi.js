import api from '../utils/api';

// Trim kit custody flow (loader verify & sign). Roles enforced server-side:
// verify/sign = line_loader, factory_admin; read also store_manager, production_manager.
export const trimKitsApi = {
    getReadyKits: () => api.get('/trim-kits/ready'),
    getKitOrder: (orderId) => api.get(`/trim-kits/orders/${orderId}`),
    verifyKit: (orderId, data) => api.post(`/trim-kits/orders/${orderId}/verify`, data),
    getVerifications: (orderId) => api.get(`/trim-kits/orders/${orderId}/verifications`),

    // Exchanges — swap trims already in the loader's custody (wrong variant issued).
    // Store prepares (returns[] + optional issues[]); loader signs to execute.
    getExchanges: (orderId) => api.get(`/trim-kits/orders/${orderId}/exchanges`),
    createExchange: (orderId, data) => api.post(`/trim-kits/orders/${orderId}/exchanges`, data),
    signExchange: (exchangeId) => api.post(`/trim-kits/exchanges/${exchangeId}/sign`),
    cancelExchange: (exchangeId) => api.patch(`/trim-kits/exchanges/${exchangeId}/cancel`),

    // Picked-kit history — register of signed handovers (kit bills, exchange slips excluded).
    // Filters: order_id, production_batch_id, batch_code, issued_to_user_id, date_from, date_to, limit, offset.
    getKitHistory: (params) => api.get('/trim-kits/history', { params }),
    getKitHistoryDetail: (issueId) => api.get(`/trim-kits/history/${issueId}`),
};
