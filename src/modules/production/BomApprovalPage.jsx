import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FileText, CheckCircle, XCircle, Clock, Archive, Search,
    ChevronDown, ChevronUp, Loader2, RefreshCw,
    Check, AlertCircle, Scissors, Package, Eye, AlertTriangle,
    X, ThumbsUp, ThumbsDown, Layers, Tag, ShieldCheck, Info, ArrowRight,
} from 'lucide-react';
import { bomApi } from '../../api/bomApi';

// ─── status config ─────────────────────────────────────────────────────────────

const STATUS = {
    PENDING_APPROVAL: {
        label: 'Pending Approval', short: 'Pending', icon: Clock,
        pill: 'bg-amber-100 text-amber-700 border-amber-200',
        border: 'border-l-amber-400', glow: 'ring-amber-200', dot: 'bg-amber-400',
    },
    APPROVED: {
        label: 'Approved', short: 'Approved', icon: CheckCircle,
        pill: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        border: 'border-l-emerald-400', glow: 'ring-emerald-200', dot: 'bg-emerald-400',
    },
    DRAFT: {
        label: 'Draft', short: 'Draft', icon: FileText,
        pill: 'bg-slate-100 text-slate-600 border-slate-200',
        border: 'border-l-slate-300', glow: 'ring-slate-200', dot: 'bg-slate-400',
    },
    REJECTED: {
        label: 'Rejected', short: 'Rejected', icon: XCircle,
        pill: 'bg-red-100 text-red-700 border-red-200',
        border: 'border-l-red-400', glow: 'ring-red-200', dot: 'bg-red-400',
    },
    ARCHIVED: {
        label: 'Archived', short: 'Archived', icon: Archive,
        pill: 'bg-gray-100 text-gray-500 border-gray-200',
        border: 'border-l-gray-300', glow: 'ring-gray-200', dot: 'bg-gray-400',
    },
};

const TABS = ['ALL', 'PENDING_APPROVAL', 'APPROVED', 'DRAFT', 'REJECTED', 'ARCHIVED'];

// ─── small helpers ─────────────────────────────────────────────────────────────

const Spinner = ({ size = 20 }) => <Loader2 size={size} className="animate-spin text-violet-500" />;

