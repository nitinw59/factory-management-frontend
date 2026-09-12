// ─── TRIM ORDER CELL STATUS ─────────────────────────────────────────────────
// Status/stock helpers for the trim-order fulfillment grid (TrimOrderItemsGrid)
// and its drilldown modal (TrimOrderItemDrilldownModal). Relocated out of
// TrimOrderDetailPage.jsx — this domain's own decision vocabulary
// ('exact'|'substitute'|'insufficient'|'fulfilled' → blue|purple|red|green) is
// deliberately NOT the merchandiser planning module's requirementCellStatus.js
// (red|blue|yellow|green, no 'purple') — the two grids serve different
// questions (reserve stock vs. pick/fulfill from stock) and sharing one color
// map would blur that distinction for the same user moving between screens.

// Raw stock (available_stock / main_store_stock) minus reservations. Defensive —
// works on order items, substitute entries, and ad-hoc variant-like objects.
// Falls back to raw when reservation data isn't present on that particular variant.
export const effectiveStockOf = (v) => {
    if (!v) return 0;
    const raw = Number(v.available_stock ?? v.main_store_stock ?? v.in_stock ?? 0);
    const res = Number(v.quantity_reserved ?? 0);
    return Math.max(0, raw - res);
};
export const reservedOf = (v) => Number(v?.quantity_reserved ?? 0);

// decision → { key, label, color, order }. `color` here is this domain's own
// vocabulary (blue/green/red/purple) — see the file header note above.
export const intentDisplay = (decision, fulfillingVariant) => {
    if (decision === 'exact')        return { key: 'exact',        label: 'Exact match',                                                       color: 'blue',   order: 0 };
    if (decision === 'fulfilled')    return { key: 'fulfilled',    label: 'Already fulfilled',                                                 color: 'green',  order: 4 };
    if (decision === 'insufficient') return { key: 'insufficient', label: 'Cannot fulfill',                                                    color: 'red',    order: 3 };
    // substitute — one bucket per substitute variant id
    const v = fulfillingVariant || {};
    return {
        key:   `substitute:${v.id || 'unknown'}`,
        label: `Substitute with ${v.color_name || 'variant'}${v.color_number ? ` ${v.color_number}` : ''}`,
        color: 'purple',
        order: 1,
    };
};

// One grid cell's full status: the decision display plus whether this specific
// item has already gone out on a signed handover slip (custody transferred —
// no longer revertable).
export const getTrimOrderItemCellStatus = (item, plan) => {
    const display = intentDisplay(plan.decision, plan.fulfilling_variant);
    return {
        ...display,
        isHandedOver: (item?.fulfillment_log || []).some(log => !!log.issue_id),
    };
};

// Tailwind classes per cell color — reuses the exact tokens TrimOrderDetailPage's
// own STATUS_STYLES already uses for these same decisions, so the grid's palette
// matches today's intent-group boxes exactly (no new colors to learn).
export const CELL_COLOR_CLS = {
    blue:   'bg-blue-50 border-blue-200 hover:border-blue-300 text-blue-700',
    green:  'bg-emerald-50 border-emerald-200 hover:border-emerald-300 text-emerald-700',
    red:    'bg-red-50 border-red-200 hover:border-red-300 text-red-700',
    purple: 'bg-purple-50 border-purple-200 hover:border-purple-300 text-purple-700',
};

export const CELL_COLOR_DOT = {
    blue:   'bg-blue-500',
    green:  'bg-emerald-500',
    red:    'bg-red-500',
    purple: 'bg-purple-500',
};
