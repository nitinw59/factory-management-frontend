// The debit note PDF (4 Nov 2026): letterhead, against which invoice, why, the lines with HSN, rate and tax, the GST split, signatures.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPdfLetterhead, loadLetterhead } from '../components/letterhead';
import { inr } from './poShared';

const M = 10;
const dmy = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const plain = (t) => String(t || '').replace(/₹\s*/g, 'Rs ');   // the PDF font has no rupee sign

export async function exportDebitNotePdf(d, printedBy = '') {
    const lh = await loadLetterhead().catch(() => null);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    let y = drawPdfLetterhead(doc, lh, { x: M, title: 'DEBIT NOTE', note: d.status === 'APPROVED' ? '' : d.status === 'CANCELLED' ? 'CANCELLED' : 'NOT APPROVED YET' });
    if (y < 10) { doc.setFont(undefined, 'bold'); doc.setFontSize(16); doc.text('DEBIT NOTE', W / 2, 14, { align: 'center' }); doc.setFont(undefined, 'normal'); y = 20; }
    doc.setDrawColor(180); doc.line(M, y, W - M, y); y += 2;
    autoTable(doc, {
        startY: y, theme: 'grid', margin: { left: M, right: M },
        body: [
            [`Debit note no.\n${d.debit_no}`, `Date\n${dmy(d.note_date)}`, `Against invoice\n${d.invoice_no} · ${dmy(d.invoice_date)}`],
            [{ content: `Supplier\n${d.supplier_name}${d.supplier_gstin ? `\nGSTIN ${d.supplier_gstin}` : ''}${d.supplier_address ? `\n${[d.supplier_address, d.supplier_city].filter(Boolean).join(', ')}` : ''}`, colSpan: 2 }, `Supplier's credit note\n${d.supplier_credit_no || '—'}`],
            [{ content: `Reason\n${d.reason_label}: ${plain(d.reason)}`, colSpan: 3 }],
        ],
        styles: { fontSize: 9, textColor: [15, 23, 42], lineColor: [148, 163, 184], lineWidth: 0.2, cellPadding: 2, valign: 'top' },
    });
    const right = (v) => ({ content: v, styles: { halign: 'right' } });
    const foot = [['', 'Taxable', '', '', '', right(inr(d.taxable_amount)), '']];
    if (d.tax_type === 'INTER') foot.push(['', 'IGST', '', '', '', '', right(inr(d.igst_amount))]);
    else foot.push(['', 'CGST', '', '', '', '', right(inr(d.cgst_amount))], ['', 'SGST', '', '', '', '', right(inr(d.sgst_amount))]);
    foot.push(['', 'Total debited', '', '', '', '', right(inr(d.total_amount))]);
    autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 3, theme: 'grid', margin: { left: M, right: M, bottom: 16 },
        head: [['#', 'Item', 'HSN', 'Qty', 'Rate Rs', 'Taxable Rs', 'GST Rs']],
        body: d.lines.map((l, i) => [String(i + 1), `${plain(l.label)}${l.grn_no ? `\n${l.grn_no}` : ''}`, l.hsn_code || '', right(`${qty(l.qty)} ${l.purchase_uom || ''}`), right(inr(l.rate)), right(inr(l.taxable)), right(`${inr(l.gst)} (${l.gst_pct}%)`)]),
        foot, showFoot: 'lastPage',
        styles: { fontSize: 8.5, textColor: [15, 23, 42], lineColor: [100, 116, 139], lineWidth: 0.2, cellPadding: 1.8 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 18 }, 3: { cellWidth: 24 }, 4: { cellWidth: 20 }, 5: { cellWidth: 26 }, 6: { cellWidth: 30 } },
    });
    y = doc.lastAutoTable.finalY + 10;
    if (y > H - 36) { doc.addPage(); y = 16; }
    const boxW = (W - 2 * M - 4) / 2;
    [['Prepared by (accounts)', d.created_by_name], ['Approved by', d.approved_by_name]].forEach(([label, name], i) => {
        const x = M + i * (boxW + 4);
        doc.setDrawColor(148, 163, 184); doc.rect(x, y, boxW, 20);
        doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.text(label, x + 2, y + 4.5); doc.setFont(undefined, 'normal');
        if (name) { doc.setFontSize(8.5); doc.text(name, x + boxW - 2, y + 17, { align: 'right' }); }
    });
    doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(`Computer-generated${printedBy ? ` · printed by ${printedBy}` : ''} · ${d.debit_no}`, M, H - 7);
    doc.save(`DebitNote-${String(d.debit_no).replace(/[^\w-]+/g, '-')}.pdf`);
}
