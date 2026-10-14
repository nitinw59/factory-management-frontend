// BOM layout v2 (13 Oct 2026) — the factory's own Excel order BOM layout, for both BOMs:
//   Order BOM: header (sales order, order type, buyer, brand | style category, name, no., SAM, fit,
//              cut allowance) → colour × size quantity grid (rows by the colour's shell fabric) →
//              fabric block (pocketing included) → trims block (per colour, or one "Same in all" row),
//              with consumption per piece, unit, wastage, BOM qty and remarks.
//   Style BOM: the same without order quantities — header (style), colourways, fabric, trims.
// Fabric and trims tables end with a blank SAMPLE column (tall rows) to stick the real swatch / trim.
// Offered next to layout v1 (to be removed later). One model → PDF (jsPDF + autotable) and Excel
// (ExcelJS), one page / sheet per order line (style).
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
// Per-piece consumption: one value, or "30: 1.2 · 32: 1.25 …" when it changes by size.
function consText(pairs) {
    const vals = [...new Set(pairs.map(p => Number(p.c)))];
    if (vals.length <= 1) return num(vals[0]);
    const seen = new Map();
    pairs.forEach(p => { if (!seen.has(p.s)) seen.set(p.s, p.c); });
    return [...seen.entries()].map(([s, c]) => `${s}: ${num(c)}`).join(' · ');
}
const purchaseNote = (usageQty, uom, info) => {
    if (!info || !info.purchase_uom || !info.factor || Number(info.factor) === 1) return '';   // same quantity in both units: nothing to add
    return `= ${num(usageQty / Number(info.factor), 2)} ${info.purchase_uom}`;
};

// ── Order BOM ────────────────────────────────────────────────────────────
export function buildOrderBomV2(d) {
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
            return { size: sizeRange(det.filter(t => Number(t.ordered) > 0).map(t => t.size), sizeOrder), cons: consText(det.map(t => ({ s: t.size, c: t.consumption }))), wastage: det[0] ? `${num(det[0].wastage_pct, 2)}%` : '' };
        };
        const fabric = fabricRows
            .sort((a, b) => ROLE_ORDER.indexOf(a.r.fabric_role) - ROLE_ORDER.indexOf(b.r.fabric_role) || a.r.colour.localeCompare(b.r.colour))
            .map(x => ({ code: x.it.info?.code || x.it.label, classification: x.it.info?.shade_name || x.it.info?.shade_code || '', description: x.it.info?.composition || x.it.info?.mill || '',
                colour: x.r.colour, ...line(x), uom: x.it.uom, qty: x.r.required_qty,
                remarks: [x.r.fabric_role && x.r.fabric_role !== 'SHELL' ? `${ROLE[x.r.fabric_role] || x.r.fabric_role} fabric` : '', x.r.notes || ''].filter(Boolean).join(' · ') }));
        // trims: per BOM line; one "Same in all" row when every colour uses the same item
        const byLine = new Map();
        for (const x of trimRows) { const k = x.r.bom_line_id; if (!byLine.has(k)) byLine.set(k, []); byLine.get(k).push(x); }
        const trims = [...byLine.values()].sort((a, b) => (a[0].r.bom_sort ?? 0) - (b[0].r.bom_sort ?? 0)).map(group => {
            const items = new Set(group.map(x => x.it.key));
            const name = `${group[0].r.trim_type || group[0].r.bom_line}${group[0].r.placement ? ` (${group[0].r.placement})` : ''}`;
            const mk = (x, colour, qty, det) => {
                const info = { purchase_uom: x.it.purchase_uom, factor: x.it.usage_per_purchase_uom };
                return { classification: x.it.info?.code || x.it.label, description: x.it.info?.description || '', colour,
                    size: sizeRange(det.filter(t => Number(t.ordered) > 0).map(t => t.size), sizeOrder), cons: consText(det.map(t => ({ s: t.size, c: t.consumption }))),
                    uom: x.it.uom, wastage: det[0] ? `${num(det[0].wastage_pct, 2)}%` : '', qty,
                    remarks: [purchaseNote(qty, x.it.uom, info), x.r.notes || ''].filter(Boolean).join(' · ') };
            };
            if (items.size === 1 && group.length > 1) {
                const det = group.flatMap(x => x.r.detail || []);
                const r = mk(group[0], 'Same in all', group.reduce((s, x) => s + x.r.required_qty, 0), det);
                r.remarks = [r.remarks, 'Same in all colours'].filter(Boolean).join(' · ');
                return { name, rows: [r] };
            }
            return { name, rows: group.sort((a, b) => a.r.colour.localeCompare(b.r.colour)).map(x => mk(x, x.r.colour, x.r.required_qty, x.r.detail || [])) };
        });
        return {
            title: `ORDER BOM${d.estimate ? ' — ESTIMATE' : ''}`, sheet: `L${L.line_no} ${L.style_code}`, estimate: !!d.estimate,
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
            file: `Order-BOM-v2-${o.order_no}`.replace(/[^\w.-]+/g, '-'),
        };
    });
}

