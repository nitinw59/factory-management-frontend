import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    FileText, CheckCircle, XCircle, Clock, Archive, Search,
    ChevronDown, ChevronUp, ChevronRight, Loader2, RefreshCw,
    Check, AlertCircle, Scissors, Package, Eye, AlertTriangle,
    X, ThumbsUp, ThumbsDown, Layers, Tag,
} from 'lucide-react';
import { bomApi } from '../../api/bomApi';

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS = {
    PENDING_APPROVAL: {
        label: 'Pending Approval',
        short: 'Pending',
        icon: Clock,
        pill: 'bg-amber-100 text-amber-700 border-amber-200',
        border: 'border-l-amber-400',
        glow: 'ring-amber-200',
        dot: 'bg-amber-400',
    },
    APPROVED: {
        label: 'Approved',
        short: 'Approved',
        icon: CheckCircle,
        pill: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        border: 'border-l-emerald-400',
        glow: 'ring-emerald-200',
        dot: 'bg-emerald-400',
    },
    DRAFT: {
        label: 'Draft',
        short: 'Draft',
        icon: FileText,
        pill: 'bg-slate-100 text-slate-600 border-slate-200',
        border: 'border-l-slate-300',
        glow: 'ring-slate-200',
        dot: 'bg-slate-400',
    },
    REJECTED: {
        label: 'Rejected',
        short: 'Rejected',
        icon: XCircle,
        pill: 'bg-red-100 text-red-700 border-red-200',
        border: 'border-l-red-400',
        glow: 'ring-red-200',
        dot: 'bg-red-400',
    },
    ARCHIVED: {
        label: 'Archived',
        short: 'Archived',
        icon: Archive,
        pill: 'bg-gray-100 text-gray-500 border-gray-200',
        border: 'border-l-gray-300',
        glow: 'ring-gray-200',
        dot: 'bg-gray-400',
    },
};

const TABS = ['ALL', 'PENDING_APPROVAL', 'APPROVED', 'DRAFT', 'REJECTED', 'ARCHIVED'];

// ─── small helpers ────────────────────────────────────────────────────────────

const Spinner = ({ size = 20 }) => (
    <Loader2 size={size} className="animate-spin text-violet-500" />
);

const StatusPill = ({ status }) => {
    const cfg = STATUS[status] || { label: status, pill: 'bg-gray-100 text-gray-500 border-gray-200' };
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${cfg.pill}`}>
            {Icon && <Icon size={9} />}
            {cfg.label}
        </span>
    );
};

const Toast = ({ msg, ok, onDone }) => {
    useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
    return (
        <div className={`fixed top-4 right-4 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-bold border transition-all animate-in slide-in-from-right-4 ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
            {ok ? <Check size={15} /> : <AlertCircle size={15} />} {msg}
        </div>
    );
};

// ─── inline confirm bar ───────────────────────────────────────────────────────

const ConfirmBar = ({ message, confirmLabel, confirmColor, onConfirm, onCancel, busy }) => (
    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
            {message}
        </div>
        <div className="flex items-center gap-2 shrink-0">
            <button onClick={onCancel} disabled={busy}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                Cancel
            </button>
            <button onClick={onConfirm} disabled={busy}
                className={`flex items-center gap-1.5 text-xs font-bold text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${confirmColor}`}>
                {busy && <Loader2 size={11} className="animate-spin" />}
                {confirmLabel}
            </button>
        </div>
    </div>
);

// ─── inline reject form ───────────────────────────────────────────────────────

const RejectBar = ({ bomName, notes, onNotesChange, onConfirm, onCancel, busy }) => (
    <div className="space-y-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-1.5 text-sm font-bold text-red-700">
            <AlertTriangle size={13} className="shrink-0" />
            Reject &ldquo;{bomName}&rdquo; — reason required
        </div>
        <textarea
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="Explain what needs to be fixed…"
            rows={2}
            className="w-full border border-red-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-red-300 resize-none bg-white"
            autoFocus
        />
        <div className="flex items-center justify-end gap-2">
            <button onClick={onCancel} disabled={busy}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                Cancel
            </button>
            <button onClick={onConfirm} disabled={busy || !notes.trim()}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                {busy && <Loader2 size={11} className="animate-spin" />}
                <ThumbsDown size={11} /> Reject BOM
            </button>
        </div>
    </div>
);

// ─── ratio group detail ───────────────────────────────────────────────────────

