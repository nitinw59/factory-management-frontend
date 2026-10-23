// Cutting documents (17 Oct 2026, asked: "find what's the problem with the current cut sheet … compare it with the
// 2.0 cut sheet; there is a lay sheet in 2.0, we must build it in 3.0").
//
// Lay sheet (A5 portrait, 2.0's "Lay Sheet (A5)"): printed for the cutting table before cutting — batch, layer
// length, size ratio, the rolls with the fabric assigned and the most lays each can give, and blank Lays / Short /
// End bit / Cons boxes plus a summary to fill in by hand; printed after cutting the boxes come filled.
//
// Cut sheet (A4 landscape, 2.0's "Cutting Report" + 3.0's checks): per roll — taken, lays, garments by size, pieces,
// fabric used by the lays, end bit, unaccounted fabric, consumption per garment against the BOM — with totals; the
// planned vs cut grid per colour × size; piece numbers per roll (mode 1) or per colour (mode 2) as a size matrix;
// fabric reconciliation; signatures. Both carry the company letterhead.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const LEN_PER_IN = { m: 0.0254, yd: 1 / 36 };
const num = (v, d = 2) => (v == null || v === '' ? '' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: d }));
const fixed = (v, d = 2) => (v == null ? '' : Number(v).toFixed(d));
const dmy = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const unitOf = (b) => b.totals?.uom || b.rolls[0]?.uom || 'm';
const layerLine = (b) => {
    const inches = Number(b.layer_length_in || 0);
    return `${num(inches)} in  (${num(inches * LEN_PER_IN.m)} m = ${num(inches * LEN_PER_IN.yd)} yd)`;
};
const ratioLine = (b, sep = ' / ') => b.ratios.map(r => `${r.size}-${r.ratio}`).join(sep);
const companyName = (c) => (c?.trade_name || c?.legal_name || '').toUpperCase();
const sizeGarments = (b, r) => Object.fromEntries(b.ratios.map(x => [x.size, r.lays && r.garments ? r.lays * x.ratio : 0]));
// Fabric used by the lays (in the roll's unit) and what is not accounted for: taken − used − end bit.
const usedOf = (b, r) => (r.lays && LEN_PER_IN[r.uom] ? r.lays * Number(b.layer_length_in) * LEN_PER_IN[r.uom] : null);
const unaccountedOf = (b, r) => { const u = usedOf(b, r); return u == null ? null : Math.round((r.metres - u - (r.end_bit_m || 0) - (r.short_m || 0)) * 100) / 100; };

// Batch number on every lay / cut sheet (20 Oct 2026, asked: "show and highlight batch id mandatorily"): the number
// printed on the pieces (#floor_no; the batch code if it has none) in a black box — big on page 1 by the title, small
// at the top of every later page — and bold in the footer of every page.
const batchNo = (b) => (b.floor_no != null && b.floor_no !== '' ? `#${b.floor_no}` : b.batch_code);
function batchBadge(doc, b, xRight, y, big) {
    const no = batchNo(b);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(big ? 18 : 11);
    const w = Math.max(big ? 30 : 22, doc.getTextWidth(no) + 8); const h = big ? 13 : 8;
    doc.setFillColor(0, 0, 0); doc.roundedRect(xRight - w, y, w, h, 1.2, 1.2, 'F');
    doc.setTextColor(255);
    if (big) { doc.setFontSize(6); doc.text('BATCH', xRight - w / 2, y + 3.4, { align: 'center' }); doc.setFontSize(18); doc.text(no, xRight - w / 2, y + 10.6, { align: 'center' }); }
    else { doc.setFontSize(5.5); doc.text('BATCH', xRight - w + 2.5, y + 5.1); doc.setFontSize(11); doc.text(no, xRight - 2.5, y + 5.8, { align: 'right' }); }
    doc.setTextColor(0);
    return w;
}
// Small badge on pages 2+ and the footer (batch bold, then page / printed) on every page.
function stampBatch(doc, b, { W, H, M }) {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p += 1) {
        doc.setPage(p);
        if (p > 1) batchBadge(doc, b, W - M, 3, false);
        const rest = ` ${b.batch_code} · page ${p} of ${pages} · printed ${dmy(new Date())}`;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(110);
        doc.text(rest, W - M, H - 4, { align: 'right' });
        const restW = doc.getTextWidth(rest);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(0);
        doc.text(`BATCH ${batchNo(b)}`, W - M - restW, H - 4, { align: 'right' });
        doc.setFont('helvetica', 'normal');
    }
}

