import api from '../../utils/api';

// Version 3.0 trim orders and kits (26 Nov 2026, migration 90).
// Trim order (TO3/…) — one per cut batch, made when the batch is finalised: backend routes/v3/trimOrdersRoutes.js
// (/api/v3/trim-orders). Kit (TK3/…/####-n) — a bag the trim store prepares on the order, any number, several ready at
// once; a line loader counts and signs each kit (one TI slip + one TB bill): routes/v3/trimKitsRoutes.js (/api/v3/trim-kits).
export const trimKitsApi = {
    // samples (26 Nov 2026): a sample's kit is handed to sampling by the store; its trim order's lines can be changed
    handOver: (kitId, data) => api.post(`/v3/trim-kits/${kitId}/hand-over`, data),   // { received_by_name, note }
    sampleLines: (id, lines) => api.put(`/v3/trim-orders/${id}/lines`, { lines }),   // [{ id | trim_item_id, qty, reason }]
    permissions: () => api.get('/v3/trim-orders/permissions'),

    // trim orders
    list: (params) => api.get('/v3/trim-orders', { params }),
    lines: () => api.get('/v3/trim-orders/lines'),
    counts: () => api.get('/v3/trim-orders/counts'),   // the page's chip counts (26 Nov 2026)
    get: (id, params) => api.get(`/v3/trim-orders/${id}`, { params }),       // { except_kit } — the kit being edited counts as not there
    update: (id, data) => api.put(`/v3/trim-orders/${id}`, data),
    close: (id, reason) => api.post(`/v3/trim-orders/${id}/close`, { reason }),
    bomChangeSeen: (id, note) => api.post(`/v3/trim-orders/${id}/bom-change/seen`, { note }),
    pending: () => api.get('/v3/trim-orders/pending'),
    slips: (params) => api.get('/v3/trim-orders/slips', { params }),
    slip: (id) => api.get(`/v3/trim-orders/slips/${id}`),
    requestExtra: (id, data) => api.post(`/v3/trim-orders/${id}/extra`, data),   // { replaces_line_id, trim_item_id, qty, reason }
    extraRequests: (status) => api.get('/v3/trim-orders/extra-requests', { params: { status } }),
    approveExtra: (rid, note) => api.post(`/v3/trim-orders/extra-requests/${rid}/approve`, { note }),
    refuseExtra: (rid, reason) => api.post(`/v3/trim-orders/extra-requests/${rid}/refuse`, { reason }),
    withdrawExtra: (rid) => api.post(`/v3/trim-orders/extra-requests/${rid}/withdraw`),

    // kits — body { lines: [{ order_line_id, qty | units, reason?, note? }], labels_qty, production_line_id, stage_type_ids, notes, ready }
    kits: (params) => api.get('/v3/trim-kits', { params }),                  // { status, sent_back, trim_order_id, q }
    kit: (kitId) => api.get(`/v3/trim-kits/${kitId}`),
    createKit: (orderId, data) => api.post(`/v3/trim-orders/${orderId}/kits`, data),
    updateKit: (kitId, data) => api.put(`/v3/trim-kits/${kitId}`, data),
    kitReady: (kitId) => api.post(`/v3/trim-kits/${kitId}/ready`),
    kitUnready: (kitId) => api.post(`/v3/trim-kits/${kitId}/unready`),
    kitCancel: (kitId, reason) => api.post(`/v3/trim-kits/${kitId}/cancel`, { reason }),
    kitSendBack: (kitId, reason) => api.post(`/v3/trim-kits/${kitId}/send-back`, { reason }),
    kitSign: (kitId, data) => api.post(`/v3/trim-kits/${kitId}/sign`, data),
    // what the line loader rejected from a kit — back to the store (26 Nov 2026, migration 92)
    returns: (params) => api.get('/v3/trim-kits/returns', { params }),            // { status, trim_order_id, kit_id } → { rows, auto_confirm }
    confirmReturn: (rid, data) => api.post(`/v3/trim-kits/returns/${rid}/confirm`, data),   // { outcome: SHELF | WRITE_OFF, note }

    // garment barcode labels on the trim order (23 Oct 2026; printed through 2.0's print agent; the store manager prints)
    labels: (id) => api.get(`/v3/trim-orders/${id}/labels`),
    printLabels: (id, data) => api.post(`/v3/trim-orders/${id}/labels/print`, data),     // { printer_id, batch_roll_id?, reprint?, reason? }
    singleLabel: (id, data) => api.post(`/v3/trim-orders/${id}/labels/single`, data),    // { printer_id, garment_no, reason }
    voidLabels: (id, data) => api.post(`/v3/trim-orders/${id}/labels/void`, data),       // { batch_roll_id, reason }
    cancelLabelJob: (id, jobId, reason) => api.post(`/v3/trim-orders/${id}/labels/jobs/${jobId}/cancel`, { reason }),
    retryLabelJob: (id, jobId, data) => api.post(`/v3/trim-orders/${id}/labels/jobs/${jobId}/retry`, data || {}),
    labelsCsv: (id) => api.get(`/v3/trim-orders/${id}/labels/csv`, { responseType: 'blob' }),
};
