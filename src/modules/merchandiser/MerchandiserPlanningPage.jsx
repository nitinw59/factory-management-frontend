import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Loader2, Link2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
    AlertTriangle, CheckCircle2, Search,
    Calculator, ShoppingBag, X, Eye, Plus, Pencil,
    ShieldCheck, ShieldOff, RotateCw, Component, Calendar,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { planningApi } from '../../api/planningApi';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { bomApi } from '../../api/bomApi';
import { taApi } from '../../api/taApi';
import { stdSize } from '../../utils/sizeUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const Spinner = ({ h = 64 }) => (
    <div className={`flex justify-center items-center`} style={{ minHeight: h * 4 }}>
        <Loader2 className="animate-spin h-7 w-7 text-violet-500" />
    </div>
);

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const ORDER_STATUS_CFG = {
    DRAFT:          { cls: 'bg-slate-100 text-slate-500'   },
    CONFIRMED:      { cls: 'bg-blue-100 text-blue-700'     },
    IN_PRODUCTION:  { cls: 'bg-violet-100 text-violet-700' },
    COMPLETED:      { cls: 'bg-emerald-100 text-emerald-700'},
    CANCELLED:      { cls: 'bg-red-100 text-red-500'       },
};

// ─── T&A CONFIG ───────────────────────────────────────────────────────────────

