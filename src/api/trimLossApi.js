import api from '../utils/api';

// Trim Loss (lost trim) exception — cases, debit notes, replacement.
// Base: /api/trim-loss. Roles enforced server-side (see FE brief Part 2, line 119):
//   reporters = line_loader, line_supervisor, line_manager, production_manager, factory_admin
//   pm = production_manager, factory_admin;  hr = hr_manager, factory_admin
//   second-approvers = factory_admin, purchase_manager;  readers = all + store_manager, accountant
export const trimLossApi = {
    // ── Registers + case detail ──
    getCases: (params) => api.get('/trim-loss/cases', { params }),
    getCase: (id) => api.get(`/trim-loss/cases/${id}`),
    getNearMisses: (params) => api.get('/trim-loss/cases/near-misses', { params }),

    // ── Report + search (reporters) ──
    reportCase: (data) => api.post('/trim-loss/cases', data),
    recordSearchOutcome: (id, data) => api.patch(`/trim-loss/cases/${id}/search-outcome`, data),

    // Role-filtered user lookup (e.g. the production manager to notify on WhatsApp).
    // Mirrors productionManagerApi.getLineManagers — factory_users carries the mobile column.
    getUsersByRole: (role) => api.get('/shared/factory_users', { params: { role } }),

    // ── PM investigation → debits → approval ──
    startInvestigation: (id, data) => api.patch(`/trim-loss/cases/${id}/start-investigation`, data),
    fixResponsibility: (id, data) => api.post(`/trim-loss/cases/${id}/fix-responsibility`, data),
    approveDebits: (id) => api.patch(`/trim-loss/cases/${id}/approve-debits`),
    closeCase: (id, data) => api.patch(`/trim-loss/cases/${id}/close`, data),
    cancelCase: (id, data) => api.patch(`/trim-loss/cases/${id}/cancel`, data),

    // ── Replacement (parallel track) ──
    issueFromStock: (id, data) => api.post(`/trim-loss/cases/${id}/replacement/issue-from-stock`, data),
    requestPurchase: (id) => api.post(`/trim-loss/cases/${id}/replacement/request-purchase`),
    approvePurchase: (id) => api.post(`/trim-loss/cases/${id}/replacement/approve-purchase`),

    // ── HR salary recovery ──
    getDebitNotes: (params) => api.get('/trim-loss/debit-notes', { params }),
    confirmRecovery: (noteId, data) => api.patch(`/trim-loss/debit-notes/${noteId}/confirm-recovery`, data),
};
