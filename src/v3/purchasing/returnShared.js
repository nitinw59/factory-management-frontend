// Returns to supplier and supplier invoices: labels and the return note PDF.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { inr } from './poShared';

export const INVOICE_STATUS = {
    MATCHED:              { label: 'Matched',              cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    MATCHED_WITH_WARNING: { label: 'Matched with warning', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
    MISMATCH_OVERRIDDEN:  { label: 'Mismatch — overridden', cls: 'bg-rose-50 text-rose-700 border-rose-300' },
    CANCELLED:            { label: 'Cancelled',            cls: 'bg-slate-50 text-slate-500 border-slate-300' },
};
export const SOURCE_LABEL = { REJECTED: 'Rejected at receipt', STOCK: 'From stock' };
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export function exportReturnNotePdf(rn, company) {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    let y = 14;
    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text(company?.trade_name || company?.legal_name || 'Return note', 14, y); doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    const addr = [company?.address_line1, company?.address_line2, [company?.city, company?.state].filter(Boolean).join(', ')].filter(Boolean).join(', ');
    if (addr) { y += 4.5; doc.text(addr, 14, y, { maxWidth: pageW - 28 }); }
    if (company?.gstin) { y += 4; doc.text(`GSTIN: ${company.gstin}`, 14, y); }
    y += 8; doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text('RETURN NOTE (GOODS RETURNED TO SUPPLIER)', pageW / 2, y, { align: 'center' }); doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    y += 8; doc.text(`No.: ${rn.rn_no}`, 14, y); doc.text(`Date: ${rn.return_date.split('-').reverse().join('/')}`, 120, y);
    y += 5; doc.text(`To: ${rn.supplier_name}${rn.supplier_gstin ? ` (GSTIN ${rn.supplier_gstin})` : ''}`, 14, y);
    y += 5; doc.text(`Against: ${rn.po_no} · ${rn.grn_no} · supplier challan ${rn.challan_no}`, 14, y);
    if (rn.vehicle_no) { y += 5; doc.text(`Vehicle: ${rn.vehicle_no}`, 14, y); }
    y += 5; doc.text(`Reason: ${rn.reason}`, 14, y, { maxWidth: pageW - 28 });
    y += 5; doc.text(rn.replacement_expected ? 'Replacement expected against the same PO.' : 'No replacement: please issue a credit note.', 14, y);
    autoTable(doc, {
        startY: y + 4,
        head: [['#', 'Item', 'Type', 'Qty', 'Rate (Rs)', 'Value (Rs)', 'GST %', 'GST (Rs)']],
        body: rn.lines.map(l => [l.line_no, `${l.label}${l.rolls.length ? `\nRolls: ${l.rolls.map(r => `${r.roll_no} (${qty(r.qty)})`).join(', ')}` : ''}`,
            l.source === 'REJECTED' ? 'Rejected at receipt' : 'From stock', `${qty(l.qty)} ${l.purchase_uom}`, inr(l.rate), inr(l.value), l.gst_pct, inr(l.gst)]),
        foot: [['', 'Total', '', '', '', inr(rn.totals.taxable), '', inr(rn.totals.gst)], ['', 'Value with GST', '', '', '', inr(rn.totals.total), '', '']],
        styles: { fontSize: 8 }, headStyles: { fillColor: [79, 70, 229] }, footStyles: { fillColor: [241, 245, 249], textColor: 20 },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 7: { halign: 'right' } },
    });
    const end = doc.lastAutoTable.finalY + 22;
    doc.text('Prepared by', 14, end); doc.text('Checked by', 80, end); doc.text("Received by (supplier's representative)", 135, end);
    doc.save(`ReturnNote-${rn.rn_no.replace(/[^\w-]+/g, '-')}.pdf`);
}
