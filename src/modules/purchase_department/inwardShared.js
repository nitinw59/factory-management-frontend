import { Package, Scissors, Tag, Wrench } from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────
export const TYPE_ICON = { fabric: Package, trim: Scissors, spare: Wrench, other: Tag };

// Resolves an inward-edit 409's structured `blocked_by` payload (see
// docs/purchase-department/edit-inward-backend-spec.md §5) into human-readable
// lines, using the inward's own already-loaded items[] for labels — the
// backend intentionally doesn't resolve friendly names itself.
export const describeEditBlock = (blockedBy, items = []) => {
    if (!blockedBy) return [];
    const byItemId = new Map(items.map(it => [String(it.id), it]));
    const lines = [];
    (blockedBy.fabric_rolls || []).forEach(b => {
        const it = byItemId.get(String(b.inward_item_id));
        const label = it ? (it.fabric_type_name || 'Fabric') : 'Fabric roll';
        lines.push(`${label} · bale ${b.bale_no || '—'} is already ${uomLikeStatus(b.status)} — not editable.`);
    });
    (blockedBy.consumption_floor || []).forEach(b => {
        const it = byItemId.get(String(b.inward_item_id));
        const label = it
            ? (it.trim_item_name || it.spare_part_name || it.general_item_name || `${b.item_type} item`)
            : `${b.item_type} item`;
        lines.push(`${label} · current stock (${b.current_stock}) is below what this inward received (${b.original_qty}) — some has already been used.`);
    });
    return lines;
};

const uomLikeStatus = (status) => (status || 'unavailable').toString().toLowerCase().replace(/_/g, ' ');

// ── Pure label/value helpers ────────────────────────────────────────────────
export const reqTotal = (r) =>
    parseFloat(r.meters_required ?? r.quantity_required ?? 0);

export const reqUnit = (r) =>
    r.unit_of_measure || (r.type === 'fabric' ? 'm' : 'pcs');

