import { Package, Scissors, Tag, Wrench } from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────
export const TYPE_ICON = { fabric: Package, trim: Scissors, spare: Wrench, other: Tag };

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
    } = state;

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
            });
        } else {
            const q = parseFloat(((trimTotalByReq || {})[reqId]) ?? 0);
            if (q > 0) reqEntries.push({ requirement_id: parseInt(reqId, 10), qty_received: q });
        }
    }

    const fabricReqEntries = Object.entries(fabricRollsByReq || {})
        .map(([reqId, rolls]) => ({ reqId: parseInt(reqId, 10), rolls: mapRolls(rolls) }))
        .filter(x => x.rolls.length > 0)
        .map(x => ({
            requirement_id: x.reqId,
            qty_received:   x.rolls.reduce((s, r) => s + r.meter, 0),
            rolls:          x.rolls,
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
            });
        } else {
            const q = parseFloat(((freeFormTrimTotals || {})[poItemId]) ?? 0);
            if (q > 0) freeEntries.push({ purchase_order_item_id: parseInt(poItemId, 10), qty_received: q });
        }
    }

    const fabricFreeEntries = Object.entries(freeFormFabricRolls || {})
        .map(([poItemId, rolls]) => ({ poItemId: parseInt(poItemId, 10), rolls: mapRolls(rolls) }))
        .filter(x => x.rolls.length > 0)
        .map(x => ({
            purchase_order_item_id: x.poItemId,
            qty_received:           x.rolls.reduce((s, r) => s + r.meter, 0),
            rolls:                  x.rolls,
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