const RatioGroupDetail = ({ rg, idx }) => (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2">
                <Scissors size={11} className="text-slate-400" />
                <span className="font-bold text-slate-700 text-xs">{rg.ratio_group_name || `Group ${idx + 1}`}</span>
            </div>
            <div className="flex items-center gap-2">
                {rg.total_pieces_in_marker > 0 && (
                    <span className="text-[9px] bg-violet-50 text-violet-600 border border-violet-100 px-1.5 py-0.5 rounded font-bold">
                        {rg.total_pieces_in_marker} pcs/marker
                    </span>
                )}
                {rg.marker_length_inches && (
                    <span className="text-[9px] text-slate-400 font-medium">{rg.marker_length_inches}" marker</span>
                )}
            </div>
        </div>
        <div className="p-2.5 space-y-2">
            {/* Size ratio chips */}
            {(rg.items || []).filter(it => it.size).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {(rg.items || []).filter(it => it.size).map((it, j) => (
                        <span key={j} className="bg-violet-50 text-violet-700 border border-violet-100 rounded px-2 py-0.5 text-[10px] font-bold">
                            {it.size}: {it.number_of_pieces} pcs
                        </span>
                    ))}
                </div>
            )}
            {/* Fabric chips */}
            {(rg.fabric_consumptions || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase self-center mr-1">Fabric</span>
                    {rg.fabric_consumptions.map((fc, j) => (
                        <span key={j} className="bg-sky-50 text-sky-700 border border-sky-100 rounded px-2 py-0.5 text-[10px] font-bold">
                            {fc.fabric_type_name || `Fabric #${fc.fabric_type_id}`}
                            {fc.consumption_inches ? `: ${fc.consumption_inches}"` : ''}
                        </span>
                    ))}
                </div>
            )}
        </div>
    </div>
);

// ─── expanded BOM detail ──────────────────────────────────────────────────────

