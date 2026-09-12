// ─── TRIM ORDER BOM VARIANCE ─────────────────────────────────────────────────
// Pure BOM × cut-pieces variance calculation for one trim item (a whole
// trimItemGroups row — BOM consumption is defined per trim item, not per
// color, so this is inherently row-scoped). Extracted out of
// TrimOrderDetailPage.jsx so both the grid's row hover-popover (a condensed
// one-liner) and the drilldown modal (the full card) compute it identically
// from the same source instead of drifting apart.

// Aggregate cutting rolls' "28: 5, 30: 5" size strings into { size: totalCutForSize }.
export const parseSizeCutMap = (cutting = []) => {
    const map = {};
    (cutting || []).forEach(c => (c.sizes || '').split(',').forEach(part => {
        const [sz, qty] = part.trim().split(':').map(s => s.trim());
        if (sz && qty) map[sz] = (map[sz] || 0) + Number(qty);
    }));
    return map;
};

const normColor = (c) => (c || 'Generic').trim().toLowerCase();

// groupItems: the trim item group's own `items` array (every color's order
// item for this trim item). refData: { bom, cutting } as loaded once at page
// level via getOrderReferenceData. refDataLoaded: whether refData has landed
// yet (undefined bomEntry vs. "confirmed no BOM entry" are different states).
// colorFilter: optional — a color_name to scope the check down to. BOM
// consumption is still matched/defined at the trim-item level (unavoidable —
// that's how the BOM stores it), but cutting rolls carry their own fabric
// color, so when a color is given both the requirement totals AND the cut
// pieces the BOM-derived quantity is built from are restricted to that one
// color. Without this, "matches/doesn't match BOM" was comparing one color's
// requirement against every color's cut pieces combined — numerically
// meaningless when allocating a specific variant. Pass null/omit to get the
// original whole-row, all-colors check (still the only option that makes
// sense for a row-level summary, e.g. the grid's hover popover).
export const computeBomVariance = (groupItems = [], refData = { bom: [], cutting: [] }, refDataLoaded = false, colorFilter = null) => {
    const scopedItems = colorFilter
        ? groupItems.filter(it => normColor(it.color_name) === normColor(colorFilter))
        : groupItems;
    const items = scopedItems.length > 0 ? scopedItems : groupItems; // fall back if nothing matched (shouldn't happen)

    const totalRequired  = items.reduce((s, it) => s + Number(it.quantity_required  || 0), 0);
    const totalFulfilled = items.reduce((s, it) => s + Number(it.quantity_fulfilled || 0), 0);
    const remaining      = Math.max(0, totalRequired - totalFulfilled);
    const pct            = totalRequired > 0 ? Math.round((totalFulfilled / totalRequired) * 100) : 0;

    // Each order item carries trim_item_id directly — match BOM entries by ID
    // (reliable, name-independent). Matched against the FULL group (every
    // color) since the BOM entry itself is defined once per trim item, not
    // per color.
    const groupItemIds = new Set(groupItems.map(it => String(it.trim_item_id)).filter(Boolean));
    const idMatchResult = (refData.bom || []).find(b => groupItemIds.has(String(b.trim_item_id)));
    const bomEntry = refDataLoaded ? idMatchResult : undefined;

    // Cutting rolls carry their own fabric color (fabric_rolls.fabric_color_id)
    // — scope them to match colorFilter so the derived quantity is built from
    // only the pieces actually cut in that color.
    const allCutting  = refData.cutting || [];
    const cuttingRows = colorFilter ? allCutting.filter(c => normColor(c.color_name) === normColor(colorFilter)) : allCutting;
    // Nothing cut in this specific color yet (or the fabric roll's color name
    // never lines up with the trim's — e.g. renamed on one side) — either way
    // there's nothing to derive a comparison from. Treat it as "no cut data"
    // rather than letting bomDerived fall through to 0, which would show a
    // false "100% over" variance against a bogus zero.
    const noCuttingForScope = colorFilter != null && cuttingRows.length === 0;

    const totalCut    = cuttingRows.reduce((s, c) => s + Number(c.total_cut || 0), 0);
    const wastage     = bomEntry ? parseFloat(bomEntry.wastage_percentage || 0) : 0;
    const wasteFactor = 1 + wastage / 100;
    const calcType    = bomEntry?.calculation_type || 'FIXED';
    // quantity_per_piece is null on PER_SIZE rows — parseFloat gives NaN, which passes `!= null`.
    const qtyPerPcRaw = bomEntry ? parseFloat(bomEntry.quantity_per_piece) : NaN;
    const qtyPerPc    = Number.isFinite(qtyPerPcRaw) ? qtyPerPcRaw : null;

    let bomDerived = null, bomFormula = null;
    if (bomEntry && !noCuttingForScope) {
        if (calcType === 'PER_SIZE') {
            const sizeCutMap = parseSizeCutMap(cuttingRows);
            const raw = (bomEntry.size_consumptions || []).reduce((sum, sc) => {
                const cut = sizeCutMap[String(sc.size)] || 0;
                return sum + sc.quantity * cut;
            }, 0);
            bomDerived = Math.round(raw * wasteFactor);
            bomFormula = `Σ(size qty × cut) × ${wasteFactor.toFixed(4)}`;
        } else if (calcType === 'FIXED' && qtyPerPc != null) {
            bomDerived = Math.round(qtyPerPc * totalCut * wasteFactor);
            bomFormula = `${qtyPerPc.toFixed(4)} × ${totalCut.toLocaleString()} × ${wasteFactor.toFixed(4)}`;
        }
    }

    const variance = bomDerived != null ? totalRequired - bomDerived : null;
    const pctOff   = (bomDerived && variance != null) ? Math.abs(Math.round((variance / bomDerived) * 100)) : 0;
    const isMatch  = variance != null && Math.abs(variance) <= 1;
    const isOver   = variance != null && variance > 0;

    return {
        totalRequired, totalFulfilled, remaining, pct,
        bomEntry, totalCut, wastage, calcType, qtyPerPc,
        bomDerived, bomFormula, variance, pctOff, isMatch, isOver,
        colorFilter, noCuttingForScope,
    };
};