// ── Style BOM ────────────────────────────────────────────────────────────
export function buildStyleBomV2(card) {
    const b = card.bom;
    const sizeName = new Map(card.sizes.map(z => [z.id, z.name]));
    const sizeOrder = card.sizes.map(z => z.name);
    const allSizes = sizeRange(sizeOrder, sizeOrder);
    const cons = (l) => (l.consumption_basis === 'PER_GARMENT' ? num(l.qty_per_garment) : consText(l.sizes.map(z => ({ s: z.size_name, c: z.qty }))));
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
    const trims = [...card.trims].map((l, k) => ({ l, k })).sort((x, y) => (x.l.issue_stage_sort ?? 9999) - (y.l.issue_stage_sort ?? 9999) || x.k - y.k).map(({ l }) => {
        const name = `${l.trim_type_name}${l.placement ? ` (${l.placement})` : ''}`;
        const rowFor = (colour, g, problems = []) => ({
            classification: g?.info?.code || g?.label || '—', description: g?.info?.description || '', colour,
            size: g?.size_ids ? sizeRange(g.size_ids.map(z => sizeName.get(z)), sizeOrder) : allSizes, cons: cons(l), uom: l.uom, wastage: `${num(l.wastage_pct || 0, 2)}%`,
            remarks: [g?.info?.purchase_uom && g.info.factor && Number(g.info.factor) !== 1 ? `bought in ${g.info.purchase_uom} (1 = ${num(g.info.factor)} ${l.uom})` : '', l.notes || '', ...problems.map(p => `! ${p}`)].filter(Boolean).join(' · '),
        });
        const keys = card.colours.map(c => JSON.stringify((l.cells[c.id]?.groups || []).map(g => [g.item_id, g.size_ids])));
        if (card.colours.length > 1 && keys.every(k => k === keys[0]) && keys[0] !== '[]') {
            const groups = l.cells[card.colours[0].id].groups;
            return { name, rows: groups.map(g => ({ ...rowFor('Same in all', g), remarks: [rowFor('Same in all', g).remarks, 'Same in all colours'].filter(Boolean).join(' · ') })) };
        }
        return { name, rows: card.colours.flatMap(c => { const cell = l.cells[c.id]; return cell?.groups.length ? cell.groups.map(g => rowFor(c.name, g, cell.problems)) : [rowFor(c.name, null, cell?.problems || [])]; }) };
    });
    return [{
        title: 'STYLE BOM', sheet: b.style_code, estimate: false,
        header: [
            ['STYLE NO', b.style_code, 'Style category', b.product_type || ''],
            ['STYLE NAME', b.style_name || '', 'Fit', b.fit || ''],
            ['BUYER NAME', b.buyer || '', 'SAM', b.sam != null ? num(b.sam, 3) : ''],
            ['BRAND NAME', b.brand || '', 'Style BOM', `v${b.version_no} · ${String(b.status).replace('_', ' ').toLowerCase()}`],
        ],
        colourways, fabric, trims, withQty: false,
        footnote: card.ready ? 'Consumption is per garment; the order BOM multiplies it by the order quantity.' : `NOT READY: ${card.problems.length} unresolved item(s), marked "!".`,
        file: `Style-BOM-v2-${b.style_code}-v${b.version_no}`.replace(/[^\w.-]+/g, '_'),
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
        const sampleCol = 11 + (bk.withQty ? 1 : 0);   // SAMPLE after REMARKS in the fabric / trims tables
        const cols = Math.max(sampleCol, 6 + sizes.length + 1);
        ws.columns = Array.from({ length: cols }, (_, k) => ({ width: k + 1 === sampleCol ? 20 : [7, 18, 26, 22, 18, 10, 12, 8, 10, 12, 22][k] ?? 10 }));
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
        const qh = bk.withQty ? ['BOM QTY'] : [];
        ['SR.NO', 'ITEM CODE', 'CLASSIFICATION', 'DESCRIPTION', 'GARMENT COLOUR', 'SIZE', 'CONS./PC', 'UOM', 'WASTAGE', ...qh, 'REMARKS', 'SAMPLE'].forEach((h, k) => put(ws, r, [k + 1, k + 1], h, { font: BOLD, fill: 'FFF1F5F9' })); r++;
        bk.fabric.forEach((f, i) => { [i + 1, f.code, f.classification, f.description, f.colour, f.size, f.cons, f.uom, f.wastage, ...(bk.withQty ? [Math.round(f.qty * 100) / 100] : []), f.remarks, ''].forEach((v, k) => put(ws, r, [k + 1, k + 1], v, { align: k === 6 || k === 8 || (bk.withQty && k === 9) ? 'right' : 'left' })); ws.getRow(r).height = 38; r++; });
        r++;
        ['SR.NO', 'ITEM NAME', 'CLASSIFICATION', 'DESCRIPTION', 'GARMENT COLOUR', 'SIZE', 'CONS./PC', 'UOM', 'WASTAGE', ...qh, 'REMARKS', 'SAMPLE'].forEach((h, k) => put(ws, r, [k + 1, k + 1], h, { font: BOLD, fill: 'FFF1F5F9' })); r++;
        bk.trims.forEach((t, i) => t.rows.forEach((row, j) => {
            [j === 0 ? i + 1 : '', j === 0 ? t.name : '', row.classification, row.description, row.colour, row.size, row.cons, row.uom, row.wastage, ...(bk.withQty ? [Math.round(row.qty * 100) / 100] : []), row.remarks, '']
                .forEach((v, k) => put(ws, r, [k + 1, k + 1], v, { font: k === 1 && j === 0 ? BOLD : undefined, align: k === 6 || k === 8 || (bk.withQty && k === 9) ? 'right' : 'left' }));
            ws.getRow(r).height = 38;
            r++;
        }));
        r++;
        ws.getCell(r, 1).value = bk.footnote;
        ws.getCell(r, 1).font = { name: 'Arial', size: 8, color: { argb: 'FF6B7280' } };
    }
    return wb;
}

// Order BOM v2 straight from the order: fetch the sheet, build, download PDF or Excel.
export async function downloadOrderBomV2(planningApi, orderId, format) {
    const { data } = await planningApi.materialSheet(orderId);
    const blocks = buildOrderBomV2(data);
    if (!blocks.length) throw new Error('The order has no active lines with pieces.');
    const lh = await loadLetterhead();
    if (format === 'xlsx') return exportBomV2Xlsx(blocks, lh);
    return exportBomV2Pdf(blocks, lh);
}

export async function exportBomV2Xlsx(blocks, lh = null) {
    await saveWorkbook(await buildBomV2Workbook(blocks, lh), `${blocks[0]?.file || 'BOM-v2'}.xlsx`);
}