const StatusPill = ({ status }) => {
    const cfg = STATUS[status] || { label: status, pill: 'bg-gray-100 text-gray-500 border-gray-200' };
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${cfg.pill}`}>
            {Icon && <Icon size={9} />}{cfg.label}
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

// ─── inline confirm / reject bars (used for archive + reject only) ─────────────

const ConfirmBar = ({ message, confirmLabel, confirmColor, onConfirm, onCancel, busy }) => (
    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />{message}
        </div>
        <div className="flex items-center gap-2 shrink-0">
            <button onClick={onCancel} disabled={busy}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                Cancel
            </button>
            <button onClick={onConfirm} disabled={busy}
                className={`flex items-center gap-1.5 text-xs font-bold text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${confirmColor}`}>
                {busy && <Loader2 size={11} className="animate-spin" />}{confirmLabel}
            </button>
        </div>
    </div>
);

const RejectBar = ({ bomName, notes, onNotesChange, onConfirm, onCancel, busy }) => (
    <div className="space-y-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-1.5 text-sm font-bold text-red-700">
            <AlertTriangle size={13} className="shrink-0" />
            Reject &ldquo;{bomName}&rdquo; — reason required
        </div>
        <textarea value={notes} onChange={e => onNotesChange(e.target.value)}
            placeholder="Explain what needs to be fixed…" rows={2} autoFocus
            className="w-full border border-red-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-red-300 resize-none bg-white" />
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

// ─── BOM detail (existing expanded view) ──────────────────────────────────────

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
            {(rg.items || []).filter(it => it.size).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {(rg.items || []).filter(it => it.size).map((it, j) => (
                        <span key={j} className="bg-violet-50 text-violet-700 border border-violet-100 rounded px-2 py-0.5 text-[10px] font-bold">
                            {it.size}: {it.number_of_pieces} pcs
                        </span>
                    ))}
                </div>
            )}
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

const BomDetail = ({ bomId }) => {
    const [bom, setBom]               = useState(null);
    const [loading, setLoading]       = useState(true);
    const [err, setErr]               = useState(null);
    const [history, setHistory]       = useState(null);
    const [historyLoading, setHistLoading] = useState(false);
    const [showHistory, setShowHistory]   = useState(false);

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
    if (err)     return <p className="text-xs text-red-500 py-3">{err}</p>;
    if (!bom)    return null;

    return (
        <div className="space-y-4">
            {bom.status === 'REJECTED' && bom.rejection_notes && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                    <XCircle size={13} className="text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider mb-0.5">Rejection Reason</p>
                        <p className="text-xs text-red-700">{bom.rejection_notes}</p>
                    </div>
                </div>
            )}
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
            {(bom.ratio_groups || []).length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Layers size={10} /> Ratio Groups ({bom.ratio_groups.length})
                    </p>
                    <div className="space-y-2">
                        {bom.ratio_groups.map((rg, i) => <RatioGroupDetail key={i} rg={rg} idx={i} />)}
                    </div>
                </div>
            )}
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
                        ) : history.map((h, i) => (
                            <div key={i} className="flex items-start gap-2 text-[10px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <span className="font-bold text-slate-600">
                                        {h.from_status ? `${h.from_status} → ` : ''}{h.to_status}
                                    </span>
                                    {h.changed_by_name && <span className="text-slate-400 ml-1">by {h.changed_by_name}</span>}
                                    {h.notes && <p className="text-slate-500 mt-0.5 italic truncate">{h.notes}</p>}
                                </div>
                                <span className="text-slate-300 shrink-0">
                                    {h.changed_at ? new Date(h.changed_at).toLocaleDateString() : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── diff helpers ──────────────────────────────────────────────────────────────

function diffByKey(oldList = [], newList = [], keyFn, isChangedFn) {
    const result = [];
    const newMap = new Map(newList.map(item => [keyFn(item), item]));
    const oldMap = new Map(oldList.map(item => [keyFn(item), item]));
    for (const o of oldList) {
        const n = newMap.get(keyFn(o));
        if (!n) result.push({ type: 'removed', old: o, new: null });
        else result.push({ type: isChangedFn(o, n) ? 'changed' : 'same', old: o, new: n });
    }
    for (const n of newList) {
        if (!oldMap.has(keyFn(n))) result.push({ type: 'added', old: null, new: n });
    }
    return result;
}

const materialKey     = m => String(m.trim_item_id);
const materialChanged = (o, n) => {
    if (o.calculation_type !== n.calculation_type) return true;
    if (o.calculation_type === 'FIXED') return String(o.fixed_quantity) !== String(n.fixed_quantity);
    const os = (o.size_consumptions || []).map(s => `${s.size}:${s.quantity}`).sort().join();
    const ns = (n.size_consumptions || []).map(s => `${s.size}:${s.quantity}`).sort().join();
    return os !== ns;
};

const fabricKey     = f => String(f.fabric_type_id);
const fabricChanged = (o, n) => String(o.consumption_inches) !== String(n.consumption_inches);

const ratioGroupKey     = g => g.ratio_group_name || String(g.id);
const ratioGroupChanged = (o, n) => {
    const oFab = (o.fabric_consumptions || []).map(f => `${f.fabric_type_id}:${f.consumption_inches}`).sort().join();
    const nFab = (n.fabric_consumptions || []).map(f => `${f.fabric_type_id}:${f.consumption_inches}`).sort().join();
    if (oFab !== nFab) return true;
    const oSz = (o.items || []).map(i => `${i.size}:${i.number_of_pieces}`).sort().join();
    const nSz = (n.items || []).map(i => `${i.size}:${i.number_of_pieces}`).sort().join();
    return oSz !== nSz;
};

// ─── diff display primitives ───────────────────────────────────────────────────

const DIFF_STYLE = {
    added:   { row: 'bg-emerald-50 border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', label: '+ Added'   },
    removed: { row: 'bg-red-50 border-red-200',         badge: 'bg-red-100 text-red-600',         label: '− Removed' },
    changed: { row: 'bg-amber-50 border-amber-200',     badge: 'bg-amber-100 text-amber-700',     label: '~ Changed' },
    same:    { row: 'bg-white border-slate-200',         badge: null,                              label: null        },
};

const DiffBadge = ({ type }) => {
    const s = DIFF_STYLE[type];
    if (!s?.label) return null;
    return <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${s.badge}`}>{s.label}</span>;
};