// Compact label for a requirement row. Often joined names live on the parent
// PO item, not the requirement — prefer labelFromGroup when rendering reviews.
export const reqLabel = (r) => {
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

// { name, details } split — used by review summaries so the name stays bold
// on its own line and the variant detail wraps cleanly underneath.
export const labelFromGroup = (g) => {
    if (!g) return { name: '', details: '' };
    if (g.item_type === 'fabric') {
        const parts = [];
        if (g.fabric_color_number) parts.push(g.fabric_color_number);
        if (g.fabric_color_name)   parts.push(g.fabric_color_name);
        return { name: g.fabric_type_name || 'Fabric', details: parts.join(' · ') };
    }
    if (g.item_type === 'spare') {
        return { name: g.spare_part_name || 'Spare part', details: g.spare_part_code || '' };
    }
    if (g.item_type === 'other') {
        return { name: g.general_item_name || g.item_name || 'Item', details: g.description || '' };
    }
    const parts = [];
    if (g.variant_color_number) parts.push(g.variant_color_number);
    if (g.variant_color_name)   parts.push(g.variant_color_name);
    if (g.variant_size)         parts.push(`Sz ${g.variant_size}`);
    return { name: g.trim_item_name || 'Trim', details: parts.join(' · ') };
};

// ── UOM helpers (fabric rolls) ───────────────────────────────────────────────
export const UOM_OPTIONS = [
    { value: 'meter', label: 'm' },
    { value: 'yard',  label: 'yd' },
    { value: 'kg',    label: 'kg' },
];
export const uomLabel = (uom) => UOM_OPTIONS.find(u => u.value === uom)?.label || uom || 'm';

// ── Roll helpers (fabric) ────────────────────────────────────────────────────
export const rk = () => Math.random().toString(36).slice(2);

export const newRoll = (init = {}) => ({
    _k:      rk(),
    bale_no: init.bale_no ?? '',
    meter:   init.meter   != null ? String(init.meter) : '',
    uom:     init.uom     ?? 'meter',
});

export const sumRolls = (rolls) =>
    (rolls || []).reduce((s, r) => s + (parseFloat(r.meter) || 0), 0);

export const mapRolls = (rolls) => (rolls || [])
    .filter(r => parseFloat(r.meter) > 0)
    .map(r => ({
        bale_no: r.bale_no?.trim() ? r.bale_no.trim() : null,
        meter:   parseFloat(r.meter),
        uom:     r.uom || 'meter',
    }));

// Distribute physical fabric rolls across ordered targets (requirements or PO
// items) in FCFS order, capped by each target's pending qty. A roll that
// straddles a cap boundary is split into fragments that keep the same
// bale_no/uom, so every received metre stays tied to a real bale instead of
// being collapsed into one anonymous total. The final target absorbs any
// over-receipt (its cap is treated as unbounded) so no metres are ever dropped
// — approval downstream catches the excess. Targets are [{ id, cap }]; returns
// { [id]: [{ _k, bale_no, meter, uom }] } with only the non-empty buckets.
export const distributeRolls = (rolls, targets) => {
    const out = {};
    const queue = mapRolls(rolls).map(r => ({ ...r })); // { bale_no:string|null, meter:number, uom }
    let qi = 0;
    (targets || []).forEach((t, idx) => {
        const isLast = idx === targets.length - 1;
        let cap = isLast ? Infinity : Math.max(0, t.cap || 0);
        const bucket = [];
        while (qi < queue.length && cap > 1e-6) {
            const roll = queue[qi];
            const take = Math.min(roll.meter, cap);
            bucket.push({ _k: rk(), bale_no: roll.bale_no ?? '', meter: String(take), uom: roll.uom || 'meter' });
            roll.meter -= take;
            cap -= take;
            if (roll.meter <= 1e-6) qi += 1;
        }
        if (bucket.length > 0) out[t.id] = bucket;
    });
    return out;
};

// ── Box helpers (trim) ───────────────────────────────────────────────────────
// Trim items are received in boxes: N boxes × Q per box = total qty.
export const newTrimBox = (init = {}) => ({
    _k:          rk(),
    box_count:   init.box_count   != null ? String(init.box_count)   : '',
    qty_per_box: init.qty_per_box != null ? String(init.qty_per_box) : '',
});

export const sumTrimBoxes = (boxes) =>
    (boxes || []).reduce((s, b) => s + (parseFloat(b.box_count) || 0) * (parseFloat(b.qty_per_box) || 0), 0);

export const mapTrimBoxes = (boxes) =>
    (boxes || [])
        .filter(b => (parseFloat(b.box_count) || 0) > 0 && (parseFloat(b.qty_per_box) || 0) > 0)
        .map(b => ({ box_count: parseFloat(b.box_count), qty_per_box: parseFloat(b.qty_per_box) }));

// ── Pending qty maps ────────────────────────────────────────────────────────
// Pending qty per requirement, excluding the inward being edited (if any).
// Baseline is the parent PO item's ordered quantity, NOT the requirement's own qty.
export const pendingByReqMap = (allRequirements, allInwards, currentInward, poItems = []) => {
    // Build req id → parent PO item ordered qty
    const reqToPoQty = {};
    (poItems || []).forEach(p => {
        const poQty = parseFloat(p.quantity ?? 0);
        (p.requirements || []).forEach(r => { reqToPoQty[r.id] = poQty; });
    });

    const otherReceived = {};
    (allInwards || []).forEach(iw => {
        if (currentInward && iw.id === currentInward.id) return;
        (iw.items || []).forEach(it => {
            otherReceived[it.purchase_requirement_id] =
                (otherReceived[it.purchase_requirement_id] || 0) + parseFloat(it.qty_received || 0);
        });
    });
    const map = {};
    (allRequirements || []).forEach(r => {
        const baseline = reqToPoQty[r.id] ?? reqTotal(r); // fallback to req qty if lookup fails
        map[r.id] = Math.max(0, baseline - (otherReceived[r.id] || 0));
    });
    return map;
};

// Pending qty per free-form PO item (items with no requirements).
export const pendingByPoItemMap = (poItems, allInwards, currentInward) => {
    const otherReceived = {};
    (allInwards || []).forEach(iw => {
        if (currentInward && iw.id === currentInward.id) return;
        (iw.items || []).forEach(it => {
            if (it.purchase_order_item_id != null) {
                otherReceived[it.purchase_order_item_id] =
                    (otherReceived[it.purchase_order_item_id] || 0) + parseFloat(it.qty_received || 0);
            }
        });
    });
    const map = {};
    (poItems || []).forEach(p => {
        if ((p.requirements || []).length > 0) return;
        const total = parseFloat(p.quantity ?? 0);
        map[p.id] = Math.max(0, total - (otherReceived[p.id] || 0));
    });
    return map;
};

// ── Build API items from form state ─────────────────────────────────────────
// Returns { items, error }. error non-null means validation failed.
//
// Each trim entry supports two modes:
//   Total-only  — no boxes entered; uses trimTotalByReq[reqId] as qty_received
//   Box breakdown — boxes exist; qty_received = sum(box_count × qty_per_box), boxes sent too
//
// State shape:
//   trimTotalByReq      { [reqId]:    string }                             ← total-only mode
//   trimBoxesByReq      { [reqId]:    [{ _k, box_count, qty_per_box }] }  ← breakdown mode
//   fabricRollsByReq    { [reqId]:    [{ _k, bale_no, meter, uom }]   }
//   freeFormTrimTotals  { [poItemId]: string }
//   freeFormTrimBoxes   { [poItemId]: [{ _k, box_count, qty_per_box }] }
//   freeFormFabricRolls { [poItemId]: [{ _k, bale_no, meter, uom }]   }
//   customGroups        [{ type, lines: [{ trim_item_variant_id, total, boxes }|{ fabric_color_id, rolls }] }]
export const buildItemsFromState = (state) => {
    const {
        trimTotalByReq, trimBoxesByReq,
        fabricRollsByReq,
        freeFormTrimTotals, freeFormTrimBoxes,
        freeFormFabricRolls,
        customGroups,
        // Optional — a PO-linked line's actual received rate, when it differs
        // from what the PO/requirement itself already carries. Left blank
        // (or entirely omitted), the backend falls back to the PO's own
        // unit_price server-side (resolveInwardItemContext), so these maps
        // only need entries for lines the user actually priced.
        unitPriceByReq,
        unitPriceByPoItem,
    } = state;
    const priceForReq    = (reqId) => { const v = (unitPriceByReq    || {})[reqId]; return v === '' || v == null ? null : parseFloat(v); };
    const priceForPoItem = (poItemId) => { const v = (unitPriceByPoItem || {})[poItemId]; return v === '' || v == null ? null : parseFloat(v); };

    // Trim req entries — box breakdown takes priority over total-only
    const reqIds = new Set([
        ...Object.keys(trimBoxesByReq || {}),
        ...Object.keys(trimTotalByReq || {}),
    ]);
    const reqEntries = [];
    for (const reqId of reqIds) {
        const boxes = mapTrimBoxes((trimBoxesByReq || {})[reqId]);
        if (boxes.length > 0) {
            reqEntries.push({
                requirement_id: parseInt(reqId, 10),
                qty_received:   boxes.reduce((s, b) => s + b.box_count * b.qty_per_box, 0),
                boxes,
                unit_price:     priceForReq(reqId),
            });
        } else {
            const q = parseFloat(((trimTotalByReq || {})[reqId]) ?? 0);
            if (q > 0) reqEntries.push({ requirement_id: parseInt(reqId, 10), qty_received: q, unit_price: priceForReq(reqId) });
        }
    }

    const fabricReqEntries = Object.entries(fabricRollsByReq || {})
        .map(([reqId, rolls]) => ({ reqId: parseInt(reqId, 10), rolls: mapRolls(rolls) }))
        .filter(x => x.rolls.length > 0)
        .map(x => ({
            requirement_id: x.reqId,
            qty_received:   x.rolls.reduce((s, r) => s + r.meter, 0),
            rolls:          x.rolls,
            unit_price:     priceForReq(x.reqId),
        }));

    // Free-form trim entries — same dual-mode
    const poIds = new Set([
        ...Object.keys(freeFormTrimBoxes || {}),
        ...Object.keys(freeFormTrimTotals || {}),
    ]);
    const freeEntries = [];
    for (const poItemId of poIds) {
        const boxes = mapTrimBoxes((freeFormTrimBoxes || {})[poItemId]);
        if (boxes.length > 0) {
            freeEntries.push({
                purchase_order_item_id: parseInt(poItemId, 10),
                qty_received:           boxes.reduce((s, b) => s + b.box_count * b.qty_per_box, 0),
                boxes,
                unit_price:             priceForPoItem(poItemId),
            });
        } else {
            const q = parseFloat(((freeFormTrimTotals || {})[poItemId]) ?? 0);
            if (q > 0) freeEntries.push({ purchase_order_item_id: parseInt(poItemId, 10), qty_received: q, unit_price: priceForPoItem(poItemId) });
        }
    }

    const fabricFreeEntries = Object.entries(freeFormFabricRolls || {})
        .map(([poItemId, rolls]) => ({ poItemId: parseInt(poItemId, 10), rolls: mapRolls(rolls) }))
        .filter(x => x.rolls.length > 0)
        .map(x => ({
            purchase_order_item_id: x.poItemId,
            qty_received:           x.rolls.reduce((s, r) => s + r.meter, 0),
            rolls:                  x.rolls,
            unit_price:             priceForPoItem(x.poItemId),
        }));

    const customEntries = [];
    for (const [gi, g] of (customGroups || []).entries()) {
        const groupLabel = `Free-form ${g.type} card #${gi + 1}`;
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
                continue;
            }
            // Non-fabric (trim / spare / other) — all support box breakdown or a plain total.
            const boxes = mapTrimBoxes(ln.boxes);
            const q = boxes.length > 0 ? sumTrimBoxes(ln.boxes) : parseFloat(ln.total ?? 0);
            if (!q || q <= 0) continue;
            if (g.type === 'trim') {
                if (!g.trim_item_id)          return { items: null, error: `${groupLabel}: pick a trim item.` };
                if (!ln.trim_item_variant_id) return { items: null, error: `${groupLabel}, line ${li + 1}: pick a variant.` };
                const entry = { item_type: 'trim', qty_received: q, trim_item_variant_id: parseInt(ln.trim_item_variant_id, 10), unit_price: unitPrice, description: g.description || null };
                if (boxes.length > 0) entry.boxes = boxes;
                customEntries.push(entry);
            } else if (g.type === 'spare') {
                if (!ln.spare_part_id) return { items: null, error: `${groupLabel}, line ${li + 1}: pick a spare part.` };
                const entry = { item_type: 'spare', qty_received: q, spare_part_id: parseInt(ln.spare_part_id, 10), unit_price: unitPrice, description: g.description || null };
                if (boxes.length > 0) entry.boxes = boxes;
                customEntries.push(entry);
            } else { // 'other'
                if (!ln.general_item_id) return { items: null, error: `${groupLabel}, line ${li + 1}: pick an item.` };
                const entry = { item_type: 'other', qty_received: q, general_item_id: parseInt(ln.general_item_id, 10), description: ln.description?.trim() || g.description || null, uom: ln.uom || 'pcs', unit_price: unitPrice };
                if (boxes.length > 0) entry.boxes = boxes;
                customEntries.push(entry);
            }
        }
    }

    const itemsArr = [...reqEntries, ...fabricReqEntries, ...freeEntries, ...fabricFreeEntries, ...customEntries];
    if (itemsArr.length === 0) return { items: null, error: 'Add at least one item (rolls for fabric, qty for trim).' };
    return { items: itemsArr, error: null };
};

