// Shared bits of the reconciliation pages (20 Oct 2026, phase 6). 21 Oct 2026: Outdated / Provisional, Indian dates.
export const KIND = { FABRIC: 'Fabric', STAGE: 'Production stage', TRIM: 'Trims' };
export const STATUS = {
    WAITING: ['Waiting for approval', 'bg-amber-50 text-amber-800 border-amber-300'],
    APPROVED: ['Approved', 'bg-emerald-50 text-emerald-800 border-emerald-300'],
    SENT_BACK: ['Sent back', 'bg-rose-50 text-rose-700 border-rose-300'],
};
export const fmt = (n, d = 3) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d }));
export const money = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
export const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const scopeOf = (r) => (r.kind === 'FABRIC' ? r.order_no : r.kind === 'STAGE' ? `#${r.floor_no} · ${r.stage}` : `${r.kit_no}${r.floor_no ? ` · #${r.floor_no}` : ''}`);
export function StatusChip({ r }) {
    // Outdated (21 Oct 2026): its figures no longer hold — whatever its approvals said.
    if (r.outdated_at) return <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-300" title={r.outdated_reason || ''}>Outdated — generate again</span>;
    const [label, cls] = STATUS[r.status] || [r.status, ''];
    const who = r.status === 'WAITING' ? (r.merch_status === 'PENDING' ? ' — merchandiser' : r.accounts_approval_required && !r.accounts_approved_at ? ' — accounts' : '') : '';
    return <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${cls}`}>{label}{who}{r.merch_status === 'AUTO' ? ' (within BOM)' : ''}</span>;
}
// Provisional: the figures will still change (batches being cut, fabric / pieces left out, over-cut waiting).
export const ProvisionalChip = ({ n }) => (n > 0 ? <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">Provisional</span> : null);