// ─── fabric consumption diff chips ────────────────────────────────────────────

const FabricDiffChips = ({ oldFabrics = [], newFabrics = [], isFirstApproval }) => {
    const list = isFirstApproval
        ? newFabrics.map(f => ({ type: 'same', old: f, new: f }))
        : diffByKey(oldFabrics, newFabrics, fabricKey, fabricChanged);

    if (list.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
            <span className="text-[9px] font-bold text-slate-400 uppercase self-center mr-1">Fabric</span>
            {list.map((entry, j) => {
                const f    = entry.new || entry.old;
                const name = f.fabric_type_name || `Fabric #${f.fabric_type_id}`;
                if (entry.type === 'same') return (
                    <span key={j} className="bg-sky-50 text-sky-700 border border-sky-100 rounded px-2 py-0.5 text-[10px] font-bold">
                        {name}{f.consumption_inches ? `: ${f.consumption_inches}"` : ''}
                    </span>
                );
                if (entry.type === 'removed') return (
                    <span key={j} className="bg-red-50 text-red-500 border border-red-200 rounded px-2 py-0.5 text-[10px] font-bold line-through">
                        {name}{entry.old.consumption_inches ? `: ${entry.old.consumption_inches}"` : ''}
                    </span>
                );
                if (entry.type === 'added') return (
                    <span key={j} className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-2 py-0.5 text-[10px] font-bold">
                        + {name}{f.consumption_inches ? `: ${f.consumption_inches}"` : ''}
                    </span>
                );
                // changed — show old → new inline
                return (
                    <span key={j} className="bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1">
                        {name}: {entry.old.consumption_inches}"
                        <ArrowRight size={8} className="shrink-0" />
                        <span className="text-emerald-600">{entry.new.consumption_inches}"</span>
                    </span>
                );
            })}
        </div>
    );
};

// ─── ratio group diff row ─────────────────────────────────────────────────────

const RatioGroupDiffRow = ({ entry, isFirstApproval }) => {
    const rg = entry.new || entry.old;
    const s  = isFirstApproval ? DIFF_STYLE.same : DIFF_STYLE[entry.type];

    const sizeDiff = isFirstApproval
        ? (rg.items || []).map(i => ({ type: 'same', old: i, new: i }))
        : diffByKey(
            entry.old?.items ?? [],
            entry.new?.items ?? [],
            i => i.size,
            (o, n) => String(o.number_of_pieces) !== String(n.number_of_pieces)
          );

    return (
        <div className={`border rounded-xl overflow-hidden ${s.row}`}>
            <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                    <Scissors size={11} className="text-slate-400" />
                    <span className="font-bold text-slate-700 text-xs">{rg.ratio_group_name || 'Unnamed Group'}</span>
                    {rg.marker_length_inches && (
                        <span className="text-[9px] text-slate-400 font-medium">{rg.marker_length_inches}" marker</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {rg.total_pieces_in_marker > 0 && (
                        <span className="text-[9px] bg-violet-50 text-violet-600 border border-violet-100 px-1.5 py-0.5 rounded font-bold">
                            {rg.total_pieces_in_marker} pcs/marker
                        </span>
                    )}
                    {!isFirstApproval && <DiffBadge type={entry.type} />}
                </div>
            </div>
            <div className="px-3 pb-2.5 space-y-1.5">
                {sizeDiff.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {sizeDiff.map((sd, j) => {
                            const item = sd.new || sd.old;
                            if (sd.type === 'same') return (
                                <span key={j} className="bg-violet-50 text-violet-700 border border-violet-100 rounded px-2 py-0.5 text-[10px] font-bold">
                                    {item.size}: {item.number_of_pieces} pcs
                                </span>
                            );
                            if (sd.type === 'removed') return (
                                <span key={j} className="bg-red-50 text-red-500 border border-red-200 rounded px-2 py-0.5 text-[10px] font-bold line-through">
                                    {sd.old.size}: {sd.old.number_of_pieces} pcs
                                </span>
                            );
                            if (sd.type === 'added') return (
                                <span key={j} className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-2 py-0.5 text-[10px] font-bold">
                                    + {item.size}: {item.number_of_pieces} pcs
                                </span>
                            );
                            // changed
                            return (
                                <span key={j} className="bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1">
                                    {item.size}: {sd.old.number_of_pieces}
                                    <ArrowRight size={8} className="shrink-0" />
                                    <span className="text-emerald-600">{sd.new.number_of_pieces}</span> pcs
                                </span>
                            );
                        })}
                    </div>
                )}
                <FabricDiffChips
                    oldFabrics={entry.old?.fabric_consumptions ?? []}
                    newFabrics={entry.new?.fabric_consumptions ?? (rg.fabric_consumptions ?? [])}
                    isFirstApproval={isFirstApproval}
                />
            </div>
        </div>
    );
};

