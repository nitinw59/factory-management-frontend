// BOM layout v2 (13 Oct 2026) — the factory's own Excel order BOM layout, for both BOMs:
//   Order BOM: header (sales order, order type, buyer, brand | style category, name, no., SAM, fit,
//              cut allowance) → colour × size quantity grid (rows by the colour's shell fabric) →
//              fabric block (pocketing included) → trims block (per colour, or one "Same in all" row),
//              with consumption per piece, unit, wastage, BOM qty and remarks.
//   Style BOM: the same without order quantities — header (style), colourways, fabric, trims.
// Fabric and trims tables end with a blank SAMPLE column (tall rows) to stick the real swatch / trim.
// The only BOM layout since 16 Oct 2026 (v1 removed). One model → PDF (jsPDF + autotable) and Excel
// (ExcelJS), one page / sheet per order line (style); each Detailed or Summary.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { newWorkbook, saveWorkbook, put, BOLD } from '../components/xlsxSave';
import { loadLetterhead, drawPdfLetterhead, addXlsxLetterhead } from '../components/letterhead';

const ROLE = { SHELL: 'Shell', POCKETING: 'Pocketing', LINING: 'Lining', CONTRAST: 'Contrast', OTHER: 'Other' };
const ROLE_ORDER = ['SHELL', 'CONTRAST', 'LINING', 'POCKETING', 'OTHER'];
const num = (n, d = 3) => (n == null || n === '' ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d }));
const qty2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "30-40" when the sizes are a run of the style's size range, else "30, 34, 38".
function sizeRange(names, order) {
    const idx = names.map(n => order.indexOf(n)).filter(i => i >= 0).sort((a, b) => a - b);
    if (!idx.length) return '';
    const run = idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
    return idx.length === 1 ? order[idx[0]] : run ? `${order[idx[0]]}-${order[idx[idx.length - 1]]}` : idx.map(i => order[i]).join(', ');
}
// Order BOM (15 Oct 2026): consumption that changes by size → one average, weighted by the ordered pieces
// per size (so BOM qty = pieces × … × average still holds); sizes not ordered don't count.
function avgCons(det) {
    const vals = [...new Set(det.map(t => Number(t.consumption)))];
    if (vals.length <= 1) return num(vals[0]);
    const w = det.filter(t => Number(t.ordered) > 0);
    const pcs = w.reduce((s, t) => s + Number(t.ordered), 0);
    const avg = pcs ? w.reduce((s, t) => s + Number(t.ordered) * Number(t.consumption), 0) / pcs : vals.reduce((a, b) => a + b, 0) / vals.length;
    return `${num(avg)} avg`;
}
// "buy 31.92 ROLL (1 ROLL = 40 m)": the BOM qty in the item's purchase unit.
const purchaseNote = (usageQty, uom, info) => {
    if (!info || !info.purchase_uom || !info.factor || Number(info.factor) === 1) return '';   // same quantity in both units: nothing to add
    return `buy ${num(usageQty / Number(info.factor), 2)} ${info.purchase_uom} (1 ${info.purchase_uom} = ${num(info.factor)} ${uom})`;
};

