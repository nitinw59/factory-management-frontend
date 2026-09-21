// ─── SOP STAGE STATUS ────────────────────────────────────────────────────────
// Single source of truth for the 6-node lifecycle trail shown per product line
// (SOP) on the planning page: Order Details -> BOM Linked -> Requirements
// Calculated -> Fabric Reservation -> Trim Reservation -> Production Ready.
//
// Dot nodes (order/bom/requirements/ready) are a simple binary red/green read
// of fields already on `sop`/`sopReqs`. The two ring nodes (fabric/trim) are a
// reservation-coverage percentage — sum(reserved)/sum(required) across that
// SOP's requirement rows, using the same meters_*/quantity_* fields
// FabricRequirementsGrid.jsx and TrimRequirementsGrid.jsx already read — so the
// trail's fabric/trim rings always agree with what those grids show once opened.

export const STAGE_LABELS = {
    order:        'Order Details',
    bom:          'BOM Linked',
    requirements: 'Requirements',
    fabric:       'Fabric',
    trim:         'Trim',
    ready:        'Production Ready',
};

const ringPct = (requirements, requiredKey, reservedKey) => {
    const totals = (requirements || []).reduce((acc, r) => {
        acc.required += Number(r[requiredKey] || 0);
        acc.reserved += Number(r[reservedKey] || 0);
        return acc;
    }, { required: 0, reserved: 0 });
    if (totals.required <= 0) return 0;
    return Math.min(100, Math.round((totals.reserved / totals.required) * 100));
};

const ringStatus = (pct, hasRequirements) => {
    if (!hasRequirements) return 'gray';
    if (pct >= 100) return 'green';
    if (pct <= 0) return 'gray';
    return 'partial';
};

// sop: one entry from orderDetail.products (has bom_id, production_readiness, ...)
// sopReqs: result of planningApi.getRequirements(sop.id), or null if not yet fetched/no BOM
export const getSopStages = (sop, sopReqs) => {
    const fabricReqs = sopReqs?.fabric_requirements || [];
    const trimReqs    = sopReqs?.trim_requirements   || [];
    const hasBom      = !!sop.bom_id;
    const hasReqs     = fabricReqs.length + trimReqs.length > 0;
    const isReady     = sop.production_readiness === 'ready_for_production' || sop.production_readiness === 'force_ready';

    const fabricPct = ringPct(fabricReqs, 'meters_required', 'meters_reserved');
    const trimPct   = ringPct(trimReqs, 'quantity_required', 'quantity_reserved');

    return [
        { key: 'order',        label: STAGE_LABELS.order,        kind: 'dot',  status: 'info' },
        { key: 'bom',          label: STAGE_LABELS.bom,          kind: 'dot',  status: hasBom ? 'green' : 'red' },
        { key: 'requirements', label: STAGE_LABELS.requirements, kind: 'dot',  status: !hasBom ? 'disabled' : hasReqs ? 'green' : 'red' },
        { key: 'fabric',       label: STAGE_LABELS.fabric,       kind: 'ring', pct: fabricPct, status: ringStatus(fabricPct, fabricReqs.length > 0) },
        { key: 'trim',         label: STAGE_LABELS.trim,         kind: 'ring', pct: trimPct,   status: ringStatus(trimPct, trimReqs.length > 0) },
        { key: 'ready',        label: STAGE_LABELS.ready,        kind: 'dot',  status: isReady ? 'green' : 'red' },
    ];
};
