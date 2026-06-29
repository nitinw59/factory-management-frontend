import { useState, useEffect, useMemo } from 'react';
import {
    X, Loader2, AlertTriangle, Package, Scissors, Trash2, Upload, FileText, Plus,
} from 'lucide-react';
import { trimsApi } from '../../api/trimsApi';
import api from '../../utils/api';
import SupplierCodePill from './SupplierCodePill';
import SearchableSelect from '../../shared/SearchableSelect';
import BoxBreakdownModal from './BoxBreakdownModal';
import {
    TYPE_ICON,
    reqTotal, reqUnit, reqLabel,
    newRoll, sumRolls, rk,
    sumTrimBoxes,
    pendingByReqMap, pendingByPoItemMap,
    buildItemsFromState, labelFromGroup,
} from './inwardShared';

/**
 * InwardCreateModal — focused only on creating a brand-new inward.
 *
 * On clicking "Review & Create" we don't post anything. We bundle a payload +
 * a snapshot of every field and hand it back to the parent via onReview. The
 * parent flips to InwardReviewModal; if the user goes back, the parent
 * remounts this modal with the same snapshot so nothing is lost.
 *
 * Props
 *   poId            — PO id we're inwarding against (passed through to review)
 *   poItems         — joined PO items (used for label resolution + req lists)
 *   allInwards      — existing inwards on this PO, for pending-qty math
 *   initialSnapshot — restore previous form state (when coming back from review)
 *   onReview({ payload, snapshot })
 *   onClose()
 */
