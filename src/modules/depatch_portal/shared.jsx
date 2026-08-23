// Shared display/search helpers for the Dispatch Portal (depatch_portal). Kept
// here instead of duplicated per-file — StatusBadge previously had two
// slightly divergent copies (DispatchDashboardPage.jsx, BatchDispatchModal.jsx)
// and batch_id/batch_code display was inconsistent across every file in this
// module.

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
// Superset of every status value used across the portal's pages: dispatch
// status (OPEN/PARTIAL/CLOSED), sales-order status, and batch progress status.

const STATUS_CLS = {
    OPEN:        'bg-blue-100    text-blue-700    border-blue-200',
    PARTIAL:     'bg-amber-100   text-amber-700   border-amber-200',
    CLOSED:      'bg-emerald-100 text-emerald-700 border-emerald-200',
    SHIPPED:     'bg-indigo-100  text-indigo-700  border-indigo-200',
    IN_PROGRESS: 'bg-indigo-100  text-indigo-700  border-indigo-200',
    NOT_STARTED: 'bg-gray-100    text-gray-500    border-gray-200',
    PENDING:     'bg-yellow-50   text-yellow-700  border-yellow-200',
    COMPLETED:   'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export const humanizeStatus = (status) => status ? status.replace(/_/g, ' ').toLowerCase() : '';

export const StatusBadge = ({ status }) => (
    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${STATUS_CLS[status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
        {status?.replace(/_/g, ' ') ?? 'N/A'}
    </span>
);

// ─── BATCH IDENTIFIER ─────────────────────────────────────────────────────────
// batch_id (the real database id) is the primary identifier across this
// portal; batch_code stays visible as a secondary label right next to it,
// never hidden. Matches the convention already used in DispatchJobWorkPage.

const SIZE_CLS = {
    sm: 'text-xs',
    md: 'text-lg',
};

export const BatchIdentifier = ({ batchId, batchCode, size = 'sm', className = '' }) => (
    <span className={`font-black text-slate-800 ${SIZE_CLS[size] || SIZE_CLS.sm} ${className}`}>
        #{batchId ?? '—'}
        {batchCode && <span className="font-mono font-semibold text-slate-400"> · {batchCode}</span>}
    </span>
);

// Plain-string equivalent for contexts that can't render JSX (jsPDF text,
// modal title strings).
export const formatBatchIdentifier = (batchId, batchCode) =>
    batchCode ? `#${batchId ?? '—'} · ${batchCode}` : `#${batchId ?? '—'}`;

// ─── SEARCH ───────────────────────────────────────────────────────────────────
// One predicate for the nested batch shape returned by dispatchController's
// getDashboard (batch.product/purchase_order/sales_order/dispatch_summary) and
// (once extended) lineLoaderController's getDashboardData. Scans every header
// field a batch carries — code, id, index, product, PO, SO, buyer PO,
// customer, and both status fields (raw enum + humanized label, so typing
// "open" matches status === 'OPEN').
export const matchesBatchSearch = (batch, query) => {
    if (!query || !query.trim()) return true;
    const q  = query.trim().toLowerCase();
    const ds = batch.dispatch_summary || {};
    const so = batch.sales_order || {};
    const po = batch.purchase_order || {};
    const haystack = [
        batch.id,
        batch.batch_code,
        batch.batch_index != null ? `batch #${batch.batch_index}` : null,
        batch.product?.name,
        po.po_code,
        so.order_number,
        so.buyer_po_number,
        so.customer,
        ds.status, humanizeStatus(ds.status),
        so.status, humanizeStatus(so.status),
    ].filter(v => v != null).join(' ').toLowerCase();
    return haystack.includes(q);
};

// Job-work batches are flatter (no nested product/purchase_order/sales_order
// objects) and carry their own challans array instead of a dispatch_summary.
export const matchesJobWorkSearch = (batch, challans, query) => {
    if (!query || !query.trim()) return true;
    const q = query.trim().toLowerCase();
    const haystack = [
        batch.batch_id,
        batch.batch_code,
        batch.product_name,
        batch.po_code,
        batch.order_number,
        batch.buyer_po_number,
        batch.customer_name,
        batch.so_status, humanizeStatus(batch.so_status),
        ...(challans || []).flatMap(c => [c.challan_number, c.vendor_name, c.notes, c.status, humanizeStatus(c.status)]),
    ].filter(v => v != null).join(' ').toLowerCase();
    return haystack.includes(q);
};
