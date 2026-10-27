// Trim kit documents (21 Oct 2026, "Trim kits — store picking, handover and returns"): the pick list the store keeper
// fills the kit from (what to put in, the stock, an empty Picked column, a note column, signature) and the valuation bill
// of a handover (signed quantities × item rate, as 2.0's auto bill at signing). Both carry the company letterhead.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPdfLetterhead } from '../components/letterhead';
import { groupKitLines, isOver, unitsOwedOf } from './trimKitShared';

const num = (v, d = 3) => (v == null ? '' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: d }));
const money = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const head = (doc, k, lh, title) => {
    let y = drawPdfLetterhead(doc, lh, { title });
    if (y < 10) { doc.setFont(undefined, 'bold'); doc.setFontSize(15); doc.text(title, 105, 14, { align: 'center' }); y = 20; }
    doc.setDrawColor(180); doc.line(8, y, 202, y); y += 5;
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.text(`${k.kit_no}${k.floor_no ? `  ·  batch #${k.floor_no}` : ''}`, 8, y); doc.setFont(undefined, 'normal');
    doc.setFontSize(9); doc.text(`${k.order_no} · ${k.customer_name}${k.batch_code ? ` · ${k.batch_code}` : ''}`, 8, y + 5);
    if (k.batch_lines?.length) doc.text(`Goes to: ${k.batch_lines.map(l => l.name).join(', ')}`, 8, y + 10);
    return y + (k.batch_lines?.length ? 14 : 9);
};
// Bordered tables (27 Oct 2026, "table layout in pdf is wrong add borders"): every cell boxed; a number column's header
// sits right like its numbers.
const GRID = { theme: 'grid', rowPageBreak: 'avoid', showHead: 'everyPage', styles: { lineColor: [148, 163, 184], lineWidth: 0.2, textColor: 20 } };   // a row never splits over two pages
const right = (cols) => Object.fromEntries(cols.map(i => [i, { halign: 'right' }]));
const footer = (doc, ref) => {
    const n = doc.internal.getNumberOfPages();
    for (let p = 1; p <= n; p += 1) { doc.setPage(p); doc.setFontSize(7); doc.setTextColor(120); doc.text(`${ref} · page ${p} of ${n}`, 202, 290, { align: 'right' }); doc.setTextColor(0); }
};

// 27 Oct 2026: one row per item — for the order, over-cut, total to put in — under a small table of what the batch cut
// (per colour × size: ordered, cut before, cut now, for the order, over-cut within the free limit and above it).
export function exportPickList(k, lh) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = head(doc, k, lh, 'TRIM KIT — PICK LIST');
    const oc = k.over_cut;
    if (oc?.cells?.length) {
        const t = oc.cells.reduce((a, c) => ({ ordered: a.ordered + c.ordered, before: a.before + c.before, cut: a.cut + c.cut, within: a.within + c.within, free: a.free + c.free, approval: a.approval + c.approval }), { ordered: 0, before: 0, cut: 0, within: 0, free: 0, approval: 0 });
        autoTable(doc, {
            startY: y,
            head: [['Colour', 'Size', 'Ordered', 'Cut before', 'Cut now', 'For the order', `Over-cut (free ${oc.free_pct}%)`, 'Over-cut (above)']],
            body: oc.cells.map(c => [c.colour, c.size, c.ordered, c.before, c.cut, c.within, c.free || '—', c.approval || '—']),
            foot: [['Total', '', t.ordered, t.before, t.cut, t.within, t.free || '—', t.approval || '—']],
            ...GRID, styles: { ...GRID.styles, fontSize: 7.5, cellPadding: 1.4, valign: 'middle' },
            headStyles: { fillColor: [14, 116, 144], textColor: 255, fontStyle: 'bold' }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 14 }, ...right([2, 3, 4, 5, 6, 7]) },
            didParseCell: (d) => { if ((d.section === 'head' || d.section === 'foot') && d.column.index >= 2) d.cell.styles.halign = 'right'; },
            margin: { left: 8, right: 8 },
        });
        y = doc.lastAutoTable.finalY + 2;
        doc.setFontSize(7.5); doc.setTextColor(90);
        doc.text(`Everything cut is kitted; over-cut comes from free stock (not this order's allocation)${oc.status === 'PENDING' ? ' — over-cut approval pending, the kit does not wait' : ''}.`, 8, y + 3);
        doc.setTextColor(0); y += 7;
    }
    const amt = (g, q, units) => (g.in_units ? `${units} ${g.purchase_uom} (${num(q)} ${g.uom})` : `${num(q)} ${g.uom}`);
    const groups = groupKitLines(k.lines.filter(l => l.remaining > 0));
    autoTable(doc, {
        startY: y,
        head: [['#', 'Item', 'For the order', 'Over-cut', 'Put in the kit', 'In stock', 'Picked', 'Note']],
        body: groups.map(g => {
            const ord = g.lines.filter(l => !isOver(l)); const ov = g.lines.filter(isOver);
            const sum = (ls) => ls.reduce((a, l) => a + l.remaining, 0); const units = (ls) => ls.reduce((a, l) => a + unitsOwedOf(l), 0);
            return [g.line_no, `${g.label}${g.extra ? ' (extra line)' : ''}${g.stock_on_hand <= 0 ? ' — NOT IN STORE' : ''}`,
                ord.length ? amt(g, sum(ord), units(ord)) : '—', ov.length ? amt(g, sum(ov), units(ov)) : '—', amt(g, g.remaining, g.units_owed),
                `${num(g.stock_on_hand)} ${g.uom}`, '', ''];
        }),
        ...GRID, styles: { ...GRID.styles, fontSize: 8, cellPadding: 1.6, minCellHeight: 8, valign: 'middle' },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', valign: 'middle' },
        columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 2: { halign: 'right', cellWidth: 26 }, 3: { halign: 'right', cellWidth: 24 }, 4: { halign: 'right', cellWidth: 28, fontStyle: 'bold' }, 5: { halign: 'right', cellWidth: 22 }, 6: { cellWidth: 16 }, 7: { cellWidth: 26 } },
        didParseCell: (d) => { if (d.section === 'head' && [2, 3, 4, 5].includes(d.column.index)) d.cell.styles.halign = 'right'; },
        margin: { left: 8, right: 8 },
    });
    y = doc.lastAutoTable.finalY + 8;
    if (y > 262) { doc.addPage(); y = 20; }
    doc.setFontSize(8.5); doc.setDrawColor(150);
    ['Picked by (store keeper)', 'Checked by (store manager)'].forEach((label, i) => { const x = 8 + i * 98; doc.rect(x, y, 94, 18); doc.text(label, x + 2, y + 5); });
    doc.setFontSize(7.5); doc.setTextColor(90); doc.text(`Printed ${when(new Date())} — enter in 3.0 what you put in the kit; less than shown needs a reason.`, 8, y + 25); doc.setTextColor(0);
    footer(doc, `${k.kit_no} pick list`);
    doc.save(`${k.kit_no.replace(/\//g, '-')}-pick-list.pdf`);
}

