import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Loader2, Search, X, FileText, CheckCircle2, XCircle,
    Clock, Package, Scissors, Wrench, Tag, ExternalLink,
    AlertTriangle, Inbox, Plus, User, ChevronDown, Pencil, RefreshCw,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { useAuth } from '../../context/AuthContext';
import { IMAGE_BASE_URL } from '../../utils/api';
import { storeManagerApi } from '../../api/storeManagerApi';
import StandaloneInwardModal from './StandaloneInwardModal';
import InwardCreateModal from './InwardCreateModal';
import InwardReviewModal from './InwardReviewModal';
import { uomLabel, describeEditBlock, seedSnapshotFromInward } from './inwardShared';

// The staged re-approval backend described in
// docs/purchase-department/edit-inward-backend-spec.md has shipped (verified
// against factory-management-backend's updateInward/approveInward/rejectInward
// — PENDING_UPDATE status, purchase_inward_pending_edits staging, consumption
// guard) — editing an already-APPROVED inward is safe to enable.
const EDIT_APPROVED_INWARD_ENABLED = true;

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CHIPS = [
    { key: 'ALL',              label: 'All' },
    { key: 'PENDING_APPROVAL', label: 'Pending',      icon: Clock,        cls: 'text-amber-600' },
    { key: 'APPROVED',         label: 'Approved',     icon: CheckCircle2, cls: 'text-emerald-600' },
    { key: 'REJECTED',         label: 'Rejected',     icon: XCircle,      cls: 'text-rose-600' },
    // Not reachable until the backend spec ships (see EDIT_APPROVED_INWARD_ENABLED
    // above) — kept here so the filter is ready, not to imply it's live today.
    { key: 'PENDING_UPDATE',   label: 'Edit pending', icon: RefreshCw,    cls: 'text-blue-600' },
];

const STATUS_CFG = {
    PENDING_APPROVAL: { pill: 'bg-amber-100 text-amber-700 border-amber-200',   label: 'Pending' },
    APPROVED:         { pill: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Approved' },
    REJECTED:         { pill: 'bg-rose-100 text-rose-700 border-rose-200',      label: 'Rejected' },
    // Distinct from PENDING_APPROVAL on purpose — this is an approved record
    // with a staged edit awaiting re-approval, not a brand-new record.
    PENDING_UPDATE:   { pill: 'bg-blue-100 text-blue-700 border-blue-200',      label: 'Edit pending' },
};

const ITEM_TYPE_ICONS = {
    fabric: Package,
    trim:   Scissors,
    spare:  Wrench,
    other:  Tag,
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en', { dateStyle: 'medium' }) : '—';
// unit_price can carry up to 5 decimals (box-rate calculator) — cap this at
// 5dp too, not 2, or the amount display rounds away that precision. Floor of
// 2dp keeps a whole-rupee amount reading as currency.
const formatMoney = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 5 });

// ── Reject Modal ──────────────────────────────────────────────────────────────

