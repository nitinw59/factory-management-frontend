// Trim kit documents (21 Oct 2026, "Trim kits — store picking, handover and returns"): the pick list the store keeper
// fills the kit from (what to put in, the stock, an empty Picked column, a note column, signature) and the valuation bill
// of a handover (signed quantities × item rate, as 2.0's auto bill at signing). Both carry the company letterhead.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPdfLetterhead } from '../components/letterhead';

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
const footer = (doc, ref) => {
    const n = doc.internal.getNumberOfPages();
    for (let p = 1; p <= n; p += 1) { doc.setPage(p); doc.setFontSize(7); doc.setTextColor(120); doc.text(`${ref} · page ${p} of ${n}`, 202, 290, { align: 'right' }); doc.setTextColor(0); }
};

export function exportPickList(k, lh) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = head(doc, k, lh, 'TRIM KIT — PICK LIST');
    const lines = k.lines.filter(l => l.remaining > 0 && !l.held);
    autoTable(doc, {
        startY: y,
        head: [['#', 'Item', 'Put in the kit', 'In stock', 'Picked', 'Note (short / damaged / missing)']],
        body: lines.map(l => [l.line_no, `${l.label}${l.part === 'EXTRA' ? ' (extra line)' : l.free_stock ? ' (over-cut, free stock)' : ''}`,
            l.in_units ? `${Math.ceil(l.remaining / l.factor - 1e-9)} ${l.purchase_uom} (${num(l.remaining)} ${l.uom})` : `${num(l.remaining)} ${l.uom}`,
            `${num(l.stock_on_hand)} ${l.uom}`, '', '']),
        styles: { fontSize: 8.5, cellPadding: 2, minCellHeight: 8 }, headStyles: { fillColor: [30, 41, 59] },
        columnStyles: { 0: { cellWidth: 8 }, 2: { halign: 'right', cellWidth: 34 }, 3: { halign: 'right', cellWidth: 26 }, 4: { cellWidth: 22 }, 5: { cellWidth: 45 } }, margin: { left: 8, right: 8 },
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
