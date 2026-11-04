// Fabric stock export (4 Nov 2026, owner: "export excel or pdf ... filtered data"): the fabrics the page's filter and search
// show, then their rolls in stock. Excel: a Fabrics and a Rolls sheet. PDF: letterhead, the same two tables. Totals per unit,
// as yards and metres can't be added together.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtQty } from '../components/ui';
import { drawPdfLetterhead } from '../components/letterhead';
import { newWorkbook, saveWorkbook, BOX, FONT, BOLD } from '../components/xlsxSave';
import { todayLocal } from '../salesOrders/SalesOrderStatusBadge';

const round3 = (n) => Math.round(Number(n) * 1000) / 1000;
export const naturally = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
export const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const ageDays = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
export const rollFrom = (x) => (x.source === 'OPENING' ? 'Opening' : x.source === 'REMNANT' ? `Remnant${x.parent_roll_no ? ` of ${x.parent_roll_no}` : ''}` : 'GRN');
const unitsOf = (list) => [...new Set(list.map(r => r.uom))].sort(naturally);
const sumOf = (list, field) => round3(list.reduce((s, r) => s + (Number(r[field]) || 0), 0));
// Yards and metres can't be added together: "1,200 m + 340 yd".
export const perUnit = (list, field) => unitsOf(list).map(u => `${fmtQty(sumOf(list.filter(r => r.uom === u), field))} ${u}`).join(' + ') || '0';

const heldText = (f) => f.held_by.map(h => `${h.order_no} ${fmtQty(h.qty)} ${f.uom}`).join('; ');
const rollHolders = (x) => x.held_by.map(h => h.order_no).join(', ');
const widthOf = (x) => (x.width ? `${x.width} ${x.width_unit}` : '');
const describe = ({ fabrics, rolls, filter, search, by }) => [`Filter: ${filter}`, search ? `Search: "${search}"` : null, `${fabrics.length} fabric${fabrics.length === 1 ? '' : 's'}, ${rolls.length} roll${rolls.length === 1 ? '' : 's'} in stock`,
    `Exported ${new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${by ? ` by ${by}` : ''}`].filter(Boolean).join(' · ');
const fileName = (filter, ext) => `Fabric-stock-${filter.replace(/\s+/g, '-')}-${todayLocal()}.${ext}`;

// Each shown fabric with its rolls by dye lot (lot not recorded last), roll numbers in number order.
const inGroups = (fabrics, rolls) => fabrics.map(f => {
    const lots = new Map();
    for (const x of rolls.filter(r => String(r.fabric_item_id) === String(f.id)).sort((a, b) => naturally(a.roll_no, b.roll_no))) {
        const k = x.dye_lot || '';
        if (!lots.has(k)) lots.set(k, []);
        lots.get(k).push(x);
    }
    return { fabric: f, lots: [...lots.entries()].sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1) || naturally(a, b)) };
}).filter(g => g.lots.length);

