// ─── REQUIREMENTS GRID MODEL ────────────────────────────────────────────────
// Pure data-shaping for the fabric/trim requirement grids — no React, no
// fetching, callable/testable in isolation. Columns come from the SOP's own
// color list (sop.colors); rows group the flat fabric_requirements /
// trim_requirements arrays the backend returns.
//
// Fabric requirements are guaranteed 1:1 with (fabric_type_id, fabric_color_id)
// by the backend, so they drop straight into a color's cell. Trim requirements
// key on (trim_item_id, fabric_color_id NULLABLE, target_variant_size NULLABLE):
//   - is_color_agnostic=true  → fabric_color_id is null → ONE row spans every
//     color column (rendered as `agnosticRequirement`, never decomposed).
//   - is_color_agnostic=false → one row per color, like fabric.
//   - a PER_SIZE trim can have multiple rows per color (one per
//     target_variant_size) — these become `subRows`.

import { dedupeColorsById } from './merchandiserShared';

// Deduped (see dedupeColorsById) — a raw 1:1 map of sop.colors would hand the
// grids two columns/keys for the same color id whenever the upstream data has
// duplicate color rows, which React reports as a duplicate-key warning on
// every `<th>`/cell keyed by it.
export const buildGridColumns = (sop) =>
    dedupeColorsById(sop?.colors).map(c => ({
        fabric_color_id: c.fabric_color_id,
        color_name:      c.color_name,
        color_number:    c.color_number,
    }));

export const buildFabricGridModel = (sop, fabricRequirements = []) => {
    const columns = buildGridColumns(sop);
    const columnIds = new Set(columns.map(c => String(c.fabric_color_id)));

    const rowsByType = new Map();
    fabricRequirements.forEach(req => {
        const key = String(req.fabric_type_id);
        if (!rowsByType.has(key)) {
            rowsByType.set(key, {
                rowKey: `fabric-${key}`,
                fabric_type_id: req.fabric_type_id,
                fabric_type_name: req.fabric_type_name,
                cellsByColorId: {},
                orphanCells: [],
            });
        }
        const row = rowsByType.get(key);
        if (columnIds.has(String(req.fabric_color_id))) {
            row.cellsByColorId[req.fabric_color_id] = req;
        } else {
            row.orphanCells.push(req);
        }
    });

    return { columns, rows: [...rowsByType.values()] };
};

export const buildTrimGridModel = (sop, trimRequirements = []) => {
    const columns = buildGridColumns(sop);
    const columnIds = new Set(columns.map(c => String(c.fabric_color_id)));

    const rowsByTrimItem = new Map();
    trimRequirements.forEach(req => {
        const key = String(req.trim_item_id);
        if (!rowsByTrimItem.has(key)) {
            rowsByTrimItem.set(key, {
                rowKey: `trim-${key}`,
                trim_item_id: req.trim_item_id,
                trim_item_name: req.trim_item_name,
                item_code: req.item_code,
                unit_of_measure: req.unit_of_measure,
                isColorAgnostic: !!req.is_color_agnostic,
                agnosticRequirement: null,
                cellsByColorId: {},
                subRowsBySize: new Map(),
                orphanCells: [],
            });
        }
        const row = rowsByTrimItem.get(key);

        if (req.target_variant_size != null) {
            const sizeKey = String(req.target_variant_size);
            if (!row.subRowsBySize.has(sizeKey)) {
                row.subRowsBySize.set(sizeKey, {
                    subRowKey: `${row.rowKey}-size-${sizeKey}`,
                    target_variant_size: req.target_variant_size,
                    agnosticRequirement: null,
                    cellsByColorId: {},
                    orphanCells: [],
                });
            }
            const subRow = row.subRowsBySize.get(sizeKey);
            if (req.is_color_agnostic) {
                if (subRow.agnosticRequirement) {
                    console.warn(`[grid] trim_item ${req.trim_item_id} size ${sizeKey}: multiple agnostic rows — keeping the first, dropping extras into orphanCells.`);
                    subRow.orphanCells.push(req);
                } else {
                    subRow.agnosticRequirement = req;
                }
            } else if (columnIds.has(String(req.fabric_color_id))) {
                subRow.cellsByColorId[req.fabric_color_id] = req;
            } else {
                subRow.orphanCells.push(req);
            }
            return;
        }

        if (req.is_color_agnostic) {
            if (row.agnosticRequirement) {
                console.warn(`[grid] trim_item ${req.trim_item_id}: multiple agnostic rows — keeping the first, dropping extras into orphanCells.`);
                row.orphanCells.push(req);
            } else {
                row.agnosticRequirement = req;
            }
        } else if (columnIds.has(String(req.fabric_color_id))) {
            row.cellsByColorId[req.fabric_color_id] = req;
        } else {
            row.orphanCells.push(req);
        }
    });

    const rows = [...rowsByTrimItem.values()].map(row => {
        const subRows = row.subRowsBySize.size > 0 ? [...row.subRowsBySize.values()] : null;
        const { subRowsBySize, ...rest } = row;
        return { ...rest, subRows };
    });

    return { columns, rows };
};