// ─── material diff row ────────────────────────────────────────────────────────

const MaterialDiffRow = ({ entry, isFirstApproval }) => {
    const item = entry.new || entry.old;
    const s    = isFirstApproval ? DIFF_STYLE.same : DIFF_STYLE[entry.type];

    const qtyStr = m => {
        if (!m) return '—';
        if (m.calculation_type === 'FIXED') return `${m.fixed_quantity} ${m.unit_of_measure || 'unit'} (fixed)`;
        return `per-size (${(m.size_consumptions || []).length} sizes)`;
    };

    return (
        <div className={`border rounded-xl px-3 py-2 ${s.row}`}>
            <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="font-semibold text-slate-700 text-xs truncate">
                    {item.trim_item_name || `Trim #${item.trim_item_id}`}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                    {item.unit_of_measure && (
                        <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded font-bold">
                            {item.unit_of_measure}
                        </span>
                    )}
                    {!isFirstApproval && <DiffBadge type={entry.type} />}
                </div>
            </div>
            {item.placement_description && (
                <p className="text-[9px] text-slate-400 truncate">📍 {item.placement_description}</p>
            )}
            {entry.type === 'changed' && !isFirstApproval ? (
                <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                    <span className="text-red-500 line-through">{qtyStr(entry.old)}</span>
                    <ArrowRight size={9} className="text-slate-400 shrink-0" />
                    <span className="text-emerald-600 font-bold">{qtyStr(entry.new)}</span>
                </div>
            ) : (
                <p className="text-[10px] text-slate-600 mt-0.5">{qtyStr(item)}</p>
            )}
        </div>
    );
};

// ─── changes tab ──────────────────────────────────────────────────────────────

const ChangesTab = ({ currBom, prevBom }) => {
    if (!currBom) return (
        <p className="text-sm text-slate-400 text-center py-12">No BOM data available.</p>
    );

    const isFirst  = !prevBom;
    const matDiff  = diffByKey(prevBom?.material_consumptions ?? [], currBom.material_consumptions ?? [], materialKey, materialChanged);
    const rgDiff   = diffByKey(prevBom?.ratio_groups ?? [],          currBom.ratio_groups ?? [],          ratioGroupKey, ratioGroupChanged);
    const changes  = isFirst ? 0 : [...matDiff, ...rgDiff].filter(d => d.type !== 'same').length;

    return (
        <div className="space-y-5">
            {isFirst ? (
                <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5">
                    <Info size={13} className="text-sky-500 shrink-0" />
                    <p className="text-xs text-sky-700">
                        <strong>First approval</strong> for this product — no prior version to compare against. Showing full BOM contents.
                    </p>
                </div>
            ) : changes === 0 ? (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                    <CheckCircle size={13} className="text-slate-400 shrink-0" />
                    <p className="text-xs text-slate-600">No structural changes detected from the last approved version.</p>
                </div>
            ) : (
                <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5">
                    <Eye size={13} className="text-violet-500 shrink-0" />
                    <p className="text-xs text-violet-700">
                        <strong>{changes} change{changes !== 1 ? 's' : ''}</strong> detected from the last approved version.
                        <span className="ml-1 text-violet-500">Green = added · Red = removed · Orange = changed</span>
                    </p>
                </div>
            )}

            {rgDiff.length > 0 && (
                <section>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Scissors size={10} /> Ratio Groups ({rgDiff.length})
                    </p>
                    <div className="space-y-2">
                        {rgDiff.map((entry, i) => (
                            <RatioGroupDiffRow key={i} entry={entry} isFirstApproval={isFirst} />
                        ))}
                    </div>
                </section>
            )}

            {matDiff.length > 0 && (
                <section>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Tag size={10} /> Materials & Trims ({matDiff.length})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {matDiff.map((entry, i) => (
                            <MaterialDiffRow key={i} entry={entry} isFirstApproval={isFirst} />
                        ))}
                    </div>
                </section>
            )}

            {rgDiff.length === 0 && matDiff.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">No BOM content defined.</p>
            )}
        </div>
    );
};

