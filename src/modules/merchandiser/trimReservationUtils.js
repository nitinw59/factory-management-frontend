// ─── TRIM RESERVATION UTILS ─────────────────────────────────────────────────
// Shared logic for "which physical variant actually got reserved against
// which requested color" — feeds both the trim grid's hover summary (see
// TrimRequirementsGrid) and the trim requirements Excel export's summary sheet
// (see trimRequirementsExcelExport.js).

export const nameAndNumber = (name, number) => {
    if (name && number) return `${name} (${number})`;
    if (name)            return name;
    if (number)          return String(number);
    return '—';
};

// Normalizes one requirement's raw reservations: derives is_substitute (the
// backend doesn't send it directly on getSopRequirements) by comparing each
// reservation's variant to the requirement's own exact-match variant, and
// normalizes the variant's item/color fields to plain names.
export const deriveTrimReservations = (requirement) => {
    const exactVariantId = requirement.stock_suggestion?.exact_variant?.id ?? null;
    return (requirement.reservations || []).map(rs => {
        const rsVariantId = rs.trim_item_variant_id ?? null;
        const isSub = rs.is_substitute != null
            ? !!rs.is_substitute
            : (rsVariantId != null && exactVariantId != null && String(rsVariantId) !== String(exactVariantId));
        return {
            ...rs,
            is_substitute: isSub,
            item_name:    rs.variant_item_name   ?? requirement.trim_item_name,
            color_name:   rs.color_name   ?? rs.variant_color_name   ?? null,
            color_number: rs.color_number ?? rs.variant_color_number ?? null,
        };
    });
};

// Groups a flat trim_requirements array by trim_item_id — e.g. for looking up
// "every requirement (any color/size) belonging to this grid row's trim item".
export const groupTrimRequirementsByItemId = (trimRequirements = []) => {
    const map = new Map();
    trimRequirements.forEach(r => {
        const key = String(r.trim_item_id);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(r);
    });
    return map;
};

// Flattens a set of trim requirements into one row per actual reservation
// record (not one row per requirement — a single color's requirement can be
// split across more than one reservation, e.g. a partial exact match plus a
// substitute topping up the rest). Only requirements with at least one
// reservation produce rows. This is the exact "Reserved Variant / Reserved
// Variant Color / Requested Variant / Required / Reserved / Substitute" shape
// used both by the grid's hover summary and the Excel summary sheet.
export const buildReservedVariantRows = (trimRequirements = []) => {
    const rows = [];
    trimRequirements.forEach(req => {
        deriveTrimReservations(req).forEach(rs => {
            rows.push({
                reservation_id:          rs.id,
                trim_item_id:            req.trim_item_id,
                trim_item_name:          req.trim_item_name,
                item_code:               req.item_code,
                unit:                    req.unit_of_measure || 'pcs',
                reserved_item_name:      rs.item_name,
                reserved_color_name:     rs.color_name,
                reserved_color_number:   rs.color_number,
                requested_color_name:    req.color_name,
                requested_color_number:  req.color_number,
                required:                Number(req.quantity_required || 0),
                reserved:                Number(rs.quantity_reserved ?? 0),
                is_substitute:           rs.is_substitute,
            });
        });
    });
    return rows;
};

// Groups buildReservedVariantRows' flat output by the RESERVED variant itself
// (trim item + color reserved — not the requested color), summing quantities
// across every requested color it's been used against. This is the "one
// physical variant, drawn against several requested colors" view: e.g. a
// BLACK variant substituted for both M GRAY and its own BLACK requirement
// shows as one row with the combined reserved total, not two separate rows.
export const buildReservedVariantSummary = (trimRequirements = []) => {
    const flat = buildReservedVariantRows(trimRequirements);
    const map = new Map();
    flat.forEach(row => {
        const key = [row.trim_item_id, row.reserved_item_name, row.reserved_color_name, row.reserved_color_number].join('::');
        if (!map.has(key)) {
            map.set(key, {
                trim_item_id:           row.trim_item_id,
                trim_item_name:         row.trim_item_name,
                item_code:              row.item_code,
                unit:                   row.unit,
                reserved_item_name:     row.reserved_item_name,
                reserved_color_name:    row.reserved_color_name,
                reserved_color_number:  row.reserved_color_number,
                total_required:         0,
                total_reserved:         0,
                covered:                [],
                any_substitute:         false,
            });
        }
        const g = map.get(key);
        g.total_required += row.required;
        g.total_reserved += row.reserved;
        g.any_substitute  = g.any_substitute || row.is_substitute;
        g.covered.push({
            requested_color_name:   row.requested_color_name,
            requested_color_number: row.requested_color_number,
            required:               row.required,
            reserved:               row.reserved,
            is_substitute:          row.is_substitute,
        });
    });
    return [...map.values()];
};

// "BLACK (826), M GRAY (962)" — the covered-colors list as one line, for
// contexts (Excel cell, tooltip) that just need a quick scan, not a subtable.
export const coveredColorsLabel = (covered) =>
    covered.map(c => nameAndNumber(c.requested_color_name, c.requested_color_number)).join(', ');