function RejectModal({ inward, onConfirm, onClose }) {
    const [notes, setNotes] = useState('');
    const [busy,  setBusy]  = useState(false);
    const [err,   setErr]   = useState(null);

    const handleSubmit = async () => {
        if (!notes.trim()) { setErr('Rejection reason is required.'); return; }
        setBusy(true); setErr(null);
        try {
            await onConfirm(notes.trim());
        } catch (e) {
            setErr(e?.message || 'Reject failed.');
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={!busy ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reject Inward</p>
                        <h2 className="font-extrabold text-slate-800 text-base mt-0.5">
                            {inward.grn_number || `GRN #${inward.id}`}
                        </h2>
                    </div>
                    {!busy && <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={17} /></button>}
                </div>
                <div className="px-5 py-4 space-y-3">
                    {err && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                            {err}
                        </p>
                    )}
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                            Reason <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Describe why this inward is being rejected…"
                            disabled={busy}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-rose-400 resize-none"
                        />
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                    <button onClick={onClose} disabled={busy}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition">
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={busy || !notes.trim()}
                        className="flex items-center gap-1.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition">
                        {busy && <Loader2 size={13} className="animate-spin" />}
                        Reject
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Inward Detail Modal ───────────────────────────────────────────────────────

function InwardDetailModal({ inward, canApprove, canEditRow, onApprove, onReject, onEdit, onClose }) {
    const isPending      = inward.approval_status === 'PENDING_APPROVAL';
    const isApproved     = inward.approval_status === 'APPROVED';
    const isRejected     = inward.approval_status === 'REJECTED';
    const isPendingUpdate = inward.approval_status === 'PENDING_UPDATE';
    const [busyApprove, setBusyApprove] = useState(false);

    // Not reachable until the backend spec ships — see docs/purchase-department/
    // edit-inward-backend-spec.md §4. Fetched lazily only while viewing a
    // PENDING_UPDATE record so an approver isn't approving blind.
    const [pendingEdit,      setPendingEdit]      = useState(null);
    const [pendingEditErr,   setPendingEditErr]   = useState(null);
    const [pendingEditLoading, setPendingEditLoading] = useState(false);
    useEffect(() => {
        if (!isPendingUpdate) return;
        let cancelled = false;
        setPendingEditLoading(true);
        purchaseDeptApi.getPendingEdit(inward.id)
            .then(r => { if (!cancelled) setPendingEdit(r.data?.data ?? r.data ?? null); })
            .catch(e => { if (!cancelled) setPendingEditErr(e?.response?.data?.error || 'Could not load the proposed changes.'); })
            .finally(() => { if (!cancelled) setPendingEditLoading(false); });
        return () => { cancelled = true; };
    }, [isPendingUpdate, inward.id]);

    const scanUrl = useMemo(() => {
        const url = inward.scan_url;
        if (!url) return null;
        return url.startsWith('http') ? url : `${IMAGE_BASE_URL.replace(/\/uploads$/, '')}${url}`;
    }, [inward]);

    const resolvedRows = useMemo(() => (inward.items || []).map((it, idx) => {
        const type = it.item_type || 'trim';
        let name = '—', details = '';
        if (type === 'fabric') {
            name = it.fabric_type_name || 'Fabric';
            const p = [];
            if (it.fabric_color_number) p.push(it.fabric_color_number);
            if (it.fabric_color_name)   p.push(it.fabric_color_name);
            details = p.join(' · ');
        } else if (type === 'trim') {
            name = it.trim_item_name || 'Trim';
            const p = [];
            if (it.variant_color_number) p.push(it.variant_color_number);
            if (it.variant_color_name)   p.push(it.variant_color_name);
            if (it.variant_size)         p.push(`Sz ${it.variant_size}`);
            details = p.join(' · ');
        } else if (type === 'spare') {
            name = it.spare_part_name || `Spare #${it.spare_part_id}`;
            details = it.spare_part_number || '';
        } else {
            name = it.general_item_name
                ? `${it.general_item_name}${it.general_item_code ? ` (${it.general_item_code})` : ''}`
                : (it.description || 'Other item');
            details = it.uom || it.general_item_uom || '';
        }
        // For PENDING fabric items, show pending_rolls instead of real rolls
        const rolls = (type === 'fabric' && isPending) ? (it.pending_rolls || []) : (it.rolls || []);
        let unit = it.uom || 'pcs';
        if (type === 'fabric') {
            const rollUoms = [...new Set(rolls.map(r => r.uom || 'meter'))];
            unit = rollUoms.length === 0 ? 'm' : rollUoms.length === 1 ? uomLabel(rollUoms[0]) : 'mixed';
        }
        const qty = parseFloat(it.qty_received || 0);
        const unitPrice = it.unit_price != null && it.unit_price !== '' ? Number(it.unit_price) : null;
        // Prefer a server-computed line total if present (rounding may not exactly
        // match qty × unit_price); fall back to computing it ourselves.
        const amount = it.total_price != null ? Number(it.total_price)
            : it.line_value != null ? Number(it.line_value)
            : (unitPrice != null ? qty * unitPrice : null);
        const boxes = it.boxes || [];
        return { key: `r${idx}`, type, name, details, qty, unit, rolls, boxes, unitPrice, amount };
    }), [inward, isPending]);

    const totalAmount = useMemo(
        () => resolvedRows.reduce((s, r) => s + (r.amount || 0), 0),
        [resolvedRows]
    );
    const missingPriceCount = resolvedRows.filter(r => r.amount == null).length;
    const invoiceTotal = inward.total_value != null ? Number(inward.total_value)
        : inward.invoice_value != null ? Number(inward.invoice_value)
        : totalAmount;

    const handleApprove = async () => {
        setBusyApprove(true);
        try { await onApprove(); }
        finally { setBusyApprove(false); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                            <FileText size={16} className="text-emerald-500" />
                            {inward.grn_number || `GRN #${inward.id}`}
                            {inward.sales_order_id == null && (
                                <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">CUSTOM</span>
                            )}
                        </h2>
                        {inward.po_code && (
                            <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">PO · {inward.po_code}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-0.5">
                            {fmtDate(inward.received_date)}
                            {inward.supplier_name && ` · ${inward.supplier_name}`}
                            {inward.created_by_name && ` · Recorded by ${inward.created_by_name}`}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
                    {/* Status banner */}
                    {isPending && (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-700 font-medium">
                            <Clock size={14} /> Pending purchase-manager approval
                        </div>
                    )}
                    {isApproved && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-700">
                            <span className="font-bold flex items-center gap-1.5"><CheckCircle2 size={14} /> Approved</span>
                            {inward.approved_by_name && (
                                <p className="text-xs text-emerald-600 mt-0.5">
                                    by {inward.approved_by_name}
                                    {inward.approved_at && ` · ${fmtDate(inward.approved_at)}`}
                                </p>
                            )}
                        </div>
                    )}
                    {isRejected && (
                        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-sm text-rose-700">
                            <span className="font-bold flex items-center gap-1.5"><XCircle size={14} /> Rejected</span>
                            {inward.approved_by_name && (
                                <p className="text-xs text-rose-600 mt-0.5">
                                    by {inward.approved_by_name}
                                    {inward.approved_at && ` · ${fmtDate(inward.approved_at)}`}
                                </p>
                            )}
                            {inward.rejection_notes && (
                                <p className="text-xs mt-1.5 font-medium text-rose-800 bg-rose-100 rounded-lg px-2 py-1.5 whitespace-pre-wrap">
                                    {inward.rejection_notes}
                                </p>
                            )}
                        </div>
                    )}
                    {isPendingUpdate && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700">
                            <span className="font-bold flex items-center gap-1.5"><RefreshCw size={14} /> Edit awaiting approval</span>
                            <p className="text-xs text-blue-600 mt-0.5">
                                The items and stock shown below are the original approved data — still live and unaffected until this edit is approved or rejected.
                            </p>
                            {pendingEditLoading && (
                                <p className="flex items-center gap-1.5 text-[11px] font-bold text-blue-500 mt-2"><Loader2 size={11} className="animate-spin" /> Loading proposed changes…</p>
                            )}
                            {pendingEditErr && <p className="text-[11px] text-blue-500 mt-2">{pendingEditErr}</p>}
                            {pendingEdit?.proposed_items?.length > 0 && (
                                <div className="mt-2 bg-white border border-blue-100 rounded-lg px-2.5 py-2 space-y-1">
                                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Proposed changes</p>
                                    <ul className="space-y-0.5">
                                        {pendingEdit.proposed_items.map((it, i) => (
                                            <li key={i} className="text-[11px] text-slate-600 font-mono">
                                                {it.item_type} · qty {it.qty_received}{it.unit_price ? ` · ₹${it.unit_price}` : ''}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {/* GRN meta — everything about this receipt in one glance */}
                    <div className="flex flex-wrap gap-1.5">
                        {inward.id != null && (
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-lg px-2 py-1">Inward #{inward.id}</span>
                        )}
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-lg px-2 py-1">Received {fmtDate(inward.received_date)}</span>
                        {inward.condition && (
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-lg px-2 py-1">Condition · {inward.condition}</span>
                        )}
                        {inward.supplier_name && (
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-lg px-2 py-1">Supplier · {inward.supplier_name}</span>
                        )}
                        {inward.created_by_name && (
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-lg px-2 py-1">Recorded by {inward.created_by_name}</span>
                        )}
                        {inward.po_code && (
                            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-2 py-1">PO · {inward.po_code}</span>
                        )}
                    </div>

                    {/* Items */}
                    <div className="space-y-1.5">
                        {resolvedRows.map(row => {
                            const Icon = ITEM_TYPE_ICONS[row.type] || Tag;
                            return (
                                <div key={row.key} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2">
                                    <Icon size={13} className="text-slate-400 mt-0.5 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-slate-800">{row.name}</p>
                                        {row.details && <p className="text-[11px] text-slate-500 mt-0.5">{row.details}</p>}
                                        {row.rolls.length > 0 && (
                                            <ul className="mt-1 text-[10px] text-slate-500 space-y-0.5">
                                                {row.rolls.map((r, i) => (
                                                    <li key={i} className="font-mono">
                                                        {r.bale_no || '—'} · {Number(r.meter).toLocaleString(undefined, { maximumFractionDigits: 2 })} {uomLabel(r.uom)}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {row.boxes.length > 0 && (
                                            <p className="mt-1 text-[10px] text-slate-500 font-mono">
                                                {row.boxes.map(b => `${b.box_count}×${b.qty_per_box}`).join(' + ')} boxes
                                            </p>
                                        )}
                                        {row.unitPrice != null && (
                                            <p className="text-[10px] text-slate-400 mt-0.5">₹{row.unitPrice.toLocaleString('en-IN', { maximumFractionDigits: 5 })} / {row.unit}</p>
                                        )}
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-sm font-bold text-emerald-700 tabular-nums">
                                            {row.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit}
                                        </p>
                                        {row.rolls.length > 0 && (
                                            <p className="text-[9px] text-slate-400">{row.rolls.length} roll{row.rolls.length !== 1 ? 's' : ''}</p>
                                        )}
                                        <p className="text-xs font-bold text-slate-700 tabular-nums mt-0.5">
                                            {row.amount != null ? `₹${formatMoney(row.amount)}` : <span className="font-normal text-slate-300">no price</span>}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Total invoice value */}
                    <div className="flex items-center justify-between bg-slate-800 text-white rounded-xl px-4 py-2.5">
                        <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-300">Total Invoice Value</p>
                            {missingPriceCount > 0 && (
                                <p className="text-[10px] text-amber-300 mt-0.5">{missingPriceCount} line{missingPriceCount === 1 ? '' : 's'} missing a price — total is incomplete</p>
                            )}
                        </div>
                        <p className="text-lg font-black tabular-nums">₹{formatMoney(invoiceTotal)}</p>
                    </div>

                    {inward.notes && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notes</p>
                            <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{inward.notes}</p>
                        </div>
                    )}

                    {scanUrl && (
                        <a href={scanUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 underline">
                            <ExternalLink size={12} /> View scan document
                        </a>
                    )}
                </div>

                {/* Footer — approve/reject, edit, or just close */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100">
                    {isPending && canApprove ? (
                        <>
                            <button
                                onClick={() => onReject()}
                                className="flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 px-3 py-1.5 rounded-lg transition"
                            >
                                <XCircle size={12} /> Reject
                            </button>
                            <div className="flex items-center gap-2">
                                {canEditRow && (
                                    <button onClick={onEdit} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-orange-600 border border-slate-200 hover:border-orange-200 px-3 py-1.5 rounded-lg transition">
                                        <Pencil size={12} /> Edit
                                    </button>
                                )}
                                <button onClick={onClose} className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition">
                                    Close
                                </button>
                                <button
                                    onClick={handleApprove}
                                    disabled={busyApprove}
                                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition"
                                >
                                    {busyApprove ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                    Approve
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-end gap-2 ml-auto">
                            {canEditRow && !isPendingUpdate && (isApproved ? EDIT_APPROVED_INWARD_ENABLED : true) && (
                                <button onClick={onEdit} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-orange-600 border border-slate-200 hover:border-orange-200 px-3 py-1.5 rounded-lg transition">
                                    <Pencil size={12} /> Edit
                                </button>
                            )}
                            <button onClick={onClose} className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition">
                                Close
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Item-type summary chip ────────────────────────────────────────────────────

function ItemSummaryChip({ items }) {
    const counts = useMemo(() => {
        const m = {};
        (items || []).forEach(it => {
            const t = it.item_type || 'other';
            m[t] = (m[t] || 0) + 1;
        });
        return m;
    }, [items]);
    const parts = ['fabric', 'trim', 'spare', 'other']
        .filter(t => counts[t])
        .map(t => `${counts[t]} ${t}`);
    if (!parts.length) return <span className="text-slate-400 text-xs">—</span>;
    return <span className="text-xs text-slate-600">{parts.join(' · ')}</span>;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, type }) {
    if (!msg) return null;
    return (
        <div className={`fixed top-4 right-4 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold ${
            type === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 text-white'
        }`}>
            {type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {msg}
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InwardsPage() {
    const { user } = useAuth();
    const canApprove = user?.role === 'purchase_manager' || user?.role === 'factory_admin';
    // Matches the backend's route guard on PATCH /inwards/:id — purchase_manager,
    // factory_admin, and store_manager can all edit any inward, no ownership
    // restriction (see docs/purchase-department/edit-inward-backend-spec.md §7).
    // Not per-row today, but kept as a function in case a restriction returns.
    const canEdit = useCallback(() => {
        if (!user) return false;
        return ['purchase_manager', 'factory_admin', 'store_manager'].includes(user.role);
    }, [user]);
    // Whether the Edit action is actually clickable for this row today — see
    // EDIT_APPROVED_INWARD_ENABLED above.
    const editIsLive = useCallback((row) =>
        canEdit(row) && row.approval_status !== 'PENDING_UPDATE' &&
        (row.approval_status !== 'APPROVED' || EDIT_APPROVED_INWARD_ENABLED),
    [canEdit]);

    const [searchParams, setSearchParams] = useSearchParams();

    // Filters — status from URL param for deep-link support
    const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'ALL');
    const [itemType,     setItemType]     = useState('');
    const [dateFrom,     setDateFrom]     = useState('');
    const [dateTo,       setDateTo]       = useState('');
    const [supplierId,   setSupplierId]   = useState('');
    const [q,            setQ]            = useState('');
    const debounceRef = useRef(null);

    // Data
    const [inwards,   setInwards]   = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [err,       setErr]       = useState(null);
    const [suppliers, setSuppliers] = useState([]);

    // UI state
    const [detail,      setDetail]      = useState(null);  // inward row being viewed
    const [rejectTarget, setRejectTarget] = useState(null); // inward row being rejected
    const [busyId,      setBusyId]      = useState(null);
    const [showCreate,  setShowCreate]  = useState(false);
    const [toast,       setToast]       = useState(null);

    // Edit-inward state — standalone/CUSTOM rows edit in-place via
    // StandaloneInwardModal; PO-linked rows route through the same
    // InwardCreateModal → InwardReviewModal pair the "against a PO" create
    // flow uses, prefilled from this row.
    const [editTarget, setEditTarget] = useState(null); // standalone inward row being edited, or null
    const [poEditCtx,  setPoEditCtx]  = useState(null); // { po, items, inwards, inward, snapshot, payload }
    const [poEditStep, setPoEditStep] = useState(null); // null | 'create' | 'review'
    const [poEditLoading, setPoEditLoading] = useState(false);

    const showToast = useCallback((msg, type = 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    }, []);

    // Load suppliers for filter dropdown
    useEffect(() => {
        storeManagerApi.getSuppliers()
            .then(r => setSuppliers(r.data?.data || r.data || []))
            .catch(() => {});
    }, []);

    const fetchInwards = useCallback(async () => {
        setLoading(true); setErr(null);
        const params = {};
        if (statusFilter !== 'ALL') params.approval_status = statusFilter;
        if (itemType)     params.item_type    = itemType;
        if (dateFrom)     params.date_from    = dateFrom;
        if (dateTo)       params.date_to      = dateTo;
        if (supplierId)   params.supplier_id  = supplierId;
        if (q.trim())     params.q            = q.trim();
        try {
            const res = await purchaseDeptApi.listAllInwards(params);
            setInwards(res.data?.data ?? res.data ?? []);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to load inwards.');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, itemType, dateFrom, dateTo, supplierId, q]);

    // Debounce q-driven refetch; immediate for everything else
    useEffect(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(fetchInwards, q ? 350 : 0);
        return () => clearTimeout(debounceRef.current);
    }, [fetchInwards, q]);

    const handleStatusChip = (key) => {
        setStatusFilter(key);
        if (key === 'ALL') setSearchParams({}, { replace: true });
        else               setSearchParams({ status: key }, { replace: true });
    };

    const handleApprove = useCallback(async (inward) => {
        const isEditApproval = inward.approval_status === 'PENDING_UPDATE';
        if (!window.confirm(isEditApproval
            ? `Approve the pending edit on ${inward.grn_number || `GRN #${inward.id}`}? The original stock will be reversed and the new items applied immediately.`
            : `Approve ${inward.grn_number || `GRN #${inward.id}`}? Stock will be applied immediately.`)) return;
        setBusyId(inward.id);
        try {
            const res = await purchaseDeptApi.approveInward(inward.id);
            // edit_outcome is server-driven (see docs/purchase-department/
            // edit-inward-backend-spec.md §4) — not live yet, so this falls
            // back to the plain "approved" copy against the current backend.
            const outcome = res?.data?.edit_outcome;
            showToast(outcome === 'edit_applied'
                ? `${inward.grn_number || 'Inward'} — edit approved, stock updated.`
                : `${inward.grn_number || 'Inward'} approved`, 'success');
            setDetail(null);
            fetchInwards();
        } catch (e) {
            if (e?.response?.status === 409 && e?.response?.data?.blocked_by) {
                const blocked = describeEditBlock(e.response.data.blocked_by, inward.items || []);
                showToast([e?.response?.data?.error, ...blocked].filter(Boolean).join(' '));
            } else if (e?.response?.status === 409) {
                showToast('Already actioned by someone else — refreshing.');
                setDetail(null);
                fetchInwards();
            } else {
                showToast(e?.response?.data?.error || 'Approve failed.');
            }
        } finally {
            setBusyId(null);
        }
    }, [fetchInwards, showToast]);

    const handleRejectConfirm = useCallback(async (notes) => {
        if (!rejectTarget) return;
        const isEditRejection = rejectTarget.approval_status === 'PENDING_UPDATE';
        const res = await purchaseDeptApi.rejectInward(rejectTarget.id, notes);
        const outcome = res?.data?.edit_outcome;
        showToast(outcome === 'edit_discarded' || isEditRejection
            ? `${rejectTarget.grn_number || 'Inward'} — edit rejected, original record unchanged.`
            : `${rejectTarget.grn_number || 'Inward'} rejected`, 'success');
        setRejectTarget(null);
        setDetail(null);
        fetchInwards();
    }, [rejectTarget, fetchInwards, showToast]);

    const handleRejectErr = useCallback((e) => {
        if (e?.response?.status === 409) {
            showToast('Already actioned by someone else — refreshing.');
            setRejectTarget(null);
            setDetail(null);
            fetchInwards();
        }
    }, [fetchInwards, showToast]);

    // Edit entry point — standalone/CUSTOM rows edit in-place; PO-linked rows
    // need the PO's item catalogue + other inwards loaded first, same as
    // StandaloneInwardModal.handleLoadPo does for the "against a PO" create flow.
    const openEdit = useCallback(async (row) => {
        if (row.po_code) {
            setPoEditLoading(true);
            try {
                const [poRes, iwRes] = await Promise.all([
                    purchaseDeptApi.getOrderById(row.purchase_order_id),
                    purchaseDeptApi.getInwards(row.purchase_order_id).catch(() => ({ data: [] })),
                ]);
                const po = poRes.data?.data ?? poRes.data;
                const otherInwards = iwRes.data?.data ?? iwRes.data ?? [];
                if (!po) throw new Error('Could not load the PO for this inward.');
                setPoEditCtx({
                    po, items: po.items || [], inwards: otherInwards, inward: row,
                    snapshot: seedSnapshotFromInward(row, po.items || []),
                    payload: null,
                });
                setPoEditStep('create');
            } catch (e) {
                showToast(e?.response?.data?.error || e.message || 'Failed to load PO for edit.');
            } finally {
                setPoEditLoading(false);
            }
        } else {
            setEditTarget(row);
        }
    }, [showToast]);

    return (
        <div className="p-4 sm:p-6 space-y-5">
            <Toast {...(toast || { msg: null, type: 'error' })} />

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Inbox size={20} className="text-orange-500" /> Inwards
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">History of all goods receipt notes and pending approvals</p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-xl shadow-sm transition shrink-0"
                >
                    <Plus size={14} /> Record Inward
                </button>
            </div>

            {/* Status chips */}
            <div className="flex flex-wrap gap-2">
                {STATUS_CHIPS.map(({ key, label, icon: Icon, cls }) => (
                    <button
                        key={key}
                        onClick={() => handleStatusChip(key)}
                        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition ${
                            statusFilter === key
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
                        }`}
                    >
                        {Icon && <Icon size={11} className={statusFilter === key ? '' : cls} />}
                        {label}
                    </button>
                ))}
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap gap-2">
                {/* Text search */}
                <div className="relative flex-1 min-w-48">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="GRN, PO, supplier…"
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-orange-400"
                    />
                    {q && (
                        <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X size={12} />
                        </button>
                    )}
                </div>

                {/* Item type */}
                <select
                    value={itemType}
                    onChange={e => setItemType(e.target.value)}
                    className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400 bg-white"
                >
                    <option value="">All types</option>
                    <option value="fabric">Fabric</option>
                    <option value="trim">Trim</option>
                    <option value="spare">Spare</option>
                    <option value="other">Other</option>
                </select>

                {/* Supplier */}
                {suppliers.length > 0 && (
                    <select
                        value={supplierId}
                        onChange={e => setSupplierId(e.target.value)}
                        className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400 bg-white max-w-48"
                    >
                        <option value="">All suppliers</option>
                        {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                )}

                {/* Date range */}
                <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    title="From date"
                    className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                />
                <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    title="To date"
                    className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                />

                {(itemType || dateFrom || dateTo || supplierId) && (
                    <button
                        onClick={() => { setItemType(''); setDateFrom(''); setDateTo(''); setSupplierId(''); }}
                        className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {err && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                    <AlertTriangle size={14} /> {err}
                </div>
            )}

            {/* Table */}
            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="animate-spin h-7 w-7 text-orange-400" />
                </div>
            ) : inwards.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                    <Inbox size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No inwards found</p>
                    <p className="text-sm mt-1">Try adjusting your filters or record a new inward</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    <th className="px-4 py-3 text-left">GRN #</th>
                                    <th className="px-4 py-3 text-left">PO</th>
                                    <th className="px-4 py-3 text-left">Supplier</th>
                                    <th className="px-4 py-3 text-left">Received</th>
                                    <th className="px-4 py-3 text-left">Items</th>
                                    <th className="px-4 py-3 text-left">Recorded by</th>
                                    <th className="px-4 py-3 text-left">Status</th>
                                    <th className="px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {inwards.map(row => {
                                    const scfg = STATUS_CFG[row.approval_status] || STATUS_CFG.PENDING_APPROVAL;
                                    // PENDING_UPDATE (edit awaiting re-approval) goes through the same
                                    // approve/reject actions as a first-time PENDING_APPROVAL row.
                                    const isPendingRow = row.approval_status === 'PENDING_APPROVAL' || row.approval_status === 'PENDING_UPDATE';
                                    const isRowBusy = busyId === row.id;
                                    return (
                                        <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                                            {/* GRN */}
                                            <td className="px-4 py-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                                                {row.grn_number || `#${row.id}`}
                                            </td>
                                            {/* PO */}
                                            <td className="px-4 py-3">
                                                {row.po_code ? (
                                                    <span className="font-mono text-xs font-bold text-orange-600">{row.po_code}</span>
                                                ) : (
                                                    <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">CUSTOM</span>
                                                )}
                                            </td>
                                            {/* Supplier */}
                                            <td className="px-4 py-3 text-slate-700 max-w-36 truncate" title={row.supplier_name}>
                                                {row.supplier_name || '—'}
                                            </td>
                                            {/* Received date */}
                                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                                                {fmtDate(row.received_date)}
                                            </td>
                                            {/* Item summary */}
                                            <td className="px-4 py-3">
                                                <ItemSummaryChip items={row.items} />
                                            </td>
                                            {/* Created by */}
                                            <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                                                <span className="flex items-center gap-1.5">
                                                    <User size={11} className="text-slate-400" />
                                                    {row.created_by_name || '—'}
                                                </span>
                                            </td>
                                            {/* Status */}
                                            <td className="px-4 py-3">
                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${scfg.pill}`}>
                                                    {scfg.label}
                                                </span>
                                            </td>
                                            {/* Actions */}
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        onClick={() => setDetail(row)}
                                                        className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-orange-600 border border-slate-200 hover:border-orange-200 px-2.5 py-1 rounded-lg transition"
                                                    >
                                                        <FileText size={11} /> Details
                                                    </button>
                                                    {canEdit(row) && (
                                                        <button
                                                            onClick={() => editIsLive(row) && openEdit(row)}
                                                            disabled={!editIsLive(row) || poEditLoading}
                                                            title={
                                                                row.approval_status === 'PENDING_UPDATE'
                                                                    ? 'An edit is already pending approval for this inward.'
                                                                    : (row.approval_status === 'APPROVED' && !EDIT_APPROVED_INWARD_ENABLED)
                                                                        ? "Editing an approved inward needs a backend update (staged re-approval) that hasn't shipped yet."
                                                                        : 'Edit this inward'
                                                            }
                                                            className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-orange-600 border border-slate-200 hover:border-orange-200 px-2.5 py-1 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-600 disabled:hover:border-slate-200"
                                                        >
                                                            <Pencil size={11} /> Edit
                                                        </button>
                                                    )}
                                                    {isPendingRow && canApprove && (
                                                        <>
                                                            <button
                                                                onClick={() => handleApprove(row)}
                                                                disabled={isRowBusy}
                                                                className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-white hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 px-2.5 py-1 rounded-lg transition disabled:opacity-40"
                                                            >
                                                                {isRowBusy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => setRejectTarget(row)}
                                                                disabled={isRowBusy}
                                                                className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 px-2.5 py-1 rounded-lg transition disabled:opacity-40"
                                                            >
                                                                <XCircle size={11} /> Reject
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modals */}
            {detail && (
                <InwardDetailModal
                    inward={detail}
                    canApprove={canApprove}
                    canEditRow={editIsLive(detail)}
                    onApprove={() => handleApprove(detail)}
                    onReject={() => { setRejectTarget(detail); }}
                    onEdit={() => { setDetail(null); openEdit(detail); }}
                    onClose={() => setDetail(null)}
                />
            )}

            {rejectTarget && (
                <RejectModal
                    inward={rejectTarget}
                    onConfirm={handleRejectConfirm}
                    onClose={() => setRejectTarget(null)}
                />
            )}

            {showCreate && (
                <StandaloneInwardModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); fetchInwards(); }}
                />
            )}

            {/* Edit — standalone/CUSTOM inward */}
            {editTarget && (
                <StandaloneInwardModal
                    inward={editTarget}
                    onClose={() => setEditTarget(null)}
                    onCreated={() => { setEditTarget(null); fetchInwards(); }}
                />
            )}

            {/* Edit — PO-linked inward: same InwardCreateModal → InwardReviewModal
                pair the "against a PO" create flow uses, prefilled from the row. */}
            {poEditStep === 'create' && poEditCtx && (
                <InwardCreateModal
                    poId={poEditCtx.po.id}
                    poCode={poEditCtx.po.po_code}
                    poIndex={poEditCtx.po.po_index}
                    poItems={poEditCtx.items}
                    supplierId={poEditCtx.po.supplier_id}
                    supplierName={poEditCtx.po.supplier_name}
                    allInwards={poEditCtx.inwards}
                    inward={poEditCtx.inward}
                    initialSnapshot={poEditCtx.snapshot}
                    onClose={() => { setPoEditStep(null); setPoEditCtx(null); }}
                    onBack={() => { setPoEditStep(null); setPoEditCtx(null); }}
                    onReview={({ payload, snapshot }) => {
                        setPoEditCtx(prev => ({ ...prev, payload, snapshot }));
                        setPoEditStep('review');
                    }}
                />
            )}
            {poEditStep === 'review' && poEditCtx?.payload && (
                <InwardReviewModal
                    poId={poEditCtx.po.id}
                    poCode={poEditCtx.po.po_code}
                    poIndex={poEditCtx.po.po_index}
                    payload={poEditCtx.payload}
                    poItems={poEditCtx.items}
                    supplierId={poEditCtx.po.supplier_id}
                    supplierName={poEditCtx.po.supplier_name}
                    inward={poEditCtx.inward}
                    onClose={() => { setPoEditStep(null); setPoEditCtx(null); }}
                    onBack={() => setPoEditStep('create')}
                    onConfirmed={() => { setPoEditStep(null); setPoEditCtx(null); fetchInwards(); }}
                />
            )}
        </div>
    );
}