// ─── planning impact tab ──────────────────────────────────────────────────────

const ImpactTab = ({ impact }) => {
    if (!impact) return (
        <p className="text-sm text-slate-400 text-center py-12">Impact data unavailable.</p>
    );

    if (impact.affected_orders_count === 0) return (
        <div className="flex flex-col items-center py-12 gap-3 text-slate-400">
            <CheckCircle size={36} strokeWidth={1.5} className="text-emerald-400" />
            <p className="font-bold text-base text-slate-600">No Planning Impact</p>
            <p className="text-xs text-center max-w-xs">
                This BOM is not currently linked to any active sales order planning. Safe to approve.
            </p>
        </div>
    );

    const orders = impact.orders ?? [];
    const hasReservations = orders.some(o => o.has_active_fabric_reservations || o.has_active_trim_reservations);
    const hasPOs = orders.some(o => o.has_raised_purchase_orders);
    const totalFabric = impact.total_fabric_requirements
        ?? orders.reduce((sum, o) => sum + (o.fabric_requirements_count ?? 0), 0);
    const totalTrim = impact.total_trim_requirements
        ?? orders.reduce((sum, o) => sum + (o.trim_requirements_count ?? 0), 0);

    return (
        <div className="space-y-4">
            {/* Summary stat cards */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-amber-600">{impact.affected_orders_count}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Affected Orders</p>
                </div>
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-sky-600">{totalFabric}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Fabric Requirements</p>
                </div>
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-violet-600">{totalTrim}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Trim Requirements</p>
                </div>
            </div>

            {/* Critical warnings */}
            {(hasReservations || hasPOs) && (
                <div className="space-y-1.5">
                    {hasReservations && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                            <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700">
                                <strong>Active reservations exist</strong> on linked fabric or trim requirements.
                                These will need to be re-reviewed after approval since quantities may change.
                            </p>
                        </div>
                    )}
                    {hasPOs && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                            <AlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-700">
                                <strong>Purchase orders have already been raised</strong> for some requirements.
                                Approving this BOM may create quantity discrepancies with those POs.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Per-order breakdown */}
            <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Affected Sales Orders</p>
                {orders.map(order => (
                    <div key={order.sales_order_id} className="border border-slate-200 rounded-xl px-4 py-3 bg-white">
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                                <p className="font-bold text-sm text-slate-800">{order.order_reference}</p>
                                <p className="text-xs text-slate-500 truncate">
                                    {order.customer_name && <span>{order.customer_name} · </span>}
                                    {order.product_name}
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {order.has_raised_purchase_orders && (
                                    <span className="text-[9px] font-bold bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded uppercase">
                                        PO Raised
                                    </span>
                                )}
                                {(order.has_active_fabric_reservations || order.has_active_trim_reservations) && (
                                    <span className="text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
                                        Reserved
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] text-slate-500">
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 bg-sky-400 rounded-full" />
                                {order.fabric_requirements_count} fabric req.
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 bg-violet-400 rounded-full" />
                                {order.trim_requirements_count} trim req.
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── approval modal ───────────────────────────────────────────────────────────

const BomApprovalModal = ({ bom, onClose, onApproved }) => {
    const [preview,      setPreview]      = useState(null);
    const [loading,      setLoading]      = useState(true);
    const [previewErr,   setPreviewErr]   = useState(null);
    const [tab,          setTab]          = useState('changes');
    const [acknowledged, setAcknowledged] = useState(false);
    const [approveNotes, setApproveNotes] = useState('');
    const [approving,    setApproving]    = useState(false);
    const [approveErr,   setApproveErr]   = useState(null);

    useEffect(() => {
        bomApi.getApprovalPreview(bom.id)
            .then(res => setPreview(res.data?.data ?? res.data))
            .catch(e  => setPreviewErr(e?.response?.data?.error || e.message || 'Could not load preview.'))
            .finally(() => setLoading(false));
    }, [bom.id]);

    const handleApprove = async () => {
        setApproving(true);
        setApproveErr(null);
        try {
            await bomApi.approve(bom.id, approveNotes.trim() || null);
            onApproved(bom.id);
            onClose();
        } catch (e) {
            setApproveErr(e?.response?.data?.error || 'Failed to approve BOM.');
            setApproving(false);
        }
    };

    const impact       = preview?.planning_impact;
    const hasImpact    = (impact?.affected_orders_count ?? 0) > 0;
    const hasCritical  = impact?.orders?.some(
        o => o.has_active_fabric_reservations || o.has_active_trim_reservations || o.has_raised_purchase_orders
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
                 onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <ShieldCheck size={18} className="text-violet-600" />
                            <h2 className="text-base font-extrabold text-slate-800">Review BOM Before Approving</h2>
                        </div>
                        <p className="text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">{bom.bom_name}</span>
                            {bom.product?.name && <span className="ml-1.5 text-slate-400">· {bom.product.name}</span>}
                        </p>
                    </div>
                    <button onClick={onClose}
                        className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-0 px-6 border-b border-slate-100">
                    {[
                        { id: 'changes', label: 'BOM Changes' },
                        { id: 'impact',  label: hasImpact ? `Planning Impact (${impact.affected_orders_count})` : 'Planning Impact' },
                    ].map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors ${
                                tab === t.id
                                    ? 'border-violet-500 text-violet-700'
                                    : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}>
                            {t.label}
                            {t.id === 'impact' && hasCritical && (
                                <span className="w-3.5 h-3.5 flex items-center justify-center bg-amber-500 text-white text-[8px] font-black rounded-full">!</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex justify-center py-20"><Spinner size={28} /></div>
                    ) : previewErr ? (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-amber-700 mb-0.5">Preview unavailable</p>
                                    <p className="text-xs text-amber-600">{previewErr}</p>
                                    <p className="text-xs text-amber-600 mt-1">
                                        You can still approve, but the BOM diff and planning impact cannot be shown.
                                        Make sure the BE endpoint <code className="bg-amber-100 px-1 rounded">/bom/:id/approval-preview</code> is deployed.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : tab === 'changes' ? (
                        <ChangesTab currBom={preview?.current_bom} prevBom={preview?.previous_approved_bom} />
                    ) : (
                        <ImpactTab impact={impact} />
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 px-6 py-4 space-y-3 bg-white rounded-b-2xl">
                    {approveErr && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
                            <AlertCircle size={13} /> {approveErr}
                        </div>
                    )}
                    {hasCritical && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                            <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700 leading-relaxed">
                                <strong>Warning:</strong> Some linked orders have active reservations or raised purchase orders.
                                Approving this BOM will require those to be re-reviewed for quantity accuracy.
                            </p>
                        </div>
                    )}
                    <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={acknowledged}
                            onChange={e => setAcknowledged(e.target.checked)}
                            className="mt-0.5 accent-violet-600 h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs text-slate-600 leading-relaxed">
                            I have reviewed all BOM changes and planning impacts, and confirm I want to approve{' '}
                            <strong className="text-slate-800">"{bom.bom_name}"</strong>.
                            {hasImpact && (
                                <span className="text-amber-700 font-semibold">
                                    {' '}This will affect {impact.affected_orders_count} order(s) — fabric and trim requirements will be recalculated.
                                </span>
                            )}
                        </span>
                    </label>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Approval notes <span className="font-normal normal-case text-slate-300">(optional)</span>
                        </label>
                        <textarea
                            value={approveNotes}
                            onChange={e => setApproveNotes(e.target.value)}
                            placeholder="Add any notes for the team (e.g. conditions, observations)…"
                            rows={2}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-300 resize-none bg-white"
                        />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        <button onClick={onClose} disabled={approving}
                            className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors">
                            Cancel
                        </button>
                        <button onClick={handleApprove} disabled={!acknowledged || approving}
                            className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
                            {approving ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                            Approve BOM
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── BOM card ─────────────────────────────────────────────────────────────────

const BomCard = ({ bom, onApproved, onRejected, onArchived }) => {
    const cfg = STATUS[bom.status] || STATUS.DRAFT;
    const [expanded,          setExpanded]          = useState(false);
    const [confirming,        setConfirming]        = useState(null); // 'archive' | 'reject'
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [rejectNotes,       setRejectNotes]       = useState('');
    const [busy,              setBusy]              = useState(false);
    const [localStatus,       setLocalStatus]       = useState(bom.status);

    const act = async (type) => {
        setBusy(true);
        try {
            if (type === 'reject') {
                await bomApi.reject(bom.id, rejectNotes);
                setLocalStatus('REJECTED');
                setConfirming(null);
                setRejectNotes('');
                onRejected?.(bom.id);
            } else if (type === 'archive') {
                await bomApi.archive(bom.id);
                setLocalStatus('ARCHIVED');
                setConfirming(null);
                onArchived?.(bom.id);
            }
        } catch {
            // parent shows toast
        } finally {
            setBusy(false);
        }
    };

    const handleApproveSuccess = (id) => {
        setLocalStatus('APPROVED');
        setShowApprovalModal(false);
        onApproved?.(id);
    };

    const curCfg = STATUS[localStatus] || cfg;

    return (
        <>
            {showApprovalModal && (
                <BomApprovalModal
                    bom={{ ...bom, status: localStatus }}
                    onClose={() => setShowApprovalModal(false)}
                    onApproved={handleApproveSuccess}
                />
            )}

            <div className={`bg-white rounded-2xl border border-slate-200 border-l-4 ${curCfg.border} shadow-sm transition-all duration-200 ${expanded ? `ring-2 ${curCfg.glow}` : 'hover:shadow-md'}`}>
                {/* Card header */}
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
                        ) : confirming === 'archive' ? (
                            <ConfirmBar
                                message={`Archive "${bom.bom_name}"? It will be hidden from active views.`}
                                confirmLabel="Yes, Archive"
                                confirmColor="bg-slate-600 hover:bg-slate-700"
                                busy={busy}
                                onConfirm={() => act('archive')}
                                onCancel={() => setConfirming(null)}
                            />
                        ) : (
                            localStatus !== 'ARCHIVED' && (
                                <div className="flex items-center gap-2 pt-1">
                                    {localStatus === 'PENDING_APPROVAL' && (
                                        <>
                                            <button onClick={() => setShowApprovalModal(true)}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm">
                                                <ShieldCheck size={14} /> Review & Approve
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
        </>
    );
};

// ─── status group section ─────────────────────────────────────────────────────

const StatusSection = ({ status, boms, defaultOpen, onApproved, onRejected, onArchived }) => {
    const [open, setOpen] = useState(defaultOpen);
    const cfg = STATUS[status] || { label: status, pill: '', dot: 'bg-gray-400' };

    if (!boms.length) return null;

    return (
        <div className="mb-5 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <button onClick={() => setOpen(o => !o)}
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
    const [boms,      setBoms]      = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState(null);
    const [search,    setSearch]    = useState('');
    const [activeTab, setActiveTab] = useState('PENDING_APPROVAL');
    const [toast,     setToast]     = useState(null);

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

                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                        {TABS.map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    activeTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}>
                                {TAB_LABELS[tab]}
                            </button>
                        ))}
                    </div>
                    <div className="relative ml-auto">
                        <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search BOM, product, creator…"
                            className="pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-violet-400 outline-none w-56" />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64"><Spinner size={28} /></div>
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
                        <StatusSection status="PENDING_APPROVAL" boms={grouped.PENDING_APPROVAL} defaultOpen   onApproved={handleApproved} onRejected={handleRejected} onArchived={handleArchived} />
                        <StatusSection status="REJECTED"         boms={grouped.REJECTED}         defaultOpen   onApproved={handleApproved} onRejected={handleRejected} onArchived={handleArchived} />
                        <StatusSection status="APPROVED"         boms={grouped.APPROVED}         defaultOpen   onApproved={handleApproved} onRejected={handleRejected} onArchived={handleArchived} />
                        <StatusSection status="DRAFT"            boms={grouped.DRAFT}            defaultOpen   onApproved={handleApproved} onRejected={handleRejected} onArchived={handleArchived} />
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