function sheet(wb, name, title, note, cols, rows, totals, line3 = '') {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map(c => ({ width: c.width }));
    ws.getCell(1, 1).value = title; ws.getCell(1, 1).font = { ...BOLD, size: 13 };
    ws.getCell(2, 1).value = note; ws.getCell(2, 1).font = FONT;
    ws.getCell(3, 1).value = line3; ws.getCell(3, 1).font = BOLD;
    const write = (rowNo, values, font) => values.forEach((v, i) => {
        const cell = ws.getCell(rowNo, i + 1);
        cell.value = v ?? '';
        cell.font = font;
        cell.border = BOX;
        if (cols[i].fmt) cell.numFmt = cols[i].fmt;
        if (cols[i].right) cell.alignment = { horizontal: 'right' };
    });
    const head = 4;
    write(head, cols.map(c => c.label), BOLD);
    cols.forEach((c, i) => { const cell = ws.getCell(head, i + 1); cell.numFmt = 'General'; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; });
    rows.forEach((r, i) => write(head + 1 + i, r, FONT));
    totals.forEach((r, i) => write(head + 1 + rows.length + i, r, BOLD));
    ws.views = [{ state: 'frozen', ySplit: head }];
    if (rows.length) ws.autoFilter = { from: { row: head, column: 1 }, to: { row: head + rows.length, column: cols.length } };
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${head}:${head}` };
    return ws;
}

export async function exportFabricStockExcel(data) {
    const { fabrics, rolls, filter } = data;
    const note = describe(data);
    const wb = await newWorkbook();
    const QTY = '#,##0.###';
    sheet(wb, 'Fabrics', 'Fabric stock', note, [
        { label: 'Fabric', width: 44 }, { label: 'Unit', width: 6 }, { label: 'On hand', width: 11, fmt: QTY, right: true }, { label: 'Rolls', width: 7, right: true }, { label: 'Lots', width: 6, right: true },
        { label: 'Allocated', width: 11, fmt: QTY, right: true }, { label: 'Free', width: 11, fmt: QTY, right: true }, { label: 'Rolls missing lot, width or location', width: 16, right: true }, { label: 'Held by', width: 44 },
    ], fabrics.map(f => [f.label, f.uom, f.on_hand, f.rolls, f.dye_lots.length, f.allocated, f.free, f.rolls_missing_data, heldText(f)]),
    unitsOf(fabrics).map(u => { const l = fabrics.filter(f => f.uom === u); return [`Total ${u}`, u, sumOf(l, 'on_hand'), sumOf(l, 'rolls'), '', sumOf(l, 'allocated'), sumOf(l, 'free'), sumOf(l, 'rolls_missing_data'), '']; }));

    const flat = inGroups(fabrics, rolls).flatMap(g => g.lots.flatMap(([, list]) => list));
    const dateOf = (d) => { const x = new Date(d); return new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())); };   // the local day, as Excel takes dates as UTC
    sheet(wb, 'Rolls in stock', 'Fabric stock: rolls in stock', note, [
        { label: 'Fabric', width: 44 }, { label: 'Dye lot', width: 12 }, { label: 'Roll no.', width: 11 }, { label: 'Width', width: 9 }, { label: 'Unit', width: 6 }, { label: 'Now', width: 10, fmt: QTY, right: true },
        { label: 'Received qty', width: 11, fmt: QTY, right: true }, { label: 'Received on', width: 12, fmt: 'dd-mmm-yyyy', right: true }, { label: 'Age (days)', width: 8, right: true }, { label: 'Location', width: 14 }, { label: 'From', width: 14 }, { label: 'Held by', width: 20 },
    ], flat.map(x => [x.item_label, x.dye_lot || '', x.roll_no, widthOf(x), x.uom, x.qty, x.original_qty, dateOf(x.created_at), ageDays(x.created_at), x.location || '', rollFrom(x), rollHolders(x)]),
    unitsOf(flat).map(u => { const l = flat.filter(x => x.uom === u); return [`Total ${u} · ${l.length} roll${l.length === 1 ? '' : 's'}`, '', '', '', u, sumOf(l, 'qty'), sumOf(l, 'original_qty'), '', '', '', '', '']; }));
    await saveWorkbook(wb, fileName(filter, 'xlsx'));
}

// Count sheet (4 Nov 2026): the rolls in stock in walking order (location, fabric, lot, roll). "Count sheet" is what gets printed
// and doesn't show the book quantity, so people write what they find; "Compare" sets what they wrote against the book.
export async function exportFabricCountSheet(data) {
    const { fabrics, rolls, filter } = data;
    const note = describe(data);
    const wb = await newWorkbook();
    const QTY = '#,##0.###';
    const fabricOrder = new Map(fabrics.map((f, i) => [String(f.id), i]));
    const list = inGroups(fabrics, rolls).flatMap(g => g.lots.flatMap(([, l]) => l))
        .sort((a, b) => (a.location ? 0 : 1) - (b.location ? 0 : 1) || naturally(a.location || '', b.location || '')
            || fabricOrder.get(String(a.fabric_item_id)) - fabricOrder.get(String(b.fabric_item_id)) || naturally(a.dye_lot || '~', b.dye_lot || '~') || naturally(a.roll_no, b.roll_no));
    const first = 5;
    const last = first + list.length - 1;
    const units = unitsOf(list);
    const count = sheet(wb, 'Count sheet', 'Fabric count sheet', note, [
        { label: 'Location', width: 13 }, { label: 'Fabric', width: 44 }, { label: 'Dye lot', width: 12 }, { label: 'Roll no.', width: 11 }, { label: 'Width', width: 9 }, { label: 'Unit', width: 6 },
        { label: 'Counted', width: 11, fmt: QTY, right: true }, { label: 'Damage / remarks', width: 30 },
    ], list.map(x => [x.location || '', x.item_label, x.dye_lot || '', x.roll_no, widthOf(x), x.uom, null, '']),
    units.map(u => [`Total ${u}`, '', '', '', '', u, { formula: `SUMIF(F${first}:F${last},"${u}",G${first}:G${last})` }, '']),
    'Counted by: ____________________    Date: ______________    Checked by: ____________________');
    for (let r = first; r <= last; r++) count.getCell(r, 7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
    sheet(wb, 'Compare', 'Fabric count: book against counted', note, [
        { label: 'Location', width: 13 }, { label: 'Fabric', width: 44 }, { label: 'Dye lot', width: 12 }, { label: 'Roll no.', width: 11 }, { label: 'Unit', width: 6 },
        { label: 'Book', width: 11, fmt: QTY, right: true }, { label: 'Counted', width: 11, fmt: QTY, right: true }, { label: 'Difference', width: 11, fmt: QTY, right: true }, { label: 'Held by', width: 20 },
    ], list.map((x, i) => {
        const r = first + i;
        return [x.location || '', x.item_label, x.dye_lot || '', x.roll_no, x.uom, x.qty, { formula: `IF('Count sheet'!G${r}="","",'Count sheet'!G${r})` }, { formula: `IF(G${r}="","",G${r}-F${r})` }, rollHolders(x)];
    }), units.map(u => [`Total ${u}`, '', '', '', u, { formula: `SUMIF(E${first}:E${last},"${u}",F${first}:F${last})` }, { formula: `SUMIF(E${first}:E${last},"${u}",G${first}:G${last})` }, { formula: `SUMIF(E${first}:E${last},"${u}",H${first}:H${last})` }, '']));
    await saveWorkbook(wb, `Fabric-count-sheet-${filter.replace(/\s+/g, '-')}-${todayLocal()}.xlsx`);
}

export function exportFabricStockPdf(data, lh) {
    const { fabrics, rolls, filter } = data;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    let y = drawPdfLetterhead(doc, lh, { title: 'FABRIC STOCK' });
    if (y < 10) { doc.setFont(undefined, 'bold'); doc.setFontSize(16); doc.text('FABRIC STOCK', W / 2, 14, { align: 'center' }); y = 20; }
    doc.setDrawColor(180); doc.line(8, y, W - 8, y); y += 5;
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(describe(data), 8, y); y += 3;

    const common = { margin: { left: 8, right: 8, bottom: 12 }, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.2, lineColor: [200, 200, 200], lineWidth: 0.1, textColor: 20 }, headStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' }, showFoot: 'lastPage' };
    const right = { halign: 'right' };
    autoTable(doc, {
        ...common, startY: y,
        head: [['Fabric', { content: 'On hand', styles: right }, { content: 'Rolls', styles: right }, { content: 'Lots', styles: right }, { content: 'Allocated', styles: right }, { content: 'Free', styles: right }, 'Held by']],
        body: fabrics.map(f => [f.label, `${fmtQty(f.on_hand)} ${f.uom}`, f.rolls, f.dye_lots.length || '—', `${fmtQty(f.allocated)} ${f.uom}`, `${fmtQty(f.free)} ${f.uom}`, heldText(f) || '—']),
        foot: [[`Total · ${fabrics.length} fabric${fabrics.length === 1 ? '' : 's'}`, perUnit(fabrics, 'on_hand'), sumOf(fabrics, 'rolls'), '', perUnit(fabrics, 'allocated'), perUnit(fabrics, 'free'), '']],
        columnStyles: { 1: right, 2: right, 3: right, 4: right, 5: right },
    });

    const groups = inGroups(fabrics, rolls);
    if (groups.length) {
        const body = [];
        for (const { fabric: f, lots } of groups) {
            for (const [lot, list] of lots) {
                body.push([{ content: `${f.label} · ${lot ? `Lot ${lot}` : 'Lot not recorded'} · ${list.length} roll${list.length === 1 ? '' : 's'} · ${fmtQty(sumOf(list, 'qty'))} ${f.uom}`, colSpan: 9, styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } }]);
                for (const x of list) body.push([x.roll_no, widthOf(x) || '—', `${fmtQty(x.qty)} ${x.uom}`, fmtQty(x.original_qty), fmtDate(x.created_at), `${ageDays(x.created_at)} d`, x.location || '—', rollFrom(x), rollHolders(x) || '—']);
            }
        }
        const shown = groups.flatMap(g => g.lots.flatMap(([, list]) => list));
        autoTable(doc, {
            ...common, startY: doc.lastAutoTable.finalY + 6,
            head: [['Roll', 'Width', { content: 'Now', styles: right }, { content: 'Received qty', styles: right }, { content: 'Received on', styles: right }, { content: 'Age', styles: right }, 'Location', 'From', 'Held by']],
            body,
            foot: [[`Total · ${shown.length} roll${shown.length === 1 ? '' : 's'}`, '', perUnit(shown, 'qty'), perUnit(shown, 'original_qty'), '', '', '', '', '']],
            columnStyles: { 2: right, 3: right, 4: right, 5: right },
        });
    }
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(8); doc.setTextColor(120);
        doc.text(`Page ${i} of ${pages}`, W - 8, H - 6, { align: 'right' });
        doc.setTextColor(0);
    }
    doc.save(fileName(filter, 'pdf'));
}