export function exportKitBill(k, bill, lh) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = head(doc, k, lh, 'TRIM VALUATION BILL');
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.text(bill.bill_no, 202, y - 4, { align: 'right' }); doc.setFont(undefined, 'normal');
    doc.setFontSize(9); doc.text(`Handover on ${bill.issue_no} · ${when(bill.created_at)}${bill.created_by_name ? ` · ${bill.created_by_name}` : ''}`, 8, y); y += 4;
    autoTable(doc, {
        startY: y + 1,
        head: [['#', 'Item', 'Quantity', 'Rate', 'Source', 'Value']],
        body: bill.lines.map((x, i) => [i + 1, x.label || '', `${num(x.qty)} ${x.uom}`, x.rate != null ? money(x.rate) : 'no rate', x.rate_source || '', x.value != null ? money(x.value) : '—']),
        foot: [['', 'Total', '', '', '', money(bill.total)]],
        styles: { fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: [30, 41, 59] }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 8 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 5: { halign: 'right' } }, margin: { left: 8, right: 8 },
    });
    y = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(8); doc.setTextColor(90);
    doc.text(`Valuation only — the stock went out on ${bill.issue_no}. Rate: the item's GRN rate, else its PO rate${bill.unpriced ? '; items without a rate are valued at 0' : ''}.`, 8, y);
    doc.setTextColor(0);
    footer(doc, bill.bill_no);
    doc.save(`${bill.bill_no.replace(/\//g, '-')}.pdf`);
}
