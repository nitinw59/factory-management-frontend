import api from '../utils/api';

// Material Replacement requests — a checker (/universal-checker/dashboard)
// flags a piece from their own Pending Rework queue as needing a material
// replacement instead of a normal repair/re-reject; a cutting_manager
// (/initialization-portal) resolves it: REQUESTED -> ACCEPTED -> FULFILLED,
// with CANCELLED reachable from either open stage. See backend
// controllers/materialReplacementController.js.
export const materialReplacementApi = {
    // Checker-side (also used by a line manager — see resolveRequesterLineIds
    // on the backend; createRequests/getMyLineRequests work unchanged for both)
    createRequests: (data) => api.post('/material-replacement/requests', data),
    getMyLineRequests: (status = 'REQUESTED') => api.get('/material-replacement/requests/my-line', { params: { status } }),

    // Line-manager-side — flat pending-rework list across every line this
    // user manages (production_lines.line_manager_user_id), shaped to drop
    // straight into MaterialReplacementRequestModal's `pieces` prop.
    getMyLinePendingRework: () => api.get('/material-replacement/requests/pending-rework'),

    // Cutting-manager ("initialisation user") side
    getAllRequests: (status = 'REQUESTED') => api.get('/material-replacement/requests', { params: { status } }),
    acceptRequest: (id) => api.post(`/material-replacement/requests/${id}/accept`),
    fulfillRequest: (id) => api.post(`/material-replacement/requests/${id}/fulfill`),
    cancelRequest: (id) => api.post(`/material-replacement/requests/${id}/cancel`),
};