// ── Order BOM ────────────────────────────────────────────────────────────
// summary (15 Oct 2026, Excel): a fabric / trim BOM line printed colour by colour collapses into one row,
// colour "MATCH TO COLOR" (different item per colour) or "Same in all"; qty summed, consumption averaged.
const MATCH = 'MATCH TO COLOR';
const common = (vals) => (vals.length && vals.every(v => (v || '') === (vals[0] || '')) ? vals[0] || '' : null);
export function buildOrderBomV2(d, { summary = false } = {}) {
    const o = d.order;
    return (d.sheet_lines || []).map(L => {
        const plan = d.lines.find(x => String(x.line_no) === String(L.line_no)) || {};
        const sizeOrder = L.sizes.map(z => z.name);
        const rowsOf = (kind) => d.items.filter(i => i.kind === kind).flatMap(it => it.rows.filter(r => String(r.line_no) === String(L.line_no)).map(r => ({ it, r })));
        const fabricRows = rowsOf('FABRIC');
        const trimRows = rowsOf('TRIM');
        // colour × size grid, rows labelled by the colour's shell fabric
        const colours = [...new Map(L.qty.map(x => [x.colour_id, x.colour])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
        const grid = colours.map(([cid, name]) => {
            const shell = fabricRows.find(x => x.r.colour_id === cid && x.r.fabric_role === 'SHELL') || fabricRows.find(x => x.r.colour_id === cid);
            const per = L.sizes.map(z => L.qty.filter(x => x.colour_id === cid && x.size_id === z.id).reduce((s, x) => s + Number(x.qty), 0));
            return { code: shell?.it.info?.code || '', desc: shell ? (shell.it.info?.shade_name || shell.it.info?.shade_code || '') : '', colour: name, fit: L.fit || '', per, total: per.reduce((a, b) => a + b, 0) };
        });
        const totals = L.sizes.map((_, k) => grid.reduce((s, g) => s + g.per[k], 0));
        const line = (x) => {
            const det = x.r.detail || [];
            return { size: sizeRange(det.filter(t => Number(t.ordered) > 0).map(t => t.size), sizeOrder), cons: avgCons(det), wastage: det[0] ? `${num(det[0].wastage_pct, 2)}%` : '' };
        };
        const fabricRow = (x) => ({ code: x.it.info?.code || x.it.label, classification: x.it.info?.shade_name || x.it.info?.shade_code || '', description: x.it.info?.composition || x.it.info?.mill || '',
            colour: x.r.colour, ...line(x), uom: x.it.uom, qty: x.r.required_qty,
            remarks: [x.r.fabric_role && x.r.fabric_role !== 'SHELL' ? `${ROLE[x.r.fabric_role] || x.r.fabric_role} fabric` : '', x.r.notes || ''].filter(Boolean).join(' · ') });
        const sortedFabric = fabricRows.sort((a, b) => ROLE_ORDER.indexOf(a.r.fabric_role) - ROLE_ORDER.indexOf(b.r.fabric_role) || (a.r.bom_sort ?? 0) - (b.r.bom_sort ?? 0) || a.r.colour.localeCompare(b.r.colour));
        let fabric = sortedFabric.map(fabricRow);
        if (summary) {
            // one row per fabric BOM line
            const byFab = new Map();
            for (const x of sortedFabric) { const k = x.r.bom_line_id || `${x.r.fabric_role}`; if (!byFab.has(k)) byFab.set(k, []); byFab.get(k).push(x); }
            // the same rule as trims: one fabric → "Same in all"; a different fabric for every colour → MATCH TO COLOR;
            // by tone (a fabric shared by some colours) → one row per fabric with its colours
            const merge = (xs, colour, note) => {
                const rows = xs.map(fabricRow);
                const det = xs.flatMap(x => x.r.detail || []);
                return { ...rows[0], code: common(rows.map(r => r.code)) ?? 'Per colour', classification: common(rows.map(r => r.classification)) ?? 'Per colour',
                    description: common(rows.map(r => r.description)) ?? '', colour,
                    size: sizeRange([...new Set(det.filter(t => Number(t.ordered) > 0).map(t => t.size))], sizeOrder), cons: avgCons(det),
                    qty: xs.reduce((n, x) => n + x.r.required_qty, 0),
                    remarks: [...new Set(rows.map(r => r.remarks).filter(Boolean)), note].filter(Boolean).join(' · ') };
            };
            fabric = [...byFab.values()].flatMap(xs => {
                if (xs.length === 1) return [fabricRow(xs[0])];
                const perItem = new Map();
                for (const x of xs) { if (!perItem.has(x.it.key)) perItem.set(x.it.key, []); perItem.get(x.it.key).push(x); }
                if (perItem.size === 1) return [merge(xs, 'Same in all', 'Same in all colours')];
                // picked by colour on the BOM (even when some colours share a fabric), or one fabric per colour
                if (xs[0].r.colour_rule === 'BY_COLOUR' || [...perItem.values()].every(g => g.length === 1)) return [merge(xs, MATCH, `Fabric per garment colour (${xs.length} colours)`)];
                return [...perItem.values()].map(g => (g.length === 1 ? fabricRow(g[0]) : merge(g, g.map(x => x.r.colour).join(', '), '')));
            });
        }
        // trims: per BOM line; one "Same in all" row when every colour uses the same item
        const byLine = new Map();
        for (const x of trimRows) { const k = x.r.bom_line_id; if (!byLine.has(k)) byLine.set(k, []); byLine.get(k).push(x); }
        const trims = [...byLine.values()].sort((a, b) => (a[0].r.bom_sort ?? 0) - (b[0].r.bom_sort ?? 0)).map(group => {
            const items = new Set(group.map(x => x.it.key));
            const name = `${group[0].r.trim_type || group[0].r.bom_line}${group[0].r.placement ? ` (${group[0].r.placement})` : ''}`;
            const mk = (x, colour, qty, det, notes = [x.r.notes]) => {
                const info = { purchase_uom: x.it.purchase_uom, factor: x.it.usage_per_purchase_uom };
                const buyNote = purchaseNote(qty, x.it.uom, info);
                return { classification: x.it.info?.code || x.it.label, description: x.it.info?.description || '', colour,
                    size: sizeRange([...new Set(det.filter(t => Number(t.ordered) > 0).map(t => t.size))], sizeOrder), cons: avgCons(det),
                    uom: x.it.uom, wastage: det[0] ? `${num(det[0].wastage_pct, 2)}%` : '', qty,
                    // Excel (16 Oct 2026): the purchase quantity in its own columns
                    buy: buyNote ? { qty: Math.round((qty / Number(info.factor)) * 100) / 100, uom: info.purchase_uom } : null, buyNote,
                    remarks: [buyNote, ...new Set(notes.filter(Boolean))].filter(Boolean).join(' · ') };
            };
            // DTM (dyed to match) shade items (15 Oct 2026): one row for all colours — the base item, colour "DTM", qty summed.
            const dtm = group.filter(x => x.it.info?.dtm);
            if (dtm.length) {
                const rest = group.filter(x => !x.it.info?.dtm);
                const r = mk(dtm[0], 'DTM', dtm.reduce((s, x) => s + x.r.required_qty, 0), dtm.flatMap(x => x.r.detail || []), dtm.map(x => x.r.notes));
                r.classification = dtm[0].it.info.base_code || r.classification;
                r.description = dtm[0].it.info.base_description || '';   // never one colour's shade text
                r.remarks = [r.remarks, `Dyed to match each colour's fabric${rest.length ? ` (${[...new Set(dtm.map(x => x.r.colour))].join(', ')})` : ''}`].filter(Boolean).join(' · ');
                const others = new Map();
                for (const x of [...rest].sort((a, b) => a.r.colour.localeCompare(b.r.colour))) { if (!others.has(x.it.key)) others.set(x.it.key, []); others.get(x.it.key).push(x); }
                return { name, rows: [r, ...[...others.values()].map(xs => mk(xs[0], xs.map(x => x.r.colour).join(', '), xs.reduce((s, x) => s + x.r.required_qty, 0), xs.flatMap(x => x.r.detail || []), xs.map(x => x.r.notes)))] };
            }
            if (items.size === 1 && group.length > 1) {
                const det = group.flatMap(x => x.r.detail || []);
                const r = mk(group[0], 'Same in all', group.reduce((s, x) => s + x.r.required_qty, 0), det);
                r.remarks = [r.remarks, 'Same in all colours'].filter(Boolean).join(' · ');
                return { name, rows: [r] };
            }
            // several items (e.g. by tone: black on dark colours, white on light): one row per item, its colours listed, qty summed
            const perItem = new Map();
            for (const x of [...group].sort((a, b) => a.r.colour.localeCompare(b.r.colour))) { if (!perItem.has(x.it.key)) perItem.set(x.it.key, []); perItem.get(x.it.key).push(x); }
            // summary: the BOM picks the item by colour (BY_COLOUR, even when some colours share one), or a different
            // item for every colour → one MATCH TO COLOR row. Items that change by size (e.g. one wash care label per
            // size, each in every colour) → one row, size "BY SIZE". Both → one MATCH TO COLOR row with BY SIZE.
            const sizesOf = (xs) => new Set(xs.flatMap(x => (x.r.detail || []).filter(t => Number(t.ordered) > 0).map(t => t.size)));
            const allSizes = sizesOf(group);
            const lineCols = new Set(group.map(x => x.r.colour_id)).size;
            const bySize = perItem.size > 1 && [...perItem.values()].some(xs => sizesOf(xs).size < allSizes.size);
            const byColour = perItem.size > 1 && (group[0].r.colour_rule === 'BY_COLOUR' || [...perItem.values()].every(xs => new Set(xs.map(x => x.r.colour_id)).size === 1));
            const everyColour = [...perItem.values()].every(xs => new Set(xs.map(x => x.r.colour_id)).size === lineCols);
            if (summary && (byColour || (bySize && everyColour))) {
                const rows = group.map(x => mk(x, x.r.colour, x.r.required_qty, x.r.detail || []));
                const purchase = common(group.map(x => `${x.it.purchase_uom || ''}|${x.it.usage_per_purchase_uom || ''}`));
                const qty = group.reduce((s, x) => s + x.r.required_qty, 0);
                const r = mk(group[0], byColour ? MATCH : 'Same in all', qty, group.flatMap(x => x.r.detail || []), group.map(x => x.r.notes));
                r.classification = common(rows.map(x => x.classification)) ?? (byColour ? 'Per colour' : 'Per size');
                r.description = common(rows.map(x => x.description)) ?? '';
                if (bySize) r.size = 'BY SIZE';
                if (purchase === null) { r.remarks = [...new Set(group.map(x => x.r.notes).filter(Boolean))].join(' · '); r.buy = null; r.buyNote = ''; }   // purchase units differ: no total in one unit
                const sizeList = sizeRange([...allSizes], sizeOrder);
                r.remarks = [r.remarks, byColour ? `Item per garment colour (${lineCols} colours)` : 'Same in all colours',
                    bySize ? `item per size (${perItem.size} items, sizes ${sizeList})` : ''].filter(Boolean).join(' · ');
                return { name, rows: [r] };
            }
            // an item used in every colour (e.g. one wash care label per size): "Same in all", not the list of colours
            const lineColours = new Set(group.map(x => x.r.colour_id)).size;
            return { name, rows: [...perItem.values()].map(xs => {
                const all = lineColours > 1 && new Set(xs.map(x => x.r.colour_id)).size === lineColours;
                const r = mk(xs[0], all ? 'Same in all' : xs.map(x => x.r.colour).join(', '), xs.reduce((s, x) => s + x.r.required_qty, 0), xs.flatMap(x => x.r.detail || []), xs.map(x => x.r.notes));
                if (all) r.remarks = [r.remarks, 'Same in all colours'].filter(Boolean).join(' · ');
                return r;
            }) };
        });
        return {
            title: `ORDER BOM${summary ? ' — SUMMARY' : ''}${d.estimate ? ' — ESTIMATE' : ''}`, sheet: `L${L.line_no} ${L.style_code}`, estimate: !!d.estimate,
            header: [
                ['SALES ORDER NO', `${o.order_no}${o.buyer_po_no ? `  (PO ${o.buyer_po_no})` : ''}`, 'Style category', L.product_type || ''],
                ['ORDER TYPE', d.order_type === 'DOMESTIC' ? 'Domestic' : d.order_type || 'FOB', 'Style name', L.style_name || ''],
                ['BUYER NAME', o.customer_name || '', 'Style no', L.style_code],
                ['BRAND NAME', L.brand || '', 'SAM', L.sam != null ? num(L.sam, 3) : ''],
                ['LINE / SHIP DATE', `Line ${L.line_no}${plan.ship_date ? ` · ${String(plan.ship_date).split('-').reverse().join('-')}` : ''}`, 'Fit', L.fit || ''],
                ['STYLE BOM', plan.bom_version ? `v${plan.bom_version}` : '', 'Cut allowance', `${num(plan.cut_allowance_pct ?? 0, 2)}% (in BOM qty)`],
            ],
            grid: { sizes: sizeOrder, rows: grid, totals, total: totals.reduce((a, b) => a + b, 0) },
            fabric, trims, withQty: true,
            footnote: `BOM qty = pieces × (1 + cut allowance) × consumption per piece × (1 + wastage). ${d.estimate ? 'ESTIMATE: the order is not approved yet.' : ''}`,
            file: `Order-BOM-v2-${o.order_no}${summary ? '-Summary' : ''}`.replace(/[^\w.-]+/g, '-'),
        };
    });
}

// ── Style BOM ────────────────────────────────────────────────────────────
// Consumption per piece of a Style BOM line (15 Oct 2026): one value, or the plain average when it changes by size
// ("1.213 avg") — a style has no order quantities to weight it by (the Order BOM weights by pieces ordered).
export function styleCons(l) {
    if (l.consumption_basis === 'PER_GARMENT') return num(l.qty_per_garment);
    const vals = (l.sizes || []).map(z => Number(z.qty));
    if (!vals.length) return '';
    if (new Set(vals).size === 1) return num(vals[0]);
    return `${num(vals.reduce((a, b) => a + b, 0) / vals.length)} avg`;
}
const itemCode = (kind, g) => (kind === 'fabric' ? [g.info?.code, g.info?.shade_name || g.info?.shade_code].filter(Boolean).join(' · ') : g.info?.code) || g.label;
const itemDesc = (kind, g) => (kind === 'fabric' ? g.info?.composition || g.info?.mill : g.info?.description) || '';

// Summary rows of one Style BOM line (15 Oct 2026; the same rules as the Order BOM summary) — the "View style BOM"
// summary and the Style BOM summary Excel.
export function summariseStyleLine(l, card) {
    const colours = card.colours;
    const allSizeIds = card.sizes.map(z => z.id);
    const sizeName = new Map(card.sizes.map(z => [z.id, z.name]));
    const range = (ids) => {
        const idx = [...ids].map(id => allSizeIds.indexOf(id)).filter(i => i >= 0).sort((a, b) => a - b);
        if (!idx.length) return '';
        if (idx.length === allSizeIds.length) return idx.length === 1 ? sizeName.get(allSizeIds[0]) : `${sizeName.get(allSizeIds[0])}-${sizeName.get(allSizeIds[allSizeIds.length - 1])}`;
        return idx.map(i => sizeName.get(allSizeIds[i])).join(', ');
    };
    const items = new Map();
    for (const c of colours) {
        for (const g of l.cells[c.id]?.groups || []) {
            if (!items.has(g.item_id)) items.set(g.item_id, { g, colours: new Set(), sizes: new Set() });
            const e = items.get(g.item_id);
            e.colours.add(c.id);
            (g.size_ids || allSizeIds).forEach(z => e.sizes.add(z));
        }
    }
    const nCol = colours.length;
    const problems = colours.reduce((n, c) => n + (l.cells[c.id]?.problems.length || 0), 0) + l.line_problems.length;
    const entries = [...items.values()];
    // bought in another unit (the same for every item of the line): "bought in ROLL (1 = 40 m)"
    const units = common([...items.values()].map(e => `${e.g.info?.purchase_uom || ''}|${e.g.info?.factor || ''}`));
    const [pu, factor] = (units || '|').split('|');
    const purchase = pu && factor && Number(factor) !== 1 ? `bought in ${pu} (1 = ${num(factor)} ${l.uom})` : '';
    const row = (item, desc, colour, size, extra = []) => ({ item, desc, colour, size, notes: [...extra, l.notes].filter(Boolean).join(' · '), purchase, problems });
    if (!entries.length) return [row('—', '', '—', '')];
    const allSizes = new Set(entries.flatMap(e => [...e.sizes]));
    // DTM: the line is set up as DTM, or every item on it is a DTM shade item
    if (l.dtm_base_item_id || (l.kind === 'trim' && entries.every(e => e.g.info?.dtm_base_item_id))) {
        const g = entries[0].g;
        return [row(g.info?.base_code || 'DTM shades', g.info?.base_description || '', 'DTM', range(allSizes), [`Dyed to match each colour's fabric (${entries.length} shade item${entries.length === 1 ? '' : 's'})`])];
    }
    const colourText = (e) => (nCol > 1 && e.colours.size === nCol ? 'Same in all' : colours.filter(c => e.colours.has(c.id)).map(c => c.name).join(', '));
    if (entries.length === 1) return [row(itemCode(l.kind, entries[0].g), itemDesc(l.kind, entries[0].g), colourText(entries[0]), range(entries[0].sizes))];
    const bySize = entries.some(e => e.sizes.size < allSizes.size);
    const byColour = l.colour_rule === 'BY_COLOUR' || entries.every(e => e.colours.size === 1);
    const everyColour = entries.every(e => e.colours.size === nCol);
    if (byColour || (bySize && everyColour)) {
        return [row(common(entries.map(e => itemCode(l.kind, e.g))) ?? (byColour ? 'Per colour' : 'Per size'), common(entries.map(e => itemDesc(l.kind, e.g))) ?? '',
            byColour ? MATCH : 'Same in all', bySize ? 'BY SIZE' : range(allSizes),
            [`${entries.length} items${byColour ? ` for ${nCol} colours` : ''}${bySize ? `, item per size (${range(allSizes)})` : ''}`])];
    }
    // by tone: a row per item with its colours
    const toneOf = (e) => common(colours.filter(c => e.colours.has(c.id)).map(c => c.tone_name || ''));
    return entries.map(e => {
        const tone = l.colour_rule === 'BY_TONE' && e.colours.size < nCol ? toneOf(e) : null;
        return row(itemCode(l.kind, e.g), itemDesc(l.kind, e.g), tone ? `${tone}: ${colourText(e)}` : colourText(e), range(e.sizes), l.colour_rule === 'BY_TONE' ? ['By tone'] : []);
    });
}

export function buildStyleBomV2(card, { summary = false } = {}) {
    const b = card.bom;
    const sizeName = new Map(card.sizes.map(z => [z.id, z.name]));
    const sizeOrder = card.sizes.map(z => z.name);
    const allSizes = sizeRange(sizeOrder, sizeOrder);
    const cons = styleCons;
    const shell = card.fabric.find(f => f.role === 'SHELL') || card.fabric[0];
    const colourways = card.colours.map(c => {
        const g = shell?.cells[c.id]?.groups[0];
        return { colour: c.name, code: g?.info?.code || '', desc: g?.info?.shade_name || g?.info?.shade_code || '', fit: b.fit || '', sizes: allSizes };
    });
    const fabric = [...card.fabric].sort((x, y) => ROLE_ORDER.indexOf(x.role) - ROLE_ORDER.indexOf(y.role)).flatMap(l => card.colours.map(c => {
        const g = l.cells[c.id]?.groups[0];
        return { code: g?.info?.code || g?.label || '—', classification: g?.info?.shade_name || g?.info?.shade_code || '', description: g?.info?.composition || g?.info?.mill || '',
            colour: c.name, size: allSizes, cons: cons(l), uom: l.uom, wastage: `${num(l.wastage_pct || 0, 2)}%`,
            remarks: [l.role !== 'SHELL' ? `${ROLE[l.role] || l.role} fabric` : '', l.notes || '', ...(l.cells[c.id]?.problems || []).map(p => `! ${p}`)].filter(Boolean).join(' · ') };
    }));
    // Trims in BOM line order, as on the Order BOM (16 Oct 2026). Colours that use the same item(s) share one row
    // ("Same in all" when every colour does); DTM shade items print as one DTM row with the base item.
    const trims = card.trims.map((l) => {
        const name = `${l.trim_type_name}${l.placement ? ` (${l.placement})` : ''}`;
        const rowFor = (colour, g, problems = []) => ({
            classification: g?.info?.code || g?.label || '—', description: g?.info?.description || '', colour,
            size: g?.size_ids ? sizeRange(g.size_ids.map(z => sizeName.get(z)), sizeOrder) : allSizes, cons: cons(l), uom: l.uom, wastage: `${num(l.wastage_pct || 0, 2)}%`,
            remarks: [g?.info?.purchase_uom && g.info.factor && Number(g.info.factor) !== 1 ? `bought in ${g.info.purchase_uom} (1 ${g.info.purchase_uom} = ${num(g.info.factor)} ${l.uom})` : '', l.notes || '', ...problems.map(p => `! ${p}`)].filter(Boolean).join(' · '),
        });
        const allGroups = card.colours.flatMap(c => l.cells[c.id]?.groups || []);
        const allProblems = [...new Set(card.colours.flatMap(c => l.cells[c.id]?.problems || []))];
        if (allGroups.length && (l.dtm_base_item_id || allGroups.every(g => g.info?.dtm_base_item_id))) {
            const g = allGroups[0];
            const r = rowFor('DTM', g, allProblems);
            return { name, line: l, rows: [{ ...r, classification: g.info?.base_code || 'DTM shades', description: g.info?.base_description || '',
                remarks: [r.remarks, `Dyed to match each colour's fabric (${new Set(allGroups.map(x => x.item_id)).size} shade items)`].filter(Boolean).join(' · ') }] };
        }
        const bySig = new Map();
        for (const c of card.colours) {
            const k = JSON.stringify((l.cells[c.id]?.groups || []).map(g => [g.item_id, g.size_ids]));
            if (!bySig.has(k)) bySig.set(k, []);
            bySig.get(k).push(c);
        }
        return { name, line: l, rows: [...bySig.values()].flatMap(cs => {
            const every = card.colours.length > 1 && cs.length === card.colours.length;
            const label = every ? 'Same in all' : cs.map(c => c.name).join(', ');
            const cell = l.cells[cs[0].id];
            const probs = [...new Set(cs.flatMap(c => l.cells[c.id]?.problems || []))];
            const rows = cell?.groups.length ? cell.groups.map(g => rowFor(label, g, probs)) : [rowFor(label, null, probs)];
            return every ? rows.map(x => ({ ...x, remarks: [x.remarks, 'Same in all colours'].filter(Boolean).join(' · ') })) : rows;
        }) };
    });
    if (summary) {
        // one row per BOM line (or per tone item): MATCH TO COLOR / BY SIZE / DTM / Same in all
        const extra = (r) => [r.purchase, r.notes, r.problems ? `! ${r.problems} problem(s) — see the detailed BOM` : ''];
        fabric.length = 0;
        [...card.fabric].sort((x, y) => ROLE_ORDER.indexOf(x.role) - ROLE_ORDER.indexOf(y.role)).forEach(l => summariseStyleLine(l, card).forEach(r => fabric.push({
            code: r.item, classification: '', description: r.desc, colour: r.colour, size: r.size, cons: cons(l), uom: l.uom, wastage: `${num(l.wastage_pct || 0, 2)}%`,
            remarks: [l.role !== 'SHELL' ? `${ROLE[l.role] || l.role} fabric` : '', ...extra(r)].filter(Boolean).join(' · ') })));
        trims.forEach(t => {
            const l = t.line;
            t.rows = summariseStyleLine(l, card).map(r => ({ classification: r.item, description: r.desc, colour: r.colour, size: r.size, cons: cons(l), uom: l.uom,
                wastage: `${num(l.wastage_pct || 0, 2)}%`, remarks: extra(r).filter(Boolean).join(' · ') }));
        });
    }
    return [{
        title: `STYLE BOM${summary ? ' — SUMMARY' : ''}`, sheet: b.style_code, estimate: false,
        header: [
            ['STYLE NO', b.style_code, 'Style category', b.product_type || ''],
            ['STYLE NAME', b.style_name || '', 'Fit', b.fit || ''],
            ['BUYER NAME', b.buyer || '', 'SAM', b.sam != null ? num(b.sam, 3) : ''],
            ['BRAND NAME', b.brand || '', 'Style BOM', `v${b.version_no} · ${String(b.status).replace('_', ' ').toLowerCase()}`],
        ],
        colourways, fabric, trims, withQty: false,
        footnote: card.ready ? 'Consumption is per garment; the order BOM multiplies it by the order quantity.' : `NOT READY: ${card.problems.length} unresolved item(s), marked "!".`,
        file: `Style-BOM-v2-${b.style_code}-v${b.version_no}${summary ? '-Summary' : ''}`.replace(/[^\w.-]+/g, '_'),
    }];
}

// ── PDF ──────────────────────────────────────────────────────────────────
const GRID = { lineWidth: 0.3, lineColor: [0, 0, 0], fillColor: false, textColor: [0, 0, 0], valign: 'middle', cellPadding: 1, fontSize: 7.5 };
const HEAD = { ...GRID, fontStyle: 'bold', fillColor: [241, 245, 249] };
// Blank SAMPLE column at the end of the fabric and trims tables, rows tall enough to stick the real
// swatch / trim (asked 13 Oct 2026).
const SAMPLE_W = 26;    // mm
const SAMPLE_H = 13;    // mm
const sampleCell = () => ({ content: '', styles: { minCellHeight: SAMPLE_H } });
const sampleCols = (n) => ({ [n]: { cellWidth: SAMPLE_W } });

export function exportBomV2Pdf(blocks, lh = null) {
    const doc = new jsPDF({ orientation: 'landscape' });
    const W = doc.internal.pageSize.getWidth() - 16;
    const base = { theme: 'grid', margin: { left: 8, right: 8, top: 10, bottom: 12 }, tableWidth: W, styles: GRID, headStyles: HEAD, rowPageBreak: 'avoid' };
    blocks.forEach((bk, i) => {
        if (i) doc.addPage();
        // Company (logo, name, address) on the left, the BOM title on the right; plain title without a profile.
        const top = lh ? drawPdfLetterhead(doc, lh, { x: 8, y: 5, title: bk.title, titleColor: bk.estimate ? [190, 18, 60] : null }) - 5 : 3;
        if (!lh) {
            doc.setFont(undefined, 'bold'); doc.setFontSize(13);
            if (bk.estimate) doc.setTextColor(190, 18, 60);
            doc.text(bk.title, 8, top + 5); doc.setTextColor(0); doc.setFont(undefined, 'normal');
        }
        autoTable(doc, { ...base, startY: top + 7, body: bk.header.map(([a, b, c, e]) => [{ content: a, styles: { fontStyle: 'bold' } }, b, { content: c, styles: { fontStyle: 'bold' } }, e]),
            columnStyles: { 0: { cellWidth: W * 0.15 }, 1: { cellWidth: W * 0.35 }, 2: { cellWidth: W * 0.15 }, 3: { cellWidth: W * 0.35 } } });
        let y = doc.lastAutoTable.finalY + 3;
        if (bk.grid) {
            autoTable(doc, { ...base, startY: y,
                head: [['SR.NO', 'FABRIC ITEM CODE', 'FABRIC DESCRIPTION', 'COLOUR', 'FIT', ...bk.grid.sizes, 'TOTAL QTY']],
                body: [...bk.grid.rows.map((g, k) => [k + 1, g.code, g.desc, g.colour, g.fit, ...g.per.map(v => ({ content: v ? num(v, 0) : '0', styles: { halign: 'right' } })), { content: num(g.total, 0), styles: { halign: 'right', fontStyle: 'bold' } }]),
                    ['', '', '', '', { content: 'TOTAL', styles: { fontStyle: 'bold' } }, ...bk.grid.totals.map(v => ({ content: num(v, 0), styles: { halign: 'right', fontStyle: 'bold' } })), { content: num(bk.grid.total, 0), styles: { halign: 'right', fontStyle: 'bold' } }]] });
            y = doc.lastAutoTable.finalY + 3;
        }
        if (bk.colourways) {
            autoTable(doc, { ...base, startY: y, head: [['SR.NO', 'GARMENT COLOUR', 'FABRIC ITEM CODE', 'FABRIC DESCRIPTION', 'FIT', 'SIZES']],
                body: bk.colourways.map((c, k) => [k + 1, c.colour, c.code, c.desc, c.fit, c.sizes]) });
            y = doc.lastAutoTable.finalY + 3;
        }
        const qtyHead = bk.withQty ? ['BOM QTY'] : [];
        const sampleAt = 10 + qtyHead.length;   // column index of SAMPLE in the fabric / trims tables
        autoTable(doc, { ...base, startY: y, showHead: 'everyPage', columnStyles: sampleCols(sampleAt),
            head: [['SR.NO', 'ITEM CODE', 'CLASSIFICATION', 'DESCRIPTION', 'GARMENT COLOUR', 'SIZE', 'CONS./PC', 'UOM', 'WASTAGE', ...qtyHead, 'REMARKS', 'SAMPLE']],
            body: bk.fabric.map((f, k) => [k + 1, f.code, f.classification, f.description, f.colour, f.size, { content: f.cons, styles: { halign: 'right' } }, f.uom, { content: f.wastage, styles: { halign: 'right' } },
                ...(bk.withQty ? [{ content: qty2(f.qty), styles: { halign: 'right', fontStyle: 'bold' } }] : []), { content: f.remarks, styles: { textColor: /! /.test(f.remarks) ? [190, 18, 60] : [0, 0, 0] } }, sampleCell()]) });
        y = doc.lastAutoTable.finalY + 3;
        const body = [];
        bk.trims.forEach((t, k) => t.rows.forEach((r, j) => body.push([
            ...(j === 0 ? [{ content: String(k + 1), rowSpan: t.rows.length, styles: { valign: 'top' } }, { content: t.name, rowSpan: t.rows.length, styles: { valign: 'top', fontStyle: 'bold' } }] : []),
            r.classification, r.description, r.colour, r.size, { content: r.cons, styles: { halign: 'right' } }, r.uom, { content: r.wastage, styles: { halign: 'right' } },
            ...(bk.withQty ? [{ content: qty2(r.qty), styles: { halign: 'right', fontStyle: 'bold' } }] : []), { content: r.remarks, styles: { textColor: /! /.test(r.remarks) ? [190, 18, 60] : [0, 0, 0] } }, sampleCell()])));
        autoTable(doc, { ...base, startY: y, showHead: 'everyPage', columnStyles: sampleCols(sampleAt),
            head: [['SR.NO', 'ITEM NAME', 'CLASSIFICATION', 'DESCRIPTION', 'GARMENT COLOUR', 'SIZE', 'CONS./PC', 'UOM', 'WASTAGE', ...qtyHead, 'REMARKS', 'SAMPLE']], body });
        y = doc.lastAutoTable.finalY;
        doc.setFontSize(7); doc.setTextColor(90);
        doc.text(bk.footnote, 8, Math.min(y + 5, doc.internal.pageSize.getHeight() - 6));
        doc.setTextColor(0);
    });
    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFontSize(7); doc.setTextColor(110); doc.text(`Layout v2 · page ${p} of ${pages}`, doc.internal.pageSize.getWidth() - 8, doc.internal.pageSize.getHeight() - 4, { align: 'right' }); doc.setTextColor(0); }
    doc.save(`${blocks[0]?.file || 'BOM-v2'}.pdf`);
    return doc;
}

// ── Excel ────────────────────────────────────────────────────────────────
export async function buildBomV2Workbook(blocks, lh = null) {
    const wb = await newWorkbook();
    const used = new Set();
    for (const bk of blocks) {
        let name = bk.sheet.replace(/[\\/?*[\]:]/g, '-').slice(0, 28) || 'BOM';
        while (used.has(name)) name = `${name.slice(0, 26)}_${used.size}`;
        used.add(name);
        const ws = wb.addWorksheet(name, { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
        const sizes = bk.grid ? bk.grid.sizes : [];
        // Order BOM: BOM QTY, then BUY QTY + BUY UNIT (16 Oct 2026); SAMPLE after REMARKS
        const sampleCol = 11 + (bk.withQty ? 3 : 0);
        const cols = Math.max(sampleCol, 6 + sizes.length + 1);
        const widths = bk.withQty ? [7, 18, 26, 22, 18, 10, 12, 8, 10, 12, 11, 10, 26] : [7, 18, 26, 22, 18, 10, 12, 8, 10, 22];
        ws.columns = Array.from({ length: cols }, (_, k) => ({ width: k + 1 === sampleCol ? 20 : widths[k] ?? 10 }));
        // Consumption and wastage as numbers (16 Oct 2026): "1.213 avg" → 1.213 shown as "1.213 avg"; "2%" → 2 shown as "2%"
        const consCell = (v) => { const t = String(v ?? ''); const n = Number(t.replace(/,/g, '').replace(/ avg$/, '')); return t && Number.isFinite(n) ? { v: n, fmt: / avg$/.test(t) ? '#,##0.###" avg"' : '#,##0.###' } : { v: t }; };
        const pctCell = (v) => { const n = Number(String(v ?? '').replace('%', '')); return String(v ?? '') && Number.isFinite(n) ? { v: n, fmt: '0.##"%"' } : { v: v ?? '' }; };
        const numCell = (ws2, row, col, cell, align = 'right', font) => { const x = put(ws2, row, [col, col], cell.v, { align, font }); if (cell.fmt) x.numFmt = cell.fmt; return x; };
        // Company on the left, the BOM title on the right; plain title row without a profile.
        let r = addXlsxLetterhead(wb, ws, lh, { lastCol: cols, title: bk.title, titleColor: bk.estimate ? 'FFBE123C' : null });
        if (r === 1) { put(ws, r, [1, 4], bk.title, { font: { ...BOLD, size: 13, ...(bk.estimate ? { color: { argb: 'FFBE123C' } } : {}) } }); r++; }
        for (const [a, b, c, e] of bk.header) {
            put(ws, r, [1, 2], a, { font: BOLD }); put(ws, r, [3, 4], b); put(ws, r, [5, 6], c, { font: BOLD }); put(ws, r, [7, Math.max(8, cols)], e);
            r++;
        }
        r++;
        if (bk.grid) {
            const head = ['SR.NO', 'FABRIC ITEM CODE', 'FABRIC DESCRIPTION', 'COLOUR', 'FIT', ...sizes, 'TOTAL QTY'];
            head.forEach((h, k) => put(ws, r, [k + 1, k + 1], h, { font: BOLD, fill: 'FFF1F5F9' })); r++;
            bk.grid.rows.forEach((g, i) => { [i + 1, g.code, g.desc, g.colour, g.fit, ...g.per, g.total].forEach((v, k) => put(ws, r, [k + 1, k + 1], v, { align: k >= 5 ? 'right' : 'left' })); r++; });
            ['', '', '', '', 'TOTAL', ...bk.grid.totals, bk.grid.total].forEach((v, k) => put(ws, r, [k + 1, k + 1], v, { font: BOLD, align: k >= 5 ? 'right' : 'left' })); r += 2;
        }
        if (bk.colourways) {
            ['SR.NO', 'GARMENT COLOUR', 'FABRIC ITEM CODE', 'FABRIC DESCRIPTION', 'FIT', 'SIZES'].forEach((h, k) => put(ws, r, [k + 1, k + 1], h, { font: BOLD, fill: 'FFF1F5F9' })); r++;
            bk.colourways.forEach((c, i) => { [i + 1, c.colour, c.code, c.desc, c.fit, c.sizes].forEach((v, k) => put(ws, r, [k + 1, k + 1], v)); r++; });
            r++;
        }
        const qh = bk.withQty ? ['BOM QTY', 'BUY QTY', 'BUY UNIT'] : [];
        // one table row: text cells, then numbers with their formats; REMARKS without the "buy …" note when it has its own columns
        const tableRow = (lead, x, boldName) => {
            lead.forEach((v, k) => put(ws, r, [k + 1, k + 1], v, { font: k === 1 && boldName ? BOLD : undefined }));
            [x.classification ?? x.code, x.description, x.colour, x.size].forEach((v, k) => put(ws, r, [k + 3, k + 3], v));
            numCell(ws, r, 7, consCell(x.cons));
            put(ws, r, [8, 8], x.uom);
            numCell(ws, r, 9, pctCell(x.wastage));
            let c = 10;
            if (bk.withQty) {
                numCell(ws, r, c++, { v: Math.round(x.qty * 100) / 100, fmt: '#,##0.00' }, 'right', BOLD);
                numCell(ws, r, c++, x.buy ? { v: x.buy.qty, fmt: '#,##0.00' } : { v: '' });
                put(ws, r, [c, c], x.buy ? x.buy.uom : ''); c++;
            }
            const rem = x.buy && x.buyNote ? String(x.remarks || '').replace(x.buyNote, '').replace(/^ · /, '') : x.remarks;
            put(ws, r, [c, c], rem); put(ws, r, [c + 1, c + 1], '');
            ws.getRow(r).height = 38;
            r++;
        };
        ['SR.NO', 'ITEM CODE', 'CLASSIFICATION', 'DESCRIPTION', 'GARMENT COLOUR', 'SIZE', 'CONS./PC', 'UOM', 'WASTAGE', ...qh, 'REMARKS', 'SAMPLE'].forEach((h, k) => put(ws, r, [k + 1, k + 1], h, { font: BOLD, fill: 'FFF1F5F9' })); r++;
        bk.fabric.forEach((f, i) => tableRow([i + 1, f.code], f, false));
        r++;
        const trimHead = r;
        ['SR.NO', 'ITEM NAME', 'CLASSIFICATION', 'DESCRIPTION', 'GARMENT COLOUR', 'SIZE', 'CONS./PC', 'UOM', 'WASTAGE', ...qh, 'REMARKS', 'SAMPLE'].forEach((h, k) => put(ws, r, [k + 1, k + 1], h, { font: BOLD, fill: 'FFF1F5F9' })); r++;
        bk.trims.forEach((t, i) => t.rows.forEach((row, j) => tableRow([j === 0 ? i + 1 : '', j === 0 ? t.name : ''], row, j === 0)));
        // frozen item columns (A–B) while scrolling right; the trims heading repeats on every printed page
        ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 0 }];
        ws.pageSetup.printTitlesRow = `${trimHead}:${trimHead}`;
        r++;
        ws.getCell(r, 1).value = bk.footnote;
        ws.getCell(r, 1).font = { name: 'Arial', size: 8, color: { argb: 'FF6B7280' } };
    }
    return wb;
}

// Order BOM v2 straight from the order: fetch the sheet, build, download PDF or Excel.
// opts.summary: the Summary BOM (MATCH TO COLOR rows) instead of the detailed one.
export async function downloadOrderBomV2(planningApi, orderId, format, opts = {}) {
    const { data } = await planningApi.materialSheet(orderId);
    const blocks = buildOrderBomV2(data, { summary: !!opts.summary });
    if (!blocks.length) throw new Error('The order has no active lines with pieces.');
    const lh = await loadLetterhead();
    if (format === 'xlsx') return exportBomV2Xlsx(blocks, lh);
    return exportBomV2Pdf(blocks, lh);
}

export async function exportBomV2Xlsx(blocks, lh = null) {
    await saveWorkbook(await buildBomV2Workbook(blocks, lh), `${blocks[0]?.file || 'BOM-v2'}.xlsx`);
}
