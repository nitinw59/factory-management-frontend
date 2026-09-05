// ─── REQUIREMENT CELL STATUS ────────────────────────────────────────────────
// Single source of truth for how a fabric/trim requirement maps to one of the
// grid's four cell colors. Deliberately NOT re-derived from raw quantities the
// way the old ProductionTrackingModal did (client-side `reserved >= required`,
// which disagreed with the backend's own `is_fulfilled` since that also counts
// outstanding purchase requirements as coverage). Instead this reads the
// backend's own per-requirement `status` enum directly, and treats an open
// purchase requirement as a separate "pending on procurement" signal.
//
// Shared across FabricRequirementsGrid, TrimRequirementsGrid, and
// RequirementCellDrilldownModal — a deliberate, small exception to this
// codebase's usual "declare status colors locally per file" convention,
// because all three need to agree on exactly the same mapping.

// purchase_requirements.status values confirmed against the backend
// (purchaseDepartmentController.js): PENDING, PO_RAISED are open/in-flight;
// FULFILLED and CANCELLED are terminal/closed.
const OPEN_PR_STATUSES = ['PENDING', 'PO_RAISED'];

const hasOpenPR = (requirement) =>
    (requirement?.purchase_requirements || []).some(pr =>
        OPEN_PR_STATUSES.includes(String(pr.status || '').toUpperCase())
    );

// cellColor: 'red' | 'blue' | 'yellow' | 'green'
const statusFromReserved = (status, reservedQty, requirement) => {
    const hasPR = hasOpenPR(requirement);
    if (status === 'PARTIALLY_RESERVED' || (reservedQty > 0 && status !== 'RESERVED' && status !== 'FULFILLED')) {
        return { color: 'blue', label: 'Partially reserved' };
    }
    if (status === 'RESERVED' || status === 'FULFILLED') {
        return { color: 'green', label: status === 'FULFILLED' ? 'Fulfilled' : 'Fully reserved' };
    }
    // PENDING (or unrecognized) with nothing reserved
    if (hasPR) return { color: 'yellow', label: 'Pending — procurement raised' };
    return { color: 'red', label: 'Nothing reserved' };
};

export const getFabricCellStatus = (requirement) => {
    if (!requirement) return null;
    const reserved = Number(requirement.meters_reserved || 0);
    const { color, label } = statusFromReserved(requirement.status, reserved, requirement);
    return {
        color,
        label,
        hasOpenPR: hasOpenPR(requirement),
        isFulfilled: !!requirement.is_fulfilled,
    };
};

export const getTrimCellStatus = (requirement) => {
    if (!requirement) return null;
    const reserved = Number(requirement.quantity_reserved || 0);
    const { color, label } = statusFromReserved(requirement.status, reserved, requirement);
    return {
        color,
        label,
        hasOpenPR: hasOpenPR(requirement),
        isFulfilled: !!requirement.is_fulfilled,
    };
};

// Tailwind classes per cell color — one place every grid/legend pulls from.
export const CELL_COLOR_CLS = {
    red:    'bg-red-50 border-red-200 hover:border-red-300 text-red-700',
    blue:   'bg-blue-50 border-blue-200 hover:border-blue-300 text-blue-700',
    yellow: 'bg-amber-50 border-amber-200 hover:border-amber-300 text-amber-700',
    green:  'bg-emerald-50 border-emerald-200 hover:border-emerald-300 text-emerald-700',
    orphan: 'bg-slate-100 border-slate-300 border-dashed text-slate-400',
};

export const CELL_COLOR_DOT = {
    red:    'bg-red-500',
    blue:   'bg-blue-500',
    yellow: 'bg-amber-500',
    green:  'bg-emerald-500',
};