const BomDetail = ({ bomId }) => {
    const [bom, setBom]         = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr]         = useState(null);
    const [history, setHistory]         = useState(null);
    const [historyLoading, setHistLoading] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        setLoading(true);
        bomApi.getById(bomId)
            .then(res => setBom(res.data?.data ?? res.data))
            .catch(e => setErr(e?.response?.data?.error || e.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, [bomId]);

    const loadHistory = () => {
        if (history !== null) { setShowHistory(h => !h); return; }
        setHistLoading(true);
        setShowHistory(true);
        bomApi.getHistory(bomId)
            .then(res => setHistory(res.data?.data ?? res.data ?? []))
            .catch(() => setHistory([]))
            .finally(() => setHistLoading(false));
    };

    if (loading) return <div className="flex justify-center py-6"><Spinner /></div>;
    if (err) return <p className="text-xs text-red-500 py-3">{err}</p>;
    if (!bom) return null;

    return (
        <div className="space-y-4">
            {/* Rejection reason banner */}
            {bom.status === 'REJECTED' && bom.rejection_notes && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                    <XCircle size={13} className="text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider mb-0.5">Rejection Reason</p>
                        <p className="text-xs text-red-700">{bom.rejection_notes}</p>
                    </div>
                </div>
            )}

            {/* Meta */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: 'Product',     val: bom.product?.name || '—' },
                    { label: 'Created by',  val: bom.created_by?.name || '—' },
                    { label: 'Approved by', val: bom.approved_by?.name || '—' },
                ].map(({ label, val }) => (
                    <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                        <p className="text-xs font-semibold text-slate-700">{val}</p>
                    </div>
                ))}
            </div>

            {/* Ratio groups */}
            {(bom.ratio_groups || []).length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Layers size={10} /> Ratio Groups ({bom.ratio_groups.length})
                    </p>
                    <div className="space-y-2">
                        {bom.ratio_groups.map((rg, i) => (
                            <RatioGroupDetail key={i} rg={rg} idx={i} />
                        ))}
                    </div>
                </div>
            )}

            {/* Materials */}
            {(bom.material_consumptions || []).length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Tag size={10} /> Materials & Trims ({bom.material_consumptions.length})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {bom.material_consumptions.map((mc, i) => (
                            <div key={i} className="border border-slate-200 rounded-xl px-3 py-2">
                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                    <span className="font-semibold text-slate-700 text-xs truncate">
                                        {mc.trim_item_name || `Trim #${mc.trim_item_id}`}
                                    </span>
                                    {mc.unit_of_measure && (
                                        <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded font-bold shrink-0">
                                            {mc.unit_of_measure}
                                        </span>
                                    )}
                                </div>
                                {mc.placement_description && (
                                    <p className="text-[9px] text-slate-400 truncate">📍 {mc.placement_description}</p>
                                )}
                                <p className="text-[10px] text-slate-600 font-bold mt-0.5">
                                    {mc.calculation_type === 'FIXED'
                                        ? `${mc.fixed_quantity} ${mc.unit_of_measure || 'unit'} fixed`
                                        : `Per size · ${(mc.size_consumptions || []).length} sizes`}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Status history */}
            <div className="border-t border-slate-100 pt-2">
                <button onClick={loadHistory}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors">
                    <Eye size={10} />
                    {showHistory ? 'Hide history' : 'Show status history'}
                    {historyLoading && <Loader2 size={10} className="animate-spin ml-1" />}
                </button>
                {showHistory && !historyLoading && history !== null && (
                    <div className="mt-2 space-y-1.5">
                        {history.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">No history entries.</p>
                        ) : (
                            history.map((h, i) => (
                                <div key={i} className="flex items-start gap-2 text-[10px]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <span className="font-bold text-slate-600">
                                            {h.from_status ? `${h.from_status} → ` : ''}{h.to_status}
                                        </span>
                                        {h.changed_by_name && (
                                            <span className="text-slate-400 ml-1">by {h.changed_by_name}</span>
                                        )}
                                        {h.notes && (
                                            <p className="text-slate-500 mt-0.5 italic truncate">{h.notes}</p>
                                        )}
                                    </div>
                                    <span className="text-slate-300 shrink-0">
                                        {h.changed_at ? new Date(h.changed_at).toLocaleDateString() : ''}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── BOM card ─────────────────────────────────────────────────────────────────

const BomCard = ({ bom, onApproved, onRejected, onArchived }) => {
    const cfg = STATUS[bom.status] || STATUS.DRAFT;
    const [expanded, setExpanded] = useState(false);
    const [confirming, setConfirming] = useState(null); // 'approve' | 'archive' | 'reject'
    const [rejectNotes, setRejectNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [localStatus, setLocalStatus] = useState(bom.status);

    const act = async (type) => {
        setBusy(true);
        try {
            if (type === 'approve') {
                await bomApi.approve(bom.id);
                setLocalStatus('APPROVED');
                setConfirming(null);
                onApproved?.(bom.id);
            } else if (type === 'reject') {
                await bomApi.reject(bom.id, rejectNotes);
                setLocalStatus('REJECTED');
                setConfirming(null);
                setRejectNotes('');
                onRejected?.(bom.id);
            } else {
                await bomApi.archive(bom.id);
                setLocalStatus('ARCHIVED');
                setConfirming(null);
                onArchived?.(bom.id);
            }
        } catch {
            // parent handles toast
        } finally {
            setBusy(false);
        }
    };

    const curCfg = STATUS[localStatus] || cfg;

    return (
        <div className={`bg-white rounded-2xl border border-slate-200 border-l-4 ${curCfg.border} shadow-sm transition-all duration-200 ${expanded ? `ring-2 ${curCfg.glow}` : 'hover:shadow-md'}`}>
            {/* Card header — always visible */}
            <div className="p-4 cursor-pointer select-none" onClick={() => setExpanded(e => !e)}>
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800 text-sm leading-tight truncate">{bom.bom_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{bom.product?.name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <StatusPill status={localStatus} />
                        {expanded
                            ? <ChevronUp size={14} className="text-slate-400" />
                            : <ChevronDown size={14} className="text-slate-400" />}
                    </div>
                </div>

                {/* Quick stats row */}
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                        <Layers size={9} />
                        {bom.ratio_groups_count ?? bom.ratio_groups?.length ?? 0} groups
                    </span>
                    <span className="flex items-center gap-1">
                        <Package size={9} />
                        {bom.material_count ?? bom.material_consumptions?.length ?? 0} materials
                    </span>
                    {bom.created_by && (
                        <span className="ml-auto truncate">{bom.created_by?.name || bom.created_by}</span>
                    )}
                </div>
            </div>

            {/* Expanded section */}
            {expanded && (
                <div className="px-4 pb-4 border-t border-slate-100 pt-4 space-y-4">
                    <BomDetail bomId={bom.id} />

                    {/* Action area */}
                    {confirming === 'reject' ? (
                        <RejectBar
                            bomName={bom.bom_name}
                            notes={rejectNotes}
                            onNotesChange={setRejectNotes}
                            onConfirm={() => act('reject')}
                            onCancel={() => { setConfirming(null); setRejectNotes(''); }}
                            busy={busy}
                        />
                    ) : confirming ? (
                        <ConfirmBar
                            message={confirming === 'approve'
                                ? `Approve "${bom.bom_name}"? This will make it available for production planning.`
                                : `Archive "${bom.bom_name}"? It will be hidden from active views.`}
                            confirmLabel={confirming === 'approve' ? 'Yes, Approve' : 'Yes, Archive'}
                            confirmColor={confirming === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-600 hover:bg-slate-700'}
                            busy={busy}
                            onConfirm={() => act(confirming)}
                            onCancel={() => setConfirming(null)}
                        />
                    ) : (
                        localStatus !== 'ARCHIVED' && (
                            <div className="flex items-center gap-2 pt-1">
                                {localStatus === 'PENDING_APPROVAL' && (
                                    <>
                                        <button onClick={() => setConfirming('approve')}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm">
                                            <ThumbsUp size={14} /> Approve
                                        </button>
                                        <button onClick={() => setConfirming('reject')}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm">
                                            <ThumbsDown size={14} /> Reject
                                        </button>
                                    </>
                                )}
                                {localStatus === 'APPROVED' && (
                                    <div className="flex-1 flex items-center gap-2 py-2.5 px-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                                        <Check size={14} className="text-emerald-600" />
                                        <span className="text-sm font-bold text-emerald-700">BOM Approved</span>
                                    </div>
                                )}
                                {localStatus === 'REJECTED' && (
                                    <div className="flex-1 flex items-center gap-2 py-2.5 px-3 bg-red-50 border border-red-200 rounded-xl">
                                        <XCircle size={14} className="text-red-500" />
                                        <span className="text-sm font-bold text-red-600">BOM Rejected — awaiting resubmission</span>
                                    </div>
                                )}
                                <button onClick={() => setConfirming('archive')}
                                    className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-colors">
                                    <Archive size={13} /> Archive
                                </button>
                            </div>
                        )
                    )}

                    {localStatus === 'ARCHIVED' && (
                        <div className="flex items-center gap-2 py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl">
                            <Archive size={13} className="text-slate-400" />
                            <span className="text-sm text-slate-500">This BOM has been archived.</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── status group section ─────────────────────────────────────────────────────

const StatusSection = ({ status, boms, defaultOpen, onApproved, onRejected, onArchived }) => {
    const [open, setOpen] = useState(defaultOpen);
    const cfg = STATUS[status] || { label: status, pill: '', dot: 'bg-gray-400' };

    if (!boms.length) return null;

    return (
        <div className="mb-5 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-slate-50 border-b border-slate-100 transition-colors">
                <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    <span className="font-bold text-slate-700 text-sm">{cfg.label}</span>
                    <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 min-w-[22px] text-center">
                        {boms.length}
                    </span>
                </div>
                {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>
            {open && (
                <div className="p-4 bg-slate-50/40">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {boms.map(b => (
                            <BomCard key={b.id} bom={b} onApproved={onApproved} onRejected={onRejected} onArchived={onArchived} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── main page ────────────────────────────────────────────────────────────────

export default function BomApprovalPage() {
    const [boms, setBoms]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const [search, setSearch]   = useState('');
    const [activeTab, setActiveTab] = useState('PENDING_APPROVAL');
    const [toast, setToast]     = useState(null);

    const showToast = (msg, ok = true) => setToast({ msg, ok });

    const fetchBoms = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await bomApi.getAll();
            setBoms(res.data?.data ?? res.data ?? []);
        } catch {
            setError('Failed to load BOMs.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchBoms(); }, [fetchBoms]);

    const handleApproved = useCallback((id) => {
        setBoms(prev => prev.map(b => b.id === id ? { ...b, status: 'APPROVED' } : b));
        showToast('BOM approved successfully.');
    }, []);

    const handleRejected = useCallback((id) => {
        setBoms(prev => prev.map(b => b.id === id ? { ...b, status: 'REJECTED' } : b));
        showToast('BOM rejected — editor will be notified.', false);
    }, []);

    const handleArchived = useCallback((id) => {
        setBoms(prev => prev.map(b => b.id === id ? { ...b, status: 'ARCHIVED' } : b));
        showToast('BOM archived.');
    }, []);

    const stats = useMemo(() => ({
        pending:  boms.filter(b => b.status === 'PENDING_APPROVAL').length,
        approved: boms.filter(b => b.status === 'APPROVED').length,
        rejected: boms.filter(b => b.status === 'REJECTED').length,
        draft:    boms.filter(b => b.status === 'DRAFT').length,
        archived: boms.filter(b => b.status === 'ARCHIVED').length,
        total:    boms.length,
    }), [boms]);

    const filtered = useMemo(() => {
        let list = activeTab === 'ALL' ? boms : boms.filter(b => b.status === activeTab);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(b =>
                (b.bom_name || '').toLowerCase().includes(q) ||
                (b.product?.name || '').toLowerCase().includes(q) ||
                (b.created_by?.name || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [boms, activeTab, search]);

    const grouped = useMemo(() => ({
        PENDING_APPROVAL: filtered.filter(b => b.status === 'PENDING_APPROVAL'),
        APPROVED:         filtered.filter(b => b.status === 'APPROVED'),
        REJECTED:         filtered.filter(b => b.status === 'REJECTED'),
        DRAFT:            filtered.filter(b => b.status === 'DRAFT'),
        ARCHIVED:         filtered.filter(b => b.status === 'ARCHIVED'),
    }), [filtered]);

    const TAB_LABELS = {
        ALL:              `All (${stats.total})`,
        PENDING_APPROVAL: `Pending (${stats.pending})`,
        APPROVED:         `Approved (${stats.approved})`,
        REJECTED:         `Rejected (${stats.rejected})`,
        DRAFT:            `Draft (${stats.draft})`,
        ARCHIVED:         `Archived (${stats.archived})`,
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {toast && <Toast msg={toast.msg} ok={toast.ok} onDone={() => setToast(null)} />}

            {/* Page header */}
            <div className="bg-white border-b border-slate-200 px-6 py-5">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <FileText size={20} className="text-violet-600" />
                            <h1 className="text-xl font-extrabold text-slate-800">BOM Approvals</h1>
                            {stats.pending > 0 && (
                                <span className="flex items-center gap-1 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
                                    {stats.pending} pending
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400">Review and approve Bills of Materials submitted by the merchandising team.</p>
                    </div>
                    <button onClick={fetchBoms} disabled={loading}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50">
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-5 gap-3 mb-5">
                    {[
                        { label: 'Pending Review', val: stats.pending,  color: 'text-amber-600',   bg: 'bg-amber-50  border-amber-200',   urgent: stats.pending > 0 },
                        { label: 'Approved',       val: stats.approved, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', urgent: false },
                        { label: 'Rejected',       val: stats.rejected, color: 'text-red-600',     bg: 'bg-red-50    border-red-200',      urgent: false },
                        { label: 'Draft',          val: stats.draft,    color: 'text-slate-700',   bg: 'bg-slate-50  border-slate-200',    urgent: false },
                        { label: 'Total BOMs',     val: stats.total,    color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',   urgent: false },
                    ].map(({ label, val, color, bg, urgent }) => (
                        <div key={label} className={`border rounded-xl p-3 text-center ${bg} ${urgent ? 'ring-2 ring-amber-300 ring-offset-1' : ''}`}>
                            <p className={`text-2xl font-black ${color}`}>{val}</p>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mt-0.5">{label}</p>
                        </div>
                    ))}
                </div>

                {/* Tabs + search row */}
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                        {TABS.map(tab => (
                            <button key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    activeTab === tab
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}>
                                {TAB_LABELS[tab]}
                            </button>
                        ))}
                    </div>
                    <div className="relative ml-auto">
                        <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search BOM, product, creator…"
                            className="pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-violet-400 outline-none w-56"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Spinner size={28} />
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
                        <AlertCircle size={16} /> {error}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-24 gap-3 text-slate-400">
                        <FileText size={44} strokeWidth={1} />
                        <p className="font-bold text-lg">
                            {search ? 'No BOMs match your search.' : 'No BOMs in this view.'}
                        </p>
                        {search && (
                            <button onClick={() => setSearch('')} className="text-sm text-violet-600 hover:underline">Clear search</button>
                        )}
                    </div>
                ) : activeTab === 'ALL' ? (
                    <>
                        <StatusSection status="PENDING_APPROVAL" boms={grouped.PENDING_APPROVAL} defaultOpen onApproved={handleApproved} onRejected={handleRejected} onArchived={handleArchived} />
                        <StatusSection status="REJECTED"         boms={grouped.REJECTED}         defaultOpen onApproved={handleApproved} onRejected={handleRejected} onArchived={handleArchived} />
                        <StatusSection status="APPROVED"         boms={grouped.APPROVED}         defaultOpen onApproved={handleApproved} onRejected={handleRejected} onArchived={handleArchived} />
                        <StatusSection status="DRAFT"            boms={grouped.DRAFT}            defaultOpen onApproved={handleApproved} onRejected={handleRejected} onArchived={handleArchived} />
                        <StatusSection status="ARCHIVED"         boms={grouped.ARCHIVED}         defaultOpen={false} onApproved={handleApproved} onRejected={handleRejected} onArchived={handleArchived} />
                    </>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {filtered.map(b => (
                            <BomCard key={b.id} bom={b} onApproved={handleApproved} onRejected={handleRejected} onArchived={handleArchived} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