function letterhead(doc, { company, assets, title, x0, width, y = 10, batch = null }) {
    let x = x0;
    const logo = assets?.logo;
    if (logo?.dataUrl) {
        try {
            const h = 11; const w = Math.min(32, (h * (logo.w || 1)) / (logo.h || 1));
            doc.addImage(logo.dataUrl, logo.format || 'PNG', x0, y - 2, w, h); x = x0 + w + 3;
        } catch { /* unreadable logo: name only */ }
    }
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(companyName(company) || ' ', x, y + 3);
    const badgeW = batch ? batchBadge(doc, batch, x0 + width, y - 3, true) + 3 : 0;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(title, x0 + width - badgeW, y + 3, { align: 'right' });
    doc.setLineWidth(0.3); doc.line(x0, y + 11, x0 + width, y + 11);
    return y + 15;
}

const GRID = { theme: 'grid', styles: { textColor: 0, lineColor: 0, lineWidth: 0.1 }, headStyles: { fillColor: [235, 238, 243], textColor: 0, fontStyle: 'bold', lineColor: 0, lineWidth: 0.1, halign: 'center' } };

// ── Lay sheet ────────────────────────────────────────────────────────
export function exportLaySheet(b, company = null, assets = {}) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
    const W = doc.internal.pageSize.width; const H = doc.internal.pageSize.height; const M = 8; const CW = W - 2 * M;
    const u = unitOf(b);
    const cut = b.rolls.some(r => r.lays);
    let y = letterhead(doc, { company, assets, title: 'LAY SHEET', x0: M, width: CW, batch: b });
    autoTable(doc, {
        ...GRID, startY: y, margin: { left: M, right: M },
        body: [
            ['Batch no.', { content: `${batchNo(b)}   ${b.batch_code}`, styles: { fontStyle: 'bold', fontSize: 9, fillColor: [255, 236, 153] } }, 'Date', dmy(b.finalized_at || b.created_at)],
            ['Order', `${b.line.order_no} · line ${b.line.line_no}`, 'Ship', dmy(b.line.ship_date)],
            ['Customer', b.line.customer_name, 'Style', `${b.line.style_code} ${b.line.style_name || ''}`],
            ['Layer length', layerLine(b), 'Numbering', b.numbering_mode === 'MODE_2' ? 'Continuous (mode 2)' : 'Per roll (mode 1)'],
            ['Size ratio', `${ratioLine(b)}   = ${b.ratio_sum} garments per lay`, '', ''],
        ],
        styles: { ...GRID.styles, fontSize: 7, cellPadding: 1.2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 20 }, 1: { cellWidth: 58 }, 2: { fontStyle: 'bold', cellWidth: 16 } },
        didParseCell: (d) => { if (d.row.index === 4 && d.column.index === 1) d.cell.colSpan = 3; },
    });
    if (b.gate_override) { doc.setFontSize(7); doc.setTextColor(170, 30, 30); doc.text('Released for cutting before all material was allocated.', M, doc.lastAutoTable.finalY + 4); doc.setTextColor(0); }
    y = doc.lastAutoTable.finalY + (b.gate_override ? 8 : 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('CUTTING LAY DETAILS', M, y);
    const body = b.rolls.map(r => [
        r.floor_roll_no ?? r.roll_sequence, r.roll_no, r.dye_lot || '', `${r.colour}`, `${num(r.metres)}`, r.max_lays ?? '',
        r.lays ?? '', r.lays && r.short_m ? num(r.short_m) : '', r.lays ? num(r.end_bit_m) : '',
        r.lays && r.garments ? fixed((r.metres - (r.end_bit_m || 0)) / r.garments, 3) : '',
    ]);
    const tot = b.rolls.reduce((s, r) => ({ m: s.m + Number(r.metres || 0), lays: s.lays + (r.lays || 0), eb: s.eb + Number(r.end_bit_m || 0), sh: s.sh + Number(r.short_m || 0), g: s.g + (r.garments || 0) }), { m: 0, lays: 0, eb: 0, sh: 0, g: 0 });
    body.push(['', 'TOTAL', '', '', num(tot.m), '', cut ? tot.lays : '', cut && tot.sh ? num(tot.sh) : '', cut ? num(tot.eb) : '', '']);
    autoTable(doc, {
        ...GRID, startY: y + 2, margin: { left: M, right: M },
        head: [['Roll no.', 'Store tag', 'Lot', 'Colour', `Assigned (${u})`, 'Max lays', 'Lays', 'Short', 'End bit', `Cons (${u}/pc)`]],
        body,
        styles: { ...GRID.styles, fontSize: 7, cellPadding: 1.4, halign: 'center', valign: 'middle', minCellHeight: 7 },
        headStyles: { ...GRID.headStyles, fontSize: 6.5 },
        columnStyles: { 0: { cellWidth: 6 }, 1: { cellWidth: 14, halign: 'left', fontStyle: 'bold' }, 2: { cellWidth: 11 }, 3: { halign: 'left' }, 4: { halign: 'right', fontStyle: 'bold' } },
        didParseCell: (d) => { if (d.section === 'body' && d.row.index === body.length - 1) d.cell.styles.fontStyle = 'bold'; },
    });
    // Fabric names under the table (the roll table stays narrow enough for A5).
    y = doc.lastAutoTable.finalY + 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    const fabrics = [...new Map(b.rolls.map(r => [r.fabric_label, r.parts.map(p => p.part_name).join(', ')])).entries()];
    fabrics.forEach(([f, parts]) => { doc.text(`${f}  —  ${parts}`, M, y); y += 3; });
    if (y > H - 62) { doc.addPage(); y = 12; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('SUMMARY', M, y + 3);
    const used = b.totals?.expected_m;
    autoTable(doc, {
        ...GRID, startY: y + 5, margin: { left: M, right: M }, tableWidth: 78,
        body: [
            ['Total fabric assigned', `${num(tot.m)} ${u}`],
            ['Total fabric consumed (lays)', cut ? `${num(used)} ${u}` : ''],
            ['Total shortage', cut ? `${num(tot.sh)} ${u}` : ''],
            ['Total end bits', cut ? `${num(tot.eb)} ${u}` : ''],
            ['Total no. of lays', cut ? String(tot.lays) : ''],
            ['Total cut qty (garments)', cut ? String(tot.g) : ''],
        ],
        styles: { ...GRID.styles, fontSize: 7, cellPadding: 1.4, minCellHeight: 6.5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 46 }, 1: { halign: 'right' } },
    });
    y = Math.max(doc.lastAutoTable.finalY + 16, H - 20);
    if (y > H - 8) { doc.addPage(); y = 30; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    [['Prepared by', M], ['Cutter', M + CW / 3], ['Authorised by', M + (2 * CW) / 3]].forEach(([t, x]) => { doc.line(x, y, x + CW / 3 - 6, y); doc.text(t, x, y + 4); });
    stampBatch(doc, b, { W, H, M });
    doc.save(`LaySheet-${b.batch_code.replace(/[^\w-]+/g, '-')}.pdf`);
}

// ── Cut sheet ────────────────────────────────────────────────────────
// One end bit piece in words (24 Oct 2026, "EB-41-L 0" read as missing fabric): its length when cut and what became of it —
// "EB-41-L 2.9, used on #507", "EB-41-R 1.1", "EB-41-R 1.1 (0.6 left)", "… w/o", "…, returned to store". Plain ASCII: the
// PDF's built-in font has no arrow.
export function endBitText(e) {
    const orig = e.original_m ?? e.metres;
    if (e.status === 'WRITTEN_OFF') return `${e.tag} ${num(orig)} w/o`;
    if (e.status === 'RETURNED') return `${e.tag} ${num(orig)}, returned to store`;
    if (e.status === 'ON_BATCH') return `${e.tag} ${num(orig)}, on #${e.used_on_floor_no ?? '?'}`;
    if (e.status === 'USED') return `${e.tag} ${num(orig)}, ${e.used_on_floor_no ? `used on #${e.used_on_floor_no}` : 'used'}`;
    return Number(e.metres) < Number(orig) - 1e-9 ? `${e.tag} ${num(orig)} (${num(e.metres)} left)` : `${e.tag} ${num(e.metres)}`;
}

export function exportCutSheet(b, company = null, assets = {}) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.width; const H = doc.internal.pageSize.height; const M = 10; const CW = W - 2 * M;
    const u = unitOf(b);
    const sizes = b.ratios.map(r => r.size);
    let y = letterhead(doc, { company, assets, title: `CUT SHEET  ${b.batch_code}`, x0: M, width: CW, batch: b });
    // Batch facts as a label / value grid (17 Oct 2026: the three run-on "·" lines were hard to read).
    const who = (when, name) => [dmy(when), name ? `by ${name}` : ''].filter(Boolean).join(' ');
    const L = (t) => ({ content: t, styles: { fontStyle: 'bold', textColor: [90, 90, 90], fillColor: [245, 246, 248] } });
    autoTable(doc, {
        ...GRID, startY: y, margin: { left: M, right: M },
        body: [
            [L('Order'), `${b.line.order_no} · line ${b.line.line_no}`, L('Customer'), b.line.customer_name, L('Style'), `${b.line.style_code} ${b.line.style_name || ''}`, L('Ship'), dmy(b.line.ship_date)],
            [L('Layer length'), layerLine(b), L('Size ratio'), { content: ratioLine(b, '   '), colSpan: 3 }, L('Per lay'), `${b.ratio_sum} garments`],
            [L('Numbering'), b.numbering_mode === 'MODE_2' ? 'Continuous across rolls (mode 2)' : 'Per roll (mode 1)', L('Status'), b.status === 'CUT' ? 'Cut' : b.status.charAt(0) + b.status.slice(1).toLowerCase(),
                L('Finalised'), who(b.finalized_at, b.finalized_by_name) || '—', L('Created'), who(b.created_at, b.created_by_name)],
            ...(b.gate_override ? [[L('Note'), { content: 'Released for cutting before all material was allocated.', colSpan: 7, styles: { textColor: [180, 20, 20], fontStyle: 'bold' } }]] : []),
        ],
        styles: { ...GRID.styles, fontSize: 7.8, cellPadding: 1, valign: 'middle' },
        columnStyles: { 0: { cellWidth: 24 }, 2: { cellWidth: 20 }, 4: { cellWidth: 18 }, 6: { cellWidth: 18 } },
    });
    y = doc.lastAutoTable.finalY + 3;

    // Rolls: garments by size, fabric reconciliation, consumption vs BOM.
    const rows = b.rolls.map(r => {
        const g = sizeGarments(b, r);
        const used = usedOf(b, r); const un = unaccountedOf(b, r);
        const cons = r.lays && r.garments ? (r.metres - (r.end_bit_m || 0)) / r.garments : null;
        return { r, g, used, un, cons };
    });
    const T = rows.reduce((s, x) => ({ taken: s.taken + Number(x.r.metres || 0), lays: s.lays + (x.r.lays || 0), garments: s.garments + (x.r.garments || 0), pieces: s.pieces + (x.r.pieces || 0),
        used: s.used + (x.used || 0), eb: s.eb + Number(x.r.end_bit_m || 0), sh: s.sh + Number(x.r.short_m || 0), un: s.un + (x.un || 0) }), { taken: 0, lays: 0, garments: 0, pieces: 0, used: 0, eb: 0, sh: 0, un: 0 });
    // Pocketing / lining per garment colour (24 Oct 2026: "add column for pocketing color, example BLACK, and on header cell
    // the pocketing name highlighted") — one column per pocketing / lining fabric, right after Colour.
    const sup = b.support_columns || [];
    const nS = sup.length;
    const body = rows.map(({ r, g, used, un, cons }) => [
        r.floor_roll_no ?? r.roll_sequence, r.roll_no, r.dye_lot || '', r.fabric_label, r.colour, ...sup.map(c => c.cells[r.garment_colour_id] || '—'), num(r.metres), r.lays ?? '',
        ...sizes.map(s => (g[s] || '')), r.garments || '', r.pieces || '',
        used != null ? num(used) : '', [num(r.end_bit_m), ...(r.end_bits || []).map(endBitText)].filter(Boolean).join('\n'),   // end-bit tags under the roll (19 Oct 2026)
        r.short_m ? num(r.short_m) : '', un != null ? num(un) : '',
        cons != null ? fixed(cons, 3) : '', r.bom_per_garment != null ? fixed(r.bom_per_garment, 3) : '',
    ]);
    const totGarmentsBySize = Object.fromEntries(sizes.map(s => [s, rows.reduce((t, x) => t + (x.g[s] || 0), 0)]));
    body.push(['', 'TOTAL', '', '', '', ...sup.map(() => ''), num(T.taken), T.lays, ...sizes.map(s => totGarmentsBySize[s] || ''), T.garments, T.pieces, num(T.used), num(T.eb), num(T.sh), num(T.un),
        T.garments ? fixed((T.taken - T.eb) / T.garments, 3) : '', '']);
    const head = [['Roll no.', 'Store tag', 'Lot', 'Fabric', 'Colour', ...sup.map(c => c.title), `Taken ${u}`, 'Lays', ...sizes, 'Garm.', 'Pieces', `Used ${u}`, `End bit`, `Short`, `Unacc.`, `Cons/pc`, `BOM/pc`]];
    const unIdx = 7 + nS + sizes.length + 5; const consIdx = unIdx + 1;
    const isSup = (i) => i >= 5 && i < 5 + nS;
    autoTable(doc, {
        ...GRID, startY: y, margin: { left: M, right: M }, head, body,
        styles: { ...GRID.styles, fontSize: 7, cellPadding: 1.2, halign: 'center', valign: 'middle' },
        headStyles: { ...GRID.headStyles, fontSize: 6.8 },
        columnStyles: { 1: { fontStyle: 'bold' }, 3: { halign: 'left', cellWidth: 46 }, 4: { halign: 'left' } },
        didParseCell: (d) => {
            // the pocketing / lining header highlighted, its cells bold
            if (d.section === 'head' && isSup(d.column.index)) { d.cell.styles.fillColor = [253, 224, 71]; d.cell.styles.textColor = [20, 20, 20]; d.cell.styles.fontStyle = 'bold'; }
            if (d.section !== 'body') return;
            if (isSup(d.column.index)) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [254, 249, 195]; }
            if (d.row.index === body.length - 1) d.cell.styles.fontStyle = 'bold';
            const x = rows[d.row.index];
            if (x && d.column.index === unIdx && x.un != null && x.un > Math.max(0.5, x.r.metres * 0.03)) { d.cell.styles.textColor = [180, 20, 20]; d.cell.styles.fontStyle = 'bold'; }
            if (x && d.column.index === consIdx && x.cons != null && x.r.bom_per_garment && x.cons > x.r.bom_per_garment * 1.05) { d.cell.styles.textColor = [180, 20, 20]; d.cell.styles.fontStyle = 'bold'; }
        },
    });
    y = doc.lastAutoTable.finalY + 3;
    doc.setFontSize(6.8); doc.setFont('helvetica', 'normal');
    doc.text(`Used = lays x layer length.  Unaccounted = taken - used - end bit - short (red above 3 % of the roll: waste or fabric not returned).  Cons/pc = (taken - end bit) / garments;  BOM/pc = Order BOM fabric per planned garment.  Parts: ${[...new Set(b.rolls.flatMap(r => r.parts.map(p => p.part_name)))].join(', ')}.`, M, y, { maxWidth: CW });
    y += 5;

    // Fabric reconciliation box (left) and planned vs cut (right).
    const leftW = 92;
    autoTable(doc, {
        ...GRID, startY: y, margin: { left: M }, tableWidth: leftW,
        head: [['Fabric', `${u}`]],
        body: [['Taken (issued rolls + lay pieces)', num(T.taken)], ['Used by the lays', num(T.used)], ['End bits kept at cutting (reserve + lay)', num(T.eb)], ['Short (roll had less than its label)', num(T.sh)],
            ['Not accounted for', num(T.un)], ['Garments cut', String(T.garments)], [`Consumption per garment`, T.garments ? fixed((T.taken - T.eb) / T.garments, 3) : '']],
        styles: { ...GRID.styles, fontSize: 7.5, cellPadding: 1.3 }, columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
        didParseCell: (d) => { if (d.section === 'body' && d.row.index === 4 && T.un > Math.max(0.5, T.taken * 0.03)) { d.cell.styles.textColor = [180, 20, 20]; d.cell.styles.fontStyle = 'bold'; } },
    });
    const afterLeft = doc.lastAutoTable.finalY;
    const g = b.grid || { sizes: [], colours: [], cells: [] };
    const cell = (c, s) => g.cells.find(x => x.colour_id === c.id && x.size_id === s.id);
    autoTable(doc, {
        ...GRID, startY: y, margin: { left: M + leftW + 6, right: M },
        head: [['Cut / planned (all batches of the line)', ...g.sizes.map(s => s.name), 'Total']],
        body: g.colours.map(c => {
            const cs = g.sizes.map(s => cell(c, s));
            const cutT = cs.reduce((t, x) => t + (x?.cut || 0), 0); const plT = cs.reduce((t, x) => t + (x?.planned || 0), 0);
            return [c.name, ...cs.map(x => (x ? `${x.cut}/${x.planned}` : '')), `${cutT}/${plT}`];
        }),
        styles: { ...GRID.styles, fontSize: 7, cellPadding: 1.2, halign: 'center' }, columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
        didParseCell: (d) => {
            if (d.section !== 'body' || d.column.index === 0) return;
            const c = g.colours[d.row.index]; const s = g.sizes[d.column.index - 1]; const x = c && s ? cell(c, s) : null;
            if (x?.over > 0) { d.cell.styles.textColor = [180, 20, 20]; d.cell.styles.fontStyle = 'bold'; }
        },
    });
    y = Math.max(afterLeft, doc.lastAutoTable.finalY) + 4;

    // Piece numbers: per roll (mode 1) — rows roll × part, columns sizes, "first–last".
    const nums = b.roll_numbers || [];
    if (nums.length) {
        if (y > H - 40) { doc.addPage(); y = 14; }
        const keyRows = [...new Map(nums.map(n => [`${n.roll_sequence}|${n.part_name}`, n])).values()];
        const rollOf = (seq) => b.rolls.find(r => r.roll_sequence === seq);
        const sameAcrossParts = b.numbering_mode !== 'MODE_2';
        // Mode 1: every part of a roll has the same numbers — one row per roll.
        const list = sameAcrossParts ? [...new Map(keyRows.map(n => [n.roll_sequence, n])).values()] : keyRows;
        autoTable(doc, {
            ...GRID, startY: y, margin: { left: M, right: M },
            head: [[sameAcrossParts ? 'Piece numbers per roll (all parts)' : 'Piece numbers (roll · part)', ...sizes]],
            body: list.map(n => {
                const rl = rollOf(n.roll_sequence);
                return [`Roll ${rl?.floor_roll_no ?? n.roll_sequence} (tag ${rl?.roll_no || ''}) · ${rl?.colour || ''}${sameAcrossParts ? '' : ` · ${n.part_name}`}`,
                    ...sizes.map(s => { const x = nums.find(z => z.roll_sequence === n.roll_sequence && z.size === s && z.part_name === n.part_name); return x ? `${x.first_no}–${x.last_no}` : ''; })];
            }),
            styles: { ...GRID.styles, fontSize: 7, cellPadding: 1.1, halign: 'center' }, columnStyles: { 0: { halign: 'left', cellWidth: 70 } },
        });
        y = doc.lastAutoTable.finalY + 4;
    }

    // Signatures (kept on the last page when there is room: line at least 8 mm below the tables).
    y = Math.max(y + 8, H - 14);
    if (y > H - 10) { doc.addPage(); y = 30; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const sig = ['Cutting manager', 'Cutter', 'Fabric store', 'Checked by'];
    sig.forEach((t, i) => { const x = M + (i * CW) / sig.length; doc.line(x, y, x + CW / sig.length - 10, y); doc.text(t, x, y + 4); });
    stampBatch(doc, b, { W, H, M });
    doc.save(`CutSheet-${b.batch_code.replace(/[^\w-]+/g, '-')}.pdf`);
}
