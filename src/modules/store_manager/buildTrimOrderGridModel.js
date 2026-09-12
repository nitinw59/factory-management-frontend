// ─── BUILD TRIM ORDER GRID MODEL ────────────────────────────────────────────
// Pure, dependency-free row/column pivot builder for the trim-order
// fulfillment grid (TrimOrderItemsGrid). Mirrors the merchandiser planning
// module's buildRequirementsGridModel.js in spirit, adapted to this page's
// actual data shape: order items don't carry a fabric_color_id the way plan
// requirements do, so columns are derived directly from the colors present on
// the items themselves rather than from an external sales-order-product color
// list.

const colorKeyOf = (item) => String(item.color_number ?? `name:${item.color_name || 'GENERIC'}`);

// Dedupe columns across every item passed in, sorted numerically by
// color_number when present, falling back to name; the agnostic/Generic
// column (no color_number) always sorts last.
export const buildTrimOrderGridColumns = (items = []) => {
    const map = new Map();
    items.forEach(item => {
        const key = colorKeyOf(item);
        if (!map.has(key)) {
            map.set(key, {
                colorKey:     key,
                color_name:   item.color_name || 'Generic',
                color_number: item.color_number ?? null,
            });
        }
    });
    return [...map.values()].sort((a, b) => {
        const an = a.color_number, bn = b.color_number;
        if (an == null && bn == null) return a.color_name.localeCompare(b.color_name);
        if (an == null) return 1;    // no color_number sorts last
        if (bn == null) return -1;
        const na = Number(an), nb = Number(bn);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
        return String(an).localeCompare(String(bn));
    });
};

// Given the page's existing trimItemGroups (already grouped by base trim item
// name), produce { columns, rows }. Each row's cellsByColorKey maps a column
// to an ARRAY of order items — usually length 1, but more than one when the
// same trim item has more than one variant_size in the same color. Unlike
// buildRequirementsGridModel.js's PER_SIZE handling (a whole extra sub-row per
// size), this keeps the collision as an in-cell array: size collisions on
// trim orders are rare enough that they don't warrant an always-visible extra
// grid row — the grid renders a "×N sizes" cell and the drilldown modal lets
// the user pick which size once they open it.
export const buildTrimOrderGridModel = (trimItemGroups = []) => {
    const allItems = trimItemGroups.flatMap(g => g.items);
    const columns = buildTrimOrderGridColumns(allItems);
    const columnKeys = new Set(columns.map(c => c.colorKey));

    const rows = trimItemGroups.map(group => {
        const cellsByColorKey = {};
        const orphanCells = [];
        group.items.forEach(item => {
            const key = colorKeyOf(item);
            // Defensive only — colorKey is derived from the same items that built
            // `columns`, so this should never actually miss.
            if (!columnKeys.has(key)) { orphanCells.push(item); return; }
            (cellsByColorKey[key] || (cellsByColorKey[key] = [])).push(item);
        });
        return {
            rowKey:      `trim-${group.name}`,
            name:        group.name,
            counts:      group.counts,
            handedOver:  group.handedOver,
            total:       group.total,
            donePct:     group.donePct,
            items:       group.items,
            cellsByColorKey,
            orphanCells,
        };
    });

    return { columns, rows };
};