// = today's `trimGroups` memo (ProductionTrackingModal, original lines 1589-1648):
// groups trim requirements by trim_item_id, keeps groups with ≥2 rows, and for
// each finds substitute variants that cover ≥2 of the group's requirements —
// exactly what a "bulk fill this trim item across colors" action needs.
export const buildTrimBulkFillGroups = (trimRequirements = []) => {
    const map = new Map();
    trimRequirements.forEach(r => {
        const key = String(r.trim_item_id ?? `req-${r.id}`);
        if (!map.has(key)) {
            map.set(key, {
                trim_item_id:   r.trim_item_id,
                trim_item_name: r.trim_item_name,
                item_code:      r.item_code,
                unit:           r.unit_of_measure || 'pcs',
                requirements:   [],
            });
        }
        map.get(key).requirements.push(r);
    });

    return [...map.values()]
        .filter(g => g.requirements.length >= 2)
        .map(g => {
            const variantMap = new Map();
            g.requirements.forEach(r => {
                (r.stock_suggestion?.substitutes || []).forEach(s => {
                    const sid = Number(s.substitute_variant_id);
                    if (!variantMap.has(sid)) variantMap.set(sid, { sample: s, reqIds: new Set() });
                    variantMap.get(sid).reqIds.add(r.id);
                });
            });
            const commonSubstitutes = [];
            variantMap.forEach((v, sid) => {
                if (v.reqIds.size >= 2) {
                    commonSubstitutes.push({
                        ...v.sample,
                        substitute_variant_id: sid,
                        matches_req_ids:       [...v.reqIds],
                        matches_count:         v.reqIds.size,
                    });
                }
            });
            commonSubstitutes.sort((a, b) =>
                (b.matches_count - a.matches_count) || ((b.in_stock ?? 0) - (a.in_stock ?? 0))
            );
            const totalRequired = g.requirements.reduce((s, r) => s + Number(r.quantity_required || 0), 0);
            const totalReserved = g.requirements.reduce((s, r) => s + Number(r.quantity_reserved || 0), 0);
            const fulfilled     = g.requirements.filter(r => r.is_fulfilled).length;
            return {
                ...g,
                commonSubstitutes,
                totalRequired,
                totalReserved,
                fulfilled,
                pendingCount: g.requirements.length - fulfilled,
            };
        })
        .filter(g => g.pendingCount > 0 && g.commonSubstitutes.length > 0);
};

// Convenience: map of trim_item_id -> bulk-fill group, for O(1) "does this row
// have a bulk-fill action" lookups while rendering TrimRequirementsGrid rows.
export const buildTrimBulkFillGroupsByItemId = (trimRequirements = []) => {
    const groups = buildTrimBulkFillGroups(trimRequirements);
    return new Map(groups.map(g => [String(g.trim_item_id), g]));
};