const CAT = {
    production: { label: 'Production', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
    fabric:     { label: 'Fabric',     cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    trim:       { label: 'Trim',       cls: 'bg-amber-50  text-amber-700  border-amber-200'  },
    delivery:   { label: 'Delivery',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    quality:    { label: 'Quality',    cls: 'bg-sky-50    text-sky-700    border-sky-200'    },
    other:      { label: 'Other',      cls: 'bg-slate-50  text-slate-600  border-slate-200'  },
};
const TL_STATUS = {
    pending:       { label: 'Pending',     cls: 'bg-amber-50  text-amber-700  border-amber-200'  },
    'in-progress': { label: 'In Progress', cls: 'bg-blue-50   text-blue-700   border-blue-200'   },
    completed:     { label: 'Completed',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    delayed:       { label: 'Delayed',     cls: 'bg-red-50    text-red-700    border-red-200'    },
};
const PRIORITY = {
    low:      { label: 'Low',      dot: 'bg-slate-300'  },
    medium:   { label: 'Medium',   dot: 'bg-amber-400'  },
    high:     { label: 'High',     dot: 'bg-orange-500' },
    critical: { label: 'Critical', dot: 'bg-red-600'    },
};

// ─── BOM PREVIEW MODAL ────────────────────────────────────────────────────────

const BomPreviewModal = ({ bomId, onClose }) => {
    const [bom,     setBom]     = useState(null);
    const [loading, setLoading] = useState(true);
    const [err,     setErr]     = useState(null);

    useEffect(() => {
        bomApi.getById(bomId)
            .then(res => setBom(res.data?.data ?? res.data))
            .then(() => console.log('BOM detail:', bom))
            .catch(e  => setErr(e?.response?.data?.error || e.message || 'Failed to load BOM'))
            .finally(() => setLoading(false));
           
    }, [bomId]);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh]"
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">BOM Preview</p>
                        <h2 className="font-extrabold text-slate-800 text-base">
                            {loading ? 'Loading…' : bom?.bom_name || '—'}
                        </h2>
                        {bom && <p className="text-xs text-slate-400 mt-0.5">{bom.product?.name}</p>}
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {loading && <Spinner />}
                    {err && <p className="text-sm text-red-500">{err}</p>}
                    {bom && (
                        <>
                            {/* Ratio Groups */}
                            {(bom.ratio_groups || []).length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ratio Groups</p>
                                    <div className="space-y-2">
                                        {bom.ratio_groups.map((rg, i) => (
                                            <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                                                <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
                                                    <span className="font-bold text-slate-700 text-xs">{rg.ratio_group_name || `Group ${i + 1}`}</span>
                                                    <div className="flex items-center gap-2">
                                                        {rg.total_pieces_in_marker > 0 && (
                                                            <span className="text-[9px] bg-violet-50 text-violet-600 border border-violet-100 px-1.5 py-0.5 rounded font-bold">
                                                                {rg.total_pieces_in_marker} pcs
                                                            </span>
                                                        )}
                                                        {rg.marker_length_inches && (
                                                            <span className="text-[9px] text-slate-400">{rg.marker_length_inches}"</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 p-2.5">
                                                    {(rg.items || []).filter(it => it.size).map((it, j) => (
                                                        <span key={j} className="bg-violet-50 text-violet-700 border border-violet-100 rounded px-2 py-0.5 text-[10px] font-bold">
                                                            {it.size}: {it.number_of_pieces} pcs
                                                        </span>
                                                    ))}
                                                </div>
                                                {(rg.fabric_consumptions || []).length > 0 && (
                                                    <div className="border-t border-slate-100 px-2.5 py-2 flex flex-wrap gap-1.5">
                                                        {rg.fabric_consumptions.map((fc, j) => (
                                                            <span key={j} className="bg-sky-50 text-sky-700 border border-sky-100 rounded px-2 py-0.5 text-[10px] font-bold">
                                                                {fc.fabric_type_name || `Fabric #${fc.fabric_type_id}`}: {fc.consumption_inches}"
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Materials */}
                            {(bom.material_consumptions || []).length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Materials & Trims</p>
                                    <div className="space-y-1.5">
                                        {bom.material_consumptions.map((mc, i) => (
                                            <div key={i} className="border border-slate-200 rounded-xl px-3 py-2">
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-semibold text-slate-700 text-xs">{mc.trim_item_name || `Trim #${mc.trim_item_id}`}</span>
                                                        {mc.item_code && <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1 rounded">{mc.item_code}</span>}
                                                        {mc.unit_of_measure && (
                                                            <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded font-bold">{mc.unit_of_measure}</span>
                                                        )}
                                                    </div>
                                                    <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold shrink-0">{mc.calculation_type}</span>
                                                </div>
                                                {mc.placement_description && (
                                                    <p className="text-[9px] text-slate-400 mb-1">📍 {mc.placement_description}</p>
                                                )}
                                                {mc.calculation_type === 'FIXED' ? (
                                                    <p className="text-[10px] text-slate-600 font-bold">
                                                        {mc.fixed_quantity} <span className="font-normal text-slate-400">{mc.unit_of_measure || 'unit'} per garment</span>
                                                    </p>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {(mc.size_consumptions || []).map((sc, j) => (
                                                            <span key={j} className="bg-violet-50 text-violet-700 border border-violet-100 rounded px-1.5 py-0.5 text-[9px] font-bold">
                                                                {sc.size || '—'}: {sc.quantity}{mc.unit_of_measure ? ` ${mc.unit_of_measure}` : ''}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── ORDER CARD (left sidebar) ─────────────────────────────────────────────────

const OrderCard = ({ order, isSelected, onClick }) => {
    const { cls } = ORDER_STATUS_CFG[order.status] || { cls: 'bg-gray-100 text-gray-500' };
    const linked    = order.linked_bom_count ?? 0;
    const total     = order.product_count    ?? 0;
    const allLinked = linked === total && total > 0;
    const customerName = order.customer_name || order.buyer_name || '—';

    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors hover:bg-slate-50
                ${isSelected ? 'bg-violet-50 border-l-[3px] border-l-violet-500' : 'border-l-[3px] border-l-transparent'}`}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800 text-sm truncate">
                    {order.order_number}
                    {order.buyer_po_number && (
                        <span className="font-normal text-slate-400 ml-1 text-[10px]">· PO {order.buyer_po_number}</span>
                    )}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ml-1 ${cls}`}>
                    {order.status}
                </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-1.5 truncate">{customerName}</p>
            <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold ${allLinked ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {linked}/{total} BOMs linked
                </span>
                {order.delivery_date && (
                    <span className="text-[10px] text-slate-400">
                        {new Date(order.delivery_date).toLocaleDateString()}
                    </span>
                )}
            </div>
        </button>
    );
};

// ─── T&A TIMELINE ITEM ROW (used in TAItemFormModal) ─────────────────────────

const fmtD = (d) => d ? new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : null;

// ─── T&A ITEM FORM MODAL ──────────────────────────────────────────────────────

const TAItemFormModal = ({ sop, item, onClose, onSaved }) => {
    const isEdit = !!item;
    const [form, setForm] = useState({
        title:           item?.title           || '',
        category:        item?.category        || 'fabric',
        status:          item?.status          || 'pending',
        priority:        item?.priority        || 'medium',
        start_date:      item?.start_date?.slice(0, 10) || '',
        end_date:        item?.end_date?.slice(0, 10)   || '',
        assignee:        item?.assignee        || '',
        notes:           item?.notes           || '',
        fabric_color_id: item?.fabric_color_id || '',
    });
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        if (!form.title.trim()) { setErr('Title is required'); return; }
        setBusy(true); setErr(null);
        try {
            const payload = {
                ...form,
                sales_order_product_id: sop.id,
                start_date:      form.start_date      || null,
                end_date:        form.end_date        || null,
                assignee:        form.assignee        || null,
                notes:           form.notes           || null,
                fabric_color_id: form.fabric_color_id ? parseInt(form.fabric_color_id) : null,
            };
            console.log(payload);
            if (isEdit) await taApi.updateTimelineItem(item.id, payload);
            else        await taApi.createTimelineItem(payload);
            onSaved();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Save failed');
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={!busy ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">T&A Timeline · {sop.product_name}</p>
                        <h2 className="font-extrabold text-slate-800 text-base">{isEdit ? 'Edit Milestone' : 'Add Milestone'}</h2>
                    </div>
                    {!busy && <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {err && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{err}</p>}

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Title *</label>
                        <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
                            placeholder="e.g. Fabric arrival confirmation"
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Category</label>
                            <select value={form.category} onChange={e => set('category', e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400">
                                {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Priority</label>
                            <select value={form.priority} onChange={e => set('priority', e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400">
                                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Status</label>
                        <select value={form.status} onChange={e => set('status', e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400">
                            {Object.entries(TL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Start Date</label>
                            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">End Date</label>
                            <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Assignee</label>
                            <input type="text" value={form.assignee} onChange={e => set('assignee', e.target.value)}
                                placeholder="Name"
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400" />
                        </div>
                        {(sop.colors || []).length > 0 && (
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Color (optional)</label>
                                <select value={form.fabric_color_id} onChange={e => set('fabric_color_id', e.target.value)}
                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400">
                                    <option value="">All colors</option>
                                    {sop.colors.map(c => (
                                        <option key={c.fabric_color_id} value={c.fabric_color_id}>
                                            {c.color_name || c.color_number}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Notes</label>
                        <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                            rows={2} placeholder="Optional notes…"
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 resize-none" />
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={onClose} disabled={busy}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40">
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={busy}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-5 py-2.5 rounded-xl transition-colors shadow-sm">
                        {busy && <Loader2 size={14} className="animate-spin" />}
                        {isEdit ? 'Save Changes' : 'Add Milestone'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── RESERVE / FULFIL MODAL ─────────────────────────────────────────────────────

const ReserveFulfillModal = ({ item, onClose, onDone }) => {
    const [busy,     setBusy]     = useState(false);
    const [err,      setErr]      = useState(null);

    // ── Trim: 'exact' | substitute_variant_id string ────────────────────────
    const [sourceId, setSourceId] = useState('exact');
    const [trimQty,  setTrimQty]  = useState(() =>
        String(Math.max(0, (item.quantity_required || 0) - (item.quantity_reserved || 0)))
    );

    // ── Fabric: per-roll selection map { [roll_id]: meters_string } ──────────
    const [rollSel, setRollSel] = useState(() => {
        if (item.type !== 'fabric') return {};
        const needed = (item.meters_required || 0) - (item.meters_reserved || 0);
        let left = needed;
        const sel = {};
        for (const roll of (item.available_rolls || [])) {
            if (left <= 0) break;
            const free = parseFloat(roll.free_meters ?? roll.meter ?? 0);
            if (free <= 0) continue;
            sel[roll.roll_id] = String(Math.min(free, left).toFixed(2));
            left -= Math.min(free, left);
        }
        return sel;
    });

    const toggleRoll = (rollId, free) =>
        setRollSel(prev =>
            rollId in prev
                ? (({ [rollId]: _, ...rest }) => rest)(prev)
                : { ...prev, [rollId]: String(parseFloat(free || 0).toFixed(2)) }
        );

    const setRollMeters = (rollId, v) =>
        setRollSel(prev => ({ ...prev, [rollId]: v }));

    const totalSelected = Object.values(rollSel).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const needed        = (item.meters_required || 0) - (item.meters_reserved || 0);
    const overReserving = totalSelected > item.meters_required + 0.001;

    // ── Trim: what stock does the currently-selected source actually have? ──
    const trimAvailable = useMemo(() => {
        if (item.type !== 'trim') return Infinity;
        if (sourceId === 'exact') return Number(item.exact_variant_stock ?? 0);
        const sub = (item.substitutes || []).find(s => String(s.substitute_variant_id) === sourceId);
        return Number(sub?.in_stock ?? 0);
    }, [item, sourceId]);
    const trimQtyNum = parseFloat(trimQty) || 0;
    const trimOver   = item.type === 'trim' && trimQtyNum > trimAvailable;

    // ── Fabric: which rolls have been over-reserved past their free meters? ──
    const fabricOverRolls = useMemo(() => {
        if (item.type !== 'fabric') return [];
        const offenders = [];
        for (const roll of (item.available_rolls || [])) {
            const v = parseFloat(rollSel[roll.roll_id] ?? 0);
            const free = parseFloat(roll.free_meters ?? roll.meter ?? 0);
            if (v > free + 0.001) offenders.push({ rollId: roll.roll_id, free, v });
        }
        return offenders;
    }, [item, rollSel]);
    const fabricOver = item.type === 'fabric' && fabricOverRolls.length > 0;

    const handleConfirm = async () => {
        setBusy(true); setErr(null);
        try {
            if (item.type === 'fabric') {
                const entries = Object.entries(rollSel).filter(([, v]) => parseFloat(v) > 0);
                if (entries.length === 0) { setErr('Select at least one roll and enter meters'); setBusy(false); return; }
                if (fabricOverRolls.length > 0) {
                    setErr('One or more rolls exceed available meters. Reduce before saving.');
                    setBusy(false);
                    return;
                }
                for (const [rollId, v] of entries) {
                    await planningApi.reserveFabric(item.req_id, {
                        fabric_roll_id:  parseInt(rollId),
                        meters_reserved: parseFloat(v),
                    });
                }
            } else if (item.type === 'trim') {
                const q = parseFloat(trimQty);
                if (!q || q <= 0) { setErr('Enter a quantity greater than 0'); setBusy(false); return; }
                if (q > trimAvailable) {
                    setErr(`Only ${trimAvailable.toLocaleString()} ${item.unit} available from the selected source.`);
                    setBusy(false);
                    return;
                }
                const body = { quantity_reserved: q };
                if (sourceId !== 'exact') body.trim_item_variant_id = parseInt(sourceId);
                else if (item.exact_variant_id) body.trim_item_variant_id = parseInt(item.exact_variant_id);
                await planningApi.reserveTrim(item.req_id, body);
            }
            onDone();
        } catch(e) { setErr(e?.response?.data?.error || 'Failed to reserve'); }
        finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-100 shrink-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {item.type === 'fabric' ? 'Reserve Fabric Rolls' : 'Fulfil Trim Requirement'}
                    </p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.subtitle}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">

                    {/* ── FABRIC ────────────────────────────────────────────── */}
                    {item.type === 'fabric' && (<>
                        {/* Stock summary */}
                        <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 rounded-xl p-3">
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Required</p>
                                <p className="text-sm font-bold text-slate-700">{item.meters_required.toFixed(2)} m</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Already Reserved</p>
                                <p className="text-sm font-bold text-slate-700">{(item.meters_reserved || 0).toFixed(2)} m</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">{item.inStock ? 'Available' : 'Short'}</p>
                                <p className={`text-sm font-bold ${item.inStock ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {item.meters_available.toFixed(2)} m
                                </p>
                            </div>
                        </div>

                        {/* Roll selection */}
                        {item.available_rolls.length === 0 ? (
                            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                No rolls in stock — record a fabric intake first.
                            </p>
                        ) : (
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    Select Rolls to Reserve
                                </p>
                                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                    {item.available_rolls.map(roll => {
                                        const free     = parseFloat(roll.free_meters ?? roll.meter ?? 0);
                                        const checked  = roll.roll_id in rollSel;
                                        const metersV  = rollSel[roll.roll_id] ?? '';
                                        return (
                                            <div key={roll.roll_id}
                                                className={`rounded-xl border-2 transition-all ${checked ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-slate-50'}`}>
                                                {/* Roll header row */}
                                                <button type="button"
                                                    onClick={() => toggleRoll(roll.roll_id, free)}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                                                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checked ? 'border-violet-500 bg-violet-500' : 'border-slate-300 bg-white'}`}>
                                                        {checked && <CheckCircle2 size={10} className="text-white" strokeWidth={3} />}
                                                    </span>
                                                    <span className="font-mono font-bold text-xs text-indigo-600">R-{roll.roll_id}</span>
                                                    <div className="flex-1 min-w-0">
                                                        {roll.challan_number && <span className="text-[10px] text-slate-400">{roll.challan_number}</span>}
                                                        {roll.supplier_name  && <span className="text-[10px] text-slate-400 ml-1">· {roll.supplier_name}</span>}
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-[10px] font-bold text-slate-500">
                                                            {parseFloat(roll.meter ?? roll.total_meter ?? 0).toFixed(1)} m total
                                                        </p>
                                                        <p className="text-[10px] font-bold text-emerald-600">
                                                            {free.toFixed(1)} m free
                                                        </p>
                                                    </div>
                                                </button>

                                                {/* Meters input — only when checked */}
                                                {checked && (
                                                    <div className="px-3 pb-2.5 flex items-center gap-2">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase shrink-0">
                                                            Meters to reserve
                                                        </label>
                                                        <input
                                                            type="number" min="0.01" step="0.01"
                                                            max={free}
                                                            value={metersV}
                                                            onChange={e => setRollMeters(roll.roll_id, e.target.value)}
                                                            className="flex-1 text-xs border border-violet-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-400 bg-white font-bold text-slate-800"
                                                        />
                                                        <span className="text-[10px] text-slate-400 shrink-0">m</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Running total */}
                                <div className={`mt-3 flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold ${
                                    overReserving
                                        ? 'bg-amber-50 border border-amber-200 text-amber-700'
                                        : totalSelected >= needed - 0.001
                                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                                            : 'bg-slate-50 border border-slate-200 text-slate-600'
                                }`}>
                                    <span>Selected total</span>
                                    <span>{totalSelected.toFixed(2)} m
                                        {overReserving
                                            ? <span className="ml-1 font-normal text-amber-600">· exceeds requirement</span>
                                            : needed > 0
                                                ? <span className="ml-1 font-normal opacity-70">of {needed.toFixed(2)} m needed</span>
                                                : null
                                        }
                                    </span>
                                </div>

                                {fabricOverRolls.length > 0 && (
                                    <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-semibold">
                                        {fabricOverRolls.length} roll{fabricOverRolls.length === 1 ? '' : 's'} exceed{fabricOverRolls.length === 1 ? 's' : ''} available meters — reduce before saving.
                                    </p>
                                )}
                            </div>
                        )}
                    </>)}

                    {/* ── TRIM ──────────────────────────────────────────────── */}
                    {item.type === 'trim' && (<>
                        <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 rounded-xl p-3">
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Required</p>
                                <p className="text-sm font-bold text-slate-700">{item.quantity_required.toLocaleString()} {item.unit}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Reserved</p>
                                <p className="text-sm font-bold text-slate-700">{item.quantity_reserved.toLocaleString()} {item.unit}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Still Needed</p>
                                <p className={`text-sm font-bold ${item.inStock ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {item.inStock
                                        ? '✓ Fulfilled'
                                        : `${(item.quantity_required - item.quantity_reserved).toLocaleString()} ${item.unit}`}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Reserve From</p>
                            <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${sourceId === 'exact' ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-slate-300'}`}>
                                <input type="radio" name="src" value="exact" checked={sourceId === 'exact'} onChange={() => setSourceId('exact')} className="sr-only" />
                                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${sourceId === 'exact' ? 'border-violet-500 bg-violet-500' : 'border-slate-300'}`}>
                                    {sourceId === 'exact' && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-700 truncate">{item.title}</p>
                                    <p className="text-[10px] text-slate-400">Exact match</p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${(item.exact_variant_stock ?? 0) > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                                    {item.exact_variant_stock != null ? `${item.exact_variant_stock.toLocaleString()} in stock` : 'Unknown'}
                                </span>
                            </label>
                            {item.substitutes.length === 0 && (
                                <p className="text-xs text-slate-400 italic px-1">No substitutes configured for this variant.</p>
                            )}
                            {item.substitutes.map(s => {
                                const sid = String(s.substitute_variant_id);
                                
                                return (
                                    <label key={sid} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${sourceId === sid ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-slate-300'}`}>
                                        <input type="radio" name="src" value={sid} checked={sourceId === sid} onChange={() => setSourceId(sid)} className="sr-only" />
                                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${sourceId === sid ? 'border-violet-500 bg-violet-500' : 'border-slate-300'}`}>
                                            {sourceId === sid && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-700 truncate">
                                                {s.item_name}{s.color_name ? ` – ${s.color_name}` : ''}{s.color_number ? ` (${s.color_number})` : ''}
                                            </p>
                                            <p className="text-[10px] text-slate-400">SubstituteD</p>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.in_stock > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                            {s.in_stock != null ? `${s.in_stock.toLocaleString()} in stock` : '—'}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>

                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                                Quantity to Reserve ({item.unit})
                                <span className="ml-2 text-slate-400 normal-case font-semibold">
                                    max {Number.isFinite(trimAvailable) ? trimAvailable.toLocaleString() : '∞'} {item.unit}
                                </span>
                            </label>
                            <input
                                type="number" min={0} step="any" max={trimAvailable}
                                value={trimQty} onChange={e => setTrimQty(e.target.value)}
                                className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none ${trimOver ? 'border-red-300 focus:border-red-400 bg-red-50/40' : 'border-slate-200 focus:border-violet-400'}`}
                            />
                            {trimOver && (
                                <p className="text-[11px] text-red-600 mt-1.5 font-semibold">
                                    Cannot reserve {trimQtyNum.toLocaleString()} {item.unit} — only {trimAvailable.toLocaleString()} available from the selected source.
                                </p>
                            )}
                        </div>
                    </>)}

                    {err && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>}
                </div>

                <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleConfirm}
                        disabled={busy || trimOver || fabricOver}
                        title={trimOver
                            ? `Quantity exceeds the ${trimAvailable.toLocaleString()} ${item.unit} available from this source.`
                            : fabricOver
                                ? 'One or more rolls exceed available meters.'
                                : undefined}
                        className="flex items-center gap-1.5 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-1.5 rounded-lg transition-colors">
                        {busy && <Loader2 size={13} className="animate-spin" />}
                        Reserve & Mark Complete
                    </button>
                </div>
            </div>
        </div>
    );
};
// ─── PRODUCTION TRACKING MODAL ──────────────────────────────────────────────────

const ProductionTrackingModal = ({ sop, salesOrder, sopReqs, onClose, onRefresh }) => {
    const DAYS = 60;
    const [weekOf,     setWeekOf]     = useState(() => {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 7); return d;
    });
    const [selId,      setSelId]      = useState(null);
    const [actionMode, setActionMode] = useState(null);
    const [openReqId,  setOpenReqId]  = useState(null);
    const [reservationsItem, setReservationsItem] = useState(null);  // null = closed; item = show its reservations modal
    const [expandAll,  setExpandAll]  = useState(false);
    const [expandedTrimGroups, setExpandedTrimGroups] = useState(new Set());
    const toggleTrimGroup = useCallback((tid) => setExpandedTrimGroups(s => {
        const n = new Set(s); n.has(tid) ? n.delete(tid) : n.add(tid); return n;
    }), []);
    const [addModal,   setAddModal]   = useState(false);
    const [editItem,   setEditItem]   = useState(null);
    const [busy,       setBusy]       = useState(false);
    const [err,        setErr]        = useState(null);
    const [reqForm,    setReqForm]    = useState({ urgency: 'normal', notes: '' });
    const [localReqs,    setLocalReqs]    = useState(sopReqs);
    const [loadingLocal, setLoadingLocal] = useState(!sopReqs);
    const [search,       setSearch]       = useState('');
    const [reserveItem,  setReserveItem]  = useState(null);
    // Bulk-procurement state (shared substitute picker per trim_item_id)
    const [bulkPickerByTrim,   setBulkPickerByTrim]   = useState({});
    const [bulkBusyId,         setBulkBusyId]         = useState(null);
    const [procExpanded,       setProcExpanded]       = useState(false);
    // Per-group, per-requirement exclusions: { [trim_item_id]: Set<requirement_id> }
    const [excludedReqsByTrim, setExcludedReqsByTrim] = useState({});

    const refetchLocal = useCallback(() => {
        planningApi.getRequirements(sop.id)
            .then(r => setLocalReqs(r.data?.data ?? r.data))
            .catch(() => {});
    }, [sop.id]);

    useEffect(() => {
        setLoadingLocal(true);
        planningApi.getRequirements(sop.id)
            .then(r => setLocalReqs(r.data?.data ?? r.data))
            .catch(() => {})
            .finally(() => setLoadingLocal(false));
    }, [sop.id]);

    const today = new Date(); today.setHours(0, 0, 0, 0);

    const days = Array.from({ length: DAYS }, (_, i) => {
        const d = new Date(weekOf); d.setDate(d.getDate() + i); return d;
    });

    const fabReqs  = localReqs?.fabric_requirements || [];
    const trimReqs = localReqs?.trim_requirements   || [];
    const taItems  = sop.timeline || [];
    console.log('TA items:', taItems);
    // ── Bulk-procurement groups: trims with substitutes covering ≥2 colors ──
    const trimGroups = useMemo(() => {
        const reqs = localReqs?.trim_requirements || [];
        const map = new Map();
        reqs.forEach(r => {
            const key = String(r.trim_item_id ?? `req-${r.id}`);
            if (!map.has(key)) {
                map.set(key, {
                    trim_item_id:   r.trim_item_id,
                    trim_item_name: r.trim_item_name,
                    item_code:      r.item_code,
                    unit:           r.unit_of_measure || 'pcs',
                    requirements:   [],
                });
            }
            map.get(key).requirements.push(r);
        });
        return [...map.values()]
            .filter(g => g.requirements.length >= 2)
            .map(g => {
                // For each substitute variant, track which requirements have it.
                const variantMap = new Map();
                g.requirements.forEach(r => {
                    (r.stock_suggestion?.substitutes || []).forEach(s => {
                        const sid = Number(s.substitute_variant_id);
                        if (!variantMap.has(sid)) {
                            variantMap.set(sid, { sample: s, reqIds: new Set() });
                        }
                        variantMap.get(sid).reqIds.add(r.id);
                    });
                });
                // Keep only variants that cover ≥2 colors in this group.
                const commonSubstitutes = [];
                variantMap.forEach((v, sid) => {
                    if (v.reqIds.size >= 2) {
                        commonSubstitutes.push({
                            ...v.sample,
                            substitute_variant_id: sid,
                            matches_req_ids:       [...v.reqIds],
                            matches_count:         v.reqIds.size,
                        });
                    }
                });
                // Best coverage first, then by stock.
                commonSubstitutes.sort((a, b) =>
                    (b.matches_count - a.matches_count) || ((b.in_stock ?? 0) - (a.in_stock ?? 0))
                );
                const totalRequired = g.requirements.reduce((s, r) => s + Number(r.quantity_required || 0), 0);
                const totalReserved = g.requirements.reduce((s, r) => s + Number(r.quantity_reserved || 0), 0);
                const fulfilled     = g.requirements.filter(r => r.is_fulfilled).length;
                return {
                    ...g,
                    commonSubstitutes,
                    totalRequired,
                    totalReserved,
                    fulfilled,
                    pendingCount: g.requirements.length - fulfilled,
                };
            })
            .filter(g => g.pendingCount > 0 && g.commonSubstitutes.length > 0);
    }, [localReqs]);

    // Returns the set of requirement_ids the chosen variant can be applied to.
    const eligibleReqIds = (group, variantId) => {
        const sub = (group.commonSubstitutes || []).find(s => Number(s.substitute_variant_id) === Number(variantId));
        return new Set(sub?.matches_req_ids || []);
    };
    // Set of currently-excluded requirement ids for a given group.
    const excludedSet = (groupId) => excludedReqsByTrim[groupId] || new Set();

    // Pick a variant — clears any per-req exclusions for this group so the
    // user starts a fresh selection. Pass null to clear the picker.
    const pickVariantForGroup = (groupId, variantId) => {
        setBulkPickerByTrim(p => ({ ...p, [groupId]: variantId }));
        setExcludedReqsByTrim(p => ({ ...p, [groupId]: new Set() }));
    };

    // Toggle a single requirement in/out of the bulk action.
    const toggleExcludeReq = (groupId, reqId) => {
        setExcludedReqsByTrim(p => {
            const s = new Set(p[groupId] || []);
            if (s.has(reqId)) s.delete(reqId); else s.add(reqId);
            return { ...p, [groupId]: s };
        });
    };

    // Final set of req ids that a bulk action will touch:
    // covered by the variant AND not fulfilled AND not user-excluded.
    const actionableReqIds = (group, variantId) => {
        const eligible = eligibleReqIds(group, variantId);
        const excluded = excludedSet(group.trim_item_id);
        return new Set(
            group.requirements
                .filter(r => !r.is_fulfilled && eligible.has(r.id) && !excluded.has(r.id))
                .map(r => r.id)
        );
    };

    const handleBulkReserve = async (group) => {
        const variantId = bulkPickerByTrim[group.trim_item_id];
        if (!variantId) { setErr('Pick a substitute variant first.'); return; }
        const targets = actionableReqIds(group, variantId);
        setBulkBusyId(group.trim_item_id); setErr(null);
        try {
            let touched = 0;
            for (const r of group.requirements) {
                if (!targets.has(r.id)) continue;
                const pending = Number(r.quantity_required || 0) - Number(r.quantity_reserved || 0);
                if (pending <= 0) continue;
                await planningApi.reserveTrim(r.id, {
                    quantity_reserved:    pending,
                    trim_item_variant_id: parseInt(variantId, 10),
                });
                touched++;
            }
            if (touched === 0) setErr('No requirements selected for this variant.');
            refetchLocal(); onRefresh();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Bulk reserve failed.');
        } finally {
            setBulkBusyId(null);
        }
    };

    const handleBulkRaise = async (group) => {
        const variantId = bulkPickerByTrim[group.trim_item_id];
        if (!variantId) { setErr('Pick a substitute variant first.'); return; }
        const targets = actionableReqIds(group, variantId);
        setBulkBusyId(group.trim_item_id); setErr(null);
        try {
            let touched = 0;
            for (const r of group.requirements) {
                if (!targets.has(r.id)) continue;
                const pending = Number(r.quantity_required || 0) - Number(r.quantity_reserved || 0);
                if (pending <= 0) continue;
                await purchaseDeptApi.raiseRequirement({
                    sales_order_product_id:    sop.id,
                    type:                      'trim',
                    urgency:                   'normal',
                    notes:                     `Bulk raised for ${group.trim_item_name} (substitute applied across ${targets.size} colors)`,
                    quantity_required:         pending,
                    unit_of_measure:           r.unit_of_measure,
                    trim_item_id:              r.trim_item_id,
                    trim_item_variant_id:      parseInt(variantId, 10),
                    plan_trim_requirement_id:  r.id,
                });
                touched++;
            }
            if (touched === 0) setErr('No requirements selected for this variant.');
            refetchLocal(); onRefresh();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Bulk raise failed.');
        } finally {
            setBulkBusyId(null);
        }
    };

    const reqTaIds = new Set([
        ...fabReqs.filter(r => r.ta_id).map(r => r.ta_id),
        ...trimReqs.filter(r => r.ta_id).map(r => r.ta_id),
    ]);

    const allItems = [
        ...fabReqs.filter(r => r.ta_id).map(r => {
            const req = Number(r.meters_required || 0);
            const res = Number(r.meters_reserved || 0);
            return ({
            id:                    r.ta_id,
            req_id:                r.id,
            title:                 `${r.fabric_type_name}${r.color_name ? ' – ' + r.color_name : ''}${r.color_number ? ` · ${r.color_number}` : ''}`,
            subtitle:              `${req.toFixed(1)} m${res > 0 ? ` · Reserved ${res.toFixed(1)} m` : ''}`,
            type:                  'fabric',
            status:                r.ta_status    || 'pending',
            priority:              r.ta_priority  || 'medium',
            start_date:            r.ta_start_date || null,
            end_date:              r.ta_end_date   || null,
            notes:                 r.ta_notes || null,
            isReq:                 true,
            unit:                  'm',
            meters_required:       r.meters_required || 0,
            meters_reserved:       r.meters_reserved || 0,
            meters_available:      r.stock_suggestion?.total_meters_available || 0,
            available_rolls:       r.stock_suggestion?.available_rolls || [],
            inStock:               (r.stock_suggestion?.total_meters_available || 0) >= (r.meters_required || 0),
            calculation_breakdown: r.calculation_breakdown || null,
            procurement_events:    r.procurement_events    || [],
            reservations:          r.reservations          || [],
            purchase_requirements: r.purchase_requirements || [],
            });
        }),
        ...trimReqs.filter(r => r.ta_id).map(r => {
            const reqQ = Number(r.quantity_required || 0);
            const resQ = Number(r.quantity_reserved || 0);
            const uom  = r.unit_of_measure || 'pcs';
            return ({
            id:                    r.ta_id,
            req_id:                r.id,
            title:                 `${r.trim_item_name}${r.color_name ? ' – ' + r.color_name : ''}${r.color_number ? ` · ${r.color_number}` : ''}${r.variant_size ? ` · Sz ${r.variant_size}` : ''}`,
            subtitle:              `${reqQ.toLocaleString()} ${uom}${resQ > 0 ? ` · Reserved ${resQ.toLocaleString()} ${uom}` : ''}`,
            type:                  'trim',
            status:                r.ta_status    || 'pending',
            priority:              r.ta_priority  || 'medium',
            start_date:            r.ta_start_date || null,
            end_date:              r.ta_end_date   || null,
            notes:                 r.ta_notes || null,
            isReq:                 true,
            unit:                  r.unit_of_measure || 'pcs',
            inStock:               r.is_fulfilled,
            trim_item_id:          r.trim_item_id ?? null,
            trim_item_name:        r.trim_item_name || '',
            trim_item_variant_id:  r.trim_item_variant_id ?? null,
            color_name:            r.color_name || '',
            variant_color_name:    r.variant_color_name || null,
            is_substitute:         !!r.is_substitute,
            exact_variant_id:      r.stock_suggestion?.exact_variant?.id || null,
            exact_variant_stock:   r.stock_suggestion?.exact_variant?.in_stock ?? null,
            // Defensive cleanup for backend join-fanout (see trim_item_substitutes — UNIQUE
            // (original_variant_id, substitute_variant_id) guarantees no duplicate rows in the
            // table; duplicates in the response come from SELECT-side joins).
            //   1. Drop substitutes whose color matches the requirement's own color (degenerate).
            //   2. Dedupe by substitute_variant_id (collapses fanned-out identical rows; keep highest in_stock).
            //   3. Collapse same-color cross-size variants by color_number (keep highest in_stock).
            //   4. Sort by in_stock desc so usable substitutes surface first.
            substitutes:           (() => {
                const reqColorNum = String(r.color_number ?? '').trim();
                const byId = new Map();
                (r.stock_suggestion?.substitutes || []).forEach(s => {
                    const id = s.substitute_variant_id ?? s.id;
                    if (id == null) return;
                    const subColorNum = String(s.color_number ?? '').trim();
                    if (reqColorNum && subColorNum && reqColorNum === subColorNum) return;
                    const prev = byId.get(id);
                    if (!prev || Number(s.in_stock ?? 0) > Number(prev.in_stock ?? 0)) {
                        byId.set(id, s);
                    }
                });
                const byColor = new Map();
                [...byId.values()].forEach(s => {
                    const ck = String(s.color_number ?? s.color_name ?? s.substitute_variant_id);
                    const prev = byColor.get(ck);
                    if (!prev || Number(s.in_stock ?? 0) > Number(prev.in_stock ?? 0)) {
                        byColor.set(ck, s);
                    }
                });
                return [...byColor.values()].sort(
                    (a, b) => Number(b.in_stock ?? 0) - Number(a.in_stock ?? 0)
                );
            })(),
            quantity_required:     r.quantity_required || 0,
            quantity_reserved:     r.quantity_reserved || 0,
            calculation_breakdown: r.calculation_breakdown || null,
            procurement_events:    r.procurement_events    || [],
            reservations:          r.reservations          || [],
            purchase_requirements: r.purchase_requirements || [],
            });
        }),
        ...taItems
            .filter(it => !reqTaIds.has(it.id) && it.production_plan_item_id == null)
            .map(it => ({
                id:         it.id,
                title:      it.title,
                subtitle:   it.category,
                type:       'manual',
                status:     it.status,
                start_date: it.start_date,
                end_date:   it.end_date,
                notes:      it.notes,
                isReq:      false,
            })),
    ];

    const q             = search.toLowerCase().trim();
    const filteredItems = q
        ? allItems.filter(it =>
            it.title.toLowerCase().includes(q) ||
            (it.subtitle || '').toLowerCase().includes(q)
          )
        : allItems;

    const today2 = new Date(); today2.setHours(0, 0, 0, 0);
    const isOverdue = it => it.end_date && new Date(it.end_date) < today2 && it.status !== 'completed';
    const STATUS_GROUPS = [
        { key: 'overdue',     label: 'Overdue',     dot: 'bg-red-500',     filter: it =>  isOverdue(it) },
        { key: 'delayed',     label: 'Delayed',     dot: 'bg-red-400',     filter: it => !isOverdue(it) && it.status === 'delayed'      },
        { key: 'in-progress', label: 'In Progress', dot: 'bg-blue-400',    filter: it => !isOverdue(it) && it.status === 'in-progress'  },
        { key: 'pending',     label: 'Pending',     dot: 'bg-amber-400',   filter: it => !isOverdue(it) && it.status === 'pending'      },
        { key: 'completed',   label: 'Complete',    dot: 'bg-emerald-500', filter: it => !isOverdue(it) && it.status === 'completed'    },
    ];
    const trimFilteredItems    = filteredItems.filter(it => it.type === 'trim');
    const nonTrimFilteredItems = filteredItems.filter(it => it.type !== 'trim');

    const trimItemGroups = (() => {
        const map = new Map();
        trimFilteredItems.forEach(item => {
            const key = item.trim_item_id;
            if (!map.has(key)) map.set(key, { trim_item_id: key, trim_item_name: item.trim_item_name, unit: item.unit, variants: [] });
            map.get(key).variants.push(item);
        });
        return [...map.values()].map(g => {
            const startDates = g.variants.map(v => v.start_date).filter(Boolean);
            const endDates   = g.variants.map(v => v.end_date).filter(Boolean);
            const hasOverdue = g.variants.some(v => isOverdue(v));
            const dominant   = hasOverdue ? 'pending'
                : g.variants.some(v => v.status === 'delayed')     ? 'delayed'
                : g.variants.some(v => v.status === 'in-progress') ? 'in-progress'
                : g.variants.some(v => v.status === 'pending')     ? 'pending'
                : 'completed';
            return {
                ...g,
                type: 'trim_group',
                id: `tg-${g.trim_item_id}`,
                total_required: g.variants.reduce((s, v) => s + Number(v.quantity_required || 0), 0),
                total_reserved: g.variants.reduce((s, v) => s + Number(v.quantity_reserved || 0), 0),
                start_date: startDates.length ? startDates.reduce((a, b) => a < b ? a : b) : null,
                end_date:   endDates.length   ? endDates.reduce((a, b)   => a > b ? a : b) : null,
                status: dominant,
                overdue: hasOverdue,
                reservations: g.variants.flatMap(v => v.reservations || []),
                purchase_requirements: g.variants.flatMap(v => v.purchase_requirements || []),
                procurement_events: g.variants.flatMap(v => v.procurement_events || []),
            };
        });
    })();

    const groups = STATUS_GROUPS.map(g => {
        const regular = nonTrimFilteredItems.filter(g.filter);
        const trimGroupsInStatus = trimItemGroups.filter(tg =>
            g.key === 'overdue'     ? tg.overdue :
            g.key === 'delayed'     ? !tg.overdue && tg.status === 'delayed'     :
            g.key === 'in-progress' ? !tg.overdue && tg.status === 'in-progress' :
            g.key === 'pending'     ? !tg.overdue && tg.status === 'pending'     :
            g.key === 'completed'   ? !tg.overdue && tg.status === 'completed'   : false
        );
        // Flatten: header row followed by its variant child rows
        const trimFlat = trimGroupsInStatus.flatMap(tg => [
            tg,
            ...tg.variants.map(v => ({ ...v, parentTrimGroupId: tg.trim_item_id })),
        ]);
        return { ...g, items: [...regular, ...trimFlat] };
    }).filter(g => g.items.length > 0);


    const prevWindow = () => setWeekOf(p => { const n = new Date(p); n.setDate(n.getDate() - 14); return n; });
    const nextWindow = () => setWeekOf(p => { const n = new Date(p); n.setDate(n.getDate() + 14); return n; });
    const goToday    = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 7); setWeekOf(d); };

    const tlStart = days[0];
    const tlEnd   = (() => { const d = new Date(days[DAYS - 1]); d.setDate(d.getDate() + 1); return d; })();
    const tlSpan  = tlEnd - tlStart;

    const barStyle = (item) => {
        if (!item.start_date && !item.end_date) return null;
        const s    = new Date(item.start_date || item.end_date);
        const eRaw = new Date(item.end_date   || item.start_date);
        const eInc = new Date(eRaw); eInc.setDate(eInc.getDate() + 1);
        const left  = Math.max(0,   (s    - tlStart) / tlSpan) * 100;
        const right = Math.min(100, (eInc - tlStart) / tlSpan) * 100;
        if (right <= 0 || left >= 100) return null;
        return { left: `${left}%`, width: `${Math.max(0.5, right - left)}%` };
    };

    const todayPct = ((today - tlStart) / tlSpan) * 100;

    const ST = {
        pending:       { bg: 'bg-amber-400',   label: 'Pending'     },
        'in-progress': { bg: 'bg-blue-400',    label: 'In Progress' },
        completed:     { bg: 'bg-emerald-500', label: 'Complete'    },
        delayed:       { bg: 'bg-red-400',     label: 'Delayed'     },
    };

    const EVT_ST = {
        pending:      { bg: 'bg-amber-400',   ring: 'ring-amber-200',   label: 'Pending'    },
        'in-transit': { bg: 'bg-blue-400',    ring: 'ring-blue-200',    label: 'In Transit' },
        received:     { bg: 'bg-emerald-500', ring: 'ring-emerald-200', label: 'Received'   },
        delayed:      { bg: 'bg-red-500',     ring: 'ring-red-200',     label: 'Delayed'    },
    };

    const counts = { pending: 0, 'in-progress': 0, completed: 0, delayed: 0 };
    allItems.forEach(it => { if (counts[it.status] !== undefined) counts[it.status]++; });

    const handleMarkAvailable = async (item) => {
        setBusy(true); setErr(null);
        try {
            await taApi.updateTimelineItem(item.id, { status: 'completed' });
            refetchLocal(); onRefresh(); setSelId(null);
        } catch(e) { setErr(e?.response?.data?.error || 'Failed'); }
        finally { setBusy(false); }
    };

    const handleRaiseRequirement = async (item) => {
        setBusy(true); setErr(null);
        try {
            const rawFab  = fabReqs.find(r => r.id === item.req_id);
            const rawTrim = trimReqs.find(r => r.id === item.req_id);

            const base = {
                sales_order_product_id: sop.id,
                urgency:                reqForm.urgency || 'normal',
                notes:                  reqForm.notes || null,
            };

            const formQty = parseFloat(reqForm.quantity);
            const qty     = Number.isFinite(formQty) && formQty > 0 ? formQty : null;

            if (item.type === 'fabric' && rawFab) {
                await purchaseDeptApi.raiseRequirement({
                    ...base,
                    type:                       'fabric',
                    meters_required:            qty ?? rawFab.meters_required,
                    fabric_type_id:             rawFab.fabric_type_id,
                    fabric_color_id:            rawFab.fabric_color_id,
                    plan_fabric_requirement_id: rawFab.id,
                });
            } else if (item.type === 'trim' && rawTrim) {
                if (!reqForm.trim_item_variant_id) {
                    throw new Error('Pick a variant to procure (exact match or substitute).');
                }
                await purchaseDeptApi.raiseRequirement({
                    ...base,
                    type:                      'trim',
                    quantity_required:         qty ?? rawTrim.quantity_required,
                    unit_of_measure:           rawTrim.unit_of_measure,
                    trim_item_id:              rawTrim.trim_item_id,
                    trim_item_variant_id:      reqForm.trim_item_variant_id,
                    plan_trim_requirement_id:  rawTrim.id,
                });
            }
            await taApi.updateTimelineItem(item.id, { status: 'in-progress', notes: reqForm.notes || null });
            refetchLocal(); onRefresh(); setActionMode(null);
        } catch(e) { setErr(e?.response?.data?.error || e.message || 'Failed to raise requirement'); }
        finally { setBusy(false); }
    };

    const generateFabricPDF = () => {
        const completed = fabReqs.filter(r => r.ta_status === 'completed');
        const doc = new jsPDF();
        const pageW = doc.internal.pageSize.getWidth();
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en', { dateStyle: 'short' }) : '—';

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(`Fabric T&A — ${sop.product_name}`, 14, 18);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toLocaleDateString('en', { dateStyle: 'medium' })}`, 14, 25);

        let y = 32;
        let grandRequired = 0;
        let grandReserved = 0;

        completed.forEach((r, idx) => {
            grandRequired += r.meters_required || 0;
            grandReserved += r.meters_reserved || 0;

            if (y > 255) { doc.addPage(); y = 14; }

            // Requirement heading
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(`${r.fabric_type_name}${r.color_name ? ' – ' + r.color_name : ''}${r.color_number ? ` · ${r.color_number}` : ''}`, 14, y);
            doc.setFont(undefined, 'normal');
            doc.setFontSize(8);
            doc.setTextColor(80);
            doc.text(
                `Required: ${fmt(r.meters_required)} m   |   Reserved: ${fmt(r.meters_reserved)} m${r.calculation_breakdown ? `   |   Formula: ${r.calculation_breakdown.base_quantity_per_set ?? ''}m × ${r.calculation_breakdown.total_sets ?? ''} sets + ${r.calculation_breakdown.wastage_percentage ?? 0}% waste` : ''}`,
                14, y + 5
            );
            doc.setTextColor(0);
            y += 12;

            const reservations = r.reservations || [];

            if (reservations.length === 0) {
                doc.setFontSize(8);
                doc.setTextColor(160);
                doc.text('No rolls reserved.', 18, y);
                doc.setTextColor(0);
                y += 6;
            } else {
                // Group reservations by roll_color_name
                const byColor = {};
                reservations.forEach(res => {
                    const key = `${res.roll_color_name || 'Unknown'}|||${res.roll_color_number || ''}`;
                    if (!byColor[key]) byColor[key] = [];
                    byColor[key].push(res);
                });

                Object.entries(byColor).forEach(([colorKey, rolls]) => {
                    const [colorName, colorNumber] = colorKey.split('|||');
                    const colorTotal = rolls.reduce((s, rv) => s + parseFloat(rv.meters_reserved || 0), 0);
                    const colorLabel = `${colorName}${colorNumber ? ` (${colorNumber})` : ''}  —  ${colorTotal.toFixed(2)} m reserved`;

                    autoTable(doc, {
                        startY: y,
                        head: [
                            [{ content: colorLabel, colSpan: 7, styles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 } }],
                            ['Roll ID', 'Bale No.', 'Reserved (m)', 'Roll Total (m)', 'Status', 'Supplier', 'Bill Date'],
                        ],
                        body: [
                            ...rolls.map(rv => [
                                rv.fabric_roll_id,
                                rv.roll_bale_no || '—',
                                fmt(rv.meters_reserved),
                                fmt(rv.roll_total_meters),
                                rv.roll_status || '—',
                                rv.supplier_name || '—',
                                fmtDate(rv.intake_bill_date),
                            ]),
                            [
                                { content: 'Subtotal', colSpan: 2, styles: { fontStyle: 'bold' } },
                                { content: `${colorTotal.toFixed(2)} m`, styles: { fontStyle: 'bold' } },
                                '', '', '', '',
                            ],
                        ],
                        styles: { fontSize: 7.5 },
                        headStyles: { fillColor: [99, 102, 241] },
                        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
                    });
                    y = doc.lastAutoTable.finalY + 5;
                });
            }

            if (idx < completed.length - 1) {
                if (y > 255) { doc.addPage(); y = 14; }
                doc.setDrawColor(210);
                doc.line(14, y, pageW - 14, y);
                doc.setDrawColor(0);
                y += 6;
            }
        });

        // Grand total footer
        if (y > 255) { doc.addPage(); y = 14; }
        autoTable(doc, {
            startY: y + 6,
            head: [['', 'Total Required (m)', 'Total Reserved (m)']],
            body: [['Grand Total', `${grandRequired.toFixed(2)} m`, `${grandReserved.toFixed(2)} m`]],
            styles: { fontSize: 9, fontStyle: 'bold' },
            headStyles: { fillColor: [30, 41, 59] },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        });

        doc.save(`fabric-ta-${sop.product_name.replace(/\s+/g, '-')}.pdf`);
    };

    const generateTrimPDF = () => {
        const completed = allItems.filter(it => it.type === 'trim' && it.status === 'completed');
        const doc   = new jsPDF();
        const pageW = doc.internal.pageSize.getWidth();
        doc.setFontSize(14);
        doc.text(`Trim T&A — ${sop.product_name}`, 14, 18);
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toLocaleDateString('en', { dateStyle: 'medium' })}`, 14, 25);

        // Group completed trim items by reserved variant.
        const groupsMap = new Map();
        completed.forEach(it => {
            const key = String(it.trim_item_variant_id ?? `unassigned-${it.req_id ?? it.id}`);
            if (!groupsMap.has(key)) {
                groupsMap.set(key, {
                    trim_item_variant_id: it.trim_item_variant_id ?? null,
                    trim_item_name:       it.trim_item_name || (it.title || '').split(' – ')[0] || 'Trim',
                    variant_color_name:   it.variant_color_name,
                    is_substitute:        !!it.is_substitute,
                    unit:                 it.unit || 'pcs',
                    items:                [],
                    totalRequired:        0,
                    totalReserved:        0,
                });
            }
            const g = groupsMap.get(key);
            g.items.push(it);
            g.totalRequired += Number(it.quantity_required || 0);
            g.totalReserved += Number(it.quantity_reserved || 0);
        });
        const groups = [...groupsMap.values()];

        let y = 30;
        let grandRequired = 0;
        let grandReserved = 0;

        if (groups.length === 0) {
            doc.setFontSize(10);
            doc.text('No completed trim T&A items.', 14, y + 6);
        }

        groups.forEach((g, idx) => {
            if (y > 250) { doc.addPage(); y = 14; }
            // Variant header — "<Trim> <Variant Color> reserved for: <Color1>, <Color2>, …"
            const requestedColors = g.items
                .map(it => it.color_name || (it.title || '').split(' – ')[1] || '—')
                .filter(Boolean);
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            const variantLabel =
                `${g.trim_item_name}` +
                `${g.variant_color_name ? ` ${g.variant_color_name}` : ''}` +
                `${g.variant_color_number ? ` · ${g.variant_color_number}` : ''}` +
                `${g.variant_size ? ` · Sz ${g.variant_size}` : ''}` +
                ` reserved for: ${requestedColors.join(', ') || '—'}` +
                `${g.is_substitute ? '  (substitute)' : ''}`;
            const wrapped = doc.splitTextToSize(variantLabel, pageW - 28);
            doc.text(wrapped, 14, y);
            const headerLines = Array.isArray(wrapped) ? wrapped.length : 1;
            y += headerLines * 5;
            doc.setFont(undefined, 'normal');
            doc.setFontSize(8);
            doc.text(
                `Variant ID: ${g.trim_item_variant_id ?? '—'}  ·  ${g.items.length} requirement${g.items.length === 1 ? '' : 's'}`,
                14, y
            );
            y += 4;

            autoTable(doc, {
                startY: y,
                head: [['Requested Color', 'Required', 'Reserved', 'Formula']],
                body: [
                    ...g.items.map(it => [
                        it.color_name || (it.title || '').split(' – ')[1] || '—',
                        `${fmt(it.quantity_required)} ${g.unit}`,
                        `${fmt(it.quantity_reserved)} ${g.unit}`,
                        it.calculation_breakdown
                            ? `${it.calculation_breakdown.base_quantity_per_set ?? ''}× ${it.calculation_breakdown.total_sets ?? ''} sets + ${it.calculation_breakdown.wastage_percentage ?? 0}% waste`
                            : '—',
                    ]),
                    [
                        { content: 'Subtotal', styles: { fontStyle: 'bold' } },
                        { content: `${fmt(g.totalRequired)} ${g.unit}`, styles: { fontStyle: 'bold', halign: 'right' } },
                        { content: `${fmt(g.totalReserved)} ${g.unit}`, styles: { fontStyle: 'bold', halign: 'right' } },
                        { content: '', styles: {} },
                    ],
                ],
                styles: { fontSize: 8 },
                headStyles: { fillColor: [245, 158, 11] },
                columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
            });
            y = doc.lastAutoTable.finalY + 5;
            grandRequired += g.totalRequired;
            grandReserved += g.totalReserved;

            if (idx < groups.length - 1) {
                if (y > 255) { doc.addPage(); y = 14; }
                doc.setDrawColor(210);
                doc.line(14, y, pageW - 14, y);
                doc.setDrawColor(0);
                y += 6;
            }
        });

        // Grand total
        if (groups.length > 0) {
            if (y > 255) { doc.addPage(); y = 14; }
            autoTable(doc, {
                startY: y + 6,
                head: [['', 'Total Required', 'Total Reserved']],
                body: [['Grand Total', fmt(grandRequired), fmt(grandReserved)]],
                styles: { fontSize: 9, fontStyle: 'bold' },
                headStyles: { fillColor: [30, 41, 59] },
                columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
            });
        }

        doc.save(`trim-ta-${sop.product_name.replace(/\s+/g, '-')}.pdf`);
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex" onClick={onClose}>
            <div className="bg-white shadow-2xl w-screen h-screen flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Production Tracking · {sop.product_name}
                            {salesOrder?.order_number && (
                                <span className="ml-1.5 text-slate-300 normal-case">
                                    · Order #{salesOrder.order_number}
                                    {salesOrder.customer_name ? ` · ${salesOrder.customer_name}` : ''}
                                </span>
                            )}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {[
                                { k: 'pending',     cls: 'bg-amber-400',   lbl: 'pending'     },
                                { k: 'in-progress', cls: 'bg-blue-400',    lbl: 'in progress' },
                                { k: 'completed',   cls: 'bg-emerald-500', lbl: 'complete'    },
                                { k: 'delayed',     cls: 'bg-red-400',     lbl: 'delayed'     },
                            ].map(({ k, cls, lbl }) => counts[k] > 0 && (
                                <span key={k} className="flex items-center gap-1 text-xs text-slate-600">
                                    <span className={`w-1.5 h-1.5 rounded-full ${cls}`} /> {counts[k]} {lbl}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                        <button
                            onClick={generateFabricPDF}
                            className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1.5 rounded-lg transition-colors"
                            title="Export completed fabric T&A items as PDF"
                        >
                            Fabric PDF
                        </button>
                        <button
                            onClick={generateTrimPDF}
                            className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg transition-colors"
                            title="Export completed trim T&A items as PDF"
                        >
                            Trim PDF
                        </button>
                        <button
                            onClick={() => { setEditItem(null); setAddModal(true); }}
                            className="flex items-center gap-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            <Plus size={13} /> Add Milestone
                        </button>
                        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Bulk Trim Procurement Groups — collapsible section above the timeline */}
                {(localReqs?.trim_requirements?.length ?? 0) > 0 && (
                    <div className="border-b border-slate-100 bg-amber-50/30">
                        <button
                            onClick={() => setProcExpanded(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-amber-50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <Component size={13} className="text-amber-600" />
                                <span className="text-sm font-bold text-slate-800">Trim Procurement Groups</span>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${trimGroups.length > 0 ? 'text-amber-700 bg-amber-100' : 'text-slate-500 bg-slate-100'}`}>
                                    {trimGroups.length === 0
                                        ? 'No bulk groups available'
                                        : `${trimGroups.length} group${trimGroups.length === 1 ? '' : 's'} · ${trimGroups.reduce((s, g) => s + g.pendingCount, 0)} pending`}
                                </span>
                            </div>
                            {procExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                        </button>
                        {procExpanded && (
                            <div className="px-5 pb-3 space-y-3 max-h-[45vh] overflow-y-auto">
                                {trimGroups.length === 0 ? (
                                    <div className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
                                        <p className="font-bold text-slate-700 mb-1">No qualifying groups yet.</p>
                                        <p className="text-slate-500">
                                            This panel activates when a trim spans <strong>≥2 color requirements</strong> AND has at least one <strong>substitute variant that matches every color</strong>. Manage single-color trims one-by-one in the timeline below.
                                        </p>
                                    </div>
                                ) : (<>
                                <p className="text-[10px] text-slate-500 italic">
                                    These trims have multiple colors with one or more substitute variants matching <em>every</em> color. Pick a substitute once and reserve or raise a PR for the whole group.
                                </p>
                                {trimGroups.map(g => {
                                    const picked = bulkPickerByTrim[g.trim_item_id];
                                    const busy   = bulkBusyId === g.trim_item_id;
                                    return (
                                        <div key={g.trim_item_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-slate-800 truncate">
                                                        {g.trim_item_name}
                                                        {g.item_code ? <span className="text-[10px] font-mono text-slate-400 ml-1.5">{g.item_code}</span> : null}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500">
                                                        {g.requirements.length} color{g.requirements.length === 1 ? '' : 's'}
                                                        {' · '}<span className="text-emerald-700 font-bold">{g.fulfilled} fulfilled</span>
                                                        {' · '}<span className="text-amber-700 font-bold">{g.pendingCount} pending</span>
                                                        {' · Total '}{g.totalRequired.toLocaleString()} {g.unit}
                                                        {' · Reserved '}{g.totalReserved.toLocaleString()} {g.unit}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Common substitutes picker */}
                                            <div className="px-3 py-2 space-y-1.5">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                                    Available substitutes (each covers ≥2 colors in this group)
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                    {g.commonSubstitutes.map(s => {
                                                        const sid = Number(s.substitute_variant_id);
                                                        const sel = picked === sid;
                                                        const coversAll = s.matches_count >= g.requirements.length;
                                                        return (
                                                            <button
                                                                key={sid}
                                                                onClick={() => pickVariantForGroup(g.trim_item_id, sel ? null : sid)}
                                                                disabled={busy}
                                                                className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border-2 transition-colors text-left ${
                                                                    sel
                                                                        ? 'border-violet-400 bg-violet-50'
                                                                        : 'border-slate-200 bg-white hover:border-violet-200'
                                                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                                                            >
                                                                <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${sel ? 'border-violet-500 bg-violet-500' : 'border-slate-300'}`} />
                                                                <span className="flex-1 min-w-0 truncate font-bold text-slate-800">
                                                                    {s.item_name}{s.color_name ? ` – ${s.color_name}` : ''}{s.color_number ? ` (${s.color_number})` : ''}
                                                                </span>
                                                                <span
                                                                    title={`Matches ${s.matches_count} of ${g.requirements.length} colors`}
                                                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${coversAll ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}
                                                                >
                                                                    {s.matches_count}/{g.requirements.length} colors
                                                                </span>
                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${(s.in_stock ?? 0) > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                                                    {s.in_stock != null ? `${Number(s.in_stock).toLocaleString()} stock` : '—'}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Per-color status row + bulk actions */}
                                            {(() => {
                                                const pickedSub = picked
                                                    ? g.commonSubstitutes.find(s => Number(s.substitute_variant_id) === Number(picked))
                                                    : null;
                                                const coveredSet = pickedSub ? new Set(pickedSub.matches_req_ids) : null;
                                                const excluded   = excludedSet(g.trim_item_id);
                                                const targetReqs = pickedSub
                                                    ? g.requirements.filter(r =>
                                                        !r.is_fulfilled && coveredSet.has(r.id) && !excluded.has(r.id)
                                                      )
                                                    : [];
                                                const targetCount = targetReqs.length;
                                                const totalSelectedQty = targetReqs.reduce(
                                                    (sum, r) => sum + Math.max(0, Number(r.quantity_required || 0) - Number(r.quantity_reserved || 0)),
                                                    0
                                                );
                                                const totalInStock = Number(pickedSub?.in_stock ?? 0);
                                                const overStock    = !!pickedSub && totalSelectedQty > totalInStock;
                                                return (
                                                    <div className="px-3 py-2 border-t border-slate-100 space-y-2">
                                                        {pickedSub && (
                                                            <>
                                                            <p className="text-[10px] text-slate-500">
                                                                <span className="font-bold text-violet-700">{targetCount}</span>
                                                                {' '}of <span className="font-bold">{coveredSet.size}</span> covered colors selected — click highlighted chips to exclude.
                                                            </p>
                                                            <p className="text-[10px]">
                                                                <span className="text-slate-500">Total qty selected: </span>
                                                                <span className={`font-bold ${overStock ? 'text-red-600' : 'text-violet-700'}`}>
                                                                    {totalSelectedQty.toLocaleString()} {g.unit}
                                                                </span>
                                                                <span className="text-slate-500"> · In stock: </span>
                                                                <span className={`font-bold ${overStock ? 'text-red-600' : 'text-emerald-700'}`}>
                                                                    {totalInStock.toLocaleString()} {g.unit}
                                                                </span>
                                                                {overStock && (
                                                                    <span className="ml-1 text-red-600 font-bold">⚠ exceeds available stock — raise PR instead</span>
                                                                )}
                                                            </p>
                                                            </>
                                                        )}
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                                                                {g.requirements.map(r => {
                                                                    const isFulfilled = r.is_fulfilled;
                                                                    const pending     = Number(r.quantity_required || 0) - Number(r.quantity_reserved || 0);
                                                                    const isCovered   = coveredSet ? coveredSet.has(r.id) : false;
                                                                    const isExcluded  = excluded.has(r.id);
                                                                    const isClickable = !!pickedSub && isCovered && !isFulfilled;
                                                                    let cls;
                                                                    if (isFulfilled) {
                                                                        cls = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                                                                    } else if (!pickedSub) {
                                                                        cls = pending > 0
                                                                            ? 'bg-amber-100 text-amber-700 border-amber-200'
                                                                            : 'bg-slate-100 text-slate-600 border-slate-200';
                                                                    } else if (!isCovered) {
                                                                        cls = 'bg-slate-50 text-slate-400 border-slate-200 opacity-60';
                                                                    } else if (isExcluded) {
                                                                        cls = 'bg-slate-100 text-slate-500 border-slate-300 line-through';
                                                                    } else {
                                                                        // Covered + included = highlighted
                                                                        cls = 'bg-violet-100 text-violet-800 border-violet-400 ring-2 ring-violet-300';
                                                                    }
                                                                    return (
                                                                        <button
                                                                            key={r.id}
                                                                            type="button"
                                                                            disabled={!isClickable || busy}
                                                                            onClick={isClickable ? () => toggleExcludeReq(g.trim_item_id, r.id) : undefined}
                                                                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cls} ${isClickable ? 'cursor-pointer hover:brightness-95' : 'cursor-default'} disabled:cursor-not-allowed`}
                                                                            title={`${r.color_name || ''}${r.color_number ? ` (${r.color_number})` : ''} · ${r.quantity_reserved || 0}/${r.quantity_required || 0} ${g.unit}${pickedSub && !isCovered ? ' · variant does not match this color' : ''}${isExcluded ? ' · excluded from bulk' : ''}${isClickable ? (isExcluded ? ' · click to include' : ' · click to exclude') : ''}`}
                                                                        >
                                                                            {r.color_name || `#${r.id}`}
                                                                            {isFulfilled ? ' ✓' : isExcluded ? ' ✕' : (pickedSub && isCovered ? '' : '')}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                            <button
                                                                onClick={() => handleBulkReserve(g)}
                                                                disabled={!picked || busy || targetCount === 0 || overStock}
                                                                title={overStock ? `Selected ${totalSelectedQty.toLocaleString()} ${g.unit} exceeds ${totalInStock.toLocaleString()} ${g.unit} in stock` : undefined}
                                                                className={`flex items-center gap-1 text-[11px] font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg transition-colors ${
                                                                    overStock ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                                                                }`}
                                                            >
                                                                {busy && <Loader2 size={11} className="animate-spin" />}
                                                                Reserve {pickedSub ? `(${targetCount})` : 'all'}
                                                            </button>
                                                            <button
                                                                onClick={() => handleBulkRaise(g)}
                                                                disabled={!picked || busy || targetCount === 0}
                                                                className="flex items-center gap-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-2.5 py-1.5 rounded-lg transition-colors"
                                                            >
                                                                {busy && <Loader2 size={11} className="animate-spin" />}
                                                                Raise PR {pickedSub ? `(${targetCount})` : 'for all'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    );
                                })}
                                </>)}
                            </div>
                        )}
                    </div>
                )}

                {/* Timeline body */}
                <div className="flex-1 overflow-y-auto">
                    {/* Navigation bar */}
                    <div className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                        <button onClick={prevWindow} className="p-1 rounded hover:bg-slate-100 text-slate-500"><ChevronLeft size={14} /></button>
                        <button onClick={nextWindow} className="p-1 rounded hover:bg-slate-100 text-slate-500"><ChevronRight size={14} /></button>
                        <button onClick={goToday} className="text-[10px] font-bold text-violet-600 px-2 py-0.5 rounded bg-violet-50 hover:bg-violet-100 transition-colors">Today</button>
                        <button
                            onClick={() => setExpandAll(v => !v)}
                            title={expandAll ? 'Collapse every row' : 'Expand every row'}
                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${expandAll ? 'text-white bg-violet-600 hover:bg-violet-700' : 'text-violet-600 bg-violet-50 hover:bg-violet-100'}`}
                        >
                            {expandAll ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            {expandAll ? 'Collapse all' : 'Expand all'}
                        </button>
                        <span className="text-xs text-slate-500 mr-auto">
                            {days[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                            {' – '}
                            {days[DAYS - 1].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <div className="relative">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                type="search"
                                placeholder="Search items…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="text-xs pl-6 pr-3 py-1 border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 w-40"
                            />
                        </div>
                    </div>

                    <div className="px-5 pt-2 pb-4">
                        {/* Week-marker header row */}
                        <div className="flex mb-1 select-none">
                            <div className="w-44 shrink-0" />
                            <div className="flex-1 relative h-7">
                                {days
                                    .filter((d, i) => i === 0 || d.getDay() === 1)
                                    .map(d => {
                                        const pct = ((d - tlStart) / tlSpan) * 100;
                                        const showMonth = d.getDate() <= 7 || d === days[0];
                                        return (
                                            <div key={d.toDateString()}
                                                className="absolute top-0 flex flex-col items-start"
                                                style={{ left: `${pct}%` }}>
                                                {showMonth && (
                                                    <span className="text-[7px] font-bold text-violet-500 uppercase leading-none mb-0.5 whitespace-nowrap">
                                                        {d.toLocaleDateString('en', { month: 'short' })}
                                                    </span>
                                                )}
                                                <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap">
                                                    {d.toLocaleDateString('en', { day: 'numeric' })}
                                                </span>
                                            </div>
                                        );
                                    })}
                                {todayPct >= 0 && todayPct <= 100 && (
                                    <div className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
                                        style={{ left: `${todayPct}%` }}>
                                        <span className="text-[7px] font-bold text-violet-500 whitespace-nowrap" style={{ transform: 'translateX(-50%)' }}>today</span>
                                    </div>
                                )}
                            </div>
                            <div className="w-20 shrink-0" />
                        </div>

                        {loadingLocal ? (
                            <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
                                <Loader2 size={16} className="animate-spin" />
                                <span className="text-sm">Loading requirements…</span>
                            </div>
                        ) : filteredItems.length === 0 ? (
                            <p className="text-center text-sm text-slate-400 py-10 italic">
                                {search ? 'No items match your search.' : 'No requirements linked yet. Calculate requirements first.'}
                            </p>
                        ) : (
                            <div className="space-y-5">
                                {groups.map(group => (
                                    <div key={group.key}>
                                        {/* Group header */}
                                        <div className="flex items-center gap-2 mb-1.5 px-1">
                                            <span className={`w-2 h-2 rounded-full ${group.dot}`} />
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{group.label}</span>
                                            <span className="text-[9px] font-bold text-slate-300">{group.items.filter(it => it.parentTrimGroupId == null).length}</span>
                                        </div>
                                        <div className="space-y-0.5">
                                            {group.items.map(item => {
                                                // ── TRIM GROUP HEADER ─────────────────────────────────
                                                if (item.type === 'trim_group') {
                                                    const isExpanded = expandAll || expandedTrimGroups.has(item.trim_item_id);
                                                    const groupSt = ST[item.status] || ST.pending;
                                                    const gBStyle = barStyle(item);
                                                    const totalReq = item.total_required;
                                                    const totalRes = item.total_reserved;
                                                    const pct = totalReq > 0 ? Math.min(100, Math.round((totalRes / totalReq) * 100)) : 0;
                                                    const pctCls = pct >= 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : pct > 0 ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                        : 'bg-slate-50 text-slate-500 border-slate-200';
                                                    const multiVariant = item.variants.length > 1;
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            onClick={() => {
                                                                if (multiVariant) { toggleTrimGroup(item.trim_item_id); }
                                                                else { const v = item.variants[0]; if (v) { setSelId(selId === v.id ? null : v.id); setActionMode(null); setErr(null); } }
                                                            }}
                                                            className={`flex items-center cursor-pointer rounded-lg transition-all hover:bg-slate-50 ${item.overdue ? 'bg-red-50/30' : ''}`}
                                                        >
                                                            <div className="w-72 shrink-0 flex items-center gap-2 px-2 py-2">
                                                                <span className={`w-2 h-2 rounded-full shrink-0 ${item.overdue ? 'bg-red-500' : groupSt.bg}`} />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-[10px] font-bold text-slate-700 break-words leading-tight">{item.trim_item_name}</p>
                                                                    <p className="text-[8px] text-slate-400">{item.variants.length} color{item.variants.length !== 1 ? 's' : ''}</p>
                                                                </div>
                                                                {totalReq > 0 && (
                                                                    <span title={`${totalRes.toLocaleString()} of ${totalReq.toLocaleString()} ${item.unit || ''} reserved (${pct}%)`}
                                                                        className={`text-[8px] font-bold rounded-full px-1.5 py-0.5 shrink-0 border ${pctCls}`}>
                                                                        {totalRes.toLocaleString()}/{totalReq.toLocaleString()} {item.unit || ''}
                                                                    </span>
                                                                )}
                                                                {multiVariant && (
                                                                    <ChevronRight size={12} className={`shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                                                )}
                                                            </div>
                                                            <div className="flex-1 relative h-7">
                                                                {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && (
                                                                    <div key={i} className="absolute top-0 bottom-0 bg-slate-50/80 pointer-events-none"
                                                                        style={{ left: `${(i / DAYS) * 100}%`, width: `${(1 / DAYS) * 100}%` }} />
                                                                ))}
                                                                {todayPct >= 0 && todayPct <= 100 && (
                                                                    <div className="absolute top-0 bottom-0 w-px bg-violet-400/60 z-10 pointer-events-none"
                                                                        style={{ left: `${todayPct}%` }} />
                                                                )}
                                                                {gBStyle ? (
                                                                    <div className={`absolute top-1.5 bottom-1.5 rounded-full ${item.overdue ? 'bg-red-500' : groupSt.bg} opacity-60`}
                                                                        style={gBStyle} />
                                                                ) : (
                                                                    <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
                                                                        <div className="flex-1 border-t border-dashed border-slate-200" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="w-20 shrink-0 flex justify-end pr-2">
                                                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full text-white ${item.overdue ? 'bg-red-500' : groupSt.bg}`}>
                                                                    {item.overdue ? 'Overdue' : groupSt.label}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                // ── TRIM VARIANT CHILD — hide when parent collapsed ───
                                                if (item.parentTrimGroupId != null) {
                                                    const parentExpanded = expandAll || expandedTrimGroups.has(item.parentTrimGroupId);
                                                    if (!parentExpanded) return null;
                                                }
                                                // ── REGULAR ITEM (fabric / manual / expanded variant) ─
                                                const st      = ST[item.status] || ST.pending;
                                                const bStyle  = barStyle(item);
                                                const isSel   = expandAll || selId === item.id;
                                                const overdue = isOverdue(item);
                                                return (
                                                    <div key={item.id} className={item.parentTrimGroupId != null ? 'ml-5 border-l border-slate-200' : ''}>
                                                        <div
                                                            onClick={() => {
                                                                setSelId(isSel ? null : item.id);
                                                                setActionMode(null);
                                                                setErr(null);
                                                            }}
                                                            className={`flex items-center cursor-pointer rounded-lg transition-all ${isSel ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-slate-50'}`}
                                                        >
                                                            {/* Label */}
                                                            <div className="w-72 shrink-0 flex items-center gap-2 px-2 py-2">
                                                                <span className={`w-2 h-2 rounded-full shrink-0 ${overdue ? 'bg-red-500' : st.bg}`} />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-[10px] font-bold text-slate-700 break-words leading-tight">{item.title}</p>
                                                                    <p className="text-[8px] text-slate-400 truncate">{item.subtitle}</p>
                                                                </div>
                                                                {(item.reservations?.length || 0) > 0 && (
                                                                    <span
                                                                        title={`${item.reservations.length} reservation${item.reservations.length === 1 ? '' : 's'} — click to view`}
                                                                        className="text-[8px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 shrink-0"
                                                                    >
                                                                        {item.reservations.length}×
                                                                    </span>
                                                                )}
                                                                {item.type === 'trim' && (() => {
                                                                    const subRes = (item.reservations || []).filter(r => r.is_substitute);
                                                                    if (subRes.length === 0) return null;
                                                                    const unique = [...new Map(subRes.map(r => [r.trim_item_variant_id, r])).values()];
                                                                    const label = unique.length === 1
                                                                        ? `SUB · ${unique[0].color_name || unique[0].color_number || 'variant'}`
                                                                        : `SUB · ${unique.length} variants`;
                                                                    const tip = unique.map(r =>
                                                                        `${r.color_name || ''}${r.color_number ? ` (${r.color_number})` : ''}`.trim() || `variant #${r.trim_item_variant_id}`
                                                                    ).join(', ');
                                                                    return (
                                                                        <span
                                                                            title={`Reserved with substitute: ${tip}`}
                                                                            className="text-[8px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-1.5 py-0.5 shrink-0"
                                                                        >
                                                                            {label}
                                                                        </span>
                                                                    );
                                                                })()}
                                                                {(item.purchase_requirements?.length || 0) > 0 && (
                                                                    <span
                                                                        title={`${item.purchase_requirements.length} purchase requirement${item.purchase_requirements.length === 1 ? '' : 's'} — click to view`}
                                                                        className="text-[8px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5 shrink-0"
                                                                    >
                                                                        PR {item.purchase_requirements.length}
                                                                    </span>
                                                                )}
                                                                {(() => {
                                                                    const cancelled = (item.purchase_requirements || []).filter(pr => (pr.status || '').toString().toUpperCase() === 'CANCELLED');
                                                                    if (cancelled.length === 0) return null;
                                                                    return (
                                                                        <span
                                                                            title={`${cancelled.length} cancelled purchase requirement${cancelled.length === 1 ? '' : 's'} — click to view`}
                                                                            className="text-[8px] font-bold text-white bg-red-500 rounded-full px-1.5 py-0.5 shrink-0"
                                                                        >
                                                                            ✕ {cancelled.length}
                                                                        </span>
                                                                    );
                                                                })()}
                                                                {item.end_date && (
                                                                    <span
                                                                        title={`Due ${fmtD(item.end_date)}`}
                                                                        className={`text-[8px] font-bold rounded-full px-1.5 py-0.5 shrink-0 border flex items-center gap-1 ${
                                                                            overdue
                                                                                ? 'bg-red-50 text-red-700 border-red-200'
                                                                                : 'bg-slate-100 text-slate-600 border-slate-200'
                                                                        }`}
                                                                    >
                                                                        <Calendar size={8} /> {fmtD(item.end_date)}
                                                                    </span>
                                                                )}
                                                                {(() => {
                                                                    const req = item.type === 'fabric'
                                                                        ? Number(item.meters_required || 0)
                                                                        : Number(item.quantity_required || 0);
                                                                    const res = item.type === 'fabric'
                                                                        ? Number(item.meters_reserved || 0)
                                                                        : Number(item.quantity_reserved || 0);
                                                                    if (req <= 0) return null;
                                                                    const pct = Math.min(100, Math.round((res / req) * 100));
                                                                    const cls = pct >= 100
                                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                        : pct > 0
                                                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                                            : 'bg-slate-50 text-slate-500 border-slate-200';
                                                                    return (
                                                                        <span
                                                                            title={`${res.toLocaleString()} of ${req.toLocaleString()} ${item.unit || ''} reserved (${pct}%)`}
                                                                            className={`text-[8px] font-bold rounded-full px-1.5 py-0.5 shrink-0 border ${cls}`}
                                                                        >
                                                                            {res.toLocaleString()}/{req.toLocaleString()} {item.unit || ''}
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </div>

                                                            {/* Bar track */}
                                                            <div className="flex-1 relative h-7">
                                                                {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && (
                                                                    <div key={i}
                                                                        className="absolute top-0 bottom-0 bg-slate-50/80 pointer-events-none"
                                                                        style={{ left: `${(i / DAYS) * 100}%`, width: `${(1 / DAYS) * 100}%` }}
                                                                    />
                                                                ))}
                                                                {todayPct >= 0 && todayPct <= 100 && (
                                                                    <div className="absolute top-0 bottom-0 w-px bg-violet-400/60 z-10 pointer-events-none"
                                                                        style={{ left: `${todayPct}%` }} />
                                                                )}
                                                                {(item.procurement_events || []).map(evt => {
                                                                    const startStr = evt.order_date;
                                                                    const endStr   = evt.actual_date || evt.expected_date;
                                                                    if (!startStr && !endStr) return null;
                                                                    const s    = new Date(startStr || endStr);
                                                                    const eRaw = new Date(endStr   || startStr);
                                                                    const eInc = new Date(eRaw); eInc.setDate(eInc.getDate() + 1);
                                                                    const left  = Math.max(0,   (s    - tlStart) / tlSpan) * 100;
                                                                    const right = Math.min(100, (eInc - tlStart) / tlSpan) * 100;
                                                                    if (right <= 0 || left >= 100) return null;
                                                                    const est = EVT_ST[evt.status] || EVT_ST.pending;
                                                                    const tip = [
                                                                        evt.po_code || (evt.purchase_order_id ? `PO #${evt.purchase_order_id}` : 'PO'),
                                                                        evt.supplier_name,
                                                                        est.label,
                                                                        startStr ? `Ordered ${fmtD(startStr)}` : null,
                                                                        endStr   ? (evt.actual_date ? `Received ${fmtD(endStr)}` : `Expected ${fmtD(endStr)}`) : null,
                                                                        evt.quantity ? `${evt.quantity}${evt.unit ? ' ' + evt.unit : ''}` : null,
                                                                    ].filter(Boolean).join(' · ');
                                                                    return (
                                                                        <div
                                                                            key={evt.id}
                                                                            title={tip}
                                                                            className={`absolute top-0.5 h-1.5 rounded-full ${est.bg} z-20 cursor-pointer hover:h-2 transition-all`}
                                                                            style={{ left: `${left}%`, width: `${Math.max(0.5, right - left)}%` }}
                                                                            onClick={e => { e.stopPropagation(); setSelId(item.id); }}
                                                                        />
                                                                    );
                                                                })}
                                                                {bStyle ? (
                                                                    <div
                                                                        className={`absolute top-1.5 bottom-1.5 rounded-full ${overdue ? 'bg-red-500' : st.bg} opacity-80 cursor-pointer hover:opacity-100 transition-opacity`}
                                                                        style={bStyle}
                                                                        onClick={e => { e.stopPropagation(); setSelId(item.id); }}
                                                                    />
                                                                ) : (
                                                                    <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
                                                                        <div className="flex-1 border-t border-dashed border-slate-200" />
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Status chip */}
                                                            <div className="w-20 shrink-0 flex justify-end pr-2">
                                                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full text-white ${overdue ? 'bg-red-500' : st.bg}`}>
                                                                    {overdue ? 'Overdue' : st.label}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Inline action panel */}
                                                        {isSel && (
                                                            <div className="mx-2 mb-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                                                                {/* Raised purchase requirements */}
                                                                {(item.purchase_requirements?.length || 0) > 0 && (
                                                                    <div className="bg-white border-2 border-blue-200 rounded-lg overflow-hidden">
                                                                        <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border-b border-blue-200">
                                                                            <p className="text-sm font-bold text-blue-800">
                                                                                {item.purchase_requirements.length} Raised Requirement{item.purchase_requirements.length === 1 ? '' : 's'}
                                                                            </p>
                                                                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">click to expand</p>
                                                                        </div>
                                                                        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                                                                            {item.purchase_requirements.map(pr => {
                                                                                const prId      = pr.id ?? pr.requirement_id;
                                                                                const isOpen    = openReqId === prId;
                                                                                const qty       = Number(pr.quantity_required ?? pr.quantity ?? pr.meters_required ?? 0);
                                                                                const uom       = pr.unit_of_measure || pr.uom || (item.type === 'fabric' ? 'm' : (item.unit || 'pcs'));
                                                                                const status    = (pr.status || 'PENDING').toString();
                                                                                const urgency   = (pr.urgency || '').toString();
                                                                                const created   = pr.created_at;
                                                                                const poCode    = pr.po_code || pr.purchase_order_code;
                                                                                const supplier  = pr.supplier_name;
                                                                                const expected  = pr.expected_date;
                                                                                const statusUp = status.toUpperCase();
                                                                                const statusCls = statusUp === 'CANCELLED' || statusUp === 'CANCELED'
                                                                                    ? 'bg-red-100 text-red-700'
                                                                                    : statusUp.includes('FULFIL') || statusUp.includes('RECEIV')
                                                                                        ? 'bg-emerald-100 text-emerald-700'
                                                                                        : statusUp.includes('ORDER') || statusUp.includes('PARTIAL')
                                                                                            ? 'bg-amber-100 text-amber-700'
                                                                                            : 'bg-slate-100 text-slate-600';
                                                                                return (
                                                                                    <div key={prId}>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => { e.stopPropagation(); setOpenReqId(isOpen ? null : prId); }}
                                                                                            className="w-full flex items-center gap-3 px-3 py-2 text-xs hover:bg-blue-50 transition-colors text-left"
                                                                                        >
                                                                                            <span className="font-mono font-bold text-blue-700 shrink-0">PR-{prId}</span>
                                                                                            <span className="font-bold text-slate-800 tabular-nums shrink-0">
                                                                                                {qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} {uom}
                                                                                            </span>
                                                                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusCls}`}>
                                                                                                {status.replace(/_/g, ' ')}
                                                                                            </span>
                                                                                            {urgency && (
                                                                                                <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">
                                                                                                    {urgency}
                                                                                                </span>
                                                                                            )}
                                                                                            <span className="ml-auto text-[10px] text-slate-400 shrink-0">{created ? fmtD(created) : ''}</span>
                                                                                            {isOpen ? <ChevronUp size={12} className="text-slate-400 shrink-0" /> : <ChevronDown size={12} className="text-slate-400 shrink-0" />}
                                                                                        </button>
                                                                                        {isOpen && (
                                                                                            <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-600 space-y-1">
                                                                                                {poCode && (
                                                                                                    <p><span className="font-bold text-slate-700">PO:</span> <span className="font-mono">{poCode}</span></p>
                                                                                                )}
                                                                                                {supplier && (
                                                                                                    <p><span className="font-bold text-slate-700">Supplier:</span> {supplier}</p>
                                                                                                )}
                                                                                                {expected && (
                                                                                                    <p><span className="font-bold text-slate-700">Expected:</span> {fmtD(expected)}</p>
                                                                                                )}
                                                                                                {pr.notes && (
                                                                                                    <p><span className="font-bold text-slate-700">Notes:</span> {pr.notes}</p>
                                                                                                )}
                                                                                                {!poCode && !supplier && !expected && !pr.notes && (
                                                                                                    <p className="italic text-slate-400">No additional details — awaiting purchase team.</p>
                                                                                                )}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Red alert: trim req with no procurement option */}
                                                                {item.type === 'trim' && item.isReq && !item.exact_variant_id && (!item.substitutes || item.substitutes.length === 0) && (
                                                                    <div className="bg-red-50 border-2 border-red-300 rounded-lg px-3 py-2.5 flex items-start gap-2">
                                                                        <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                                                                        <div className="flex-1">
                                                                            <p className="text-base font-black text-red-800">No procurement option</p>
                                                                            <p className="text-sm text-red-700 mt-0.5">
                                                                                No exact-match variant, trim variant, or substitute is configured for this requirement.
                                                                                Coordinate with merchandiser / purchase to resolve before production.
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Item info + calc breakdown */}
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0 flex-1 space-y-2">
                                                                        <div>
                                                                            <p className="text-base font-bold text-slate-900">{item.title}</p>
                                                                            {item.start_date && (
                                                                                <p className="text-[30px] leading-snug text-slate-700 mt-0.5">
                                                                                    Order: {fmtD(item.start_date)}{item.end_date ? ` → Arrival: ${fmtD(item.end_date)}` : ''}
                                                                                </p>
                                                                            )}
                                                                            {item.notes && <p className="text-[30px] leading-snug text-slate-700 italic mt-0.5">{item.notes}</p>}
                                                                        </div>
                                                                        {/* Calculation breakdown — always 4 columns. Reserved opens the reservations modal. */}
                                                                        {item.type === 'fabric' && (() => {
                                                                            const required = Number(item.meters_required || 0);
                                                                            const reserved = Number(item.meters_reserved || 0);
                                                                            const inStock  = Number(item.meters_available || 0);
                                                                            const remaining  = required - reserved;
                                                                            const surplus    = inStock - remaining;
                                                                            const hasSurplus = surplus >= 0;
                                                                            const resCount   = item.reservations?.length || 0;
                                                                            return (
                                                                                <div className="grid grid-cols-4 gap-2 text-center bg-white border border-slate-100 rounded-lg p-2">
                                                                                    <div>
                                                                                        <p className="text-[24px] leading-tight font-bold text-slate-700 uppercase">Required</p>
                                                                                        <p className="text-3xl font-bold text-slate-900">{required.toFixed(1)} m</p>
                                                                                    </div>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={e => { e.stopPropagation(); setReservationsItem(item); }}
                                                                                        title={resCount > 0 ? 'View reservations' : 'No reservations yet'}
                                                                                        className="rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer text-center px-1 py-1 -m-1"
                                                                                    >
                                                                                        <p className="text-[24px] leading-tight font-bold text-emerald-700 uppercase">
                                                                                            Reserved{resCount > 0 ? <span className="ml-1 text-emerald-500">({resCount})</span> : ''}
                                                                                        </p>
                                                                                        <p className={`text-3xl font-bold ${reserved > 0 ? 'text-emerald-700' : 'text-slate-900'} underline decoration-dotted underline-offset-4`}>
                                                                                            {reserved.toFixed(1)} m
                                                                                        </p>
                                                                                    </button>
                                                                                    <div>
                                                                                        <p className="text-[24px] leading-tight font-bold text-slate-700 uppercase">In Stock</p>
                                                                                        <p className={`text-3xl font-bold ${inStock > 0 ? 'text-emerald-700' : 'text-slate-900'}`}>{inStock.toFixed(1)} m</p>
                                                                                    </div>
                                                                                    <div>
                                                                                        <p className="text-[24px] leading-tight font-bold text-slate-700 uppercase">{hasSurplus ? 'Surplus' : 'Shortfall'}</p>
                                                                                        <p className={`text-3xl font-bold ${hasSurplus ? 'text-emerald-700' : 'text-red-600'}`}>
                                                                                            {hasSurplus ? `+${surplus.toFixed(1)} m` : `−${(-surplus).toFixed(1)} m`}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                        {item.type === 'trim' && (() => {
                                                                            const resCount = item.reservations?.length || 0;
                                                                            return (
                                                                            <div className="grid grid-cols-4 gap-2 text-center bg-white border border-slate-100 rounded-lg p-2">
                                                                                <div>
                                                                                    <p className="text-[24px] leading-tight font-bold text-slate-700 uppercase">Required</p>
                                                                                    <p className="text-3xl font-bold text-slate-900">{item.quantity_required.toLocaleString()} {item.unit}</p>
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={e => { e.stopPropagation(); setReservationsItem(item); }}
                                                                                    title={resCount > 0 ? 'View reservations' : 'No reservations yet'}
                                                                                    className="rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer text-center px-1 py-1 -m-1"
                                                                                >
                                                                                    <p className="text-[24px] leading-tight font-bold text-slate-700 uppercase">
                                                                                        Reserved{resCount > 0 ? <span className="ml-1 text-emerald-500">({resCount})</span> : ''}
                                                                                    </p>
                                                                                    <p className={`text-3xl font-bold ${item.inStock ? 'text-emerald-700' : 'text-slate-900'} underline decoration-dotted underline-offset-4`}>{item.quantity_reserved.toLocaleString()} {item.unit}</p>
                                                                                </button>
                                                                                <div>
                                                                                    <p className="text-[24px] leading-tight font-bold text-slate-700 uppercase">In Stock</p>
                                                                                    <p className={`text-3xl font-bold ${(item.exact_variant_stock ?? 0) > 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                                                                                        {item.exact_variant_stock != null
                                                                                            ? `${Number(item.exact_variant_stock).toLocaleString()} ${item.unit}`
                                                                                            : '—'}
                                                                                    </p>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-[24px] leading-tight font-bold text-slate-700 uppercase">{item.inStock ? 'Fulfilled' : 'Still Needed'}</p>
                                                                                    <p className={`text-3xl font-bold ${item.inStock ? 'text-emerald-700' : 'text-red-600'}`}>
                                                                                        {item.inStock
                                                                                            ? '✓ All reserved'
                                                                                            : `${(item.quantity_required - item.quantity_reserved).toLocaleString()} ${item.unit}`}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                            );
                                                                        })()}
                                                                        {/* Substitutes for trim not in stock */}
                                                                        {item.type === 'trim' && !item.inStock && item.substitutes?.length > 0 && (
                                                                            <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 space-y-1.5">
                                                                                <p className="text-[27px] leading-tight font-bold text-amber-800 uppercase tracking-wider">Substitutes Available</p>
                                                                                {item.substitutes.map(s => (
                                                                                    <div key={s.substitute_variant_id} className="flex items-center justify-between text-[27px] leading-tight">
                                                                                        <span className="font-bold text-slate-900">
                                                                                            {s.item_name}{s.color_name ? ` – ${s.color_name}` : ''}{s.color_number ? ` (${s.color_number})` : ''}
                                                                                        </span>
                                                                                        <span className={s.in_stock > 0 ? 'text-emerald-700 font-bold' : 'text-slate-700'}>
                                                                                            {s.in_stock != null ? `${s.in_stock.toLocaleString()} in stock` : '—'}
                                                                                        </span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {!item.isReq && (
                                                                        <div className="flex items-center gap-1 shrink-0">
                                                                            <button onClick={e => { e.stopPropagation(); setEditItem(item); setAddModal(true); }}
                                                                                className="p-1 text-slate-400 hover:text-violet-600 transition-colors">
                                                                                <Pencil size={11} />
                                                                            </button>
                                                                            <button onClick={async e => {
                                                                                    e.stopPropagation();
                                                                                    if (!window.confirm('Delete this milestone?')) return;
                                                                                    try { await taApi.deleteTimelineItem(item.id); refetchLocal(); onRefresh(); setSelId(null); } catch {}
                                                                                }}
                                                                                className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                                                                                <X size={11} />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {err && (
                                                                    <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>
                                                                )}

                                                                {/* Action buttons. Buttons stay visible while there is still a shortfall,
                                                                    even after a force-complete — items may become available again later. */}
                                                                {actionMode !== 'req' && (() => {
                                                                    const required     = item.type === 'fabric' ? Number(item.meters_required || 0) : Number(item.quantity_required || 0);
                                                                    const reserved     = item.type === 'fabric' ? Number(item.meters_reserved || 0) : Number(item.quantity_reserved || 0);
                                                                    const fullyReserved = required > 0 ? reserved >= required : true;
                                                                    // Show the badge only when the item is completed AND there's no shortfall.
                                                                    const showBadgeOnly = item.status === 'completed' && fullyReserved;
                                                                    return (
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        {!showBadgeOnly ? (
                                                                            <>
                                                                                {!fullyReserved && (
                                                                                    <button
                                                                                        onClick={() => item.isReq && item.req_id ? setReserveItem(item) : handleMarkAvailable(item)}
                                                                                        disabled={busy}
                                                                                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
                                                                                        <CheckCircle2 size={13} /> Reserve
                                                                                    </button>
                                                                                )}
                                                                                {item.isReq && (
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            // Default to shortfall: required − reserved − in_stock_available (never negative).
                                                                                            const req = item.type === 'fabric' ? Number(item.meters_required || 0) : Number(item.quantity_required || 0);
                                                                                            const res = item.type === 'fabric' ? Number(item.meters_reserved || 0) : Number(item.quantity_reserved || 0);
                                                                                            const avail = item.type === 'fabric'
                                                                                                ? Number(item.meters_available || 0)
                                                                                                : Number(item.exact_variant_stock || 0);
                                                                                            const shortfall = Math.max(0, req - res - avail);
                                                                                            setReqForm({
                                                                                                urgency: 'normal',
                                                                                                notes: item.notes || '',
                                                                                                trim_item_variant_id: item.type === 'trim' ? (item.exact_variant_id ?? null) : null,
                                                                                                quantity: shortfall > 0 ? String(shortfall) : String(Math.max(0, req - res)),
                                                                                            });
                                                                                            setActionMode('req');
                                                                                            setErr(null);
                                                                                        }}
                                                                                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors">
                                                                                        <ShoppingBag size={13} />
                                                                                        {(item.purchase_requirements?.length || 0) > 0 ? 'Raise Another' : 'Raise Requirement'}
                                                                                    </button>
                                                                                )}
                                                                                {(() => {
                                                                                    // Complete button — visible when reserved is fully covered OR within 10% of required.
                                                                                    const required = item.type === 'fabric' ? Number(item.meters_required || 0) : Number(item.quantity_required || 0);
                                                                                    const reserved = item.type === 'fabric' ? Number(item.meters_reserved || 0) : Number(item.quantity_reserved || 0);
                                                                                    if (required <= 0) return null;
                                                                                    const shortfall = Math.max(0, required - reserved);
                                                                                    const withinTolerance = shortfall < required * 0.10;
                                                                                    if (!withinTolerance) return null;
                                                                                    const shortfallTxt = shortfall > 0
                                                                                        ? `${shortfall.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.type === 'fabric' ? 'm' : (item.unit || 'pcs')} short`
                                                                                        : 'fully reserved';
                                                                                    return (
                                                                                        <button
                                                                                            onClick={async () => {
                                                                                                if (shortfall > 0 && !window.confirm(`Mark this item as completed with ${shortfallTxt}?`)) return;
                                                                                                try { await taApi.updateTimelineItem(item.id, { status: 'completed' }); refetchLocal(); onRefresh(); setSelId(null); }
                                                                                                catch(e) { setErr(e?.response?.data?.error || 'Failed'); }
                                                                                            }}
                                                                                            disabled={busy}
                                                                                            title={`Complete this milestone (${shortfallTxt})`}
                                                                                            className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
                                                                                            <CheckCircle2 size={13} /> Complete
                                                                                        </button>
                                                                                    );
                                                                                })()}
                                                                                {item.status !== 'delayed' && (
                                                                                    <button onClick={async () => {
                                                                                            try { await taApi.updateTimelineItem(item.id, { status: 'delayed' }); refetchLocal(); onRefresh(); }
                                                                                            catch(e) { setErr(e?.response?.data?.error || 'Failed'); }
                                                                                        }}
                                                                                        className="text-xs font-bold text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                                                                                        Mark Delayed
                                                                                    </button>
                                                                                )}
                                                                            </>
                                                                        ) : (
                                                                            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                                                                                <CheckCircle2 size={13} /> Available · Completed
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    );
                                                                })()}

                                                                {/* Raise Requirement form */}
                                                                {actionMode === 'req' && (
                                                                    <div className="space-y-3 pt-2 border-t border-slate-200">
                                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                                                            Raise Purchase Requirement
                                                                        </p>
                                                                        <div className="space-y-2.5">
                                                                            {item.type === 'trim' && (
                                                                                <div>
                                                                                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                                                                                        Variant to Procure <span className="text-red-500">*</span>
                                                                                    </label>
                                                                                    <div className="space-y-1.5">
                                                                                        {item.exact_variant_id != null && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => setReqForm(p => ({ ...p, trim_item_variant_id: item.exact_variant_id }))}
                                                                                                className={`w-full flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg border transition ${
                                                                                                    reqForm.trim_item_variant_id === item.exact_variant_id
                                                                                                        ? 'bg-emerald-50 border-emerald-300'
                                                                                                        : 'bg-white border-slate-200 hover:border-emerald-200'
                                                                                                }`}
                                                                                            >
                                                                                                <div className="flex items-center gap-2 min-w-0">
                                                                                                    <CheckCircle2 size={12} className={reqForm.trim_item_variant_id === item.exact_variant_id ? 'text-emerald-500' : 'text-slate-300'} />
                                                                                                    <span className="font-bold truncate">{item.title}</span>
                                                                                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">Exact</span>
                                                                                                </div>
                                                                                                <span className="text-[10px] text-slate-500 shrink-0">
                                                                                                    Stock: <span className={`font-bold ${(item.exact_variant_stock || 0) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{item.exact_variant_stock ?? 0}</span>
                                                                                                </span>
                                                                                            </button>
                                                                                        )}
                                                                                        {(item.substitutes || []).map(s => {
                                                                                            const sid = s.substitute_variant_id ?? s.id;
                                                                                            const selected = reqForm.trim_item_variant_id === sid;
                                                                                            return (
                                                                                                <button
                                                                                                    key={sid}
                                                                                                    type="button"
                                                                                                    onClick={() => setReqForm(p => ({ ...p, trim_item_variant_id: sid }))}
                                                                                                    className={`w-full flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg border transition ${
                                                                                                        selected
                                                                                                            ? 'bg-amber-50 border-amber-300'
                                                                                                            : 'bg-white border-slate-200 hover:border-amber-200'
                                                                                                    }`}
                                                                                                >
                                                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                                                        <CheckCircle2 size={12} className={selected ? 'text-amber-500' : 'text-slate-300'} />
                                                                                                        <span className="font-bold truncate">
                                                                                                            {s.item_name}{s.color_name ? ` – ${s.color_name}` : ''}{s.color_number ? ` (${s.color_number})` : ''}
                                                                                                        </span>
                                                                                                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">Substitute</span>
                                                                                                    </div>
                                                                                                    <span className="text-[10px] text-slate-500 shrink-0">
                                                                                                        Stock: <span className={`font-bold ${(s.in_stock || 0) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{s.in_stock ?? 0}</span>
                                                                                                    </span>
                                                                                                </button>
                                                                                            );
                                                                                        })}
                                                                                        {item.exact_variant_id == null && (item.substitutes || []).length === 0 && (
                                                                                            <p className="text-[10px] text-amber-600 italic px-2 py-1.5 bg-amber-50 border border-amber-100 rounded-lg">
                                                                                                No variants resolved for this item — backend cannot accept a purchase request without a variant id.
                                                                                            </p>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                            <div>
                                                                                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                                                                                    Quantity to Procure ({item.type === 'fabric' ? 'm' : (item.unit || 'pcs')})
                                                                                    <span className="text-slate-300 font-normal normal-case ml-1">— defaults to shortfall</span>
                                                                                </label>
                                                                                <input
                                                                                    type="number"
                                                                                    min="0"
                                                                                    step={item.type === 'fabric' ? '0.01' : '1'}
                                                                                    value={reqForm.quantity ?? ''}
                                                                                    onChange={e => setReqForm(p => ({ ...p, quantity: e.target.value }))}
                                                                                    placeholder="0"
                                                                                    className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Urgency</label>
                                                                                <div className="flex gap-2">
                                                                                    {['urgent', 'normal', 'low'].map(u => (
                                                                                        <button key={u}
                                                                                            onClick={() => setReqForm(p => ({ ...p, urgency: u }))}
                                                                                            className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${reqForm.urgency === u
                                                                                                ? u === 'urgent' ? 'bg-red-500 text-white border-red-500'
                                                                                                    : u === 'normal' ? 'bg-blue-500 text-white border-blue-500'
                                                                                                    : 'bg-slate-500 text-white border-slate-500'
                                                                                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                                                                                            {u.charAt(0).toUpperCase() + u.slice(1)}
                                                                                        </button>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                            <div>
                                                                                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Notes (optional)</label>
                                                                                <textarea rows={2} placeholder="Additional context for purchase dept…"
                                                                                    value={reqForm.notes}
                                                                                    onChange={e => setReqForm(p => ({ ...p, notes: e.target.value }))}
                                                                                    className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-400 resize-none" />
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex justify-end gap-2">
                                                                            <button onClick={() => { setActionMode(null); setErr(null); }}
                                                                                className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                                                                                Cancel
                                                                            </button>
                                                                            <button onClick={() => handleRaiseRequirement(item)}
                                                                                disabled={busy || (item.type === 'trim' && !reqForm.trim_item_variant_id)}
                                                                                className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-40 px-4 py-1.5 rounded-lg transition-colors">
                                                                                {busy && <Loader2 size={12} className="animate-spin" />}
                                                                                Send to Purchase Dept
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {reserveItem && (
                <ReserveFulfillModal
                    item={reserveItem}
                    onClose={() => setReserveItem(null)}
                    onDone={() => { setReserveItem(null); setSelId(null); refetchLocal(); onRefresh(); }}
                />
            )}

            {addModal && (
                <TAItemFormModal
                    sop={sop}
                    item={editItem}
                    onClose={() => { setAddModal(false); setEditItem(null); }}
                    onSaved={() => { setAddModal(false); setEditItem(null); onRefresh(); }}
                />
            )}

            {reservationsItem && (() => {
                const item = reservationsItem;
                const unit = item.type === 'fabric' ? 'm' : (item.unit || 'pcs');
                const list = item.reservations || [];
                const total = list.reduce((s, rs) => s + Number(rs.meters_reserved ?? rs.quantity_reserved ?? 0), 0);
                return (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setReservationsItem(null)}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                                <div>
                                    <h2 className="text-base font-black text-slate-800">
                                        Reservations · {item.title}
                                    </h2>
                                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                                        {list.length} reservation{list.length === 1 ? '' : 's'} · {total.toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit} reserved
                                    </p>
                                </div>
                                <button onClick={() => setReservationsItem(null)} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                                    <X size={16} className="text-slate-500" />
                                </button>
                            </div>
                            <div className="overflow-auto flex-1 px-5 py-4">
                                {list.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic text-center py-8">No reservations recorded yet.</p>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {list.map(rs => {
                                            const reservedAmount = Number(rs.meters_reserved ?? rs.quantity_reserved ?? 0);
                                            const rollTotal      = Number(rs.roll_total_meters ?? rs.roll_total ?? 0);
                                            const rollStatus     = rs.roll_status || rs.status;
                                            const rollId         = rs.fabric_roll_id ?? rs.trim_inventory_id ?? rs.roll_id;
                                            const reservedAt     = rs.reserved_at;
                                            return (
                                                <div key={rs.id} className="flex items-center gap-3 px-1 py-2.5 text-xs">
                                                    {rollId != null && (
                                                        <span className="font-mono font-bold text-emerald-700 shrink-0">R-{rollId}</span>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-slate-800 tabular-nums">
                                                            {reservedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit}
                                                            {rollTotal > 0 && (
                                                                <span className="font-normal text-slate-400 ml-1">
                                                                    of {rollTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit}
                                                                </span>
                                                            )}
                                                        </p>
                                                        {reservedAt && (
                                                            <p className="text-[10px] text-slate-400">Reserved {fmtD(reservedAt)}</p>
                                                        )}
                                                    </div>
                                                    {rollStatus && (
                                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                                            rollStatus === 'IN_STOCK'
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : 'bg-blue-100 text-blue-700'
                                                        }`}>
                                                            {String(rollStatus).replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end px-5 py-3 border-t border-slate-100">
                                <button onClick={() => setReservationsItem(null)}
                                    className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition">
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

// ─── SOP CARD (product → BOM link) ────────────────────────────────────────────

// gcd helper for ratio simplification
const _gcd = (a, b) => (b === 0 ? a : _gcd(b, a % b));

const READINESS_CFG = {
    in_planning:          { label: 'In Planning',  cls: 'bg-amber-50  text-amber-600  border-amber-200',   icon: null },
    ready_for_production: { label: 'Ready',        cls: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: CheckCircle2 },
    force_ready:          { label: 'Force Ready',  cls: 'bg-violet-50 text-violet-700 border-violet-200',  icon: ShieldCheck },
};

const QuantitySuggestionModal = ({ linkedSops, onClose, onDone }) => {
    const [suggestions, setSuggestions] = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState(null);
    const [choices,     setChoices]     = useState({});
    const [submitting,  setSubmitting]  = useState(false);

    useEffect(() => {
        Promise.all(
            linkedSops.map(sop =>
                planningApi.getSuggestions(sop.id)
                    .then(r => {
                        const raw = r.data?.data ?? r.data;
                        return {
                            sopId:    sop.id,
                            sopName:  sop.product_name,
                            ratioSum: raw?.ratio_sum ?? null,
                            colors:   raw?.suggestions || [],
                        };
                    })
            )
        ).then(results => {
            setSuggestions(results);
            const init = {};
            results.forEach(({ sopId, colors }) => {
                colors.forEach(c => {
                    let selected = c.exact ? 'exact' : 'lower';
                    // If the API tells us the previous selection, use it.
                    if (c.selected_option) {
                        selected = c.selected_option;
                    } else {
                        // Otherwise infer from previously-finalized quantity
                        const prev = c.finalized_quantity ?? c.previous_finalized_quantity;
                        if (prev != null) {
                            const prevNum = Number(prev);
                            if (Number(c.lower?.total_pieces) === prevNum)      selected = 'lower';
                            else if (Number(c.upper?.total_pieces) === prevNum) selected = 'upper';
                        }
                    }
                    init[`${sopId}_${c.fabric_color_id}`] = selected;
                });
            });
            setChoices(init);
        }).catch(e => setError(e?.response?.data?.error || 'Failed to load suggestions'))
          .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const pick = (sopId, colorId, opt) =>
        setChoices(p => ({ ...p, [`${sopId}_${colorId}`]: opt }));

    const handleConfirm = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await Promise.all(
                suggestions.map(async ({ sopId, colors }) => {
                    const quantities = colors.map(c => {
                        const opt    = choices[`${sopId}_${c.fabric_color_id}`] || 'lower';
                        const chosen = (opt === 'exact' ? c.lower : c[opt]) ?? c.lower ?? c.upper;
                        return {
                            fabric_color_id:    c.fabric_color_id,
                            selected_option:    opt,
                            finalized_quantity: chosen?.total_pieces ?? c.ordered_quantity,
                            marker_runs:        chosen?.runs ?? null,
                        };
                    });
                    await planningApi.finalizeQuantities(sopId, { quantities });
                    await planningApi.calculateRequirements(sopId);
                })
            );
            onDone();
        } catch (e) {
            setError(e?.response?.data?.error || 'Calculation failed');
            setSubmitting(false);
        }
    };

    const totalSelections = suggestions?.reduce((s, g) => s + g.colors.length, 0) ?? 0;
    const madeSelections  = Object.keys(choices).length;
    const allChosen       = madeSelections >= totalSelections && totalSelections > 0;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={!submitting ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Step 1 of 2 — Confirm Quantities</p>
                        <h2 className="font-extrabold text-slate-800 text-base">Choose Nearest Marker Run</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Select lower or upper run for each color, then confirm to calculate requirements.</p>
                    </div>
                    {!submitting && <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 mt-0.5"><X size={18} /></button>}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {loading && <Spinner />}
                    {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

                    {suggestions?.map(({ sopId, sopName, ratioSum, colors }) => (
                        <div key={sopId} className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
                                <p className="font-bold text-slate-800 text-sm">{sopName}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    {colors.length} color{colors.length !== 1 ? 's' : ''}
                                    {ratioSum != null && <> · ratio sum: {ratioSum} pcs/cycle</>}
                                </p>
                            </div>
                            <div className="p-4 space-y-3">
                                {colors.map(c => {
                                    const key    = `${sopId}_${c.fabric_color_id}`;
                                    const chosen = choices[key] || 'lower';
                                    return (
                                        <div key={c.fabric_color_id} className="rounded-xl border border-slate-200 overflow-hidden">
                                            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                                                <span className="font-bold text-slate-800 text-sm">{c.color_name}</span>
                                                {c.color_number && (
                                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{c.color_number}</span>
                                                )}
                                                <span className="ml-auto text-[10px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded font-medium">
                                                    Ordered: {(c.ordered_quantity || 0).toLocaleString()} pcs
                                                </span>
                                            </div>
                                            <div className="p-3">
                                                {c.exact ? (
                                                    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                                                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                                                        <div>
                                                            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Exact match</p>
                                                            <p className="text-xl font-extrabold text-slate-800 leading-none">
                                                                {(c.lower?.total_pieces ?? c.upper?.total_pieces ?? c.ordered_quantity).toLocaleString()}
                                                            </p>
                                                            {c.lower?.runs != null && (
                                                                <p className="text-[10px] text-slate-500 mt-0.5">{c.lower.runs} run{c.lower.runs !== 1 ? 's' : ''}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {['lower', 'upper'].map(opt => {
                                                            const d       = c[opt];
                                                            if (!d) return null;
                                                            const active  = chosen === opt;
                                                            const diff    = (d.total_pieces || 0) - (c.ordered_quantity || 0);
                                                            const isUnder = diff < 0;
                                                            return (
                                                                <button key={opt} onClick={() => pick(sopId, c.fabric_color_id, opt)}
                                                                    className={`relative flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all ${
                                                                        active
                                                                            ? isUnder ? 'border-blue-400 bg-blue-50' : 'border-violet-400 bg-violet-50'
                                                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                                                    }`}>
                                                                    {active && (
                                                                        <CheckCircle2 size={13} className={`absolute top-2 right-2 ${isUnder ? 'text-blue-500' : 'text-violet-500'}`} />
                                                                    )}
                                                                    <span className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isUnder ? 'text-blue-500' : 'text-violet-500'}`}>
                                                                        {isUnder ? '▼ Under-run' : '▲ Over-run'}
                                                                    </span>
                                                                    <span className="text-xl font-extrabold text-slate-800 leading-none">
                                                                        {(d.total_pieces || 0).toLocaleString()}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-500 mt-0.5">
                                                                        {d.runs} run{d.runs !== 1 ? 's' : ''}
                                                                    </span>
                                                                    <span className={`text-[10px] font-bold mt-1 ${isUnder ? 'text-blue-600' : 'text-violet-600'}`}>
                                                                        {isUnder ? `${Math.abs(diff).toLocaleString()} fewer` : `${diff.toLocaleString()} extra`} vs order
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {!loading && suggestions && (
                    <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                            {madeSelections}/{totalSelections} color{totalSelections !== 1 ? 's' : ''} configured
                        </p>
                        <div className="flex items-center gap-3">
                            <button onClick={onClose} disabled={submitting}
                                className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40">
                                Cancel
                            </button>
                            <button onClick={handleConfirm} disabled={submitting || !allChosen}
                                className="flex items-center gap-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-5 py-2.5 rounded-xl transition-colors shadow-sm">
                                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
                                Confirm & Calculate
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const RecalculateConfirmModal = ({ preview, sopName, onClose, onConfirm, busy, err }) => {
    const fabReqs      = preview?.fabric_requirements || [];
    const trimReqs     = preview?.trim_requirements   || [];
    const reservations = preview?.reservations        || [];
    const purchReqs    = preview?.purchase_requests   || [];
    const purchOrders  = preview?.purchase_orders     || [];
    const summary      = preview?.summary             || {};

    const fabricCount      = summary.fabric_count           ?? fabReqs.length;
    const trimCount        = summary.trim_count             ?? trimReqs.length;
    const reservationCount = summary.reservation_count      ?? reservations.length;
    const prCount          = summary.purchase_request_count ?? purchReqs.length;
    const poCount          = summary.purchase_order_count   ?? purchOrders.length;
    const totalMeters      = summary.total_meters
        ?? fabReqs.reduce((s, r) => s + Number(r.meters_required ?? r.meters ?? 0), 0);
    const totalQty         = summary.total_quantity
        ?? trimReqs.reduce((s, r) => s + Number(r.quantity_required ?? r.quantity ?? 0), 0);

    const fabLabel  = (r) => `${r.fabric_type_name || r.type || 'Fabric'}${(r.color_name || r.color) ? ' · ' + (r.color_name || r.color) : ''}${r.color_number ? ` · ${r.color_number}` : ''}`;
    const trimLabel = (r) => `${r.trim_item_name  || r.item || 'Trim'}${(r.color_name || r.color) ? ' · ' + (r.color_name || r.color) : ''}${r.color_number ? ` · ${r.color_number}` : ''}${r.variant_size ? ` · Sz ${r.variant_size}` : ''}`;
    const poStatusCls = (s) =>
        s === 'received'   ? 'bg-emerald-100 text-emerald-700' :
        s === 'in-transit' ? 'bg-blue-100 text-blue-700' :
        s === 'delayed'    ? 'bg-red-100 text-red-700' :
                             'bg-amber-100 text-amber-700';

    const Tile = ({ label, value, sub }) => (
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="text-base font-extrabold text-slate-800 leading-none mt-1">{value}</p>
            {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
    );

    const SectionBlock = ({ title, count, children }) => (
        <div>
            <div className="flex items-center justify-between mb-1 px-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
                <span className="text-[10px] font-bold text-slate-300">{count}</span>
            </div>
            <ul className="rounded-lg border border-slate-100 divide-y divide-slate-100">{children}</ul>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={!busy ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-0.5">
                            Destructive — recalculation will delete the items below
                        </p>
                        <h2 className="font-extrabold text-slate-800 text-base">Recalculate Requirements?</h2>
                        {sopName && <p className="text-xs text-slate-500 mt-0.5">{sopName}</p>}
                    </div>
                    {!busy && (
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 mt-0.5">
                            <X size={18} />
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <div className="grid grid-cols-4 gap-2">
                        <Tile label="Fabric reqs"  value={fabricCount}      sub={`${Number(totalMeters).toFixed(1)} m`} />
                        <Tile label="Trim reqs"    value={trimCount}        sub={`${Number(totalQty).toLocaleString()} pcs`} />
                        <Tile label="Reservations" value={reservationCount} />
                        <Tile label="PR / PO"      value={`${prCount} / ${poCount}`} />
                    </div>

                    {fabReqs.length > 0 && (
                        <SectionBlock title="Fabric Requirements" count={fabReqs.length}>
                            {fabReqs.map((r, i) => (
                                <li key={r.id ?? `f-${i}`} className="flex items-center justify-between text-xs py-1.5 px-3">
                                    <span className="truncate">{fabLabel(r)}</span>
                                    <span className="font-bold text-slate-700 shrink-0 ml-2">
                                        {Number(r.meters_required ?? r.meters ?? 0).toFixed(1)} m
                                    </span>
                                </li>
                            ))}
                        </SectionBlock>
                    )}

                    {trimReqs.length > 0 && (
                        <SectionBlock title="Trim Requirements" count={trimReqs.length}>
                            {trimReqs.map((r, i) => (
                                <li key={r.id ?? `t-${i}`} className="flex items-center justify-between text-xs py-1.5 px-3">
                                    <span className="truncate">{trimLabel(r)}</span>
                                    <span className="font-bold text-slate-700 shrink-0 ml-2">
                                        {Number(r.quantity_required ?? r.quantity ?? 0).toLocaleString()} {r.unit_of_measure ?? r.unit ?? 'pcs'}
                                    </span>
                                </li>
                            ))}
                        </SectionBlock>
                    )}

                    {reservations.length > 0 && (
                        <SectionBlock title="Reservations" count={reservations.length}>
                            {reservations.map((r, i) => {
                                const isFabric = (r.type || '').toLowerCase() === 'fabric'
                                              || r.meters_reserved != null
                                              || r.meters != null;
                                const label = isFabric ? fabLabel(r) : trimLabel(r);
                                const amount = isFabric
                                    ? `${Number(r.meters_reserved ?? r.reserved ?? r.meters ?? 0).toFixed(1)} m reserved`
                                    : `${Number(r.quantity_reserved ?? r.reserved ?? r.quantity ?? 0).toLocaleString()} ${r.unit_of_measure ?? r.unit ?? 'pcs'} reserved`;
                                return (
                                    <li key={r.id ?? `rs-${i}`} className={`flex items-center justify-between text-xs py-1.5 px-3 gap-2 ${r.is_substitute ? 'bg-purple-50/50' : 'bg-emerald-50/40'}`}>
                                        <span className="truncate flex-1 min-w-0">
                                            {r.is_substitute && (
                                                <span className="inline-flex items-center mr-1.5 text-[9px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded-full">
                                                    SUB
                                                </span>
                                            )}
                                            {label}
                                            {r.is_substitute && (r.color_name || r.color_number) && (
                                                <span className="ml-1 text-purple-600 font-semibold">
                                                    · {r.color_name}{r.color_number ? ` (${r.color_number})` : ''}
                                                </span>
                                            )}
                                        </span>
                                        <span className="font-bold text-emerald-700 shrink-0">{amount}</span>
                                    </li>
                                );
                            })}
                        </SectionBlock>
                    )}

                    {purchReqs.length > 0 && (
                        <SectionBlock title="Purchase Requests (not on PO)" count={purchReqs.length}>
                            {purchReqs.map((r, i) => {
                                const isFabric = (r.type || '').toLowerCase() === 'fabric';
                                const label = isFabric ? fabLabel(r) : trimLabel(r);
                                return (
                                    <li key={r.id ?? `pr-${i}`} className="flex items-center justify-between text-xs py-1.5 px-3">
                                        <span className="truncate">{label}</span>
                                        <span className="font-bold text-amber-700 shrink-0 ml-2">
                                            {Number(r.quantity ?? r.meters ?? 0).toLocaleString()} {r.unit ?? (isFabric ? 'm' : 'pcs')}
                                        </span>
                                    </li>
                                );
                            })}
                        </SectionBlock>
                    )}

                    {purchOrders.length > 0 && (
                        <SectionBlock title="Purchase Orders" count={purchOrders.length}>
                            {purchOrders.map((r, i) => {
                                const isFabric = (r.type || '').toLowerCase() === 'fabric';
                                const label = isFabric ? fabLabel(r) : trimLabel(r);
                                const status = r.po_status ?? r.status ?? 'pending';
                                return (
                                    <li key={r.id ?? `po-${i}`} className="flex items-center justify-between text-xs py-1.5 px-3 gap-2">
                                        <span className="truncate flex-1 min-w-0">
                                            <span className="font-semibold">{r.po_code || (r.purchase_order_id ? `PO #${r.purchase_order_id}` : 'PO')}</span>
                                            {r.supplier_name ? ` · ${r.supplier_name}` : ''}
                                            <span className="text-slate-400"> · {label}</span>
                                            {(r.quantity != null || r.meters != null) && (
                                                <span className="text-slate-500"> · {Number(r.quantity ?? r.meters ?? 0).toLocaleString()} {r.unit ?? (isFabric ? 'm' : 'pcs')}</span>
                                            )}
                                        </span>
                                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${poStatusCls(status)}`}>
                                            {status}
                                        </span>
                                    </li>
                                );
                            })}
                        </SectionBlock>
                    )}

                    {fabReqs.length === 0 && trimReqs.length === 0 && reservations.length === 0 && purchReqs.length === 0 && purchOrders.length === 0 && (
                        <p className="text-center text-sm text-slate-400 italic py-6">No existing data — recalculation will compute from scratch.</p>
                    )}

                    {err && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{err}</p>}
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
                    <button onClick={onClose} disabled={busy}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40">
                        Cancel
                    </button>
                    <button onClick={onConfirm} disabled={busy}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 px-5 py-2.5 rounded-xl transition-colors shadow-sm">
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCw size={15} />}
                        Confirm Recalculate
                    </button>
                </div>
            </div>
        </div>
    );
};

const SopCard = ({ sop, salesOrder, bomOptions, onLink, onUnlink, onPreview, isLinking, onReadinessChange, onTAChange }) => {
    const { user } = useAuth();
    const [showPicker,       setShowPicker]       = useState(false);
    const [pickedBomId,      setPickedBomId]      = useState('');
    const [selectedRgIdxs,   setSelectedRgIdxs]   = useState(new Set());
    const [confirmUnlink,    setConfirmUnlink]     = useState(false);
    const [readinessLoading, setReadinessLoading] = useState(false);
    // Full BOM detail (with items + number_of_pieces) fetched on pick
    const [pickedBomDetail,   setPickedBomDetail]   = useState(null);
    const [loadingBomDetail,  setLoadingBomDetail]  = useState(false);
    // Per-SOP requirements
    const [sopReqs,           setSopReqs]           = useState(null);
    const [loadingReqs,       setLoadingReqs]       = useState(false);
    // Production tracking modal
    const [showTrackingModal, setShowTrackingModal] = useState(false);
    // Recalculate flow
    const [showRecalcConfirm, setShowRecalcConfirm] = useState(false);
    const [showQuantityPicker, setShowQuantityPicker] = useState(false);
    const [recalcing,         setRecalcing]         = useState(false);
    const [recalcErr,         setRecalcErr]         = useState(null);
    const [preview,           setPreview]           = useState(null);
    const [refreshTick,       setRefreshTick]       = useState(0);

    useEffect(() => {
        if (!sop.bom_id) return;
        setLoadingReqs(true);
        planningApi.getRequirements(sop.id)
        .then(r => setSopReqs(r.data?.data ?? r.data))
        .catch(() => setSopReqs(null))
        .finally(() => setLoadingReqs(false));
    }, [sop.bom_id, sop.id, refreshTick]);

    // Confirm "delete & recalc" → hand off to the marker-run picker (pre-populated
    // with previous finalized choices). The picker calls finalize + calculate.
    const doRecalculate = () => {
        setShowRecalcConfirm(false);
        setPreview(null);
        setRecalcErr(null);
        setShowQuantityPicker(true);
    };

    const handleRecalcClick = async () => {
        setRecalcErr(null);
        setRecalcing(true);
        try {
            const res  = await planningApi.getRecalculationPreview(sop.id);
            const data = res.data?.data ?? res.data;
            if (!data?.has_existing_data) {
                // First-time calc — go through the marker-run picker (finalize quantities → calculate)
                setShowQuantityPicker(true);
            } else {
                setPreview(data);
                setShowRecalcConfirm(true);
            }
        } catch (e) {
            setRecalcErr(e?.response?.data?.error || 'Recalculation preview failed');
        } finally {
            setRecalcing(false);
        }
    };

    const linkedBomDetail = bomOptions.find(b => b.id === sop.bom_id);
    const totalQty        = (sop.colors || []).reduce((s, c) => s + (c.quantity || c.total_quantity || 0), 0);
    const sizeEntries     = Object.entries(sop.size_breakdown || {}).filter(([, v]) => parseInt(v) > 0);

    // Order: simplified ratio per size
    const requiredSizesSet = new Set(sizeEntries.map(([s]) => stdSize(s)));
    const requiredSizes    = Array.from(requiredSizesSet).sort();
    const rawQtys          = sizeEntries.map(([, v]) => parseInt(v) || 1);
    const commonGcd        = rawQtys.length > 0 ? rawQtys.reduce(_gcd) : 1;
    const sizeRatioMap     = Object.fromEntries(
        sizeEntries.map(([s, v]) => [stdSize(s), Math.round(parseInt(v) / commonGcd)])
    );

    // Union — use detailed items (number_of_pieces) when available; fall back to flat sizes list
    const detailGroups = pickedBomDetail?.ratio_groups || null;
    const unionSizesSet = new Set();
    const unionRawMap   = {};
    if (detailGroups) {
        detailGroups.forEach((rg, idx) => {
            if (!selectedRgIdxs.has(idx)) return;
            (rg.items || []).forEach(it => {
                const s = stdSize(it.size || '');
                if (!s) return;
                unionSizesSet.add(s);
                unionRawMap[s] = (unionRawMap[s] || 0) + (parseInt(it.number_of_pieces) || 1);
            });
        });
    } else {
        // Detail not yet loaded — use flat sizes from list (no piece counts)
        const listBom = bomOptions.find(b => String(b.id) === pickedBomId);
        (listBom?.ratio_groups || []).forEach((rg, idx) => {
            if (!selectedRgIdxs.has(idx)) return;
            (rg.sizes || []).forEach(s => {
                const norm = stdSize(s);
                if (norm) unionSizesSet.add(norm);
            });
        });
    }

    const unionSizes    = Array.from(unionSizesSet).sort();
    const unionRawQtys  = Object.values(unionRawMap);
    const unionGcd      = unionRawQtys.length > 0 ? unionRawQtys.reduce(_gcd) : 1;
    const unionRatioMap = Object.fromEntries(
        Object.entries(unionRawMap).map(([s, v]) => [s, Math.round(v / unionGcd)])
    );

    const hasDetailData   = detailGroups !== null;
    const missingSizes    = requiredSizes.filter(s => !unionSizesSet.has(s));
    const extraSizes      = unionSizes.filter(s => !requiredSizesSet.has(s));
    const sizesOnlyMatch  = missingSizes.length === 0 && extraSizes.length === 0 && unionSizes.length > 0;
    const ratioMismatches = (hasDetailData && sizesOnlyMatch)
        ? requiredSizes.filter(s => (sizeRatioMap[s] ?? 0) !== (unionRatioMap[s] ?? 0))
        : [];
    const isMatch = sizesOnlyMatch && ratioMismatches.length === 0 && selectedRgIdxs.size > 0 && hasDetailData;

    const pickBom = async (bomId) => {
        setPickedBomId(bomId);
        setPickedBomDetail(null);
        const listBom = bomOptions.find(b => String(b.id) === bomId);
        // Pre-select all groups from list data while detail loads
        setSelectedRgIdxs(new Set((listBom?.ratio_groups || []).map((_, i) => i)));
        setLoadingBomDetail(true);
        try {
            const res    = await bomApi.getById(parseInt(bomId));
            const detail = res.data?.data ?? res.data;
            setPickedBomDetail(detail);
            setSelectedRgIdxs(new Set((detail?.ratio_groups || []).map((_, i) => i)));
        } catch {
            // keep list data as fallback
        } finally {
            setLoadingBomDetail(false);
        }
    };

    const toggleRg = (idx) => setSelectedRgIdxs(prev => {
        const next = new Set(prev);
        next.has(idx) ? next.delete(idx) : next.add(idx);
        return next;
    });

    const confirmLink = () => {
        if (!pickedBomId || !isMatch) return;
        const selectedRgIds = (detailGroups || [])
            .filter((_, i) => selectedRgIdxs.has(i))
            .map(rg => rg.ratio_group_id || rg.id)
            .filter(Boolean);
        onLink(sop.id, parseInt(pickedBomId, 10), selectedRgIds);
        setShowPicker(false);
        setPickedBomId('');
        setSelectedRgIdxs(new Set());
        setPickedBomDetail(null);
    };

    const doUnlink = () => {
        setConfirmUnlink(false);
        onUnlink(sop.id);
    };

    const handleReadinessToggle = async () => {
        const isForced     = sop.production_readiness === 'force_ready';
        const newReadiness = isForced ? 'in_planning' : 'force_ready';
        setReadinessLoading(true);
        try {
            await planningApi.updateProductionReadiness(sop.id, newReadiness);
            onReadinessChange && onReadinessChange(sop.id);
        } catch (e) {
            console.error('Readiness update failed', e);
        } finally {
            setReadinessLoading(false);
        }
    };

    const readinessCfg = READINESS_CFG[sop.production_readiness] || READINESS_CFG.in_planning;
    const ReadinessIcon = readinessCfg.icon;
    const isForceReady  = sop.production_readiness === 'force_ready';

    return (
        <div className={`border rounded-xl overflow-hidden transition-colors ${sop.bom_id ? 'border-emerald-200' : 'border-slate-200'}`}>

            <div className={`flex items-center justify-between gap-3 px-4 py-3 ${sop.bom_id ? 'bg-emerald-50/50' : 'bg-slate-50'}`}>
                <div>
                    <p className="font-bold text-slate-800 text-sm">{sop.product_name}</p>
                    <div className="flex items-center flex-wrap gap-2 mt-0.5">
                        {sop.fabric_type_name && (
                            <span className="text-[10px] text-slate-500">{sop.fabric_type_name}</span>
                        )}
                        <span className="text-[10px] text-slate-400">
                            {sop.colors?.length || 0} color{(sop.colors?.length || 0) !== 1 ? 's' : ''} · {totalQty.toLocaleString()} pcs
                        </span>
                    </div>
                    {sizeEntries.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {sizeEntries.map(([size, qty]) => (
                                <span key={size} className="text-[9px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded font-bold" title={`Mapped to: ${stdSize(size)}`}>
                                    {size}×{qty}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right: BOM badge + readiness badge + toggle */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {sop.bom_id ? (
                        <span className="text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1">
                            <CheckCircle2 size={9} /> BOM Linked
                        </span>
                    ) : (
                        <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1">
                            <AlertTriangle size={9} /> No BOM
                        </span>
                    )}

                    <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border flex items-center gap-1 ${readinessCfg.cls}`}>
                            {ReadinessIcon && <ReadinessIcon size={9} />}
                            {readinessCfg.label}
                        </span>
                        <button
                            onClick={handleReadinessToggle}
                            disabled={readinessLoading}
                            title={isForceReady ? 'Revert to auto readiness' : 'Force mark as ready'}
                            className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
                                isForceReady
                                    ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200'
                                    : 'bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100'
                            }`}
                        >
                            {readinessLoading
                                ? <Loader2 size={9} className="animate-spin" />
                                : isForceReady
                                    ? <><ShieldOff size={9} /> Revert</>
                                    : <><ShieldCheck size={9} /> Force Ready</>
                            }
                        </button>
                    </div>
                </div>
            </div>

            {(sop.colors || []).length > 0 && (() => {
                const planByColor = {};
                (sop.production_plan_items || []).forEach(p => {
                    planByColor[String(p.fabric_color_id)] = p;
                });
                return (
                <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap gap-1.5">
                    {sop.colors.map(c => {
                        const ordered = Number(c.quantity ?? c.total_quantity ?? 0);
                        const plan    = planByColor[String(c.fabric_color_id)];
                        const finalized = plan?.finalized_quantity;
                        const runs    = plan?.marker_runs;
                        return (
                            <span key={c.fabric_color_id}
                                className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md font-bold">
                                {c.color_number || c.color_name}
                                {c.color_number && c.color_name && (
                                    <span className="font-normal text-indigo-400 ml-1">#{c.color_name}</span>
                                )}
                                {' '}· {ordered.toLocaleString()} ordered
                                {finalized != null && (
                                    <span className="ml-1 text-emerald-700">
                                        · {Number(finalized).toLocaleString()} final
                                        {runs != null && <span className="font-normal text-emerald-500"> ({runs} run{runs === 1 ? '' : 's'})</span>}
                                    </span>
                                )}
                            </span>
                        );
                    })}
                </div>
                );
            })()}

            <div className="px-4 py-3 border-t border-slate-100">
                {sop.bom_id ? (
                    <>
                        <div className="flex items-start justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                            <div className="flex items-start gap-2 min-w-0">
                                <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <p className="font-bold text-emerald-900 text-sm">{sop.bom_name}</p>
                                        <button
                                            onClick={() => onPreview(sop.bom_id)}
                                            className="text-emerald-500 hover:text-emerald-700 transition-colors"
                                            title="Preview BOM"
                                        >
                                            <Eye size={13} />
                                        </button>
                                    </div>
                                    {(linkedBomDetail?.ratio_groups || []).length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {linkedBomDetail.ratio_groups.map((rg, i) => (
                                                <span key={i}
                                                    className="text-[9px] bg-white text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                                                    {rg.ratio_group_name}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {isLinking ? (
                                <Loader2 size={14} className="animate-spin text-slate-400 shrink-0 mt-0.5" />
                            ) : !confirmUnlink ? (
                                <button
                                    onClick={() => setConfirmUnlink(true)}
                                    className="text-[10px] text-slate-400 hover:text-red-600 flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors shrink-0"
                                >
                                    <X size={11} /> Unlink
                                </button>
                            ) : (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] text-slate-600 font-medium">Remove?</span>
                                    <button onClick={doUnlink}
                                        className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors">
                                        Yes
                                    </button>
                                    <button onClick={() => setConfirmUnlink(false)}
                                        className="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors">
                                        No
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                            {loadingReqs && (
                                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <Loader2 size={10} className="animate-spin" /> Loading requirements…
                                </span>
                            )}
                            {user?.role === 'merchandiser' && (
                                <button
                                    onClick={handleRecalcClick}
                                    disabled={recalcing}
                                    className="ml-auto flex items-center gap-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    {recalcing ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />}
                                    {sopReqs ? 'Recalculate' : 'Calculate Requirements'}
                                </button>
                            )}
                        </div>
                        {recalcErr && !showRecalcConfirm && (
                            <p className="text-[10px] text-red-500 mt-1 text-right">{recalcErr}</p>
                        )}
                    </>
                ) : (
                    !showPicker ? (
                        <button
                            onClick={() => setShowPicker(true)}
                            disabled={isLinking}
                            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 border-dashed px-3 py-2.5 rounded-xl transition-colors disabled:opacity-40"
                        >
                            {isLinking ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                            Link a BOM
                        </button>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between mb-2.5">
                                <p className="text-xs font-bold text-slate-700">Select an approved BOM to validate sizes:</p>
                                <button onClick={() => { setShowPicker(false); setPickedBomId(''); }}
                                    className="text-slate-400 hover:text-slate-600 p-0.5">
                                    <X size={14} />
                                </button>
                            </div>

                            {bomOptions.length === 0 ? (
                                <div className="text-center py-5 text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                    No approved BOMs available for this product
                                </div>
                            ) : (
                                <>
                                    {/* ── Order required sizes with ratio ── */}
                                    <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Order Requires</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {sizeEntries.length === 0
                                                ? <span className="text-[10px] text-slate-400 italic">No size breakdown available</span>
                                                : sizeEntries.map(([rawSize, qty]) => {
                                                    const s = stdSize(rawSize);
                                                    const ratio = sizeRatioMap[s] ?? 1;
                                                    return (
                                                        <span key={s} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 shadow-sm">
                                                            <span className="text-slate-500">{s}</span>
                                                            <span className="text-slate-300">·</span>
                                                            <span className="text-violet-600">×{ratio}</span>
                                                            <span className="text-[9px] font-normal text-slate-400">({parseInt(qty).toLocaleString()} pcs)</span>
                                                        </span>
                                                    );
                                                })
                                            }
                                        </div>
                                    </div>

                                    {/* ── BOM list ── */}
                                    <div className="space-y-2 max-h-[460px] overflow-y-auto pr-0.5">
                                        {bomOptions.map(bom => {
                                            const isSelected = pickedBomId === String(bom.id);
                                            return (
                                                <div key={bom.id} className={`rounded-xl border transition-all ${
                                                    isSelected ? 'border-violet-400 bg-violet-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/20'
                                                }`}>
                                                    <label className="flex items-start gap-3 p-3 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name={`bom-pick-${sop.id}`}
                                                            value={bom.id}
                                                            checked={isSelected}
                                                            onChange={() => pickBom(String(bom.id))}
                                                            className="mt-0.5 accent-violet-600 shrink-0"
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-1">
                                                                <p className="font-bold text-slate-800 text-sm truncate">{bom.bom_name}</p>
                                                                <button
                                                                    onClick={e => { e.preventDefault(); e.stopPropagation(); onPreview(bom.id); }}
                                                                    className="shrink-0 text-slate-400 hover:text-violet-600 transition-colors p-0.5"
                                                                    title="Preview BOM"
                                                                >
                                                                    <Eye size={13} />
                                                                </button>
                                                            </div>
                                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                                {(bom.ratio_groups || []).length} ratio group{(bom.ratio_groups || []).length !== 1 ? 's' : ''}
                                                            </p>
                                                        </div>
                                                    </label>

                                                    {isSelected && (
                                                        <div className="border-t border-violet-100 bg-white p-3 mx-1 mb-1 rounded-b-lg space-y-3">

                                                            {/* Ratio group checkboxes */}
                                                            <div>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                                                    Select Ratio Groups to Include in Union
                                                                </p>
                                                                {loadingBomDetail ? (
                                                                    <div className="flex items-center gap-2 py-3 text-[11px] text-slate-400">
                                                                        <Loader2 size={12} className="animate-spin" /> Loading ratio group details…
                                                                    </div>
                                                                ) : (
                                                                <div className="space-y-1.5">
                                                                    {(detailGroups || bom.ratio_groups || []).map((rg, rgIdx) => {
                                                                        const checked  = selectedRgIdxs.has(rgIdx);
                                                                        // items with number_of_pieces only exist in detailed response
                                                                        const rgItems  = rg.items || [];
                                                                        const rgSizes  = rgItems.length > 0
                                                                            ? rgItems.map(it => stdSize(it.size || '')).filter(Boolean)
                                                                            : (rg.sizes || []).map(s => stdSize(s)).filter(Boolean);
                                                                        const rgPieces = Object.fromEntries(
                                                                            rgItems.map(it => [stdSize(it.size || ''), parseInt(it.number_of_pieces) || 1])
                                                                        );
                                                                        return (
                                                                            <label key={rgIdx}
                                                                                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                                                                                    checked
                                                                                        ? 'bg-violet-50 border-violet-200'
                                                                                        : 'bg-slate-50 border-slate-200 opacity-60 hover:opacity-80'
                                                                                }`}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={checked}
                                                                                    onChange={() => toggleRg(rgIdx)}
                                                                                    className="mt-0.5 accent-violet-600 shrink-0"
                                                                                />
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-xs font-bold text-slate-700">
                                                                                        {rg.ratio_group_name || `Group ${rgIdx + 1}`}
                                                                                        {rg.marker_length_inches && (
                                                                                            <span className="ml-1.5 text-[9px] font-normal text-slate-400">{rg.marker_length_inches}" marker</span>
                                                                                        )}
                                                                                    </p>
                                                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                                                        {rgSizes.length === 0
                                                                                            ? <span className="text-[9px] text-slate-400 italic">No sizes</span>
                                                                                            : rgSizes.map(s => (
                                                                                                <span key={s} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                                                                                    checked
                                                                                                        ? 'bg-violet-100 text-violet-700 border-violet-200'
                                                                                                        : 'bg-white text-slate-500 border-slate-200'
                                                                                                }`}>
                                                                                                    {s}{rgPieces[s] ? `×${rgPieces[s]}` : ''}
                                                                                                </span>
                                                                                            ))
                                                                                        }
                                                                                    </div>
                                                                                </div>
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                                )}
                                                            </div>

                                                            {/* Union comparison table */}
                                                            <div className="border-t border-slate-100 pt-3">
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                                                    Size Ratio Comparison
                                                                </p>
                                                                {selectedRgIdxs.size === 0 ? (
                                                                    <p className="text-[10px] text-slate-400 italic">Select at least one group above</p>
                                                                ) : (
                                                                    <table className="w-full text-[10px] border-collapse">
                                                                        <thead>
                                                                            <tr className="border-b border-slate-200">
                                                                                <th className="text-left py-1 pr-2 font-bold text-slate-400 uppercase">Size</th>
                                                                                <th className="text-center py-1 px-2 font-bold text-slate-400 uppercase">Order Ratio</th>
                                                                                <th className="text-center py-1 px-2 font-bold text-slate-400 uppercase">BOM Union</th>
                                                                                <th className="text-center py-1 pl-2 font-bold text-slate-400 uppercase">Match</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {/* Ordered sizes */}
                                                                            {requiredSizes.map(s => {
                                                                                const orderR = sizeRatioMap[s] ?? 0;
                                                                                const unionR = unionRatioMap[s] ?? null;
                                                                                const present = unionSizesSet.has(s);
                                                                                const ratioOk = present && orderR === unionR;
                                                                                return (
                                                                                    <tr key={s} className="border-b border-slate-50">
                                                                                        <td className="py-1.5 pr-2 font-bold text-slate-700">{s}</td>
                                                                                        <td className="py-1.5 px-2 text-center">
                                                                                            <span className="bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded font-bold">
                                                                                                ×{orderR}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="py-1.5 px-2 text-center">
                                                                                            {present ? (
                                                                                                <span className={`px-1.5 py-0.5 rounded font-bold border ${
                                                                                                    ratioOk
                                                                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                                                        : 'bg-red-50 text-red-600 border-red-200'
                                                                                                }`}>
                                                                                                    ×{unionR}
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="text-red-400 italic">missing</span>
                                                                                            )}
                                                                                        </td>
                                                                                        <td className="py-1.5 pl-2 text-center">
                                                                                            {ratioOk
                                                                                                ? <CheckCircle2 size={12} className="text-emerald-500 mx-auto" />
                                                                                                : <AlertTriangle size={12} className="text-red-500 mx-auto" />
                                                                                            }
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                            {/* Extra sizes not in order */}
                                                                            {extraSizes.map(s => (
                                                                                <tr key={s} className="border-b border-slate-50 opacity-70">
                                                                                    <td className="py-1.5 pr-2 font-bold text-amber-600">{s}</td>
                                                                                    <td className="py-1.5 px-2 text-center">
                                                                                        <span className="text-slate-400 italic text-[9px]">not ordered</span>
                                                                                    </td>
                                                                                    <td className="py-1.5 px-2 text-center">
                                                                                        <span className="bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
                                                                                            ×{unionRatioMap[s] ?? '?'}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="py-1.5 pl-2 text-center">
                                                                                        <AlertTriangle size={12} className="text-amber-400 mx-auto" />
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                )}
                                                            </div>

                                                            {/* Match verdict */}
                                                            {selectedRgIdxs.size > 0 && (
                                                                <div className="space-y-1.5">
                                                                    {isMatch && (
                                                                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                                                                            <CheckCircle2 size={13} className="shrink-0" />
                                                                            <span><b>Perfect match —</b> sizes and ratios align exactly.</span>
                                                                        </div>
                                                                    )}
                                                                    {missingSizes.length > 0 && (
                                                                        <div className="flex items-center gap-1.5 text-[11px] text-red-700 bg-red-50 p-2 rounded-lg border border-red-200">
                                                                            <AlertTriangle size={12} className="shrink-0" />
                                                                            <span><b>Missing sizes:</b> {missingSizes.join(', ')} — order cannot be fully fulfilled</span>
                                                                        </div>
                                                                    )}
                                                                    {ratioMismatches.length > 0 && (
                                                                        <div className="flex items-center gap-1.5 text-[11px] text-red-700 bg-red-50 p-2 rounded-lg border border-red-200">
                                                                            <AlertTriangle size={12} className="shrink-0" />
                                                                            <span><b>Ratio mismatch:</b> {ratioMismatches.join(', ')} — pieces per marker don't match ordered ratio</span>
                                                                        </div>
                                                                    )}
                                                                    {extraSizes.length > 0 && (
                                                                        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                                                                            <AlertTriangle size={12} className="shrink-0" />
                                                                            <span><b>Extra sizes:</b> {extraSizes.join(', ')} — will be cut but not ordered</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="flex items-center justify-between mt-4">
                                        <p className="text-[10px] text-slate-400">
                                            Sizes are standardized before comparison.
                                        </p>
                                        <button
                                            onClick={confirmLink}
                                            disabled={!pickedBomId || !isMatch}
                                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-xl transition-colors"
                                        >
                                            <Link2 size={14} /> Confirm Link
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )
                )}
            </div>

            {/* ── Production Tracking ── */}
            {(() => {
                const fabReqs  = sopReqs?.fabric_requirements || [];
                const trimReqs = sopReqs?.trim_requirements   || [];
                const allTracked = [
                    ...fabReqs.filter(r => r.ta_id).map(r => r.ta_status || 'pending'),
                    ...trimReqs.filter(r => r.ta_id).map(r => r.ta_status || 'pending'),
                    ...((sop.timeline || [])
                        .filter(it => it.production_plan_item_id == null &&
                            !fabReqs.some(r => r.ta_id === it.id) &&
                            !trimReqs.some(r => r.ta_id === it.id))
                        .map(it => it.status)
                    ),
                ];
                const total   = allTracked.length;
                const compl   = allTracked.filter(s => s === 'completed').length;
                const overdue = (sop.timeline || []).filter(it =>
                    it.end_date && new Date(it.end_date) < new Date() && it.status !== 'completed'
                ).length;
                const fabShort = fabReqs.filter(fr =>
                    Math.max(0, (fr.meters_required || 0) - (fr.stock_suggestion?.total_meters_available ?? 0)) > 0
                ).length;
                const trimUnf  = trimReqs.filter(tr => !tr.is_fulfilled).length;
                return (
                    <div className="border-t border-slate-100">
                        <div
                            onClick={() => setShowTrackingModal(true)}
                            className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Production Tracking
                                    {salesOrder?.order_number && (
                                        <span className="ml-2 text-[10px] font-normal text-slate-400 normal-case">
                                            · #{salesOrder.order_number}
                                            {salesOrder.customer_name ? ` · ${salesOrder.customer_name}` : ''}
                                        </span>
                                    )}
                                </p>
                                {total > 0 && (
                                    <span className="text-[10px] font-bold bg-violet-50 text-violet-600 border border-violet-100 px-1.5 py-0.5 rounded-full">
                                        {compl}/{total} done
                                    </span>
                                )}
                                {overdue > 0 && (
                                    <span className="text-[10px] font-bold bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded-full">
                                        {overdue} overdue
                                    </span>
                                )}
                                {(fabShort > 0 || trimUnf > 0) && (
                                    <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded-full">
                                        {fabShort + trimUnf} shortfall{fabShort + trimUnf !== 1 ? 's' : ''}
                                    </span>
                                )}
                                {total === 0 && !loadingReqs && sop.bom_id && (
                                    <span className="text-[10px] text-slate-400 italic">Calculate requirements to track procurement</span>
                                )}
                                {loadingReqs && <span className="text-[10px] text-slate-400">Loading…</span>}
                            </div>
                            <ChevronRight size={13} className="text-slate-400 shrink-0 ml-2" />
                        </div>
                    </div>
                );
            })()}

            {showTrackingModal && (
                <ProductionTrackingModal
                    sop={sop}
                    salesOrder={salesOrder}
                    sopReqs={sopReqs}
                    onClose={() => setShowTrackingModal(false)}
                    onRefresh={onTAChange}
                />
            )}

            {showRecalcConfirm && (
                <RecalculateConfirmModal
                    preview={preview}
                    sopName={sop?.product_name}
                    busy={recalcing}
                    err={recalcErr}
                    onClose={() => {
                        if (recalcing) return;
                        setShowRecalcConfirm(false);
                        setPreview(null);
                    }}
                    onConfirm={doRecalculate}
                />
            )}

            {showQuantityPicker && (
                <QuantitySuggestionModal
                    linkedSops={[sop]}
                    onClose={() => setShowQuantityPicker(false)}
                    onDone={() => {
                        setShowQuantityPicker(false);
                        setRefreshTick(t => t + 1);
                        if (onTAChange) onTAChange();
                    }}
                />
            )}
        </div>
    );
};

// ─── SECTION WRAPPER ───────────────────────────────────────────────────────────

const Section = ({ icon: Icon, iconCls, title, badge, children }) => (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
                <Icon size={16} className={iconCls} />
                <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
            </div>
            {badge}
        </div>
        <div className="p-5">{children}</div>
    </div>
);

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const ProductionPlanningPage = () => {
    const [formData,        setFormData]        = useState(null);
    const [loadingForm,     setLoadingForm]     = useState(true);
    const [formErr,         setFormErr]         = useState(null);

    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const [orderDetail,     setOrderDetail]     = useState(null);
    const [loadingOrder,    setLoadingOrder]    = useState(false);

    const [linking,           setLinking]           = useState({});
    const [searchQ,           setSearchQ]           = useState('');
    const [previewBomId,      setPreviewBomId]      = useState(null);

    // Load sales orders + approved BOMs on mount
    useEffect(() => {
        planningApi.getFormData()
            .then(res => {
                const data = res.data?.data ?? res.data;
                console.log('plavnning ddApi. getFormData received:', data);
                setFormData(data);
            })
            .catch(e  => setFormErr(e?.response?.data?.error || 'Failed to load planning data'))
            .finally(() => setLoadingForm(false));
    }, []);

    const refreshOrder = useCallback(async (orderId) => {
        const [detailRes, fdRes] = await Promise.all([
            planningApi.getOrderDetail(orderId),
            planningApi.getFormData(),
        ]);
        console.log('Order detail refreshfed', detailRes.data, fdRes.data);
        setOrderDetail(detailRes.data?.data ?? detailRes.data);
        setFormData(fdRes.data?.data ?? fdRes.data);
    }, []);

    const selectOrder = useCallback((orderId) => {
        if (orderId === selectedOrderId) return;
        setSelectedOrderId(orderId);
        setOrderDetail(null);
        setLoadingOrder(true);
        planningApi.getOrderDetail(orderId)
            .then(res => {
                const payload = res.data?.data ?? res.data;
                console.log('plaanningApi.getOrderDetail response:', orderId, payload);
                setOrderDetail(payload);
            })
            .catch(e  => console.error('Order detail fetch failed', e))
            .finally(() => setLoadingOrder(false));
    }, [selectedOrderId]);

    

    const handleLink = useCallback(async (sopId, bomId, ratioGroupIds) => {
        setLinking(l => ({ ...l, [sopId]: true }));
        try {
            await planningApi.linkBom(sopId, {
                bom_id: bomId,
                ratio_group_ids: ratioGroupIds,
            });
            await refreshOrder(selectedOrderId);
        } catch (e) {
            console.error('Link BOM failed', e);
        } finally {
            setLinking(l => ({ ...l, [sopId]: false }));
        }
    }, [selectedOrderId, refreshOrder]);

    const handleUnlink = useCallback(async (sopId) => {
        setLinking(l => ({ ...l, [sopId]: true }));
        try {
            await planningApi.unlinkBom(sopId);
            await refreshOrder(selectedOrderId);
        } catch (e) {
            console.error('Unlink BOM failed', e);
        } finally {
            setLinking(l => ({ ...l, [sopId]: false }));
        }
    }, [selectedOrderId, refreshOrder]);

    const handleReadiness = useCallback(async () => {
        await refreshOrder(selectedOrderId);
    }, [selectedOrderId, refreshOrder]);

    const orders         = formData?.sales_orders    || [];
    const bomsByProduct  = formData?.boms_by_product || {};
    const sops           = orderDetail?.products     || [];
    const unlinkedCount  = sops.filter(s => !s.bom_linked && !s.bom_id).length;

    const filteredOrders = orders.filter(o =>
        !searchQ ||
        o.order_number?.toLowerCase().includes(searchQ.toLowerCase()) ||
        (o.customer_name || o.buyer_name || '').toLowerCase().includes(searchQ.toLowerCase())
    );

    return (
        <>
        <div className="flex h-full bg-slate-50 overflow-hidden">

            {/* ── LEFT: Order sidebar ── */}
            <div className="w-72 min-w-[18rem] bg-white border-r border-slate-200 flex flex-col overflow-hidden">
                <div className="px-4 py-4 border-b border-slate-100 shrink-0">
                    <h2 className="font-extrabold text-slate-800 text-sm mb-3">Sales Orders</h2>
                    <input
                        type="search"
                        placeholder="Search order or buyer…"
                        value={searchQ}
                        onChange={e => setSearchQ(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loadingForm && <Spinner h={32} />}
                    {formErr && <p className="text-xs text-red-500 px-4 py-3">{formErr}</p>}
                    {!loadingForm && filteredOrders.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-10">No orders found</p>
                    )}
                    {filteredOrders.map(order => (
                        <OrderCard
                            key={order.id}
                            order={order}
                            isSelected={selectedOrderId === order.id}
                            onClick={() => selectOrder(order.id)}
                        />
                    ))}
                </div>
            </div>

            {/* ── RIGHT: Detail panel ── */}
            <div className="flex-1 overflow-y-auto">
                {!selectedOrderId && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                        <ShoppingBag size={52} className="opacity-20" />
                        <p className="text-sm font-medium">Select a sales order to start planning</p>
                    </div>
                )}

                {selectedOrderId && (
                    <div className="p-6 space-y-5">
                        {loadingOrder && <Spinner />}

                        {!loadingOrder && orderDetail && (
                            <>
                                {/* ── Order header ── */}
                                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                                    <div className="flex items-start justify-between gap-3 mb-4">
                                        <div>
                                            <div className="flex items-baseline gap-2">
                                                <h2 className="font-extrabold text-slate-800 text-xl">Order #{orderDetail.order_number}</h2>
                                                {orderDetail.buyer_po_number && (
                                                    <span className="text-sm text-slate-400">PO {orderDetail.buyer_po_number}</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-500 mt-0.5">
                                                {orderDetail.customer_name || orderDetail.buyer_name || '—'}
                                            </p>
                                        </div>
                                        {unlinkedCount > 0 ? (
                                            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0">
                                                <AlertTriangle size={13} /> {unlinkedCount} product{unlinkedCount > 1 ? 's' : ''} without BOM
                                            </span>
                                        ) : (
                                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0">
                                                <CheckCircle2 size={13} /> All BOMs linked
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {[
                                            { label: 'Delivery Date', val: orderDetail.delivery_date ? new Date(orderDetail.delivery_date).toLocaleDateString() : '—' },
                                            { label: 'Status',        val: orderDetail.status || '—' },
                                            { label: 'Products',      val: sops.length },
                                            { label: 'Order Value',   val: orderDetail.total_amount ? `₹${Number(orderDetail.total_amount).toLocaleString()}` : '—' },
                                        ].map(({ label, val }) => (
                                            <div key={label} className="bg-slate-50 rounded-xl p-3">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                                                <p className="font-semibold text-slate-700 text-sm">{val}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ── BOM Linking ── */}
                                <Section
                                    icon={Link2}
                                    iconCls="text-violet-500"
                                    title="Product–BOM Links"
                                    badge={
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1">
                                                {Array.from({ length: sops.length }).map((_, i) => (
                                                    <span key={i}
                                                        className={`inline-block w-2 h-2 rounded-full transition-colors ${
                                                            i < (sops.length - unlinkedCount) ? 'bg-emerald-500' : 'bg-slate-300'
                                                        }`}
                                                    />
                                                ))}
                                            </div>
                                            <span className={`text-xs font-bold ${unlinkedCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                {sops.length - unlinkedCount}/{sops.length} linked
                                            </span>
                                        </div>
                                    }
                                >
                                    <div className="space-y-3">
                                        {sops.map(sop => (
                                            <SopCard
                                                key={sop.id}
                                                sop={sop}
                                                salesOrder={orderDetail}
                                                bomOptions={bomsByProduct[String(sop.product_id)] || bomsByProduct[sop.product_id] || []}
                                                onLink={handleLink}
                                                onUnlink={handleUnlink}
                                                onPreview={setPreviewBomId}
                                                isLinking={!!linking[sop.id]}
                                                onReadinessChange={handleReadiness}
                                                onTAChange={() => refreshOrder(selectedOrderId)}
                                            />
                                        ))}
                                    </div>
                                </Section>

                            </>
                        )}
                    </div>
                )}
            </div>
        </div>

        {previewBomId && (
            <BomPreviewModal bomId={previewBomId} onClose={() => setPreviewBomId(null)} />
        )}
</>
    );
};

export default ProductionPlanningPage;