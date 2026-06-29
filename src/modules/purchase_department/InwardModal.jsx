import { useState, useEffect, useMemo } from 'react';
import {
    X, Loader2, AlertTriangle, Package, Scissors, Tag, Trash2, Upload, FileText, Edit3, Plus,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { trimsApi } from '../../api/trimsApi';
import api, { IMAGE_BASE_URL } from '../../utils/api';
import SearchableSelect from '../../shared/SearchableSelect';
import BoxBreakdownModal from './BoxBreakdownModal';

const TYPE_ICON = { fabric: Package, trim: Scissors, other: Tag };

const reqTotal = (r) =>
    parseFloat(r.meters_required ?? r.quantity_required ?? 0);

const reqUnit = (r) => r.unit_of_measure || (r.type === 'fabric' ? 'm' : 'pcs');

const reqLabel = (r) => {
    if (r.type === 'fabric') {
        const colorBit = (r.fabric_color_number || r.fabric_color_name)
            ? `${r.fabric_color_number ? `${r.fabric_color_number}${r.fabric_color_name ? ' · ' : ''}` : ''}${r.fabric_color_name || ''}`
            : null;
        const parts = [r.fabric_type_name, colorBit].filter(Boolean);
        return parts.length ? parts.join(' · ') : 'Fabric requirement';
    }
    if (r.type === 'trim') {
        const parts = [r.trim_item_name || 'Trim requirement'];
        if (r.variant_color_number) parts.push(r.variant_color_number);
        if (r.variant_color_name)   parts.push(r.variant_color_name);
        if (r.variant_size)         parts.push(`Sz ${r.variant_size}`);
        return parts.join(' · ');
    }
    return 'Requirement';
};

export default function InwardModal({
    poId,
    poCode,
    poItems = [],              // PO items grouped (po.items[]); each item carries .requirements[]
    allInwards = [],           // all inwards for this PO (so we can compute pending)
    inward = null,             // existing inward (edit/view), null = create
    initialMode = 'view',      // 'view' | 'edit' | 'create'
    onClose,
    onSaved,
    onDeleted,
}) {
    const isCreate = !inward;
    const [mode, setMode] = useState(isCreate ? 'create' : initialMode);
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);
    const [boxModal, setBoxModal] = useState(null);

    // Form state
    const [grnNumber,    setGrnNumber]    = useState(inward?.grn_number || '');
    const [receivedDate, setReceivedDate] = useState(
        inward?.received_date || new Date().toISOString().split('T')[0]
    );
    const [condition,    setCondition]    = useState(inward?.condition || 'GOOD');
    const [notes,        setNotes]        = useState(inward?.notes || '');
    const [scanFile,     setScanFile]     = useState(null);

    // Flatten the requirement set across PO items for pending-qty + item-state calcs
    const allRequirements = useMemo(
        () => (poItems || []).flatMap(i => i.requirements || []),
        [poItems]
    );

    // Pending qty per requirement (excludes this inward's own items if editing).
    // Baseline is the parent PO item's ordered quantity, not the requirement's own qty.
    const pendingByReq = useMemo(() => {
        const reqToPoQty = {};
        (poItems || []).forEach(p => {
            const poQty = parseFloat(p.quantity ?? 0);
            (p.requirements || []).forEach(r => { reqToPoQty[r.id] = poQty; });
        });
        const otherReceived = {};
        allInwards.forEach(iw => {
            if (inward && iw.id === inward.id) return;
            (iw.items || []).forEach(it => {
                otherReceived[it.purchase_requirement_id] =
                    (otherReceived[it.purchase_requirement_id] || 0) + parseFloat(it.qty_received || 0);
            });
        });
        const map = {};
        allRequirements.forEach(r => {
            const baseline = reqToPoQty[r.id] ?? reqTotal(r);
            map[r.id] = Math.max(0, baseline - (otherReceived[r.id] || 0));
        });
        return map;
    }, [allRequirements, allInwards, inward, poItems]);

    // Pending qty per free-form PO item (items with no requirements)
    const pendingByPoItem = useMemo(() => {
        const otherReceived = {};
        allInwards.forEach(iw => {
            if (inward && iw.id === inward.id) return;
            (iw.items || []).forEach(it => {
                if (it.purchase_order_item_id != null) {
                    otherReceived[it.purchase_order_item_id] =
                        (otherReceived[it.purchase_order_item_id] || 0) + parseFloat(it.qty_received || 0);
                }
            });
        });
        const map = {};
        (poItems || []).forEach(p => {
            if ((p.requirements || []).length > 0) return;  // only free-form items
            const total = parseFloat(p.quantity ?? 0);
            map[p.id] = Math.max(0, total - (otherReceived[p.id] || 0));
        });
        return map;
    }, [poItems, allInwards, inward]);

    // Helpers for fabric-roll style entries (mirrors FabricIntakeForm).
    // Keys must be globally unique — using a render-scoped counter restarts on
    // every render and produces stale-key collisions where two rolls share `_k`,
    // which makes every onChange write to both.
    const newRoll = (init = {}) => ({
        _k:      Math.random().toString(36).slice(2),
        bale_no: init.bale_no ?? '',
        meter:   init.meter   != null ? String(init.meter) : '',
        uom:     init.uom     ?? 'meter',
    });
    const newTrimBox = (init = {}) => ({
        _k:          Math.random().toString(36).slice(2),
        box_count:   init.box_count   != null ? String(init.box_count)   : '',
        qty_per_box: init.qty_per_box != null ? String(init.qty_per_box) : '',
    });
    const sumTrimBoxes = (boxes) =>
        (boxes || []).reduce((s, b) => s + (parseFloat(b.box_count) || 0) * (parseFloat(b.qty_per_box) || 0), 0);
    const mapTrimBoxes = (boxes) =>
        (boxes || [])
            .filter(b => (parseFloat(b.box_count) || 0) > 0 && (parseFloat(b.qty_per_box) || 0) > 0)
            .map(b => ({ box_count: parseFloat(b.box_count), qty_per_box: parseFloat(b.qty_per_box) }));

    // Determine if an existing inward item came from fabric (by linked req or PO line)
    const fabricReqIds  = new Set(allRequirements.filter(r => (r.item_type || r.type) === 'fabric').map(r => r.id));
    const fabricPoItemIds = new Set((poItems || []).filter(g => g.item_type === 'fabric').map(g => g.id));

    // Trim total per requirement (total-only mode) — primary entry
    const [trimTotalByReq, setTrimTotalByReq] = useState(() => {
        if (inward) {
            const m = {};
            (inward.items || []).forEach(it => {
                if (it.purchase_requirement_id != null && !fabricReqIds.has(it.purchase_requirement_id)) {
                    // Only set total when there's no box breakdown (box mode handles its own display)
                    if (!(it.boxes || []).length) m[it.purchase_requirement_id] = String(it.qty_received || 0);
                }
            });
            return m;
        }
        const reqToPoQty = {};
        (poItems || []).forEach(p => {
            const poQty = parseFloat(p.quantity ?? 0);
            (p.requirements || []).forEach(r => { reqToPoQty[r.id] = poQty; });
        });
        const m = {};
        allRequirements.forEach(r => {
            if ((r.item_type || r.type) === 'fabric') return;
            const baseline = reqToPoQty[r.id] ?? reqTotal(r);
            const totalAlready = (allInwards || []).reduce((s, iw) =>
                s + (iw.items || [])
                    .filter(it => it.purchase_requirement_id === r.id)
                    .reduce((s2, it) => s2 + parseFloat(it.qty_received || 0), 0), 0);
            const pending = Math.max(0, baseline - totalAlready);
            if (pending > 0) m[r.id] = String(pending);
        });
        return m;
    });

    // Trim boxes per requirement — empty by default; populated when user adds breakdown
    const [trimBoxesByReq, setTrimBoxesByReq] = useState(() => {
        if (inward) {
            const m = {};
            (inward.items || []).forEach(it => {
                if (it.purchase_requirement_id != null && !fabricReqIds.has(it.purchase_requirement_id)) {
                    if ((it.boxes || []).length > 0) m[it.purchase_requirement_id] = it.boxes.map(b => newTrimBox(b));
                    else m[it.purchase_requirement_id] = [];
                }
            });
            return m;
        }
        const m = {};
        allRequirements.forEach(r => {
            if ((r.item_type || r.type) === 'fabric') return;
            m[r.id] = [];
        });
        return m;
    });

    // Fabric rolls per requirement — { [requirement_id]: [{ _k, bale_no, meter, uom }] }
    const [fabricRollsByReq, setFabricRollsByReq] = useState(() => {
        if (inward) {
            const m = {};
            (inward.items || []).forEach(it => {
                if (it.purchase_requirement_id != null && fabricReqIds.has(it.purchase_requirement_id)) {
                    const arr = m[it.purchase_requirement_id] || [];
                    (it.rolls || []).forEach(r => arr.push(newRoll(r)));
                    if ((it.rolls || []).length === 0) arr.push(newRoll({ meter: it.qty_received }));
                    m[it.purchase_requirement_id] = arr;
                }
            });
            // Seed any fabric req that had no rolls yet with one blank
            allRequirements.forEach(r => {
                if ((r.item_type || r.type) === 'fabric' && !m[r.id]) m[r.id] = [newRoll()];
            });
            return m;
        }
        const m = {};
        allRequirements.forEach(r => {
            if ((r.item_type || r.type) !== 'fabric') return;
            m[r.id] = [newRoll()];
        });
        return m;
    });

    // Free-form trim totals (per PO line item) — total-only mode
    const [freeFormTrimTotals, setFreeFormTrimTotals] = useState(() => {
        if (inward) {
            const m = {};
            (inward.items || []).forEach(it => {
                if (it.purchase_order_item_id != null && it.purchase_requirement_id == null && !fabricPoItemIds.has(it.purchase_order_item_id)) {
                    if (!(it.boxes || []).length) m[it.purchase_order_item_id] = String(it.qty_received || 0);
                }
            });
            return m;
        }
        const m = {};
        (poItems || []).forEach(p => {
            if ((p.requirements || []).length > 0) return;
            if (p.item_type === 'fabric') return;
            const total = parseFloat(p.quantity ?? 0);
            const totalAlready = (allInwards || []).reduce((s, iw) =>
                s + (iw.items || [])
                    .filter(it => it.purchase_order_item_id === p.id)
                    .reduce((s2, it) => s2 + parseFloat(it.qty_received || 0), 0), 0);
            const pending = Math.max(0, total - totalAlready);
            if (pending > 0) m[p.id] = String(pending);
        });
        return m;
    });

    // Free-form trim boxes (per PO line item) — empty by default
    const [freeFormTrimBoxes, setFreeFormTrimBoxes] = useState(() => {
        if (inward) {
            const m = {};
            (inward.items || []).forEach(it => {
                if (it.purchase_order_item_id != null && it.purchase_requirement_id == null && !fabricPoItemIds.has(it.purchase_order_item_id)) {
                    if ((it.boxes || []).length > 0) m[it.purchase_order_item_id] = it.boxes.map(b => newTrimBox(b));
                    else m[it.purchase_order_item_id] = [];
                }
            });
            return m;
        }
        const m = {};
        (poItems || []).forEach(p => {
            if ((p.requirements || []).length > 0) return;
            if (p.item_type === 'fabric') return;
            m[p.id] = [];
        });
        return m;
    });

    // Free-form fabric rolls keyed by PO line item id
    const [freeFormFabricRolls, setFreeFormFabricRolls] = useState(() => {
        if (inward) {
            const m = {};
            (inward.items || []).forEach(it => {
                if (it.purchase_order_item_id != null && it.purchase_requirement_id == null && fabricPoItemIds.has(it.purchase_order_item_id)) {
                    const arr = m[it.purchase_order_item_id] || [];
                    (it.rolls || []).forEach(r => arr.push(newRoll(r)));
                    if ((it.rolls || []).length === 0) arr.push(newRoll({ meter: it.qty_received }));
                    m[it.purchase_order_item_id] = arr;
                }
            });
            (poItems || []).forEach(p => {
                if ((p.requirements || []).length > 0) return;
                if (p.item_type === 'fabric' && !m[p.id]) m[p.id] = [newRoll()];
            });
            return m;
        }
        const m = {};
        (poItems || []).forEach(p => {
            if ((p.requirements || []).length > 0) return;
            if (p.item_type !== 'fabric') return;
            m[p.id] = [newRoll()];
        });
        return m;
    });

    // Rows the user explicitly removed from this inward. They stop rendering
    // and their data is cleared so buildItems doesn't pick them up.
    const [removedReqIds,    setRemovedReqIds]    = useState(new Set());
    const [removedPoItemIds, setRemovedPoItemIds] = useState(new Set());

    // Truly free-form custom items (no requirement, no PO item link).
    // Shape: groups of { fabric_type | trim_item, uom, unit_price, description, lines: [...] }
    // Each line carries the color/variant + rolls (fabric) or qty (trim).
    const rk = () => Math.random().toString(36).slice(2);
    const [customGroups, setCustomGroups] = useState(() => {
        if (!inward) return [];
        // Existing data is a flat per-item list with no group concept. To preserve it
        // safely, render each existing custom item as its own single-line group; the
        // user can manually consolidate later.
        return (inward.items || [])
            .filter(it => it.is_free_form === true && it.purchase_order_item_id == null)
            .map(it => {
                const isFabric = (it.item_type || 'trim') === 'fabric';
                const rolls = isFabric
                    ? ((it.rolls || []).length > 0
                        ? it.rolls.map(r => ({ _k: rk(), bale_no: r.bale_no || '', meter: r.meter != null ? String(r.meter) : '', uom: r.uom || 'meter' }))
                        : [{ _k: rk(), bale_no: '', meter: it.qty_received != null ? String(it.qty_received) : '', uom: 'meter' }])
                    : null;
                return {
                    _k:             String(it.id) + ':' + rk(),
                    type:           isFabric ? 'fabric' : 'trim',
                    fabric_type_id: it.fabric_type_id ?? '',
                    trim_item_id:   '',                    // not stored on the entry
                    uom:            isFabric ? 'meter' : 'pcs',
                    unit_price:     it.unit_price != null ? String(it.unit_price) : '',
                    description:    it.description || '',
                    lines: [
                        isFabric
                            ? { _k: rk(), fabric_color_id: it.fabric_color_id ?? '', rolls }
                            : { _k: rk(), trim_item_variant_id: it.trim_item_variant_id ?? '',
                                total: (it.boxes || []).length > 0 ? '' : String(it.qty_received ?? ''),
                                boxes: (it.boxes || []).length > 0 ? it.boxes.map(b => newTrimBox(b)) : [] },
                    ],
                };
            });
    });

    // Lookups (loaded once)
    const [trimItems,      setTrimItems]      = useState([]);
    const [fabricTypes,    setFabricTypes]    = useState([]);
    const [fabricColors,   setFabricColors]   = useState([]);
    const [variantsByTrim, setVariantsByTrim] = useState({});

    useEffect(() => {
        trimsApi.getItems()
            .then(r => setTrimItems(r.data?.data ?? r.data ?? []))
            .catch(() => setTrimItems([]));
        api.get('/shared/fabric_type')
            .then(r => setFabricTypes(r.data?.data ?? r.data ?? []))
            .catch(() => setFabricTypes([]));
        api.get('/shared/fabric_color')
            .then(r => setFabricColors(r.data?.data ?? r.data ?? []))
            .catch(() => setFabricColors([]));
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

    useEffect(() => { setErr(null); }, [mode]);

    const editable = mode === 'create' || mode === 'edit';

    // ── Trim total helpers (total-only mode) ───────────────────────────────
    const setTrimTotalForReq    = (reqId, val)    => setTrimTotalByReq(prev => ({ ...prev, [reqId]: val }));
    const setTrimTotalForPoItem = (poItemId, val) => setFreeFormTrimTotals(prev => ({ ...prev, [poItemId]: val }));

    // ── Trim box helpers (breakdown managed via BoxBreakdownModal) ────────────
    const clearTrimBoxesForReq = (reqId, computedTotal) => {
        setTrimBoxesByReq(prev => ({ ...prev, [reqId]: [] }));
        if (computedTotal > 0) setTrimTotalByReq(prev => ({ ...prev, [reqId]: String(computedTotal) }));
    };

    const clearTrimBoxesForPoItem = (poItemId, computedTotal) => {
        setFreeFormTrimBoxes(prev => ({ ...prev, [poItemId]: [] }));
        if (computedTotal > 0) setFreeFormTrimTotals(prev => ({ ...prev, [poItemId]: String(computedTotal) }));
    };

    // ── Fabric roll helpers ─────────────────────────────────────────────────
    const sumRolls = (rolls) =>
        (rolls || []).reduce((s, r) => s + (parseFloat(r.meter) || 0), 0);

    const addRollToReq = (reqId) => setFabricRollsByReq(prev => ({
        ...prev,
        [reqId]: [...(prev[reqId] || []), newRoll()],
    }));
    const removeRollFromReq = (reqId, key) => setFabricRollsByReq(prev => ({
        ...prev,
        [reqId]: (prev[reqId] || []).filter(r => r._k !== key),
    }));
    const setRollFieldOnReq = (reqId, key, field, val) => setFabricRollsByReq(prev => ({
        ...prev,
        [reqId]: (prev[reqId] || []).map(r => r._k === key ? { ...r, [field]: val } : r),
    }));

    const addRollToPoItem = (poItemId) => setFreeFormFabricRolls(prev => ({
        ...prev,
        [poItemId]: [...(prev[poItemId] || []), newRoll()],
    }));
    const removeRollFromPoItem = (poItemId, key) => setFreeFormFabricRolls(prev => ({
        ...prev,
        [poItemId]: (prev[poItemId] || []).filter(r => r._k !== key),
    }));
    const setRollFieldOnPoItem = (poItemId, key, field, val) => setFreeFormFabricRolls(prev => ({
        ...prev,
        [poItemId]: (prev[poItemId] || []).map(r => r._k === key ? { ...r, [field]: val } : r),
    }));

    // ── Free-form custom group/line setters ────────────────────────────────
    const addCustomGroup = (type) => setCustomGroups(prev => [...prev, {
        _k:             rk(),
        type,
        fabric_type_id: '',
        trim_item_id:   '',
        uom:            type === 'fabric' ? 'meter' : 'pcs',
        unit_price:     '',
        description:    '',
        lines: type === 'fabric'
            ? [{ _k: rk(), fabric_color_id: '', rolls: [newRoll()] }]
            : [{ _k: rk(), trim_item_variant_id: '', total: '', boxes: [] }],
    }]);

    const removeCustomGroup = (gk) =>
        setCustomGroups(prev => prev.filter(g => g._k !== gk));

    const setCustomGroupField = (gk, field, value) => {
        setCustomGroups(prev => prev.map(g => {
            if (g._k !== gk) return g;
            const next = { ...g, [field]: value };
            if (field === 'trim_item_id') {
                next.lines = g.lines.map(ln => ({ ...ln, trim_item_variant_id: '' }));
                if (value) ensureVariants(value);
            }
            return next;
        }));
    };

    const addCustomLine = (gk) => setCustomGroups(prev => prev.map(g => {
        if (g._k !== gk) return g;
        const ln = g.type === 'fabric'
            ? { _k: rk(), fabric_color_id: '', rolls: [newRoll()] }
            : { _k: rk(), trim_item_variant_id: '', total: '', boxes: [] };
        return { ...g, lines: [...g.lines, ln] };
    }));

    const removeCustomLine = (gk, lk) => setCustomGroups(prev => prev.map(g => {
        if (g._k !== gk) return g;
        return { ...g, lines: g.lines.filter(ln => ln._k !== lk) };
    }));

    const setCustomLineField = (gk, lk, field, value) => setCustomGroups(prev => prev.map(g => {
        if (g._k !== gk) return g;
        return { ...g, lines: g.lines.map(ln => ln._k === lk ? { ...ln, [field]: value } : ln) };
    }));

    const addRollToCustomLine = (gk, lk) => setCustomGroups(prev => prev.map(g => {
        if (g._k !== gk) return g;
        return { ...g, lines: g.lines.map(ln => ln._k === lk ? { ...ln, rolls: [...(ln.rolls || []), newRoll()] } : ln) };
    }));

    const removeRollFromCustomLine = (gk, lk, rKey) => setCustomGroups(prev => prev.map(g => {
        if (g._k !== gk) return g;
        return { ...g, lines: g.lines.map(ln => ln._k === lk ? { ...ln, rolls: (ln.rolls || []).filter(r => r._k !== rKey) } : ln) };
    }));

    const setRollOnCustomLine = (gk, lk, rKey, field, value) => setCustomGroups(prev => prev.map(g => {
        if (g._k !== gk) return g;
        return { ...g, lines: g.lines.map(ln => ln._k === lk ? { ...ln, rolls: (ln.rolls || []).map(r => r._k === rKey ? { ...r, [field]: value } : r) } : ln) };
    }));


    // Build the items array from current form state. Returns { items, error }.
    // The summary screen calls this for preview; final submit re-uses the items
    // so we never re-validate / re-build twice.
    const buildItems = () => {
        const mapRolls = (rolls) => (rolls || [])
            .filter(r => parseFloat(r.meter) > 0)
            .map(r => ({
                bale_no: r.bale_no?.trim() ? r.bale_no.trim() : null,
                meter:   parseFloat(r.meter),
                uom:     r.uom || 'meter',
            }));

        // Trim req entries — box breakdown takes priority over total-only
        const reqIds = new Set([...Object.keys(trimBoxesByReq), ...Object.keys(trimTotalByReq)]);
        const reqEntries = [];
        for (const reqId of reqIds) {
            const boxes = mapTrimBoxes(trimBoxesByReq[reqId]);
            if (boxes.length > 0) {
                reqEntries.push({ requirement_id: parseInt(reqId, 10), qty_received: boxes.reduce((s, b) => s + b.box_count * b.qty_per_box, 0), boxes });
            } else {
                const q = parseFloat(trimTotalByReq[reqId] ?? 0);
                if (q > 0) reqEntries.push({ requirement_id: parseInt(reqId, 10), qty_received: q });
            }
        }

        const fabricReqEntries = Object.entries(fabricRollsByReq)
            .map(([reqId, rolls]) => ({ reqId: parseInt(reqId, 10), rolls: mapRolls(rolls) }))
            .filter(x => x.rolls.length > 0)
            .map(x => ({
                requirement_id: x.reqId,
                qty_received:   x.rolls.reduce((s, r) => s + r.meter, 0),
                rolls:          x.rolls,
            }));

        // Free-form trim entries — same dual-mode
        const poIds = new Set([...Object.keys(freeFormTrimBoxes), ...Object.keys(freeFormTrimTotals)]);
        const freeEntries = [];
        for (const poItemId of poIds) {
            const boxes = mapTrimBoxes(freeFormTrimBoxes[poItemId]);
            if (boxes.length > 0) {
                freeEntries.push({ purchase_order_item_id: parseInt(poItemId, 10), qty_received: boxes.reduce((s, b) => s + b.box_count * b.qty_per_box, 0), boxes });
            } else {
                const q = parseFloat(freeFormTrimTotals[poItemId] ?? 0);
                if (q > 0) freeEntries.push({ purchase_order_item_id: parseInt(poItemId, 10), qty_received: q });
            }
        }

        const fabricFreeEntries = Object.entries(freeFormFabricRolls)
            .map(([poItemId, rolls]) => ({ poItemId: parseInt(poItemId, 10), rolls: mapRolls(rolls) }))
            .filter(x => x.rolls.length > 0)
            .map(x => ({
                purchase_order_item_id: x.poItemId,
                qty_received:           x.rolls.reduce((s, r) => s + r.meter, 0),
                rolls:                  x.rolls,
            }));

        // Flatten group→line into one custom entry per line. Each line replicates
        // its parent's unit_price + description so the API contract is unchanged.
        const customEntries = [];
        for (const [gi, g] of customGroups.entries()) {
            const groupLabel = g.type === 'fabric' ? `Free-form fabric card #${gi + 1}` : `Free-form trim card #${gi + 1}`;
            const unitPrice = g.unit_price === '' || g.unit_price == null ? null : parseFloat(g.unit_price);
            for (const [li, ln] of g.lines.entries()) {
                if (g.type === 'fabric') {
                    const rolls = mapRolls(ln.rolls);
                    if (rolls.length === 0) continue;
                    if (!g.fabric_type_id) return { items: null, error: `${groupLabel}: pick a fabric type.` };
                    customEntries.push({
                        item_type:       'fabric',
                        fabric_type_id:  parseInt(g.fabric_type_id, 10),
                        fabric_color_id: ln.fabric_color_id ? parseInt(ln.fabric_color_id, 10) : null,
                        qty_received:    rolls.reduce((s, r) => s + r.meter, 0),
                        rolls,
                        unit_price:      unitPrice,
                        description:     g.description || null,
                    });
                } else {
                    const boxes = mapTrimBoxes(ln.boxes);
                    const q = boxes.length > 0
                        ? boxes.reduce((s, b) => s + b.box_count * b.qty_per_box, 0)
                        : parseFloat(ln.total ?? 0);
                    if (!q || q <= 0) continue;
                    if (!g.trim_item_id)          return { items: null, error: `${groupLabel}: pick a trim item.` };
                    if (!ln.trim_item_variant_id) return { items: null, error: `${groupLabel}, line ${li + 1}: pick a variant.` };
                    const entry = {
                        item_type:            'trim',
                        qty_received:         q,
                        trim_item_variant_id: parseInt(ln.trim_item_variant_id, 10),
                        unit_price:           unitPrice,
                        description:          g.description || null,
                    };
                    if (boxes.length > 0) entry.boxes = boxes;
                    customEntries.push(entry);
                }
            }
        }
        const itemsArr = [...reqEntries, ...fabricReqEntries, ...freeEntries, ...fabricFreeEntries, ...customEntries];
        if (itemsArr.length === 0) return { items: null, error: 'Add at least one item (rolls for fabric, qty for trim).' };
        return { items: itemsArr, error: null };
    };

    // ── Confirm flow: form → review → submit ──────────────────────────────────
    const [reviewItems, setReviewItems] = useState(null);  // non-null → show review screen

    const handleReview = () => {
        setErr(null);
        if (!receivedDate) { setErr('Received date is required.'); return; }
        const { items: built, error } = buildItems();
        if (error) { setErr(error); return; }
        setReviewItems(built);
    };

    const handleConfirmSave = async () => {
        if (!reviewItems) return;
        setBusy(true);
        try {
            const payload = {
                grn_number:    grnNumber || undefined,
                received_date: receivedDate,
                condition:     condition || undefined,
                notes:         notes || undefined,
                items:         reviewItems,
            };
            const res = mode === 'create'
                ? await purchaseDeptApi.createInward(poId, payload, scanFile)
                : await purchaseDeptApi.updateInward(inward.id, payload, scanFile);
            onSaved?.(res.data);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Save failed.');
        } finally {
            setBusy(false);
        }
    };

    // Map each requirement id back to its parent PO item so we can read the
    // joined fabric / trim names from the group (the req row itself often lacks
    // them — backend joins are on the PO item).
    const reqIdToPoGroup = useMemo(() => {
        const m = new Map();
        (poItems || []).forEach(g => (g.requirements || []).forEach(r => m.set(r.id, g)));
        return m;
    }, [poItems]);

    const labelFromGroup = (g) => {
        if (!g) return { name: '', details: '' };
        if (g.item_type === 'fabric') {
            const detailParts = [];
            if (g.fabric_color_number) detailParts.push(g.fabric_color_number);
            if (g.fabric_color_name)   detailParts.push(g.fabric_color_name);
            return { name: g.fabric_type_name || 'Fabric', details: detailParts.join(' · ') };
        }
        const detailParts = [];
        if (g.variant_color_number) detailParts.push(g.variant_color_number);
        if (g.variant_color_name)   detailParts.push(g.variant_color_name);
        if (g.variant_size)         detailParts.push(`Sz ${g.variant_size}`);
        return { name: g.trim_item_name || 'Trim', details: detailParts.join(' · ') };
    };

    // Resolve each review entry to the inward item itself — fabric type + color
    // (with number), or trim item + variant color (with number) + size. We
    // intentionally suppress requirement / SO context here so the review reads
    // as "what's being received" rather than "what was requested".
    const reviewSummary = useMemo(() => {
        if (!reviewItems) return [];
        const variantPool = Object.values(variantsByTrim).flat();
        return reviewItems.map((it, idx) => {
            if (it.requirement_id != null) {
                const g = reqIdToPoGroup.get(it.requirement_id);
                const isFabric = g?.item_type === 'fabric';
                const { name, details } = labelFromGroup(g);
                return {
                    key:     `r-${idx}`,
                    name:    name || `Requirement #${it.requirement_id}`,
                    details,
                    qty:     it.qty_received,
                    unit:    isFabric ? 'm' : (g?.uom || 'pcs'),
                    rolls:   it.rolls || null,
                };
            }
            if (it.purchase_order_item_id != null) {
                const p = (poItems || []).find(x => x.id === it.purchase_order_item_id);
                const isFabric = p?.item_type === 'fabric';
                const { name, details } = labelFromGroup(p);
                return {
                    key:     `po-${idx}`,
                    name:    name || `PO item #${it.purchase_order_item_id}`,
                    details,
                    qty:     it.qty_received,
                    unit:    isFabric ? 'm' : (p?.uom || 'pcs'),
                    rolls:   it.rolls || null,
                };
            }
            const isFabric = it.item_type === 'fabric';
            let name = '';
            let details = '';
            if (isFabric) {
                const t = fabricTypes.find(x => String(x.id) === String(it.fabric_type_id));
                const c = fabricColors.find(x => String(x.id) === String(it.fabric_color_id));
                name = t?.name || t?.fabric_type_name || 'Fabric';
                const parts = [];
                if (c?.color_number) parts.push(c.color_number);
                if (c?.color_name)   parts.push(c.color_name);
                details = parts.join(' · ');
            } else {
                const v = variantPool.find(x => String(x.id) === String(it.trim_item_variant_id));
                // Find the parent trim_item name from trimItems via the variant
                const trimParent = v ? trimItems.find(t => String(t.id) === String(v.trim_item_id)) : null;
                name = trimParent?.name || trimParent?.item_name || 'Trim';
                if (v) {
                    const parts = [];
                    if (v.color_number)  parts.push(v.color_number);
                    if (v.color_name)    parts.push(v.color_name);
                    if (v.variant_size)  parts.push(`Sz ${v.variant_size}`);
                    details = parts.join(' · ');
                } else {
                    details = `Variant #${it.trim_item_variant_id}`;
                }
            }
            return {
                key:     `c-${idx}`,
                name,
                details,
                qty:     it.qty_received,
                unit:    isFabric ? 'm' : 'pcs',
                rolls:   it.rolls || null,
            };
        });
    }, [reviewItems, reqIdToPoGroup, poItems, fabricTypes, fabricColors, variantsByTrim, trimItems]);

    const handleDelete = async () => {
        if (!inward) return;
        if (!window.confirm(`Delete inward ${inward.grn_number || `#${inward.id}`}? This will reverse trim stock additions.`)) return;
        setBusy(true); setErr(null);
        try {
            await purchaseDeptApi.deleteInward(inward.id);
            onDeleted?.(inward.id);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Delete failed.');
        } finally {
            setBusy(false);
        }
    };

    const scanUrl = (() => {
        const url = inward?.scan_url;
        if (!url) return null;
        return url.startsWith('http') ? url : `${IMAGE_BASE_URL.replace(/\/uploads$/, '')}${url}`;
    })();

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
                            {mode === 'create' ? 'New Inward (GRN)' : `Inward · ${inward.grn_number || `#${inward.id}`}`}
                        </h2>
                        {(poCode || poId) && (
                            <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                                PO · {poCode || `#${poId}`}
                            </p>
                        )}
                        {!isCreate && inward.created_by_name && (
                            <p className="text-xs text-slate-500 mt-0.5">Recorded by {inward.created_by_name}</p>
                        )}
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

                    {reviewItems ? (
                        <div className="space-y-3">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Review beforee saving</p>
                                <p className="text-[11px] text-emerald-700/80 mt-0.5">{reviewSummary.length} line{reviewSummary.length !== 1 ? 's' : ''} will be {mode === 'create' ? 'recorded' : 'updated'} on GRN {grnNumber || '(auto)'} dated {receivedDate}.</p>
                            </div>
                            <div className="space-y-1.5">
                                {reviewSummary.map(row => (
                                    <div key={row.key} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-800">{row.name}</p>
                                            {row.details && (
                                                <p className="text-[11px] text-slate-600 mt-0.5">{row.details}</p>
                                            )}
                                            {row.rolls && row.rolls.length > 0 && (
                                                <ul className="mt-1 text-[10px] text-slate-500 space-y-0.5">
                                                    {row.rolls.map((r, i) => (
                                                        <li key={i} className="font-mono">
                                                            {r.bale_no || '—'} · {Number(r.meter).toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.uom || 'm'}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="text-sm font-bold text-emerald-700 tabular-nums">
                                                {Number(row.qty).toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit}
                                            </p>
                                            {row.rolls && row.rolls.length > 0 && (
                                                <p className="text-[9px] text-slate-400">{row.rolls.length} roll{row.rolls.length !== 1 ? 's' : ''}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {notes && (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notes</p>
                                    <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{notes}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                    <>

                    {/* Header fields */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GRN Number</label>
                            <input
                                type="text"
                                value={grnNumber}
                                onChange={e => setGrnNumber(e.target.value)}
                                disabled={!editable}
                                placeholder="GRN-2026-…"
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-emerald-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Received Date *</label>
                            <input
                                type="date"
                                value={receivedDate}
                                onChange={e => setReceivedDate(e.target.value)}
                                disabled={!editable}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-emerald-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Condition</label>
                            <select
                                value={condition}
                                onChange={e => setCondition(e.target.value)}
                                disabled={!editable}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-emerald-400 bg-white"
                            >
                                <option value="GOOD">Good</option>
                                <option value="DAMAGED">Damaged</option>
                                <option value="PARTIAL">Partial</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scan (jpg, ≤5MB)</label>
                            <div className="flex items-center gap-2 mt-1">
                                {editable && (
                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 border border-emerald-200 hover:border-emerald-300 px-2.5 py-1 rounded-lg transition cursor-pointer bg-white">
                                        <Upload size={12} />
                                        {scanFile ? scanFile.name.slice(0, 18) : (scanUrl ? 'Replace' : 'Upload')}
                                        <input type="file" accept="image/jpeg" className="hidden" onChange={e => setScanFile(e.target.files?.[0] || null)} />
                                    </label>
                                )}
                                {scanUrl && (
                                    <a href={scanUrl} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-slate-700 underline">
                                        View existing
                                    </a>
                                )}
                                {!editable && !scanUrl && <span className="text-xs text-slate-400 italic">No scan</span>}
                            </div>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notes</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                disabled={!editable}
                                rows={2}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-emerald-400 resize-none"
                            />
                        </div>
                    </div>

                    {/* Items grouped by PO line item */}
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Items {mode === 'create' ? '· prefilled with pending qty from PO' : ''}
                        </p>
                        {(poItems || []).length === 0 ? (
                            <p className="text-sm text-slate-400 italic">No items on this PO.</p>
                        ) : (
                        <div className="space-y-3">
                            {(poItems || []).filter(g => (g.requirements || []).length > 0 && (g.requirements || []).some(r => !removedReqIds.has(r.id))).map(group => {
                                const Icon = TYPE_ICON[group.item_type] || Tag;
                                const groupLabel = group.item_type === 'fabric'
                                    ? `${group.fabric_type_name || 'Fabric'}${group.fabric_color_number ? ` · ${group.fabric_color_number}` : ''}${group.fabric_color_name ? ` · ${group.fabric_color_name}` : ''}`
                                    : `${group.trim_item_name || 'Trim'}${group.variant_color_number ? ` · ${group.variant_color_number}` : ''}${group.variant_color_name ? ` · ${group.variant_color_name}` : ''}${group.variant_size ? ` · Sz ${group.variant_size}` : ''}`;
                                const groupQty  = parseFloat(group.quantity ?? 0);
                                const groupUom  = group.uom || (group.item_type === 'fabric' ? 'm' : 'pcs');
                                return (
                                    <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                                            <Icon size={13} className="text-slate-500 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-slate-700 truncate">{groupLabel}</p>
                                                <p className="text-[10px] text-slate-500">
                                                    {groupQty.toLocaleString()} {groupUom} on PO
                                                    {' · '}{(group.requirements || []).length} requirement{(group.requirements || []).length === 1 ? '' : 's'}
                                                    {group.substitute_count > 0 && (
                                                        <span className="text-amber-700 font-bold"> · 🔄 {group.substitute_count} sub{group.substitute_count === 1 ? '' : 's'}</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        {group.item_type === 'trim' && (group.requirements || []).length > 1 && (
                                            <div className="px-3 py-2 border-b bg-amber-50/40 border-amber-100">
                                                <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                                                    {group.requirements.length} requirements — enter boxes per requirement below
                                                </p>
                                            </div>
                                        )}

                                        <div className="p-2 space-y-1.5">
                                            {(group.requirements || []).filter(r => !removedReqIds.has(r.id)).map(r => {
                                                const isFabricReq = group.item_type === 'fabric';
                                                const total   = parseFloat(group.quantity ?? 0) || reqTotal(r);
                                                const unit    = reqUnit(r);
                                                const pending = pendingByReq[r.id] ?? 0;

                                                if (isFabricReq) {
                                                    const rolls   = fabricRollsByReq[r.id] || [];
                                                    const sum     = sumRolls(rolls);
                                                    const over    = sum > pending + 0.001;
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
                                                                        {r.is_substitute === true && <span className="text-amber-700 font-bold"> · 🔄 sub</span>}
                                                                    </p>
                                                                </div>
                                                                {editable && (
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => addRollToReq(r.id)}
                                                                            className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:bg-violet-50 border border-violet-200 px-2 py-1 rounded-md transition"
                                                                        >
                                                                            <Plus size={11} /> Roll
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setFabricRollsByReq(prev => ({ ...prev, [r.id]: [] }));
                                                                                setRemovedReqIds(prev => new Set(prev).add(r.id));
                                                                            }}
                                                                            title="Remove from this inward"
                                                                            className="p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                                        >
                                                                            <Trash2 size={12} />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2 px-1">
                                                                    <span className="text-[9px] font-bold text-slate-400 uppercase w-24">Bale No.</span>
                                                                    <span className="text-[9px] font-bold text-slate-400 uppercase flex-1 text-right">Meters</span>
                                                                    <span className="text-[9px] font-bold text-slate-400 uppercase w-16 text-right">UOM</span>
                                                                    <span className="w-5" />
                                                                </div>
                                                                {rolls.length === 0 ? (
                                                                    <p className="text-[10px] text-slate-400 italic px-1">No rolls added — click "Roll" to record one.</p>
                                                                ) : rolls.map(roll => (
                                                                    <div key={roll._k} className="flex items-center gap-2">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="B-001"
                                                                            value={roll.bale_no}
                                                                            onChange={e => setRollFieldOnReq(r.id, roll._k, 'bale_no', e.target.value)}
                                                                            disabled={!editable}
                                                                            className="w-24 text-[11px] font-mono border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-violet-400"
                                                                        />
                                                                        <input
                                                                            type="number" step="0.01" min="0"
                                                                            placeholder="0.00"
                                                                            value={roll.meter}
                                                                            onChange={e => setRollFieldOnReq(r.id, roll._k, 'meter', e.target.value)}
                                                                            disabled={!editable}
                                                                            className="flex-1 text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums focus:outline-none focus:border-violet-400"
                                                                        />
                                                                        <select
                                                                            value={roll.uom}
                                                                            onChange={e => setRollFieldOnReq(r.id, roll._k, 'uom', e.target.value)}
                                                                            disabled={!editable}
                                                                            className="w-16 text-[11px] border border-slate-200 rounded px-1 py-1 bg-white"
                                                                        >
                                                                            <option value="meter">m</option>
                                                                            <option value="yard">yd</option>
                                                                            <option value="kg">kg</option>
                                                                        </select>
                                                                        {editable && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => removeRollFromReq(r.id, roll._k)}
                                                                                className="p-1 text-slate-300 hover:text-red-500 transition shrink-0"
                                                                            >
                                                                                <Trash2 size={11} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                // Trim: total-first UX with optional box breakdown
                                                const boxes    = trimBoxesByReq[r.id] || [];
                                                const rawTotal = trimTotalByReq[r.id] ?? '';
                                                const inThis   = boxes.length > 0 ? sumTrimBoxes(boxes) : (parseFloat(rawTotal) || 0);
                                                const over     = inThis > pending + 0.001;
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
                                                                    {boxes.length > 0 && <>{' · '}<span className={`font-bold ${over ? 'text-red-600' : 'text-violet-700'}`}>In this inward {inThis.toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit}</span></>}
                                                                    {r.unit_price != null && <span> · @ {parseFloat(r.unit_price).toFixed(2)}</span>}
                                                                    {r.is_substitute === true && <span className="text-amber-700 font-bold"> · 🔄 sub</span>}
                                                                </p>
                                                            </div>
                                                            {editable && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setRemovedReqIds(prev => new Set(prev).add(r.id))}
                                                                    title="Remove from this inward"
                                                                    className="shrink-0 p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                        {boxes.length === 0 ? (
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="number" min="0" step="any" placeholder="0"
                                                                    value={rawTotal}
                                                                    onChange={e => setTrimTotalForReq(r.id, e.target.value)}
                                                                    disabled={!editable}
                                                                    className={`w-32 text-xs text-right border rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-400 disabled:bg-white disabled:text-slate-700 ${over ? 'border-red-300' : 'border-slate-200'}`}
                                                                />
                                                                <span className="text-xs text-slate-400">{unit}</span>
                                                                {editable && (
                                                                    <button type="button"
                                                                        onClick={() => setBoxModal({ title: reqLabel(r), uom: unit, initialBoxes: [], onSave: (saved) => { if (saved.length > 0) setTrimBoxesByReq(prev => ({ ...prev, [r.id]: saved })); setBoxModal(null); } })}
                                                                        className="ml-auto flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md transition">
                                                                        <Plus size={10} /> Add box breakdown
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className={`text-xs font-bold tabular-nums ${over ? 'text-red-600' : 'text-emerald-700'}`}>
                                                                        {inThis.toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit}
                                                                    </span>
                                                                    {editable && (
                                                                        <>
                                                                            <button type="button"
                                                                                onClick={() => setBoxModal({ title: reqLabel(r), uom: unit, initialBoxes: boxes, onSave: (saved) => { if (saved.length > 0) { setTrimBoxesByReq(prev => ({ ...prev, [r.id]: saved })); } else { clearTrimBoxesForReq(r.id, inThis); } setBoxModal(null); } })}
                                                                                className="text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md transition">
                                                                                Edit
                                                                            </button>
                                                                            <button type="button" onClick={() => clearTrimBoxesForReq(r.id, inThis)}
                                                                                className="text-[10px] text-slate-400 hover:text-red-500 transition">
                                                                                Remove
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                                    {boxes.map(b => `${b.box_count}×${b.qty_per_box}`).join(' + ')}
                                                                </p>
                                                                {editable && (
                                                                    <div className="flex items-center gap-3 mt-1.5">
                                                                        <span />
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Truly free-form items (no PO link at all) — shared-header cards */}
                            {(customGroups.length > 0 || editable) && (
                                <div className="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50/40">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            Free-form additions {customGroups.length > 0 && `· ${customGroups.length} card${customGroups.length !== 1 ? 's' : ''}`}
                                        </p>
                                        {editable && (
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
                                        )}
                                    </div>
                                    {customGroups.length === 0 ? (
                                        <p className="text-[10px] text-slate-400 italic">Add a card to record items not on this PO. Share fabric type / trim item + price across multiple colors or variants.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {customGroups.map((g, gi) => {
                                                const isFabric  = g.type === 'fabric';
                                                const variants  = !isFabric ? (variantsByTrim[g.trim_item_id] || []) : [];
                                                const groupSum  = isFabric
                                                    ? g.lines.reduce((s, ln) => s + sumRolls(ln.rolls), 0)
                                                    : g.lines.reduce((s, ln) => {
                                                        const boxes = ln.boxes || [];
                                                        return s + (boxes.length > 0 ? sumTrimBoxes(boxes) : (parseFloat(ln.total) || 0));
                                                    }, 0);
                                                return (
                                                    <div key={g._k} className={`rounded-lg p-2 border ${isFabric ? 'bg-violet-50/40 border-violet-200' : 'bg-amber-50/40 border-amber-200'}`}>
                                                        {/* Card header */}
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
                                                            {editable && (
                                                                <button onClick={() => removeCustomGroup(g._k)} title="Remove card"
                                                                    className="text-slate-300 hover:text-red-500 transition">
                                                                    <Trash2 size={11} />
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Shared header fields */}
                                                        <div className="grid grid-cols-[1fr_70px_90px] gap-1.5 mb-2">
                                                            {isFabric ? (
                                                                <SearchableSelect
                                                                    value={g.fabric_type_id}
                                                                    onChange={v => setCustomGroupField(g._k, 'fabric_type_id', v)}
                                                                    options={fabricTypes.map(t => ({ value: t.id, label: t.name || t.fabric_type_name || `Type #${t.id}` }))}
                                                                    placeholder="— Fabric type —"
                                                                    disabled={!editable}
                                                                    size="xs"
                                                                    accentColor="violet"
                                                                />
                                                            ) : (
                                                                <SearchableSelect
                                                                    value={g.trim_item_id}
                                                                    onChange={v => setCustomGroupField(g._k, 'trim_item_id', v)}
                                                                    options={trimItems.map(t => ({ value: t.id, label: `${t.name || t.item_name || `Trim #${t.id}`}${t.item_code ? ` · ${t.item_code}` : ''}` }))}
                                                                    placeholder="— Trim item —"
                                                                    disabled={!editable}
                                                                    size="xs"
                                                                    accentColor="amber"
                                                                />
                                                            )}
                                                            <input type="text" placeholder="UOM"
                                                                value={g.uom}
                                                                onChange={e => setCustomGroupField(g._k, 'uom', e.target.value)}
                                                                disabled={!editable}
                                                                className="text-[11px] border border-slate-200 rounded px-1.5 py-1" />
                                                            <input type="number" min="0" step="any" placeholder="Unit price"
                                                                value={g.unit_price}
                                                                onChange={e => setCustomGroupField(g._k, 'unit_price', e.target.value)}
                                                                disabled={!editable}
                                                                className="text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums" />
                                                        </div>
                                                        <input type="text" placeholder="Description (optional, applies to all lines)"
                                                            value={g.description}
                                                            onChange={e => setCustomGroupField(g._k, 'description', e.target.value)}
                                                            disabled={!editable}
                                                            className="w-full mb-2 text-[11px] border border-slate-200 rounded px-1.5 py-1" />

                                                        {/* Lines */}
                                                        <div className="flex items-center justify-between mb-1">
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{isFabric ? 'Colors' : 'Variants'} · {g.lines.length}</p>
                                                            {editable && (
                                                                <button onClick={() => addCustomLine(g._k)}
                                                                    disabled={!isFabric && !g.trim_item_id}
                                                                    title={!isFabric && !g.trim_item_id ? 'Pick a trim first' : ''}
                                                                    className={`flex items-center gap-1 text-[10px] font-bold border px-1.5 py-0.5 rounded-md transition disabled:opacity-40 ${isFabric ? 'text-violet-600 hover:bg-violet-100 border-violet-200' : 'text-amber-600 hover:bg-amber-100 border-amber-200'}`}>
                                                                    <Plus size={10} /> Add {isFabric ? 'color' : 'variant'}
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="space-y-2">
                                                            {g.lines.map((ln, li) => (
                                                                <div key={ln._k} className="bg-white/70 rounded-md p-1.5 border border-white">
                                                                    {isFabric ? (
                                                                        <>
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <SearchableSelect
                                                                                    value={ln.fabric_color_id}
                                                                                    onChange={v => setCustomLineField(g._k, ln._k, 'fabric_color_id', v)}
                                                                                    options={fabricColors.map(co => ({ value: co.id, label: `${co.color_number ? `${co.color_number} · ` : ''}${co.color_name || `Color #${co.id}`}` }))}
                                                                                    placeholder="— Color —"
                                                                                    disabled={!editable}
                                                                                    className="flex-1 min-w-0"
                                                                                    size="xs"
                                                                                    accentColor="violet"
                                                                                />
                                                                                {editable && g.lines.length > 1 && (
                                                                                    <button onClick={() => removeCustomLine(g._k, ln._k)} title="Remove line"
                                                                                        className="p-1 text-slate-300 hover:text-red-500 transition">
                                                                                        <Trash2 size={11} />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                            <div className="space-y-1">
                                                                                {(ln.rolls || []).map(roll => (
                                                                                    <div key={roll._k} className="flex items-center gap-1.5">
                                                                                        <input type="text" placeholder="Bale"
                                                                                            value={roll.bale_no}
                                                                                            onChange={e => setRollOnCustomLine(g._k, ln._k, roll._k, 'bale_no', e.target.value)}
                                                                                            disabled={!editable}
                                                                                            className="w-20 text-[11px] font-mono border border-slate-200 rounded px-1.5 py-1" />
                                                                                        <input type="number" step="0.01" min="0" placeholder="m"
                                                                                            value={roll.meter}
                                                                                            onChange={e => setRollOnCustomLine(g._k, ln._k, roll._k, 'meter', e.target.value)}
                                                                                            disabled={!editable}
                                                                                            className="flex-1 text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums" />
                                                                                        <select value={roll.uom}
                                                                                            onChange={e => setRollOnCustomLine(g._k, ln._k, roll._k, 'uom', e.target.value)}
                                                                                            disabled={!editable}
                                                                                            className="w-14 text-[11px] border border-slate-200 rounded px-1 py-1 bg-white">
                                                                                            <option value="meter">m</option>
                                                                                            <option value="yard">yd</option>
                                                                                            <option value="kg">kg</option>
                                                                                        </select>
                                                                                        {editable && (
                                                                                            <button type="button" onClick={() => removeRollFromCustomLine(g._k, ln._k, roll._k)}
                                                                                                className="p-0.5 text-slate-300 hover:text-red-500 transition">
                                                                                                <Trash2 size={10} />
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                ))}
                                                                                {editable && (
                                                                                    <button type="button" onClick={() => addRollToCustomLine(g._k, ln._k)}
                                                                                        className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:bg-violet-100 border border-violet-200 px-1.5 py-0.5 rounded-md transition">
                                                                                        <Plus size={10} /> Roll
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </>
                                                                    ) : (
                                                                        <div className="space-y-1">
                                                                            <div className="flex items-center gap-2">
                                                                                <SearchableSelect
                                                                                    value={ln.trim_item_variant_id}
                                                                                    onChange={v => setCustomLineField(g._k, ln._k, 'trim_item_variant_id', v)}
                                                                                    options={variants.map(v => ({ value: v.id, label: `${v.color_number ? `${v.color_number} · ` : ''}${v.color_name || v.name || `Variant #${v.id}`}${v.variant_size ? ` · Sz ${v.variant_size}` : ''}` }))}
                                                                                    placeholder={g.trim_item_id ? '— Variant —' : '— Pick trim first —'}
                                                                                    disabled={!editable || !g.trim_item_id}
                                                                                    className="flex-1 min-w-0"
                                                                                    size="xs"
                                                                                    accentColor="amber"
                                                                                />
                                                                                {editable && g.lines.length > 1 && (
                                                                                    <button onClick={() => removeCustomLine(g._k, ln._k)} title="Remove line"
                                                                                        className="p-1 text-slate-300 hover:text-red-500 transition">
                                                                                        <Trash2 size={11} />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                            {(ln.boxes || []).length === 0 ? (
                                                                                <div className="flex items-center gap-2 pl-1 mt-1">
                                                                                    <input type="number" min="0" step="any" placeholder="0"
                                                                                        value={ln.total || ''}
                                                                                        onChange={e => setCustomLineField(g._k, ln._k, 'total', e.target.value)}
                                                                                        disabled={!editable}
                                                                                        className="w-24 text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums" />
                                                                                    <span className="text-[10px] text-slate-400">{g.uom || 'pcs'}</span>
                                                                                    {editable && (
                                                                                        <button type="button"
                                                                                            onClick={() => setBoxModal({ title: ln.trim_item_variant_id ? `Variant #${ln.trim_item_variant_id}` : 'Custom trim line', uom: g.uom || 'pcs', initialBoxes: [], onSave: (saved) => { if (saved.length > 0) setCustomGroups(prev => prev.map(g2 => g2._k !== g._k ? g2 : { ...g2, lines: g2.lines.map(l => l._k !== ln._k ? l : { ...l, boxes: saved }) })); setBoxModal(null); } })}
                                                                                            className="ml-auto flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md transition">
                                                                                            <Plus size={10} /> Add box breakdown
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <>
                                                                                    <div className="flex items-center gap-2 pl-1 mt-1 flex-wrap">
                                                                                        <span className="text-[11px] font-bold text-amber-700 tabular-nums">
                                                                                            {sumTrimBoxes(ln.boxes).toLocaleString(undefined, { maximumFractionDigits: 2 })} {g.uom || 'pcs'}
                                                                                        </span>
                                                                                        {editable && (
                                                                                            <>
                                                                                                <button type="button"
                                                                                                    onClick={() => setBoxModal({ title: ln.trim_item_variant_id ? `Variant #${ln.trim_item_variant_id}` : 'Custom trim line', uom: g.uom || 'pcs', initialBoxes: ln.boxes, onSave: (saved) => { const computed = sumTrimBoxes(ln.boxes); setCustomGroups(prev => prev.map(g2 => g2._k !== g._k ? g2 : { ...g2, lines: g2.lines.map(l => l._k !== ln._k ? l : saved.length > 0 ? { ...l, boxes: saved } : { ...l, boxes: [], total: computed > 0 ? String(computed) : '' }) })); setBoxModal(null); } })}
                                                                                                    className="text-[10px] font-bold text-amber-600 hover:bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md transition">
                                                                                                    Edit
                                                                                                </button>
                                                                                                <button type="button" onClick={() => { const computed = sumTrimBoxes(ln.boxes); setCustomGroups(prev => prev.map(g2 => g2._k !== g._k ? g2 : { ...g2, lines: g2.lines.map(l => l._k !== ln._k ? l : { ...l, boxes: [], total: computed > 0 ? String(computed) : '' }) })); }}
                                                                                                    className="text-[10px] text-slate-400 hover:text-red-500 transition">
                                                                                                    Remove
                                                                                                </button>
                                                                                            </>
                                                                                        )}
                                                                                    </div>
                                                                                    <p className="text-[10px] text-slate-400 font-mono pl-1 mt-0.5">
                                                                                        {(ln.boxes || []).map(b => `${b.box_count}×${b.qty_per_box}`).join(' + ')}
                                                                                    </p>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    <span className="hidden">{li}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Free-form PO items (no linked requirements) */}
                            {(poItems || []).filter(g => (g.requirements || []).length === 0 && !removedPoItemIds.has(g.id)).map(group => {
                                const Icon = TYPE_ICON[group.item_type] || Tag;
                                const isFabricGroup = group.item_type === 'fabric';
                                const groupLabel = isFabricGroup
                                    ? `${group.fabric_type_name || 'Fabric'}${group.fabric_color_number ? ` · ${group.fabric_color_number}` : ''}${group.fabric_color_name ? ` · ${group.fabric_color_name}` : ''}`
                                    : `${group.trim_item_name || 'Trim'}${group.variant_color_number ? ` · ${group.variant_color_number}` : ''}${group.variant_color_name ? ` · ${group.variant_color_name}` : ''}${group.variant_size ? ` · Sz ${group.variant_size}` : ''}`;
                                const groupQty = parseFloat(group.quantity ?? 0);
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
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <p className="text-xs font-bold text-slate-700 truncate">{groupLabel}</p>
                                                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">Free-form</span>
                                                    </div>
                                                    <p className="text-[10px] text-slate-500">
                                                        {groupQty.toLocaleString()} {groupUom} on PO
                                                        {' · '}<span className="font-bold text-emerald-600">Pending {pending.toLocaleString()} {groupUom}</span>
                                                        {' · '}<span className={`font-bold ${over ? 'text-red-600' : 'text-violet-700'}`}>In this inward {sum.toLocaleString(undefined, { maximumFractionDigits: 2 })} m</span>
                                                        {' · item #'}{group.id}
                                                    </p>
                                                </div>
                                                {editable && (
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => addRollToPoItem(group.id)}
                                                            className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:bg-violet-50 border border-violet-200 px-2 py-1 rounded-md transition"
                                                        >
                                                            <Plus size={11} /> Roll
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setFreeFormFabricRolls(prev => ({ ...prev, [group.id]: [] }));
                                                                setRemovedPoItemIds(prev => new Set(prev).add(group.id));
                                                            }}
                                                            title="Remove from this inward"
                                                            className="p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-2 space-y-1">
                                                <div className="flex items-center gap-2 px-1">
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase w-24">Bale No.</span>
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase flex-1 text-right">Meters</span>
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase w-16 text-right">UOM</span>
                                                    <span className="w-5" />
                                                </div>
                                                {rolls.length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic px-1">No rolls added — click "Roll" to record one.</p>
                                                ) : rolls.map(roll => (
                                                    <div key={roll._k} className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            placeholder="B-001"
                                                            value={roll.bale_no}
                                                            onChange={e => setRollFieldOnPoItem(group.id, roll._k, 'bale_no', e.target.value)}
                                                            disabled={!editable}
                                                            className="w-24 text-[11px] font-mono border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-violet-400"
                                                        />
                                                        <input
                                                            type="number" step="0.01" min="0"
                                                            placeholder="0.00"
                                                            value={roll.meter}
                                                            onChange={e => setRollFieldOnPoItem(group.id, roll._k, 'meter', e.target.value)}
                                                            disabled={!editable}
                                                            className="flex-1 text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums focus:outline-none focus:border-violet-400"
                                                        />
                                                        <select
                                                            value={roll.uom}
                                                            onChange={e => setRollFieldOnPoItem(group.id, roll._k, 'uom', e.target.value)}
                                                            disabled={!editable}
                                                            className="w-16 text-[11px] border border-slate-200 rounded px-1 py-1 bg-white"
                                                        >
                                                            <option value="meter">m</option>
                                                            <option value="yard">yd</option>
                                                            <option value="kg">kg</option>
                                                        </select>
                                                        {editable && (
                                                            <button
                                                                type="button"
                                                                onClick={() => removeRollFromPoItem(group.id, roll._k)}
                                                                className="p-1 text-slate-300 hover:text-red-500 transition shrink-0"
                                                            >
                                                                <Trash2 size={11} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }

                                // Trim free-form: total-first UX with optional box breakdown
                                const boxes    = freeFormTrimBoxes[group.id] || [];
                                const rawTotal = freeFormTrimTotals[group.id] ?? '';
                                const inThis   = boxes.length > 0 ? sumTrimBoxes(boxes) : (parseFloat(rawTotal) || 0);
                                const over     = inThis > pending + 0.001;
                                return (
                                    <div key={`free-${group.id}`} className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                                            <Icon size={13} className="text-slate-500 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <p className="text-xs font-bold text-slate-700 truncate">{groupLabel}</p>
                                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                                        Free-form
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-500">
                                                    {groupQty.toLocaleString()} {groupUom} on PO
                                                    {' · '}<span className="font-bold text-emerald-600">Pending {pending.toLocaleString()} {groupUom}</span>
                                                    {boxes.length > 0 && <>{' · '}<span className={`font-bold ${over ? 'text-red-600' : 'text-violet-700'}`}>In this inward {inThis.toLocaleString(undefined, { maximumFractionDigits: 2 })} {groupUom}</span></>}
                                                    {' · item #'}{group.id}
                                                </p>
                                            </div>
                                            {editable && (
                                                <button
                                                    type="button"
                                                    onClick={() => setRemovedPoItemIds(prev => new Set(prev).add(group.id))}
                                                    title="Remove from this inward"
                                                    className="shrink-0 p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                        <div className={`p-2 ${over ? 'bg-red-50' : ''}`}>
                                            {boxes.length === 0 ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number" min="0" step="any" placeholder="0"
                                                        value={rawTotal}
                                                        onChange={e => setTrimTotalForPoItem(group.id, e.target.value)}
                                                        disabled={!editable}
                                                        className={`w-32 text-xs text-right border rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-400 disabled:bg-white disabled:text-slate-700 ${over ? 'border-red-300' : 'border-slate-200'}`}
                                                    />
                                                    <span className="text-xs text-slate-400">{groupUom}</span>
                                                    {editable && (
                                                        <button type="button"
                                                            onClick={() => setBoxModal({ title: groupLabel, uom: groupUom, initialBoxes: [], onSave: (saved) => { if (saved.length > 0) setFreeFormTrimBoxes(prev => ({ ...prev, [group.id]: saved })); setBoxModal(null); } })}
                                                            className="ml-auto flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md transition">
                                                            <Plus size={10} /> Add box breakdown
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`text-xs font-bold tabular-nums ${over ? 'text-red-600' : 'text-emerald-700'}`}>
                                                            {inThis.toLocaleString(undefined, { maximumFractionDigits: 2 })} {groupUom}
                                                        </span>
                                                        {editable && (
                                                            <>
                                                                <button type="button"
                                                                    onClick={() => setBoxModal({ title: groupLabel, uom: groupUom, initialBoxes: boxes, onSave: (saved) => { if (saved.length > 0) { setFreeFormTrimBoxes(prev => ({ ...prev, [group.id]: saved })); } else { clearTrimBoxesForPoItem(group.id, inThis); } setBoxModal(null); } })}
                                                                    className="text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md transition">
                                                                    Edit
                                                                </button>
                                                                <button type="button" onClick={() => clearTrimBoxesForPoItem(group.id, inThis)}
                                                                    className="text-[10px] text-slate-400 hover:text-red-500 transition">
                                                                    Remove
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                        {boxes.map(b => `${b.box_count}×${b.qty_per_box}`).join(' + ')}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        )}
                    </div>
                    </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100">
                    <div>
                        {!reviewItems && mode === 'view' && !isCreate && inward.invoice_id == null && (
                            <button
                                onClick={handleDelete}
                                disabled={busy}
                                className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                            >
                                <Trash2 size={12} /> Delete
                            </button>
                        )}
                        {!reviewItems && mode === 'view' && !isCreate && inward.invoice_id != null && (
                            <p className="text-[10px] text-slate-400 italic">Linked to an invoice — unlink first to delete.</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {!reviewItems && mode === 'view' && (
                            <button
                                onClick={() => setMode('edit')}
                                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-emerald-600 border border-slate-200 hover:border-emerald-300 px-3 py-1.5 rounded-lg transition"
                            >
                                <Edit3 size={12} /> Edit
                            </button>
                        )}
                        {!reviewItems && editable && (
                            <>
                                <button
                                    onClick={onClose}
                                    disabled={busy}
                                    className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleReview}
                                    disabled={busy}
                                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition shadow-sm"
                                >
                                    {mode === 'create' ? 'Review & Create' : 'Review changes'}
                                </button>
                            </>
                        )}
                        {reviewItems && (
                            <>
                                <button
                                    onClick={() => { setReviewItems(null); setErr(null); }}
                                    disabled={busy}
                                    className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40"
                                >
                                    Back to edit
                                </button>
                                <button
                                    onClick={handleConfirmSave}
                                    disabled={busy}
                                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition shadow-sm"
                                >
                                    {busy && <Loader2 size={12} className="animate-spin" />}
                                    {mode === 'create' ? 'Confirm & Save' : 'Confirm changes'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
        </>
    );
}