// ── Reverse mappers — inward.items[] → form state (Edit Inward) ─────────────
// These invert buildItemsFromState/emptyLine so an existing inward's already
// -received items can prefill the create forms for editing. Source data is
// whatever the list endpoints (listAllInwards/listInwardsForPO) already embed
// per item — see loadInwardItemsDetailed on the backend: raw FK ids
// (fabric_type_id, fabric_color_id, trim_item_variant_id, spare_part_id,
// general_item_id), qty_received, unit_price, description, uom, and a
// `rolls[]` array (with live `status`) for fabric lines. Note: box-count
// breakdowns are not persisted server-side — only the summed qty_received
// comes back, so a re-opened box-breakdown line prefills as a plain total.

// Same PO-item→variant merge key InwardCreateModal uses (`ffVarKey`), needed
// here so a seeded snapshot survives that component's own group→req FCFS
// distribution step unchanged instead of being overwritten by its "still
// pending" defaults.
const ffVarKeyOf = (g) => g.item_type === 'fabric'
    ? `fabric_${g.fabric_type_id}_${g.fabric_color_id}`
    : `trim_${g.trim_item_variant_id}`;

// Builds an InwardCreateModal `initialSnapshot` (PO-linked edit path) from an
// existing inward's items[] + the PO's joined items. `trimItems` (optional)
// is used only to resolve a customGroups trim line's parent trim_item_id from
// its (item_code|name) — the backend doesn't return that raw id for fully
// unlinked/custom lines, only the joined name/code.
export const seedSnapshotFromInward = (inward, poItems = [], { trimItems = [] } = {}) => {
    const items = inward?.items || [];

    const trimTotalByReq = {}, trimBoxesByReq = {}, fabricRollsByReq = {};
    const freeFormTrimTotals = {}, freeFormTrimBoxes = {}, freeFormFabricRolls = {};
    const trimTotalByGroup = {}, fabricRollsByGroup = {};
    const freeFormTrimTotalsByVar = {}, freeFormFabricRollsByVar = {};
    const unitPriceByGroup = {}, unitPriceByVarGroup = {};
    const customGroups = [];

    const reqToGroup = {};
    (poItems || []).forEach(g => (g.requirements || []).forEach(r => { reqToGroup[r.id] = g; }));

    items.forEach(it => {
        const isFabric = it.item_type === 'fabric';
        const rolls = (it.rolls || []).map(r => newRoll(r));

        if (it.purchase_requirement_id != null) {
            const rid = it.purchase_requirement_id;
            const group = reqToGroup[rid];
            if (isFabric) {
                fabricRollsByReq[rid] = rolls.length ? rolls : [newRoll()];
                if (group) fabricRollsByGroup[group.id] = [...(fabricRollsByGroup[group.id] || []), ...rolls];
            } else {
                if (it.boxes?.length) trimBoxesByReq[rid] = it.boxes.map(b => newTrimBox(b));
                else trimTotalByReq[rid] = String(it.qty_received ?? '');
                if (group) {
                    trimTotalByGroup[group.id] = String(
                        (parseFloat(trimTotalByGroup[group.id]) || 0) + (parseFloat(it.qty_received) || 0));
                }
            }
            // Best-effort: seed the group's price input from whichever item in
            // it has one set. Items within a group were priced together via one
            // shared input, so the first non-null value found is representative.
            if (group && it.unit_price != null && unitPriceByGroup[group.id] == null) {
                unitPriceByGroup[group.id] = String(it.unit_price);
            }
        } else if (it.purchase_order_item_id != null) {
            const pid = it.purchase_order_item_id;
            const group = (poItems || []).find(g => String(g.id) === String(pid));
            const key = group ? ffVarKeyOf(group) : null;
            if (isFabric) {
                freeFormFabricRolls[pid] = rolls.length ? rolls : [newRoll()];
                if (key) freeFormFabricRollsByVar[key] = [...(freeFormFabricRollsByVar[key] || []), ...rolls];
            } else {
                if (it.boxes?.length) freeFormTrimBoxes[pid] = it.boxes.map(b => newTrimBox(b));
                else freeFormTrimTotals[pid] = String(it.qty_received ?? '');
                if (key) {
                    freeFormTrimTotalsByVar[key] = String(
                        (parseFloat(freeFormTrimTotalsByVar[key]) || 0) + (parseFloat(it.qty_received) || 0));
                }
            }
            if (key && it.unit_price != null && unitPriceByVarGroup[key] == null) {
                unitPriceByVarGroup[key] = String(it.unit_price);
            }
        } else if (isFabric) {
            customGroups.push({
                type: 'fabric',
                fabric_type_id: it.fabric_type_id != null ? String(it.fabric_type_id) : '',
                description: it.description || '',
                unit_price: it.unit_price != null ? String(it.unit_price) : '',
                lines: [{ fabric_color_id: it.fabric_color_id != null ? String(it.fabric_color_id) : '', rolls: rolls.length ? rolls : [newRoll()] }],
            });
        } else if (it.item_type === 'trim') {
            const parent = trimItems.find(t =>
                (it.trim_item_code && t.item_code === it.trim_item_code) ||
                (!it.trim_item_code && it.trim_item_name && t.name === it.trim_item_name));
            customGroups.push({
                type: 'trim',
                trim_item_id: parent ? String(parent.id) : '',
                description: it.description || '',
                unit_price: it.unit_price != null ? String(it.unit_price) : '',
                lines: [{
                    trim_item_variant_id: it.trim_item_variant_id != null ? String(it.trim_item_variant_id) : '',
                    total: it.boxes?.length ? '' : String(it.qty_received ?? ''),
                    boxes: (it.boxes || []).map(b => newTrimBox(b)),
                }],
            });
        } else if (it.item_type === 'spare') {
            customGroups.push({
                type: 'spare',
                description: it.description || '',
                unit_price: it.unit_price != null ? String(it.unit_price) : '',
                lines: [{
                    spare_part_id: it.spare_part_id != null ? String(it.spare_part_id) : '',
                    total: it.boxes?.length ? '' : String(it.qty_received ?? ''),
                    boxes: (it.boxes || []).map(b => newTrimBox(b)),
                }],
            });
        } else {
            customGroups.push({
                type: 'other',
                description: it.description || '',
                unit_price: it.unit_price != null ? String(it.unit_price) : '',
                lines: [{
                    general_item_id: it.general_item_id != null ? String(it.general_item_id) : '',
                    description: it.description || '',
                    uom: it.uom || it.general_item_uom || 'pcs',
                    total: it.boxes?.length ? '' : String(it.qty_received ?? ''),
                    boxes: (it.boxes || []).map(b => newTrimBox(b)),
                }],
            });
        }
    });

    return {
        receivedDate: inward?.received_date ? String(inward.received_date).slice(0, 10) : undefined,
        condition:    inward?.condition || 'GOOD',
        notes:        inward?.notes || '',
        scanFile:     null,
        trimTotalByReq, trimBoxesByReq, fabricRollsByReq,
        freeFormTrimTotals, freeFormTrimBoxes, freeFormFabricRolls,
        customGroups,
        removedReqIds: [], removedPoItemIds: [],
        trimTotalByGroup, fabricRollsByGroup,
        freeFormTrimTotalsByVar, freeFormFabricRollsByVar,
        unitPriceByGroup, unitPriceByVarGroup,
        removedGroupIds: [], removedVarGroupKeys: [],
    };
};

