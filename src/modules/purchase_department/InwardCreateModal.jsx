import { useState, useEffect, useMemo } from 'react';
import {
    X, Loader2, AlertTriangle, Package, Scissors, Wrench, Tag, Trash2, Upload, FileText, Plus, Boxes, ArrowLeft,
} from 'lucide-react';
import { trimsApi } from '../../api/trimsApi';
import { sparesApi } from '../../api/sparesApi';
import { generalItemsApi } from '../../api/generalItemsApi';
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
 *   onBack()        — optional; when given, a Back button returns to whatever
 *                     screen opened this one instead of closing outright
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
    onBack,
    onClose,
}) {
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);

    const [boxModal, setBoxModal] = useState(null); // { title, uom, initialBoxes, onSave }

    // ── Header fields ───────────────────────────────────────────────────────
    const grnNumber = ''; // auto-generated server-side; field is display-only
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

    // Merged group-level inputs (one per PO item group; FCFS distribution to per-req entries at review time)
    const [trimTotalByGroup, setTrimTotalByGroup] = useState(() => {
        if (initialSnapshot?.trimTotalByGroup) return initialSnapshot.trimTotalByGroup;
        const m = {};
        (poItems || []).forEach(g => {
            if ((g.requirements || []).length === 0 || g.item_type === 'fabric') return;
            const tot = (g.requirements || []).reduce((s, r) => s + (pendingByReq[r.id] || 0), 0);
            if (tot > 0) m[g.id] = String(tot);
        });
        return m;
    });

    const [fabricRollsByGroup, setFabricRollsByGroup] = useState(() => {
        if (initialSnapshot?.fabricRollsByGroup) return initialSnapshot.fabricRollsByGroup;
        const m = {};
        (poItems || []).forEach(g => {
            if ((g.requirements || []).length === 0 || g.item_type !== 'fabric') return;
            m[g.id] = [newRoll()];
        });
        return m;
    });

    const [removedGroupIds, setRemovedGroupIds] = useState(() => new Set(initialSnapshot?.removedGroupIds || []));

    // Free-form items merged by variant — one input per unique variant, FCFS distribution at review time
    const ffVarKey = (g) => g.item_type === 'fabric'
        ? `fabric_${g.fabric_type_id}_${g.fabric_color_id}`
        : `trim_${g.trim_item_variant_id}`;

    const [freeFormTrimTotalsByVar, setFreeFormTrimTotalsByVar] = useState(() => {
        if (initialSnapshot?.freeFormTrimTotalsByVar) return initialSnapshot.freeFormTrimTotalsByVar;
        const m = {};
        const ffItems = (poItems || []).filter(g => (g.requirements || []).length === 0 && g.item_type !== 'fabric');
        const seen = new Set();
        ffItems.forEach(g => {
            const key = ffVarKey(g);
            if (seen.has(key)) return;
            seen.add(key);
            const tot = ffItems.filter(x => ffVarKey(x) === key).reduce((s, x) => s + (pendingByPoItem[x.id] || 0), 0);
            if (tot > 0) m[key] = String(tot);
        });
        return m;
    });

    const [freeFormFabricRollsByVar, setFreeFormFabricRollsByVar] = useState(() => {
        if (initialSnapshot?.freeFormFabricRollsByVar) return initialSnapshot.freeFormFabricRollsByVar;
        const m = {};
        const seen = new Set();
        (poItems || []).filter(g => (g.requirements || []).length === 0 && g.item_type === 'fabric').forEach(g => {
            const key = ffVarKey(g);
            if (seen.has(key)) return;
            seen.add(key);
            m[key] = [newRoll()];
        });
        return m;
    });

    const [removedVarGroupKeys, setRemovedVarGroupKeys] = useState(() => new Set(initialSnapshot?.removedVarGroupKeys || []));

    // ── Lookups (lazy fetch) ────────────────────────────────────────────────
    const [trimItems,      setTrimItems]      = useState([]);
    const [fabricTypes,    setFabricTypes]    = useState([]);
    const [fabricColors,   setFabricColors]   = useState([]);
    const [variantsByTrim, setVariantsByTrim] = useState({});
    const [spareParts,     setSpareParts]     = useState([]);
    const [generalItems,   setGeneralItems]   = useState([]);

    useEffect(() => {
        trimsApi.getItems().then(r => setTrimItems(r.data?.data ?? r.data ?? [])).catch(() => setTrimItems([]));
        api.get('/shared/fabric_type').then(r => setFabricTypes(r.data?.data ?? r.data ?? [])).catch(() => setFabricTypes([]));
        api.get('/shared/fabric_color').then(r => setFabricColors(r.data?.data ?? r.data ?? [])).catch(() => setFabricColors([]));
        sparesApi.getAllSpares().then(d => setSpareParts(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => setSpareParts([]));
        generalItemsApi.getItems({ active: true }).then(r => setGeneralItems(r.data?.data ?? r.data ?? [])).catch(() => setGeneralItems([]));
    }, []);

    // Quick-create a general item inline (mirrors StandaloneInwardModal).
    const quickCreateGeneralItem = async (name, code, onDone) => {
        try {
            const res = await generalItemsApi.createItem({ name: name.trim(), item_code: code?.trim() || undefined });
            const item = res.data?.data ?? res.data;
            setGeneralItems(prev => [...prev, item]);
            onDone?.(item);
        } catch { /* surfaced by caller if needed */ }
    };

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
    const emptyCustomLine = (type) => {
        if (type === 'fabric') return { _k: rk(), fabric_color_id: '', rolls: [newRoll()] };
        if (type === 'spare')  return { _k: rk(), spare_part_id: '', total: '', boxes: [] };
        if (type === 'other')  return { _k: rk(), general_item_id: '', description: '', uom: 'pcs', total: '', boxes: [] };
        return { _k: rk(), trim_item_variant_id: '', total: '', boxes: [] }; // trim
    };
    const addCustomGroup = (type) => setCustomGroups(prev => [...prev, {
        _k: rk(), type,
        fabric_type_id: '', trim_item_id: '',
        uom: type === 'fabric' ? 'meter' : 'pcs',
        unit_price: '', description: '',
        lines: [emptyCustomLine(type)],
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
    const addCustomLine = (gk) => setCustomGroups(prev => prev.map(g =>
        g._k !== gk ? g : { ...g, lines: [...g.lines, emptyCustomLine(g.type)] }
    ));
    const removeCustomLine         = (gk, lk)            => setCustomGroups(prev => prev.map(g => g._k !== gk ? g : { ...g, lines: g.lines.filter(ln => ln._k !== lk) }));
    const setCustomLineField       = (gk, lk, f, v)      => setCustomGroups(prev => prev.map(g => g._k !== gk ? g : { ...g, lines: g.lines.map(ln => ln._k === lk ? { ...ln, [f]: v } : ln) }));
    const addRollToCustomLine      = (gk, lk)            => setCustomGroups(prev => prev.map(g => g._k !== gk ? g : { ...g, lines: g.lines.map(ln => ln._k === lk ? { ...ln, rolls: [...(ln.rolls || []), newRoll()] } : ln) }));
    const removeRollFromCustomLine = (gk, lk, rK)        => setCustomGroups(prev => prev.map(g => g._k !== gk ? g : { ...g, lines: g.lines.map(ln => ln._k === lk ? { ...ln, rolls: (ln.rolls || []).filter(r => r._k !== rK) } : ln) }));
    const setRollOnCustomLine      = (gk, lk, rK, f, v)  => setCustomGroups(prev => prev.map(g => g._k !== gk ? g : { ...g, lines: g.lines.map(ln => ln._k === lk ? { ...ln, rolls: (ln.rolls || []).map(r => r._k === rK ? { ...r, [f]: v } : r) } : ln) }));
    // Set/clear a custom line's box breakdown; clearing keeps the computed total.
    const setCustomLineBoxes = (gk, lk, saved) => setCustomGroups(prev => prev.map(g => g._k !== gk ? g : { ...g, lines: g.lines.map(l => {
        if (l._k !== lk) return l;
        if (saved.length > 0) return { ...l, boxes: saved };
        const computed = sumTrimBoxes(l.boxes);
        return { ...l, boxes: [], total: computed > 0 ? String(computed) : '' };
    }) }));
    // Reusable "plain total OR box breakdown" control for non-fabric custom lines (trim/spare/other).
    const boxTotalControl = (g, ln) => {
        const uom = g.uom || 'pcs';
        const open = () => setBoxModal({ title: `${g.type} line`, uom, initialBoxes: ln.boxes || [], onSave: (saved) => { setCustomLineBoxes(g._k, ln._k, saved); setBoxModal(null); } });
        if ((ln.boxes || []).length === 0) {
            return (
                <div className="flex items-center gap-2 mt-1">
                    <input type="number" min="0" step="any" placeholder="0" value={ln.total || ''}
                        onChange={e => setCustomLineField(g._k, ln._k, 'total', e.target.value)}
                        className="w-28 text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums focus:outline-none focus:border-amber-400" />
                    <span className="text-[10px] text-slate-400">{uom}</span>
                    <button type="button" onClick={open}
                        className="ml-auto flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-md transition">
                        <Boxes size={10} /> Box breakdown
                    </button>
                </div>
            );
        }
        return (
            <>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[11px] font-bold text-amber-700 tabular-nums">{sumTrimBoxes(ln.boxes).toLocaleString(undefined, { maximumFractionDigits: 2 })} {uom}</span>
                    <button type="button" onClick={open} className="text-[10px] font-bold text-amber-600 hover:bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-md transition">Edit</button>
                    <button type="button" onClick={() => setCustomLineBoxes(g._k, ln._k, [])} className="text-[10px] text-slate-400 hover:text-red-500 transition">Remove</button>
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">{(ln.boxes || []).map(b => `${b.box_count}×${b.qty_per_box}`).join(' + ')}</p>
            </>
        );
    };
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
            if (it.item_type === 'spare') {
                const sp = spareParts.find(x => String(x.id) === String(it.spare_part_id));
                return { ...it, _label: { name: sp?.name || 'Spare part', details: sp?.part_number || '', unit: 'pcs' } };
            }
            if (it.item_type === 'other') {
                const gi = generalItems.find(x => String(x.id) === String(it.general_item_id));
                return { ...it, _label: { name: gi?.name || 'Item', details: it.description || gi?.item_code || '', unit: it.uom || 'pcs' } };
            }
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

        // FCFS distribution: spread group-level totals into per-req entries
        const distTrimByReq = { ...trimTotalByReq };
        const distFabricByReq = { ...fabricRollsByReq };

        (poItems || []).forEach(group => {
            if (removedGroupIds.has(group.id)) return;
            const reqs = (group.requirements || []).filter(r => !removedReqIds.has(r.id));
            if (reqs.length === 0) return;
            if (group.item_type === 'fabric') {
                const rolls = fabricRollsByGroup[group.id] || [];
                const totalMeters = sumRolls(rolls);
                const rollUom = rolls.find(r => r.uom)?.uom || 'meter';
                let remaining = totalMeters;
                reqs.forEach(r => {
                    const cap = pendingByReq[r.id] || 0;
                    const allocated = Math.min(remaining, cap);
                    if (allocated > 0.001) {
                        distFabricByReq[r.id] = [{ _k: rk(), bale_no: '', meter: String(allocated), uom: rollUom }];
                    } else {
                        delete distFabricByReq[r.id];
                    }
                    remaining = Math.max(0, remaining - allocated);
                });
                // Over-receipt: record the excess on the last requirement (approval catches it) — never drop it.
                if (remaining > 0.001 && reqs.length > 0) {
                    const last = reqs[reqs.length - 1];
                    const ex = distFabricByReq[last.id];
                    if (ex && ex[0]) ex[0] = { ...ex[0], meter: String((parseFloat(ex[0].meter) || 0) + remaining) };
                    else distFabricByReq[last.id] = [{ _k: rk(), bale_no: '', meter: String(remaining), uom: rollUom }];
                }
            } else {
                const total = parseFloat(trimTotalByGroup[group.id] || 0);
                let remaining = total;
                reqs.forEach(r => {
                    const cap = pendingByReq[r.id] || 0;
                    const allocated = Math.min(remaining, cap);
                    if (allocated > 0) {
                        distTrimByReq[r.id] = String(allocated);
                    } else {
                        delete distTrimByReq[r.id];
                    }
                    remaining = Math.max(0, remaining - allocated);
                });
                if (remaining > 0.001 && reqs.length > 0) {
                    const last = reqs[reqs.length - 1];
                    distTrimByReq[last.id] = String((parseFloat(distTrimByReq[last.id]) || 0) + remaining);
                }
            }
        });

        // FCFS distribution for free-form items grouped by variant
        const distFreeFormTrimTotals = { ...freeFormTrimTotals };
        const distFreeFormFabricRolls = { ...freeFormFabricRolls };
        const ffVarGroupMap = {};
        (poItems || []).filter(g => (g.requirements || []).length === 0).forEach(g => {
            const key = ffVarKey(g);
            if (!ffVarGroupMap[key]) ffVarGroupMap[key] = { key, items: [], isFabric: g.item_type === 'fabric' };
            ffVarGroupMap[key].items.push(g);
        });
        Object.values(ffVarGroupMap).forEach(({ key, items, isFabric }) => {
            if (removedVarGroupKeys.has(key)) return;
            const activeItems = items.filter(g => !removedPoItemIds.has(g.id));
            if (activeItems.length === 0) return;
            if (isFabric) {
                const rolls = freeFormFabricRollsByVar[key] || [];
                const totalMeters = sumRolls(rolls);
                const rollUom = rolls.find(r => r.uom)?.uom || 'meter';
                let remaining = totalMeters;
                activeItems.forEach(g => {
                    const cap = pendingByPoItem[g.id] || 0;
                    const allocated = Math.min(remaining, cap);
                    if (allocated > 0.001) {
                        distFreeFormFabricRolls[g.id] = [{ _k: rk(), bale_no: '', meter: String(allocated), uom: rollUom }];
                    } else {
                        delete distFreeFormFabricRolls[g.id];
                    }
                    remaining = Math.max(0, remaining - allocated);
                });
                if (remaining > 0.001 && activeItems.length > 0) {
                    const last = activeItems[activeItems.length - 1];
                    const ex = distFreeFormFabricRolls[last.id];
                    if (ex && ex[0]) ex[0] = { ...ex[0], meter: String((parseFloat(ex[0].meter) || 0) + remaining) };
                    else distFreeFormFabricRolls[last.id] = [{ _k: rk(), bale_no: '', meter: String(remaining), uom: rollUom }];
                }
            } else {
                const total = parseFloat(freeFormTrimTotalsByVar[key] || 0);
                let remaining = total;
                activeItems.forEach(g => {
                    const cap = pendingByPoItem[g.id] || 0;
                    const allocated = Math.min(remaining, cap);
                    if (allocated > 0) {
                        distFreeFormTrimTotals[g.id] = String(allocated);
                    } else {
                        delete distFreeFormTrimTotals[g.id];
                    }
                    remaining = Math.max(0, remaining - allocated);
                });
                if (remaining > 0.001 && activeItems.length > 0) {
                    const last = activeItems[activeItems.length - 1];
                    distFreeFormTrimTotals[last.id] = String((parseFloat(distFreeFormTrimTotals[last.id]) || 0) + remaining);
                }
            }
        });

        const state = {
            trimTotalByReq: distTrimByReq,
            trimBoxesByReq,
            fabricRollsByReq: distFabricByReq,
            freeFormTrimTotals: distFreeFormTrimTotals,
            freeFormTrimBoxes,
            freeFormFabricRolls: distFreeFormFabricRolls,
            customGroups
        };
        const { items: built, error } = buildItemsFromState(state);
        if (error) { setErr(error); return; }
        setBusy(true);
        const decorated = decorateForReview(built);
        const payload = { items: decorated, grnNumber, receivedDate, condition, notes, scanFile };
        const snapshot = {
            grnNumber, receivedDate, condition, notes, scanFile,
            trimTotalByReq, trimBoxesByReq, fabricRollsByReq,
            trimTotalByGroup, fabricRollsByGroup,
            freeFormTrimTotals, freeFormTrimBoxes, freeFormFabricRolls, customGroups,
            freeFormTrimTotalsByVar, freeFormFabricRollsByVar,
            removedReqIds: [...removedReqIds],
            removedPoItemIds: [...removedPoItemIds],
            removedGroupIds: [...removedGroupIds],
            removedVarGroupKeys: [...removedVarGroupKeys],
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
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
            <div className="bg-white w-full h-full flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
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
                                value=""
                                disabled
                                placeholder="Auto-generated on submit"
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-400 cursor-not-allowed"
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
                        .filter(g => (g.requirements || []).length > 0 && !removedGroupIds.has(g.id))
                        .map(group => {
                            const Icon = TYPE_ICON[group.item_type] || Package;
                            const isFabricGroup = group.item_type === 'fabric';
                            const groupLabel = isFabricGroup
                                ? `${group.fabric_type_name || 'Fabric'}${group.fabric_color_number ? ` · ${group.fabric_color_number}` : ''}${group.fabric_color_name ? ` · ${group.fabric_color_name}` : ''}`
                                : `${group.trim_item_name || 'Trim'}${group.variant_color_number ? ` · ${group.variant_color_number}` : ''}${group.variant_color_name ? ` · ${group.variant_color_name}` : ''}${group.variant_size ? ` · Sz ${group.variant_size}` : ''}`;
                            const activeReqs = (group.requirements || []).filter(r => !removedReqIds.has(r.id));
                            const totalPending = activeReqs.reduce((s, r) => s + (pendingByReq[r.id] || 0), 0);
                            const unit = activeReqs[0] ? reqUnit(activeReqs[0]) : (isFabricGroup ? 'm' : 'pcs');

                            if (isFabricGroup) {
                                const rolls = fabricRollsByGroup[group.id] || [];
                                const sum = sumRolls(rolls);
                                const over = sum > totalPending + 0.001;
                                let distRem = sum;
                                const distribution = activeReqs.map(r => {
                                    const cap = pendingByReq[r.id] || 0;
                                    const allocated = Math.min(distRem, cap);
                                    distRem = Math.max(0, distRem - allocated);
                                    return { r, allocated };
                                });
                                return (
                                    <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                                            <Icon size={13} className="text-slate-500 shrink-0" />
                                            <p className="text-xs font-bold text-slate-700 truncate flex-1">{groupLabel}</p>
                                            <span className="text-[9px] text-slate-400 shrink-0">{activeReqs.length} req{activeReqs.length !== 1 ? 's' : ''}</span>
                                            <button type="button" onClick={() => setRemovedGroupIds(prev => new Set(prev).add(group.id))}
                                                title="Skip this item" className="p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                        <div className="p-2 space-y-1.5">
                                            {activeReqs.length > 1 && (
                                                <div className="space-y-0.5 px-1 pb-0.5">
                                                    {distribution.map(({ r, allocated }, i) => (
                                                        <div key={r.id} className="flex items-center justify-between text-[10px] text-slate-500">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-bold text-slate-400">Req {i + 1}/{activeReqs.length}</span>
                                                                {r.is_standalone
                                                                    ? <span className="px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 font-bold">Standalone</span>
                                                                    : r.order_number ? <span className="font-mono">SO {r.order_number}</span> : null}
                                                                {r.product_name && <span className="text-slate-400 truncate">· {r.product_name}</span>}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 tabular-nums shrink-0">
                                                                <span className="text-slate-400">{(pendingByReq[r.id] || 0)} {unit} pending</span>
                                                                {sum > 0 && <span className={`font-bold ${allocated > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>→ {allocated.toFixed(2)} {unit}</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className={`rounded-lg p-2 border ${over ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <p className="text-[10px] text-slate-500">
                                                        <span className="font-bold text-emerald-600">Pending {totalPending.toLocaleString()} {unit}</span>
                                                        {' · '}<span className={`font-bold ${over ? 'text-red-600' : 'text-violet-700'}`}>In this inward {sum.toLocaleString(undefined, { maximumFractionDigits: 2 })} m</span>
                                                    </p>
                                                    <button type="button"
                                                        onClick={() => setFabricRollsByGroup(prev => ({ ...prev, [group.id]: [...(prev[group.id] || []), newRoll()] }))}
                                                        className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:bg-violet-50 border border-violet-200 px-2 py-1 rounded-md transition">
                                                        <Plus size={11} /> Roll
                                                    </button>
                                                </div>
                                                <div className="space-y-1">
                                                    {rolls.length === 0 ? (
                                                        <p className="text-[10px] text-slate-400 italic px-1">No rolls added — click "Roll" to record one.</p>
                                                    ) : rolls.map(roll => (
                                                        <div key={roll._k} className="flex items-center gap-2">
                                                            <input type="text" placeholder="B-001" value={roll.bale_no}
                                                                onChange={e => setFabricRollsByGroup(prev => ({ ...prev, [group.id]: (prev[group.id] || []).map(r => r._k === roll._k ? { ...r, bale_no: e.target.value } : r) }))}
                                                                className="w-24 text-[11px] font-mono border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-violet-400" />
                                                            <input type="number" step="0.01" min="0" placeholder="0.00" value={roll.meter}
                                                                onChange={e => setFabricRollsByGroup(prev => ({ ...prev, [group.id]: (prev[group.id] || []).map(r => r._k === roll._k ? { ...r, meter: e.target.value } : r) }))}
                                                                className="flex-1 text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums focus:outline-none focus:border-violet-400" />
                                                            <select value={roll.uom}
                                                                onChange={e => setFabricRollsByGroup(prev => ({ ...prev, [group.id]: (prev[group.id] || []).map(r => r._k === roll._k ? { ...r, uom: e.target.value } : r) }))}
                                                                className="w-16 text-[11px] border border-slate-200 rounded px-1 py-1 bg-white">
                                                                <option value="meter">m</option>
                                                                <option value="yard">yd</option>
                                                                <option value="kg">kg</option>
                                                            </select>
                                                            <button type="button"
                                                                onClick={() => setFabricRollsByGroup(prev => ({ ...prev, [group.id]: (prev[group.id] || []).filter(r => r._k !== roll._k) }))}
                                                                className="p-1 text-slate-300 hover:text-red-500 transition shrink-0">
                                                                <Trash2 size={11} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            // Trim group — single merged qty input
                            const rawTotal = trimTotalByGroup[group.id] ?? '';
                            const inThis = parseFloat(rawTotal) || 0;
                            const over = inThis > totalPending + 0.001;
                            let distRem = inThis;
                            const distribution = activeReqs.map(r => {
                                const cap = pendingByReq[r.id] || 0;
                                const allocated = Math.min(distRem, cap);
                                distRem = Math.max(0, distRem - allocated);
                                return { r, allocated };
                            });
                            return (
                                <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                                        <Icon size={13} className="text-slate-500 shrink-0" />
                                        <p className="text-xs font-bold text-slate-700 truncate flex-1">{groupLabel}</p>
                                        {!isFabricGroup && group.trim_item_variant_id && (
                                            <SupplierCodePill supplierId={supplierId} supplierName={supplierName} variantId={group.trim_item_variant_id} className="shrink-0" />
                                        )}
                                        <span className="text-[9px] text-slate-400 shrink-0">{activeReqs.length} req{activeReqs.length !== 1 ? 's' : ''}</span>
                                        <button type="button" onClick={() => setRemovedGroupIds(prev => new Set(prev).add(group.id))}
                                            title="Skip this item" className="shrink-0 p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                    <div className="p-2 space-y-1.5">
                                        {activeReqs.length > 1 && (
                                            <div className="space-y-0.5 px-1 pb-0.5">
                                                {distribution.map(({ r, allocated }, i) => (
                                                    <div key={r.id} className="flex items-center justify-between text-[10px] text-slate-500">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-bold text-slate-400">Req {i + 1}/{activeReqs.length}</span>
                                                            {r.is_standalone
                                                                ? <span className="px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 font-bold text-[9px]">Standalone</span>
                                                                : r.order_number ? <span className="font-mono">SO {r.order_number}</span> : null}
                                                            {r.product_name && <span className="text-slate-400 truncate">· {r.product_name}</span>}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 tabular-nums shrink-0">
                                                            <span className="text-slate-400">{(pendingByReq[r.id] || 0)} {unit} pending</span>
                                                            {inThis > 0 && <span className={`font-bold ${allocated > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>→ {allocated.toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit}</span>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className={`rounded-lg p-2 border ${over ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
                                            <p className="text-[9px] text-slate-400 mb-1 font-bold uppercase">
                                                Total pending {totalPending.toLocaleString()} {unit}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <input type="number" min="0" step="any" placeholder="0"
                                                    value={rawTotal}
                                                    onChange={e => setTrimTotalByGroup(prev => ({ ...prev, [group.id]: e.target.value }))}
                                                    className={`w-36 text-sm font-bold text-right border rounded-lg px-2 py-1.5 focus:outline-none tabular-nums ${over ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-amber-400'}`}
                                                />
                                                <span className="text-xs text-slate-500">{unit}</span>
                                                <button type="button" title="Count in boxes → fills the total"
                                                    onClick={() => setBoxModal({ title: 'Box breakdown', uom: unit, initialBoxes: [], onSave: (saved) => { const t = sumTrimBoxes(saved); if (t > 0) setTrimTotalByGroup(prev => ({ ...prev, [group.id]: String(t) })); setBoxModal(null); } })}
                                                    className="flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:bg-amber-100 border border-amber-200 px-1.5 py-1 rounded-md transition">
                                                    <Boxes size={11} /> Boxes
                                                </button>
                                                {over && <span className="text-[10px] font-bold text-red-600">Over by {(inThis - totalPending).toLocaleString()} {unit}</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                    {/* Free-form PO items grouped by variant */}
                    {(() => {
                        const ffItems = (poItems || []).filter(g => (g.requirements || []).length === 0);
                        const varGroupMap = {};
                        ffItems.forEach(g => {
                            const key = ffVarKey(g);
                            if (!varGroupMap[key]) varGroupMap[key] = { key, items: [], isFabric: g.item_type === 'fabric', ref: g };
                            varGroupMap[key].items.push(g);
                        });
                        return Object.values(varGroupMap)
                            .filter(({ key }) => !removedVarGroupKeys.has(key))
                            .map(({ key, items, isFabric, ref }) => {
                                const Icon = TYPE_ICON[ref.item_type] || Package;
                                const itemLabel = isFabric
                                    ? `${ref.fabric_type_name || 'Fabric'}${ref.fabric_color_number ? ` · ${ref.fabric_color_number}` : ''}${ref.fabric_color_name ? ` · ${ref.fabric_color_name}` : ''}`
                                    : `${ref.trim_item_name || 'Trim'}${ref.variant_color_number ? ` · ${ref.variant_color_number}` : ''}${ref.variant_color_name ? ` · ${ref.variant_color_name}` : ''}${ref.variant_size ? ` · Sz ${ref.variant_size}` : ''}`;
                                const groupUom = ref.uom || (isFabric ? 'm' : 'pcs');
                                const activeItems = items.filter(g => !removedPoItemIds.has(g.id));
                                const totalPending = activeItems.reduce((s, g) => s + (pendingByPoItem[g.id] || 0), 0);

                                if (isFabric) {
                                    const rolls = freeFormFabricRollsByVar[key] || [];
                                    const sum = sumRolls(rolls);
                                    const over = sum > totalPending + 0.001;
                                    let distRem = sum;
                                    const distribution = activeItems.map(g => {
                                        const cap = pendingByPoItem[g.id] || 0;
                                        const allocated = Math.min(distRem, cap);
                                        distRem = Math.max(0, distRem - allocated);
                                        return { g, allocated };
                                    });
                                    return (
                                        <div key={`varfab-${key}`} className="border border-slate-200 rounded-xl overflow-hidden">
                                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                                                <Icon size={13} className="text-slate-500 shrink-0" />
                                                <p className="text-xs font-bold text-slate-700 truncate flex-1">{itemLabel}</p>
                                                <span className="text-[9px] text-slate-400 shrink-0">{activeItems.length} line{activeItems.length !== 1 ? 's' : ''}</span>
                                                <button type="button" onClick={() => setRemovedVarGroupKeys(prev => new Set(prev).add(key))}
                                                    title="Skip this item" className="p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0">
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                            <div className="p-2 space-y-1.5">
                                                {activeItems.length > 1 && (
                                                    <div className="space-y-0.5 px-1 pb-0.5">
                                                        {distribution.map(({ g, allocated }, i) => (
                                                            <div key={g.id} className="flex items-center justify-between text-[10px] text-slate-500">
                                                                <span className="font-bold text-slate-400">Line {i + 1}/{activeItems.length}</span>
                                                                <div className="flex items-center gap-1.5 tabular-nums shrink-0">
                                                                    <span className="text-slate-400">{(pendingByPoItem[g.id] || 0)} {groupUom} pending</span>
                                                                    {sum > 0 && <span className={`font-bold ${allocated > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>→ {allocated.toFixed(2)} {groupUom}</span>}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className={`rounded-lg p-2 border ${over ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <p className="text-[10px] text-slate-500">
                                                            <span className="font-bold text-emerald-600">Pending {totalPending.toLocaleString()} {groupUom}</span>
                                                            {' · '}<span className={`font-bold ${over ? 'text-red-600' : 'text-violet-700'}`}>In this inward {sum.toLocaleString(undefined, { maximumFractionDigits: 2 })} m</span>
                                                        </p>
                                                        <button type="button"
                                                            onClick={() => setFreeFormFabricRollsByVar(prev => ({ ...prev, [key]: [...(prev[key] || []), newRoll()] }))}
                                                            className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:bg-violet-50 border border-violet-200 px-2 py-1 rounded-md transition">
                                                            <Plus size={11} /> Roll
                                                        </button>
                                                    </div>
                                                    <div className="space-y-1">
                                                        {rolls.length === 0 ? (
                                                            <p className="text-[10px] text-slate-400 italic px-1">No rolls added — click "Roll" to record one.</p>
                                                        ) : rolls.map(roll => (
                                                            <div key={roll._k} className="flex items-center gap-2">
                                                                <input type="text" placeholder="B-001" value={roll.bale_no}
                                                                    onChange={e => setFreeFormFabricRollsByVar(prev => ({ ...prev, [key]: (prev[key] || []).map(r => r._k === roll._k ? { ...r, bale_no: e.target.value } : r) }))}
                                                                    className="w-24 text-[11px] font-mono border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-violet-400" />
                                                                <input type="number" step="0.01" min="0" placeholder="0.00" value={roll.meter}
                                                                    onChange={e => setFreeFormFabricRollsByVar(prev => ({ ...prev, [key]: (prev[key] || []).map(r => r._k === roll._k ? { ...r, meter: e.target.value } : r) }))}
                                                                    className="flex-1 text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums focus:outline-none focus:border-violet-400" />
                                                                <select value={roll.uom}
                                                                    onChange={e => setFreeFormFabricRollsByVar(prev => ({ ...prev, [key]: (prev[key] || []).map(r => r._k === roll._k ? { ...r, uom: e.target.value } : r) }))}
                                                                    className="w-16 text-[11px] border border-slate-200 rounded px-1 py-1 bg-white">
                                                                    <option value="meter">m</option>
                                                                    <option value="yard">yd</option>
                                                                    <option value="kg">kg</option>
                                                                </select>
                                                                <button type="button"
                                                                    onClick={() => setFreeFormFabricRollsByVar(prev => ({ ...prev, [key]: (prev[key] || []).filter(r => r._k !== roll._k) }))}
                                                                    className="p-1 text-slate-300 hover:text-red-500 transition shrink-0">
                                                                    <Trash2 size={11} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                // Free-form trim — merged by variant
                                const rawTotal = freeFormTrimTotalsByVar[key] ?? '';
                                const inThis = parseFloat(rawTotal) || 0;
                                const over = inThis > totalPending + 0.001;
                                let distRem = inThis;
                                const distribution = activeItems.map(g => {
                                    const cap = pendingByPoItem[g.id] || 0;
                                    const allocated = Math.min(distRem, cap);
                                    distRem = Math.max(0, distRem - allocated);
                                    return { g, allocated };
                                });
                                return (
                                    <div key={`varfree-${key}`} className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                                            <Icon size={13} className="text-slate-500 shrink-0" />
                                            <p className="text-xs font-bold text-slate-700 truncate flex-1">{itemLabel}</p>
                                            {ref.trim_item_variant_id && (
                                                <SupplierCodePill supplierId={supplierId} supplierName={supplierName} variantId={ref.trim_item_variant_id} className="shrink-0" />
                                            )}
                                            <span className="text-[9px] text-slate-400 shrink-0">{activeItems.length} line{activeItems.length !== 1 ? 's' : ''}</span>
                                            <button type="button" onClick={() => setRemovedVarGroupKeys(prev => new Set(prev).add(key))}
                                                title="Skip this item" className="shrink-0 p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                        <div className="p-2 space-y-1.5">
                                            {activeItems.length > 1 && (
                                                <div className="space-y-0.5 px-1 pb-0.5">
                                                    {distribution.map(({ g, allocated }, i) => (
                                                        <div key={g.id} className="flex items-center justify-between text-[10px] text-slate-500">
                                                            <span className="font-bold text-slate-400">Line {i + 1}/{activeItems.length} <span className="font-normal text-slate-400">({(parseFloat(g.quantity) || 0).toLocaleString()} ordered)</span></span>
                                                            <div className="flex items-center gap-1.5 tabular-nums shrink-0">
                                                                <span className="text-slate-400">{(pendingByPoItem[g.id] || 0)} {groupUom} pending</span>
                                                                {inThis > 0 && <span className={`font-bold ${allocated > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>→ {allocated.toLocaleString(undefined, { maximumFractionDigits: 2 })} {groupUom}</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className={`rounded-lg p-2 border ${over ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
                                                <p className="text-[9px] text-slate-400 mb-1 font-bold uppercase">
                                                    Total pending {totalPending.toLocaleString()} {groupUom}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <input type="number" min="0" step="any" placeholder="0"
                                                        value={rawTotal}
                                                        onChange={e => setFreeFormTrimTotalsByVar(prev => ({ ...prev, [key]: e.target.value }))}
                                                        className={`w-36 text-sm font-bold text-right border rounded-lg px-2 py-1.5 focus:outline-none tabular-nums ${over ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-amber-400'}`}
                                                    />
                                                    <span className="text-xs text-slate-500">{groupUom}</span>
                                                    <button type="button" title="Count in boxes → fills the total"
                                                        onClick={() => setBoxModal({ title: 'Box breakdown', uom: groupUom, initialBoxes: [], onSave: (saved) => { const t = sumTrimBoxes(saved); if (t > 0) setFreeFormTrimTotalsByVar(prev => ({ ...prev, [key]: String(t) })); setBoxModal(null); } })}
                                                        className="flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:bg-amber-100 border border-amber-200 px-1.5 py-1 rounded-md transition">
                                                        <Boxes size={11} /> Boxes
                                                    </button>
                                                    {over && <span className="text-[10px] font-bold text-red-600">Over by {(inThis - totalPending).toLocaleString()} {groupUom}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            });
                    })()}

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
                                <button onClick={() => addCustomGroup('spare')}
                                    className="flex items-center gap-1 text-[10px] font-bold text-sky-600 hover:bg-sky-50 border border-sky-200 px-2 py-1 rounded-md transition">
                                    <Plus size={11} /> Spare card
                                </button>
                                <button onClick={() => addCustomGroup('other')}
                                    className="flex items-center gap-1 text-[10px] font-bold text-teal-600 hover:bg-teal-50 border border-teal-200 px-2 py-1 rounded-md transition">
                                    <Plus size={11} /> Other card
                                </button>
                            </div>
                        </div>
                        {customGroups.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">Items not on this PO — extras, samples, replacements.</p>
                        ) : (
                            <div className="space-y-2">
                                {customGroups.map((g, gi) => {
                                    const isFabric = g.type === 'fabric';
                                    const isTrim   = g.type === 'trim';
                                    const isSpare  = g.type === 'spare';
                                    const variants = isTrim ? (variantsByTrim[g.trim_item_id] || []) : [];
                                    const groupSum = isFabric
                                        ? g.lines.reduce((s, ln) => s + sumRolls(ln.rolls), 0)
                                        : g.lines.reduce((s, ln) => s + ((ln.boxes || []).length > 0 ? sumTrimBoxes(ln.boxes) : (parseFloat(ln.total) || 0)), 0);
                                    const ICON = { fabric: Package, trim: Scissors, spare: Wrench, other: Tag }[g.type];
                                    // Static class strings per type (Tailwind purges dynamically-built names).
                                    const S = {
                                        fabric: { icon: 'text-violet-600', sum: 'text-violet-700', btn: 'text-violet-600 hover:bg-violet-100 border-violet-200' },
                                        trim:   { icon: 'text-amber-600',  sum: 'text-amber-700',  btn: 'text-amber-600 hover:bg-amber-100 border-amber-200' },
                                        spare:  { icon: 'text-sky-600',     sum: 'text-sky-700',     btn: 'text-sky-600 hover:bg-sky-100 border-sky-200' },
                                        other:  { icon: 'text-teal-600',    sum: 'text-teal-700',    btn: 'text-teal-600 hover:bg-teal-100 border-teal-200' },
                                    }[g.type];
                                    const tone = { fabric: 'bg-violet-50/40 border-violet-200', trim: 'bg-amber-50/40 border-amber-200', spare: 'bg-sky-50/40 border-sky-200', other: 'bg-teal-50/40 border-teal-200' }[g.type];
                                    const addLabel = isFabric ? 'color' : isTrim ? 'variant' : isSpare ? 'spare' : 'item';
                                    const addDisabled = isTrim && !g.trim_item_id;
                                    return (
                                        <div key={g._k} className={`rounded-lg p-2 border ${tone}`}>
                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                                                    <ICON size={11} className={S.icon} />
                                                    <span className="uppercase tracking-wider text-[10px] capitalize">{g.type} card</span>
                                                    <span className="text-slate-400 text-[10px] font-normal">#{gi + 1}</span>
                                                    {groupSum > 0 && (
                                                        <span className={`text-[10px] font-bold ${S.sum}`}>
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
                                                ) : isTrim ? (
                                                    <SearchableSelect
                                                        value={g.trim_item_id}
                                                        onChange={v => setCustomGroupField(g._k, 'trim_item_id', v)}
                                                        options={trimItems.map(t => ({ value: t.id, label: `${t.name || t.item_name || `Trim #${t.id}`}${t.item_code ? ` · ${t.item_code}` : ''}` }))}
                                                        placeholder="— Trim item —"
                                                        size="xs"
                                                        accentColor="amber"
                                                    />
                                                ) : (
                                                    <div className="text-[10px] text-slate-400 self-center italic">Pick {isSpare ? 'a spare part' : 'an item'} per line below</div>
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
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{g.lines.length} line{g.lines.length !== 1 ? 's' : ''}</p>
                                                <button onClick={() => addCustomLine(g._k)}
                                                    disabled={addDisabled}
                                                    className={`flex items-center gap-1 text-[10px] font-bold border px-1.5 py-0.5 rounded-md transition disabled:opacity-40 ${S.btn}`}>
                                                    <Plus size={10} /> Add {addLabel}
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
                                                                    {isTrim && (
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
                                                                    )}
                                                                    {isSpare && (
                                                                        <SearchableSelect
                                                                            value={ln.spare_part_id}
                                                                            onChange={v => setCustomLineField(g._k, ln._k, 'spare_part_id', v)}
                                                                            options={spareParts.map(s => ({ value: s.id, label: `${s.name || `Spare #${s.id}`}${s.part_number ? ` (${s.part_number})` : ''}` }))}
                                                                            placeholder="— Spare part —"
                                                                            className="flex-1 min-w-0"
                                                                            size="xs"
                                                                            accentColor="violet"
                                                                        />
                                                                    )}
                                                                    {g.type === 'other' && (
                                                                        <div className="flex-1 min-w-0 flex items-center gap-1">
                                                                            <SearchableSelect
                                                                                value={ln.general_item_id}
                                                                                onChange={v => setCustomLineField(g._k, ln._k, 'general_item_id', v)}
                                                                                options={generalItems.map(i => ({ value: i.id, label: `${i.name}${i.item_code ? ` (${i.item_code})` : ''}` }))}
                                                                                placeholder="— Item —"
                                                                                className="flex-1 min-w-0"
                                                                                size="xs"
                                                                                accentColor="violet"
                                                                            />
                                                                            <button type="button" title="Create item"
                                                                                onClick={() => { const nm = window.prompt('New item name'); if (nm && nm.trim()) quickCreateGeneralItem(nm, '', (it) => setCustomLineField(g._k, ln._k, 'general_item_id', it.id)); }}
                                                                                className="shrink-0 p-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-500">
                                                                                <Plus size={11} />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                    {g.lines.length > 1 && (
                                                                        <button onClick={() => removeCustomLine(g._k, ln._k)} title="Remove line"
                                                                            className="p-1 text-slate-300 hover:text-red-500 transition">
                                                                            <Trash2 size={11} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                {g.type === 'other' && (
                                                                    <input type="text" placeholder="Line note (optional)" value={ln.description || ''}
                                                                        onChange={e => setCustomLineField(g._k, ln._k, 'description', e.target.value)}
                                                                        className="w-full text-[11px] border border-slate-200 rounded px-1.5 py-1" />
                                                                )}
                                                                {boxTotalControl(g, ln)}
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
                <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100">
                    {onBack && (
                        <button onClick={onBack} disabled={busy}
                            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40">
                            <ArrowLeft size={12} /> Back
                        </button>
                    )}
                    <button onClick={onClose} disabled={busy}
                        className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40">
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