export default function InwardCreateModal({
    poId,                            // eslint-disable-line no-unused-vars
    poCode,
    poItems = [],
    supplierId,
    supplierName,
    allInwards = [],
    initialSnapshot = null,
    onReview,
    onClose,
}) {
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);
    const [boxModal, setBoxModal] = useState(null); // { title, uom, initialBoxes, onSave }

    // ── Header fields ───────────────────────────────────────────────────────
    const [grnNumber,    setGrnNumber]    = useState(initialSnapshot?.grnNumber    ?? '');
    const [receivedDate, setReceivedDate] = useState(initialSnapshot?.receivedDate ?? new Date().toISOString().split('T')[0]);
    const [condition,    setCondition]    = useState(initialSnapshot?.condition    ?? 'GOOD');
    const [notes,        setNotes]        = useState(initialSnapshot?.notes        ?? '');
    const [scanFile,     setScanFile]     = useState(initialSnapshot?.scanFile     ?? null);

    // ── Flattened requirements + pending maps ───────────────────────────────
    const allRequirements = useMemo(
        () => (poItems || []).flatMap(i => i.requirements || []),
        [poItems]
    );
    const pendingByReq    = useMemo(() => pendingByReqMap(allRequirements, allInwards, null, poItems), [allRequirements, allInwards, poItems]);
    const pendingByPoItem = useMemo(() => pendingByPoItemMap(poItems, allInwards, null), [poItems, allInwards]);

    const fabricReqIds = useMemo(
        () => new Set(allRequirements.filter(r => (r.item_type || r.type) === 'fabric').map(r => r.id)),
        [allRequirements]
    );

    // ── Form state ──────────────────────────────────────────────────────────
    // Trim total (simple qty, no breakdown) — primary entry mode
    const [trimTotalByReq, setTrimTotalByReq] = useState(() => initialSnapshot?.trimTotalByReq ?? (() => {
        const m = {};
        allRequirements.forEach(r => {
            if ((r.item_type || r.type) === 'fabric') return;
            const pending = pendingByReq[r.id] || 0;
            if (pending > 0) m[r.id] = String(pending);
        });
        return m;
    })());

    // Trim boxes (optional breakdown) — empty until user clicks "+ Add box breakdown"
    const [trimBoxesByReq, setTrimBoxesByReq] = useState(() => initialSnapshot?.trimBoxesByReq ?? (() => {
        const m = {};
        allRequirements.forEach(r => {
            if ((r.item_type || r.type) === 'fabric') return;
            m[r.id] = [];
        });
        return m;
    })());

    const [fabricRollsByReq, setFabricRollsByReq] = useState(() => initialSnapshot?.fabricRollsByReq ?? (() => {
        const m = {};
        allRequirements.forEach(r => {
            if ((r.item_type || r.type) !== 'fabric') return;
            m[r.id] = [newRoll()];
        });
        return m;
    })());

    const [freeFormTrimTotals, setFreeFormTrimTotals] = useState(() => initialSnapshot?.freeFormTrimTotals ?? (() => {
        const m = {};
        (poItems || []).forEach(p => {
            if ((p.requirements || []).length > 0) return;
            if (p.item_type === 'fabric') return;
            const pend = pendingByPoItem[p.id] || 0;
            if (pend > 0) m[p.id] = String(pend);
        });
        return m;
    })());

    const [freeFormTrimBoxes, setFreeFormTrimBoxes] = useState(() => initialSnapshot?.freeFormTrimBoxes ?? (() => {
        const m = {};
        (poItems || []).forEach(p => {
            if ((p.requirements || []).length > 0) return;
            if (p.item_type === 'fabric') return;
            m[p.id] = [];
        });
        return m;
    })());

    const [freeFormFabricRolls, setFreeFormFabricRolls] = useState(() => initialSnapshot?.freeFormFabricRolls ?? (() => {
        const m = {};
        (poItems || []).forEach(p => {
            if ((p.requirements || []).length > 0) return;
            if (p.item_type !== 'fabric') return;
            m[p.id] = [newRoll()];
        });
        return m;
    })());

    const [customGroups,  setCustomGroups]  = useState(initialSnapshot?.customGroups  ?? []);
    const [removedReqIds, setRemovedReqIds] = useState(() => new Set(initialSnapshot?.removedReqIds || []));
    const [removedPoItemIds, setRemovedPoItemIds] = useState(() => new Set(initialSnapshot?.removedPoItemIds || []));

    // ── Lookups (lazy fetch) ────────────────────────────────────────────────
    const [trimItems,      setTrimItems]      = useState([]);
    const [fabricTypes,    setFabricTypes]    = useState([]);
    const [fabricColors,   setFabricColors]   = useState([]);
    const [variantsByTrim, setVariantsByTrim] = useState({});

    useEffect(() => {
        trimsApi.getItems().then(r => setTrimItems(r.data?.data ?? r.data ?? [])).catch(() => setTrimItems([]));
        api.get('/shared/fabric_type').then(r => setFabricTypes(r.data?.data ?? r.data ?? [])).catch(() => setFabricTypes([]));
        api.get('/shared/fabric_color').then(r => setFabricColors(r.data?.data ?? r.data ?? [])).catch(() => setFabricColors([]));
    }, []);

    const ensureVariants = async (trimItemId) => {
        if (!trimItemId || variantsByTrim[trimItemId]) return;
        try {
            const r = await trimsApi.getVariants(trimItemId);
            setVariantsByTrim(prev => ({ ...prev, [trimItemId]: r.data?.data ?? r.data ?? [] }));
        } catch {
            setVariantsByTrim(prev => ({ ...prev, [trimItemId]: [] }));
        }
    };

    // ── Setters ─────────────────────────────────────────────────────────────
    // Trim total setters (total-only mode, no breakdown)
    const setTrimTotalForReq    = (rid, val) => setTrimTotalByReq(prev => ({ ...prev, [rid]: val }));
    const setTrimTotalForPoItem = (pid, val) => setFreeFormTrimTotals(prev => ({ ...prev, [pid]: val }));

    // Trim box setters (breakdown mode — managed via BoxBreakdownModal)
    const clearTrimBoxesForReq = (rid, computedTotal) => {
        setTrimBoxesByReq(prev => ({ ...prev, [rid]: [] }));
        if (computedTotal > 0) setTrimTotalByReq(prev => ({ ...prev, [rid]: String(computedTotal) }));
    };

    // Trim box setters (free-form PO item — managed via BoxBreakdownModal)
    const clearTrimBoxesForPoItem = (pid, computedTotal) => {
        setFreeFormTrimBoxes(prev => ({ ...prev, [pid]: [] }));
        if (computedTotal > 0) setFreeFormTrimTotals(prev => ({ ...prev, [pid]: String(computedTotal) }));
    };

    // Fabric roll setters (requirement-linked)
    const addRollToReq      = (rid)          => setFabricRollsByReq(prev => ({ ...prev, [rid]: [...(prev[rid] || []), newRoll()] }));
    const removeRollFromReq = (rid, k)       => setFabricRollsByReq(prev => ({ ...prev, [rid]: (prev[rid] || []).filter(r => r._k !== k) }));
    const setRollFieldOnReq = (rid, k, f, v) => setFabricRollsByReq(prev => ({ ...prev, [rid]: (prev[rid] || []).map(r => r._k === k ? { ...r, [f]: v } : r) }));

    // Fabric roll setters (free-form PO item)
    const addRollToPoItem      = (pid)          => setFreeFormFabricRolls(prev => ({ ...prev, [pid]: [...(prev[pid] || []), newRoll()] }));
    const removeRollFromPoItem = (pid, k)       => setFreeFormFabricRolls(prev => ({ ...prev, [pid]: (prev[pid] || []).filter(r => r._k !== k) }));
    const setRollFieldOnPoItem = (pid, k, f, v) => setFreeFormFabricRolls(prev => ({ ...prev, [pid]: (prev[pid] || []).map(r => r._k === k ? { ...r, [f]: v } : r) }));

    // Custom groups
    const addCustomGroup = (type) => setCustomGroups(prev => [...prev, {
        _k: rk(), type,
        fabric_type_id: '', trim_item_id: '',
        uom: type === 'fabric' ? 'meter' : 'pcs',
        unit_price: '', description: '',
        lines: type === 'fabric'
            ? [{ _k: rk(), fabric_color_id: '', rolls: [newRoll()] }]
            : [{ _k: rk(), trim_item_variant_id: '', total: '', boxes: [] }],
    }]);
    const removeCustomGroup = (gk) => setCustomGroups(prev => prev.filter(g => g._k !== gk));
    const setCustomGroupField = (gk, field, value) => setCustomGroups(prev => prev.map(g => {
        if (g._k !== gk) return g;
        const next = { ...g, [field]: value };
        if (field === 'trim_item_id') {
            next.lines = g.lines.map(ln => ({ ...ln, trim_item_variant_id: '' }));
            if (value) ensureVariants(value);
        }
        return next;
    }));
    const addCustomLine = (gk) => setCustomGroups(prev => prev.map(g => {
        if (g._k !== gk) return g;
        const ln = g.type === 'fabric'
            ? { _k: rk(), fabric_color_id: '', rolls: [newRoll()] }
            : { _k: rk(), trim_item_variant_id: '', total: '', boxes: [] };
        return { ...g, lines: [...g.lines, ln] };
    }));
    const removeCustomLine         = (gk, lk)            => setCustomGroups(prev => prev.map(g => g._k !== gk ? g : { ...g, lines: g.lines.filter(ln => ln._k !== lk) }));
    const setCustomLineField       = (gk, lk, f, v)      => setCustomGroups(prev => prev.map(g => g._k !== gk ? g : { ...g, lines: g.lines.map(ln => ln._k === lk ? { ...ln, [f]: v } : ln) }));
    const addRollToCustomLine      = (gk, lk)            => setCustomGroups(prev => prev.map(g => g._k !== gk ? g : { ...g, lines: g.lines.map(ln => ln._k === lk ? { ...ln, rolls: [...(ln.rolls || []), newRoll()] } : ln) }));
    const removeRollFromCustomLine = (gk, lk, rK)        => setCustomGroups(prev => prev.map(g => g._k !== gk ? g : { ...g, lines: g.lines.map(ln => ln._k === lk ? { ...ln, rolls: (ln.rolls || []).filter(r => r._k !== rK) } : ln) }));
    const setRollOnCustomLine      = (gk, lk, rK, f, v)  => setCustomGroups(prev => prev.map(g => g._k !== gk ? g : { ...g, lines: g.lines.map(ln => ln._k === lk ? { ...ln, rolls: (ln.rolls || []).map(r => r._k === rK ? { ...r, [f]: v } : r) } : ln) }));
    // ── Review handoff ──────────────────────────────────────────────────────
    // Resolve a per-item display label (name + details + unit) using whatever
    // lookups this modal already has loaded. Stamping it onto the payload means
    // the review screen can render without re-doing any lookups.
    const decorateForReview = (built) => {
        const variantPool = Object.values(variantsByTrim).flat();
        // Backend may serialise bigint ids as strings, while purchase_order_item_id /
        // requirement_id are parseInt'd numbers — compare via String() to be safe.
        const decorated = built.map(it => {
            if (it.requirement_id != null) {
                const wantReq = String(it.requirement_id);
                const r = allRequirements.find(rr => String(rr.id) === wantReq);
                const g = (poItems || []).find(x => (x.requirements || []).some(rr => String(rr.id) === wantReq));
                const isFabric = g?.item_type === 'fabric' || r?.type === 'fabric';
                const fromGroup = labelFromGroup(g);
                const fromReq = r ? { name: '', details: reqLabel(r) } : { name: '', details: '' };
                const label = {
                    name:    fromGroup.name || (isFabric ? 'Fabric' : 'Trim'),
                    details: fromGroup.details || fromReq.details || '',
                    unit:    isFabric ? 'm' : (g?.uom || r?.unit_of_measure || 'pcs'),
                };
                return { ...it, _label: label };
            }
            if (it.purchase_order_item_id != null) {
                const wantPo = String(it.purchase_order_item_id);
                const p = (poItems || []).find(x => String(x.id) === wantPo);
                const isFabric = p?.item_type === 'fabric';
                const fromGroup = labelFromGroup(p);
                const label = {
                    name:    fromGroup.name || (isFabric ? 'Fabric' : 'Trim'),
                    details: fromGroup.details,
                    unit:    isFabric ? 'm' : (p?.uom || 'pcs'),
                };
                return { ...it, _label: label };
            }
            // Custom item — resolve from local lookup arrays.
            const isFabric = it.item_type === 'fabric';
            let name = isFabric ? 'Fabric' : 'Trim';
            const parts = [];
            if (isFabric) {
                const t = fabricTypes.find(x => String(x.id) === String(it.fabric_type_id));
                const c = fabricColors.find(x => String(x.id) === String(it.fabric_color_id));
                name = t?.name || t?.fabric_type_name || name;
                if (c?.color_number) parts.push(c.color_number);
                if (c?.color_name)   parts.push(c.color_name);
            } else {
                const v = variantPool.find(x => String(x.id) === String(it.trim_item_variant_id));
                const parent = v ? trimItems.find(t => String(t.id) === String(v.trim_item_id)) : null;
                name = parent?.name || parent?.item_name || name;
                if (v?.color_number)  parts.push(v.color_number);
                if (v?.color_name)    parts.push(v.color_name);
                if (v?.variant_size)  parts.push(`Sz ${v.variant_size}`);
            }
            return { ...it, _label: { name, details: parts.join(' · '), unit: isFabric ? 'm' : 'pcs' } };
        });
        return decorated;
    };

    const handleReview = () => {
        setErr(null);
        if (!receivedDate) { setErr('Received date is required.'); return; }
        const state = { trimTotalByReq, trimBoxesByReq, fabricRollsByReq, freeFormTrimTotals, freeFormTrimBoxes, freeFormFabricRolls, customGroups };
        const { items: built, error } = buildItemsFromState(state);
        if (error) { setErr(error); return; }
        setBusy(true);
        const decorated = decorateForReview(built);
        const payload = { items: decorated, grnNumber, receivedDate, condition, notes, scanFile };
        const snapshot = {
            grnNumber, receivedDate, condition, notes, scanFile,
            trimTotalByReq, trimBoxesByReq, fabricRollsByReq, freeFormTrimTotals, freeFormTrimBoxes, freeFormFabricRolls, customGroups,
            removedReqIds: [...removedReqIds],
            removedPoItemIds: [...removedPoItemIds],
        };
        // Defer reset so parent can swap modals cleanly.
        Promise.resolve().then(() => { setBusy(false); onReview?.({ payload, snapshot }); });
    };

    // Mark fabricRequirementIds so we can render fabric reqs differently. (Used only inside group iteration.)
    void fabricReqIds;

    return (
        <>
        <BoxBreakdownModal
            open={!!boxModal}
            title={boxModal?.title}
            uom={boxModal?.uom}
            initialBoxes={boxModal?.initialBoxes || []}
            onSave={boxModal?.onSave || (() => {})}
            onClose={() => setBoxModal(null)}
        />
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                            <FileText size={16} className="text-emerald-500" />
                            New Inward (GRN)
                        </h2>
                        {(poCode || poId) && (
                            <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                                PO · {poCode || `#${poId}`}
                            </p>
                        )}
                        <p className="text-xs text-slate-500 mt-0.5">Fill in qty per requirement, rolls per fabric line, or add free-form items.</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                <div className="overflow-auto flex-1 px-5 py-4 space-y-4">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                            <AlertTriangle size={14} /> {err}
                        </div>
                    )}

                    {/* Header fields */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GRN Number</label>
                            <input
                                type="text"
                                value={grnNumber}
                                onChange={e => setGrnNumber(e.target.value)}
                                placeholder="GRN-2026-…"
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Received Date *</label>
                            <input
                                type="date"
                                value={receivedDate}
                                onChange={e => setReceivedDate(e.target.value)}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Condition</label>
                            <select
                                value={condition}
                                onChange={e => setCondition(e.target.value)}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-400 bg-white"
                            >
                                <option value="GOOD">Good</option>
                                <option value="DAMAGED">Damaged</option>
                                <option value="PARTIAL">Partial</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scan / Photo</label>
                            <label className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-emerald-600 border border-dashed border-slate-300 hover:border-emerald-300 px-3 py-1.5 rounded-lg cursor-pointer transition">
                                <Upload size={12} />
                                {scanFile?.name || 'Choose file'}
                                <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setScanFile(e.target.files?.[0] || null)} />
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notes</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-400 resize-none"
                        />
                    </div>

                    {/* Linked PO groups (groups with requirements) */}
                    {(poItems || [])
                        .filter(g => (g.requirements || []).length > 0 && (g.requirements || []).some(r => !removedReqIds.has(r.id)))
                        .map(group => {
                            const Icon = TYPE_ICON[group.item_type] || Package;
                            const isFabricGroup = group.item_type === 'fabric';
                            const groupLabel = isFabricGroup
                                ? `${group.fabric_type_name || 'Fabric'}${group.fabric_color_number ? ` · ${group.fabric_color_number}` : ''}${group.fabric_color_name ? ` · ${group.fabric_color_name}` : ''}`
                                : `${group.trim_item_name || 'Trim'}${group.variant_color_number ? ` · ${group.variant_color_number}` : ''}${group.variant_color_name ? ` · ${group.variant_color_name}` : ''}${group.variant_size ? ` · Sz ${group.variant_size}` : ''}`;
                            return (
                                <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                                        <Icon size={13} className="text-slate-500 shrink-0" />
                                        <p className="text-xs font-bold text-slate-700 truncate flex-1">{groupLabel}</p>
                                        {!isFabricGroup && group.trim_item_variant_id && (
                                            <SupplierCodePill supplierId={supplierId} supplierName={supplierName} variantId={group.trim_item_variant_id} className="shrink-0" />
                                        )}
                                        <span className="text-[9px] text-slate-400 shrink-0">item #{group.id}</span>
                                    </div>
                                    <div className="p-2 space-y-1.5">
                                        {(group.requirements || []).filter(r => !removedReqIds.has(r.id)).map(r => {
                                            const isFabricReq = group.item_type === 'fabric';
                                            const total = parseFloat(group.quantity ?? 0) || reqTotal(r);
                                            const unit = reqUnit(r);
                                            const pending = pendingByReq[r.id] ?? 0;

                                            if (isFabricReq) {
                                                const rolls = fabricRollsByReq[r.id] || [];
                                                const sum   = sumRolls(rolls);
                                                const over  = sum > pending + 0.001;
                                                return (
                                                    <div key={r.id} className={`rounded-lg p-2 border ${over ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
                                                        <div className="flex items-start justify-between gap-3 mb-1.5">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-bold text-slate-700 truncate">
                                                                    {reqLabel(r)}
                                                                    {r.product_name ? <span className="text-slate-400 font-normal"> · {r.product_name}</span> : null}
                                                                </p>
                                                                <p className="text-[10px] text-slate-500">
                                                                    Total {total.toLocaleString()} {unit}
                                                                    {' · '}<span className="font-bold text-emerald-600">Pending {pending.toLocaleString()} {unit}</span>
                                                                    {' · '}<span className={`font-bold ${over ? 'text-red-600' : 'text-violet-700'}`}>In this inward {sum.toLocaleString(undefined, { maximumFractionDigits: 2 })} m</span>
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                <button type="button" onClick={() => addRollToReq(r.id)}
                                                                    className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:bg-violet-50 border border-violet-200 px-2 py-1 rounded-md transition">
                                                                    <Plus size={11} /> Roll
                                                                </button>
                                                                <button type="button" onClick={() => {
                                                                    setFabricRollsByReq(prev => ({ ...prev, [r.id]: [] }));
                                                                    setRemovedReqIds(prev => new Set(prev).add(r.id));
                                                                }} title="Remove from this inward"
                                                                    className="p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors">
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            {rolls.length === 0 ? (
                                                                <p className="text-[10px] text-slate-400 italic px-1">No rolls added — click "Roll" to record one.</p>
                                                            ) : rolls.map(roll => (
                                                                <div key={roll._k} className="flex items-center gap-2">
                                                                    <input type="text" placeholder="B-001" value={roll.bale_no}
                                                                        onChange={e => setRollFieldOnReq(r.id, roll._k, 'bale_no', e.target.value)}
                                                                        className="w-24 text-[11px] font-mono border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-violet-400" />
                                                                    <input type="number" step="0.01" min="0" placeholder="0.00" value={roll.meter}
                                                                        onChange={e => setRollFieldOnReq(r.id, roll._k, 'meter', e.target.value)}
                                                                        className="flex-1 text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums focus:outline-none focus:border-violet-400" />
                                                                    <select value={roll.uom} onChange={e => setRollFieldOnReq(r.id, roll._k, 'uom', e.target.value)}
                                                                        className="w-16 text-[11px] border border-slate-200 rounded px-1 py-1 bg-white">
                                                                        <option value="meter">m</option>
                                                                        <option value="yard">yd</option>
                                                                        <option value="kg">kg</option>
                                                                    </select>
                                                                    <button type="button" onClick={() => removeRollFromReq(r.id, roll._k)}
                                                                        className="p-1 text-slate-300 hover:text-red-500 transition shrink-0">
                                                                        <Trash2 size={11} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            const boxes  = trimBoxesByReq[r.id] || [];
                                            const rawTotal = trimTotalByReq[r.id] ?? '';
                                            const inThis = boxes.length > 0 ? sumTrimBoxes(boxes) : (parseFloat(rawTotal) || 0);
                                            const over   = inThis > pending + 0.001;
                                            return (
                                                <div key={r.id} className={`rounded-lg p-2 border ${over ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
                                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-bold text-slate-700 truncate">
                                                                {reqLabel(r)}
                                                                {r.product_name ? <span className="text-slate-400 font-normal"> · {r.product_name}</span> : null}
                                                            </p>
                                                            <p className="text-[10px] text-slate-500">
                                                                Total {total.toLocaleString()} {unit}
                                                                {' · '}<span className="font-bold text-emerald-600">Pending {pending.toLocaleString()} {unit}</span>
                                                            </p>
                                                        </div>
                                                        <button type="button" onClick={() => {
                                                            setTrimBoxesByReq(prev => ({ ...prev, [r.id]: [] }));
                                                            setRemovedReqIds(prev => new Set(prev).add(r.id));
                                                        }} title="Remove from this inward"
                                                            className="shrink-0 p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors">
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                    {boxes.length === 0 ? (
                                                        <div className="flex items-center gap-2">
                                                            <input type="number" min="0" step="any" placeholder="0"
                                                                value={rawTotal}
                                                                onChange={e => setTrimTotalForReq(r.id, e.target.value)}
                                                                className={`w-36 text-sm font-bold text-right border rounded-lg px-2 py-1.5 focus:outline-none tabular-nums ${over ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-amber-400'}`}
                                                            />
                                                            <span className="text-xs text-slate-500">{unit}</span>
                                                            <button type="button"
                                                                onClick={() => setBoxModal({
                                                                    title: reqLabel(r),
                                                                    uom: unit,
                                                                    initialBoxes: [],
                                                                    onSave: (saved) => {
                                                                        if (saved.length > 0) setTrimBoxesByReq(prev => ({ ...prev, [r.id]: saved }));
                                                                        setBoxModal(null);
                                                                    },
                                                                })}
                                                                className="ml-auto flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:bg-amber-50 border border-amber-200 px-2 py-1 rounded-md transition">
                                                                <Plus size={11} /> Add box breakdown
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className={`text-sm font-bold tabular-nums ${over ? 'text-red-600' : 'text-amber-700'}`}>
                                                                    {inThis.toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit}
                                                                </span>
                                                                <button type="button"
                                                                    onClick={() => setBoxModal({
                                                                        title: reqLabel(r),
                                                                        uom: unit,
                                                                        initialBoxes: boxes,
                                                                        onSave: (saved) => {
                                                                            if (saved.length > 0) {
                                                                                setTrimBoxesByReq(prev => ({ ...prev, [r.id]: saved }));
                                                                            } else {
                                                                                clearTrimBoxesForReq(r.id, inThis);
                                                                            }
                                                                            setBoxModal(null);
                                                                        },
                                                                    })}
                                                                    className="text-[10px] font-bold text-amber-600 hover:bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md transition">
                                                                    Edit
                                                                </button>
                                                                <button type="button" onClick={() => clearTrimBoxesForReq(r.id, inThis)}
                                                                    className="text-[10px] text-slate-400 hover:text-red-500 transition">
                                                                    Remove
                                                                </button>
                                                            </div>
                                                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                                {boxes.map(b => `${b.box_count}×${b.qty_per_box}`).join(' + ')}
                                                            </p>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                    {/* Free-form PO items (no linked requirements) */}
                    {(poItems || []).filter(g => (g.requirements || []).length === 0 && !removedPoItemIds.has(g.id)).map(group => {
                        const Icon = TYPE_ICON[group.item_type] || Package;
                        const isFabricGroup = group.item_type === 'fabric';
                        const groupLabel = isFabricGroup
                            ? `${group.fabric_type_name || 'Fabric'}${group.fabric_color_number ? ` · ${group.fabric_color_number}` : ''}${group.fabric_color_name ? ` · ${group.fabric_color_name}` : ''}`
                            : `${group.trim_item_name || 'Trim'}${group.variant_color_number ? ` · ${group.variant_color_number}` : ''}${group.variant_color_name ? ` · ${group.variant_color_name}` : ''}${group.variant_size ? ` · Sz ${group.variant_size}` : ''}`;
                        const groupUom = group.uom || (isFabricGroup ? 'm' : 'pcs');
                        const pending  = pendingByPoItem[group.id] ?? 0;

                        if (isFabricGroup) {
                            const rolls = freeFormFabricRolls[group.id] || [];
                            const sum   = sumRolls(rolls);
                            const over  = sum > pending + 0.001;
                            return (
                                <div key={`free-${group.id}`} className="border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                                        <Icon size={13} className="text-slate-500 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-700 truncate">{groupLabel} <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 ml-1">Free-form</span></p>
                                            <p className="text-[10px] text-slate-500">Pending {pending.toLocaleString()} {groupUom} · In this inward {sum.toLocaleString(undefined, { maximumFractionDigits: 2 })} m</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button type="button" onClick={() => addRollToPoItem(group.id)}
                                                className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:bg-violet-50 border border-violet-200 px-2 py-1 rounded-md transition">
                                                <Plus size={11} /> Roll
                                            </button>
                                            <button type="button" onClick={() => {
                                                setFreeFormFabricRolls(prev => ({ ...prev, [group.id]: [] }));
                                                setRemovedPoItemIds(prev => new Set(prev).add(group.id));
                                            }} title="Remove from this inward"
                                                className="p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className={`p-2 ${over ? 'bg-red-50' : ''}`}>
                                        {rolls.length === 0 ? (
                                            <p className="text-[10px] text-slate-400 italic px-1">No rolls added — click "Roll" to record one.</p>
                                        ) : rolls.map(roll => (
                                            <div key={roll._k} className="flex items-center gap-2 mb-1">
                                                <input type="text" placeholder="B-001" value={roll.bale_no}
                                                    onChange={e => setRollFieldOnPoItem(group.id, roll._k, 'bale_no', e.target.value)}
                                                    className="w-24 text-[11px] font-mono border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-violet-400" />
                                                <input type="number" step="0.01" min="0" placeholder="0.00" value={roll.meter}
                                                    onChange={e => setRollFieldOnPoItem(group.id, roll._k, 'meter', e.target.value)}
                                                    className="flex-1 text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums" />
                                                <select value={roll.uom} onChange={e => setRollFieldOnPoItem(group.id, roll._k, 'uom', e.target.value)}
                                                    className="w-16 text-[11px] border border-slate-200 rounded px-1 py-1 bg-white">
                                                    <option value="meter">m</option>
                                                    <option value="yard">yd</option>
                                                    <option value="kg">kg</option>
                                                </select>
                                                <button type="button" onClick={() => removeRollFromPoItem(group.id, roll._k)}
                                                    className="p-1 text-slate-300 hover:text-red-500 transition shrink-0">
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        }

                        // Free-form trim — total-first, optional box breakdown
                        const boxes    = freeFormTrimBoxes[group.id] || [];
                        const rawTotal = freeFormTrimTotals[group.id] ?? '';
                        const inThis   = boxes.length > 0 ? sumTrimBoxes(boxes) : (parseFloat(rawTotal) || 0);
                        const over     = inThis > pending + 0.001;
                        return (
                            <div key={`free-${group.id}`} className={`rounded-xl p-3 border ${over ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-slate-700">{groupLabel} <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 ml-1">Free-form</span></p>
                                        {!isFabricGroup && group.trim_item_variant_id && (
                                            <SupplierCodePill supplierId={supplierId} supplierName={supplierName} variantId={group.trim_item_variant_id} className="mt-0.5" />
                                        )}
                                        <p className="text-[10px] text-slate-500">
                                            <span className="font-bold text-emerald-600">Pending {pending.toLocaleString()} {groupUom}</span>
                                        </p>
                                    </div>
                                    <button type="button" onClick={() => {
                                        setFreeFormTrimBoxes(prev => ({ ...prev, [group.id]: [] }));
                                        setRemovedPoItemIds(prev => new Set(prev).add(group.id));
                                    }} title="Remove from this inward"
                                        className="shrink-0 p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                                {boxes.length === 0 ? (
                                    <div className="flex items-center gap-2">
                                        <input type="number" min="0" step="any" placeholder="0"
                                            value={rawTotal}
                                            onChange={e => setTrimTotalForPoItem(group.id, e.target.value)}
                                            className={`w-36 text-sm font-bold text-right border rounded-lg px-2 py-1.5 focus:outline-none tabular-nums ${over ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-amber-400'}`}
                                        />
                                        <span className="text-xs text-slate-500">{groupUom}</span>
                                        <button type="button"
                                            onClick={() => setBoxModal({
                                                title: groupLabel,
                                                uom: groupUom,
                                                initialBoxes: [],
                                                onSave: (saved) => {
                                                    if (saved.length > 0) setFreeFormTrimBoxes(prev => ({ ...prev, [group.id]: saved }));
                                                    setBoxModal(null);
                                                },
                                            })}
                                            className="ml-auto flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:bg-amber-50 border border-amber-200 px-2 py-1 rounded-md transition">
                                            <Plus size={11} /> Add box breakdown
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-sm font-bold tabular-nums ${over ? 'text-red-600' : 'text-amber-700'}`}>
                                                {inThis.toLocaleString(undefined, { maximumFractionDigits: 2 })} {groupUom}
                                            </span>
                                            <button type="button"
                                                onClick={() => setBoxModal({
                                                    title: groupLabel,
                                                    uom: groupUom,
                                                    initialBoxes: boxes,
                                                    onSave: (saved) => {
                                                        if (saved.length > 0) {
                                                            setFreeFormTrimBoxes(prev => ({ ...prev, [group.id]: saved }));
                                                        } else {
                                                            clearTrimBoxesForPoItem(group.id, inThis);
                                                        }
                                                        setBoxModal(null);
                                                    },
                                                })}
                                                className="text-[10px] font-bold text-amber-600 hover:bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md transition">
                                                Edit
                                            </button>
                                            <button type="button" onClick={() => clearTrimBoxesForPoItem(group.id, inThis)}
                                                className="text-[10px] text-slate-400 hover:text-red-500 transition">
                                                Remove
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                            {boxes.map(b => `${b.box_count}×${b.qty_per_box}`).join(' + ')}
                                        </p>
                                    </>
                                )}
                            </div>
                        );
                    })}

                    {/* Free-form custom additions */}
                    <div className="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50/40">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Free-form additions {customGroups.length > 0 && `· ${customGroups.length} card${customGroups.length !== 1 ? 's' : ''}`}
                            </p>
                            <div className="flex gap-1.5">
                                <button onClick={() => addCustomGroup('fabric')}
                                    className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:bg-violet-50 border border-violet-200 px-2 py-1 rounded-md transition">
                                    <Plus size={11} /> Fabric card
                                </button>
                                <button onClick={() => addCustomGroup('trim')}
                                    className="flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:bg-amber-50 border border-amber-200 px-2 py-1 rounded-md transition">
                                    <Plus size={11} /> Trim card
                                </button>
                            </div>
                        </div>
                        {customGroups.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">Items not on this PO — extras, samples, replacements.</p>
                        ) : (
                            <div className="space-y-2">
                                {customGroups.map((g, gi) => {
                                    const isFabric = g.type === 'fabric';
                                    const variants = !isFabric ? (variantsByTrim[g.trim_item_id] || []) : [];
                                    const groupSum = isFabric
                                        ? g.lines.reduce((s, ln) => s + sumRolls(ln.rolls), 0)
                                        : g.lines.reduce((s, ln) => {
                                            const boxes = ln.boxes || [];
                                            return s + (boxes.length > 0 ? sumTrimBoxes(boxes) : (parseFloat(ln.total) || 0));
                                        }, 0);
                                    return (
                                        <div key={g._k} className={`rounded-lg p-2 border ${isFabric ? 'bg-violet-50/40 border-violet-200' : 'bg-amber-50/40 border-amber-200'}`}>
                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                                                    {isFabric ? <Package size={11} className="text-violet-600" /> : <Scissors size={11} className="text-amber-600" />}
                                                    <span className="uppercase tracking-wider text-[10px]">{isFabric ? 'Fabric' : 'Trim'} card</span>
                                                    <span className="text-slate-400 text-[10px] font-normal">#{gi + 1}</span>
                                                    {groupSum > 0 && (
                                                        <span className={`text-[10px] font-bold ${isFabric ? 'text-violet-700' : 'text-amber-700'}`}>
                                                            · {groupSum.toLocaleString(undefined, { maximumFractionDigits: 2 })} {isFabric ? 'm' : (g.uom || 'pcs')} total
                                                        </span>
                                                    )}
                                                </div>
                                                <button onClick={() => removeCustomGroup(g._k)} title="Remove card"
                                                    className="text-slate-300 hover:text-red-500 transition">
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-[1fr_70px_90px] gap-1.5 mb-2">
                                                {isFabric ? (
                                                    <SearchableSelect
                                                        value={g.fabric_type_id}
                                                        onChange={v => setCustomGroupField(g._k, 'fabric_type_id', v)}
                                                        options={fabricTypes.map(t => ({ value: t.id, label: t.name || t.fabric_type_name || `Type #${t.id}` }))}
                                                        placeholder="— Fabric type —"
                                                        size="xs"
                                                        accentColor="violet"
                                                    />
                                                ) : (
                                                    <SearchableSelect
                                                        value={g.trim_item_id}
                                                        onChange={v => setCustomGroupField(g._k, 'trim_item_id', v)}
                                                        options={trimItems.map(t => ({ value: t.id, label: `${t.name || t.item_name || `Trim #${t.id}`}${t.item_code ? ` · ${t.item_code}` : ''}` }))}
                                                        placeholder="— Trim item —"
                                                        size="xs"
                                                        accentColor="amber"
                                                    />
                                                )}
                                                <input type="text" placeholder="UOM" value={g.uom}
                                                    onChange={e => setCustomGroupField(g._k, 'uom', e.target.value)}
                                                    className="text-[11px] border border-slate-200 rounded px-1.5 py-1" />
                                                <input type="number" min="0" step="any" placeholder="Unit price" value={g.unit_price}
                                                    onChange={e => setCustomGroupField(g._k, 'unit_price', e.target.value)}
                                                    className="text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums" />
                                            </div>
                                            <input type="text" placeholder="Description (optional)" value={g.description}
                                                onChange={e => setCustomGroupField(g._k, 'description', e.target.value)}
                                                className="w-full mb-2 text-[11px] border border-slate-200 rounded px-1.5 py-1" />
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{isFabric ? 'Colors' : 'Variants'} · {g.lines.length}</p>
                                                <button onClick={() => addCustomLine(g._k)}
                                                    disabled={!isFabric && !g.trim_item_id}
                                                    className={`flex items-center gap-1 text-[10px] font-bold border px-1.5 py-0.5 rounded-md transition disabled:opacity-40 ${isFabric ? 'text-violet-600 hover:bg-violet-100 border-violet-200' : 'text-amber-600 hover:bg-amber-100 border-amber-200'}`}>
                                                    <Plus size={10} /> Add {isFabric ? 'color' : 'variant'}
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {g.lines.map(ln => (
                                                    <div key={ln._k} className="bg-white/70 rounded-md p-1.5 border border-white">
                                                        {isFabric ? (
                                                            <>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <SearchableSelect
                                                                        value={ln.fabric_color_id}
                                                                        onChange={v => setCustomLineField(g._k, ln._k, 'fabric_color_id', v)}
                                                                        options={fabricColors.map(co => ({ value: co.id, label: `${co.color_number ? `${co.color_number} · ` : ''}${co.color_name || `Color #${co.id}`}` }))}
                                                                        placeholder="— Color —"
                                                                        className="flex-1 min-w-0"
                                                                        size="xs"
                                                                        accentColor="violet"
                                                                    />
                                                                    {g.lines.length > 1 && (
                                                                        <button onClick={() => removeCustomLine(g._k, ln._k)} title="Remove line"
                                                                            className="p-1 text-slate-300 hover:text-red-500 transition">
                                                                            <Trash2 size={11} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className="space-y-1">
                                                                    {(ln.rolls || []).map(roll => (
                                                                        <div key={roll._k} className="flex items-center gap-1.5">
                                                                            <input type="text" placeholder="Bale" value={roll.bale_no}
                                                                                onChange={e => setRollOnCustomLine(g._k, ln._k, roll._k, 'bale_no', e.target.value)}
                                                                                className="w-20 text-[11px] font-mono border border-slate-200 rounded px-1.5 py-1" />
                                                                            <input type="number" step="0.01" min="0" placeholder="m" value={roll.meter}
                                                                                onChange={e => setRollOnCustomLine(g._k, ln._k, roll._k, 'meter', e.target.value)}
                                                                                className="flex-1 text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums" />
                                                                            <select value={roll.uom} onChange={e => setRollOnCustomLine(g._k, ln._k, roll._k, 'uom', e.target.value)}
                                                                                className="w-14 text-[11px] border border-slate-200 rounded px-1 py-1 bg-white">
                                                                                <option value="meter">m</option>
                                                                                <option value="yard">yd</option>
                                                                                <option value="kg">kg</option>
                                                                            </select>
                                                                            <button type="button" onClick={() => removeRollFromCustomLine(g._k, ln._k, roll._k)}
                                                                                className="p-0.5 text-slate-300 hover:text-red-500 transition">
                                                                                <Trash2 size={10} />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                    <button type="button" onClick={() => addRollToCustomLine(g._k, ln._k)}
                                                                        className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:bg-violet-100 border border-violet-200 px-1.5 py-0.5 rounded-md transition">
                                                                        <Plus size={10} /> Roll
                                                                    </button>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="space-y-1.5">
                                                                <div className="flex items-center gap-2">
                                                                    <SearchableSelect
                                                                        value={ln.trim_item_variant_id}
                                                                        onChange={v => setCustomLineField(g._k, ln._k, 'trim_item_variant_id', v)}
                                                                        options={variants.map(v => ({ value: v.id, label: `${v.color_number ? `${v.color_number} · ` : ''}${v.color_name || v.name || `Variant #${v.id}`}${v.variant_size ? ` · Sz ${v.variant_size}` : ''}` }))}
                                                                        placeholder={g.trim_item_id ? '— Variant —' : '— Pick trim first —'}
                                                                        disabled={!g.trim_item_id}
                                                                        className="flex-1 min-w-0"
                                                                        size="xs"
                                                                        accentColor="amber"
                                                                    />
                                                                    {g.lines.length > 1 && (
                                                                        <button onClick={() => removeCustomLine(g._k, ln._k)} title="Remove line"
                                                                            className="p-1 text-slate-300 hover:text-red-500 transition">
                                                                            <Trash2 size={11} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                {(ln.boxes || []).length === 0 ? (
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <input type="number" min="0" step="any" placeholder="0"
                                                                            value={ln.total || ''}
                                                                            onChange={e => setCustomLineField(g._k, ln._k, 'total', e.target.value)}
                                                                            className="w-28 text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums focus:outline-none focus:border-amber-400" />
                                                                        <span className="text-[10px] text-slate-400">{g.uom || 'pcs'}</span>
                                                                        <button type="button"
                                                                            onClick={() => setBoxModal({
                                                                                title: ln.trim_item_variant_id ? `Variant #${ln.trim_item_variant_id}` : 'Custom trim line',
                                                                                uom: g.uom || 'pcs',
                                                                                initialBoxes: [],
                                                                                onSave: (saved) => {
                                                                                    if (saved.length > 0) setCustomGroups(prev => prev.map(g2 => g2._k !== g._k ? g2 : { ...g2, lines: g2.lines.map(l => l._k !== ln._k ? l : { ...l, boxes: saved }) }));
                                                                                    setBoxModal(null);
                                                                                },
                                                                            })}
                                                                            className="ml-auto flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-md transition">
                                                                            <Plus size={10} /> Add box breakdown
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                            <span className="text-[11px] font-bold text-amber-700 tabular-nums">
                                                                                {sumTrimBoxes(ln.boxes).toLocaleString(undefined, { maximumFractionDigits: 2 })} {g.uom || 'pcs'}
                                                                            </span>
                                                                            <button type="button"
                                                                                onClick={() => setBoxModal({
                                                                                    title: ln.trim_item_variant_id ? `Variant #${ln.trim_item_variant_id}` : 'Custom trim line',
                                                                                    uom: g.uom || 'pcs',
                                                                                    initialBoxes: ln.boxes,
                                                                                    onSave: (saved) => {
                                                                                        const computed = sumTrimBoxes(ln.boxes);
                                                                                        setCustomGroups(prev => prev.map(g2 => g2._k !== g._k ? g2 : { ...g2, lines: g2.lines.map(l => l._k !== ln._k ? l : saved.length > 0 ? { ...l, boxes: saved } : { ...l, boxes: [], total: computed > 0 ? String(computed) : '' }) }));
                                                                                        setBoxModal(null);
                                                                                    },
                                                                                })}
                                                                                className="text-[10px] font-bold text-amber-600 hover:bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-md transition">
                                                                                Edit
                                                                            </button>
                                                                            <button type="button" onClick={() => {
                                                                                const computed = sumTrimBoxes(ln.boxes);
                                                                                setCustomGroups(prev => prev.map(g2 => g2._k !== g._k ? g2 : { ...g2, lines: g2.lines.map(l => l._k !== ln._k ? l : { ...l, boxes: [], total: computed > 0 ? String(computed) : '' }) }));
                                                                            }} className="text-[10px] text-slate-400 hover:text-red-500 transition">
                                                                                Remove
                                                                            </button>
                                                                        </div>
                                                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                                            {(ln.boxes || []).map(b => `${b.box_count}×${b.qty_per_box}`).join(' + ')}
                                                                        </p>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
                    <button onClick={onClose} disabled={busy}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40">
                        Cancel
                    </button>
                    <button onClick={handleReview} disabled={busy}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition shadow-sm">
                        {busy && <Loader2 size={12} className="animate-spin" />}
                        Review & Create
                    </button>
                </div>
            </div>
        </div>
        </>
    );
}