// Builds a StandaloneInwardModal `lines[]` array (free-form edit path) from an
// existing standalone inward's items[]. Standalone inwards never carry a
// purchase_requirement_id/purchase_order_item_id, so every item maps 1:1 to a
// line — no group/distribution logic needed here, unlike seedSnapshotFromInward.
export const seedLinesFromInward = (inward, { trimItems = [] } = {}) => {
    const items = inward?.items || [];
    if (items.length === 0) return null;
    return items.map(it => {
        const type = it.item_type || 'trim';
        const base = {
            _k: rk(), type,
            fabric_type_id: '', fabric_color_id: '', rolls: [newRoll()],
            trim_item_id: '', trim_item_variant_id: '', qty: '',
            spare_part_id: '', spare_qty: '',
            general_item_id: '', description: it.description || '', other_qty: '', uom: 'pcs',
            unit_price: it.unit_price != null ? String(it.unit_price) : '',
            boxes: (it.boxes || []).map(b => newTrimBox(b)),
        };
        if (type === 'fabric') {
            return {
                ...base,
                fabric_type_id:  it.fabric_type_id  != null ? String(it.fabric_type_id)  : '',
                fabric_color_id: it.fabric_color_id != null ? String(it.fabric_color_id) : '',
                rolls: (it.rolls || []).length ? it.rolls.map(r => newRoll(r)) : [newRoll()],
            };
        }
        if (type === 'trim') {
            const parent = trimItems.find(t =>
                (it.trim_item_code && t.item_code === it.trim_item_code) ||
                (!it.trim_item_code && it.trim_item_name && t.name === it.trim_item_name));
            return {
                ...base,
                trim_item_id: parent ? String(parent.id) : '',
                trim_item_variant_id: it.trim_item_variant_id != null ? String(it.trim_item_variant_id) : '',
                qty: it.boxes?.length ? '' : String(it.qty_received ?? ''),
            };
        }
        if (type === 'spare') {
            return {
                ...base,
                spare_part_id: it.spare_part_id != null ? String(it.spare_part_id) : '',
                spare_qty: it.boxes?.length ? '' : String(it.qty_received ?? ''),
            };
        }
        return {
            ...base,
            type: 'other',
            general_item_id: it.general_item_id != null ? String(it.general_item_id) : '',
            other_qty: it.boxes?.length ? '' : String(it.qty_received ?? ''),
            uom: it.uom || it.general_item_uom || 'pcs',
        };
    });
};
