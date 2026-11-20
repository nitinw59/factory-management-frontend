// The supplier invoice PDF (20 Nov 2026, owner on /v3/purchasing/invoices/23: "no option to generate PDF of invoice"): a bill
// passing sheet for accounts to file with the supplier's invoice and pay from — the invoice as entered, each line against its
// GRN and PO (rate, discounts, HSN, GST), charges, totals as printed beside the totals worked out from the lines, the tax summary
// by GST rate, the match result with its questions, any hold / override note, debit notes and what is left to pay, signatures.
// A submitted or held invoice prints the match as it stands now (the page's `live`).
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPdfLetterhead, loadLetterhead } from '../components/letterhead';
import { inr } from './poShared';

const M = 10;
const dmy = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const plain = (t) => String(t || '').replace(/₹\s*/g, 'Rs ').replace(/−/g, '-').replace(/[^\x20-\x7E\n\u00B7\u2013\u2014]/g, '');   // the PDF font has no rupee sign (· – — it has)
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const STAGE = { DRAFT: 'DRAFT — NOT SUBMITTED', SUBMITTED: 'WAITING FOR APPROVAL', ON_HOLD: 'ON HOLD', APPROVED: '' };
const MATCH = { MATCHED: 'Matched', MATCHED_WITH_WARNING: 'Matched with warnings', MISMATCH: 'Does not match', MISMATCH_OVERRIDDEN: 'Mismatch — approved with override', NOT_CHECKED: 'Not checked' };
const KIND = { FREIGHT: 'Freight', PACKING: 'Packing', INSURANCE: 'Insurance', OTHER: 'Other charge', DISCOUNT: 'Discount', TCS: 'TCS' };

export async function exportInvoicePdf(inv, printedBy = '') {
    const m = inv.live || inv.match_report || {};
    const lines = m.lines || [];
    const t = m.totals?.lines || {};
    const cancelled = inv.status === 'CANCELLED';
    const lh = await loadLetterhead().catch(() => null);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const note = cancelled ? 'CANCELLED' : STAGE[inv.approval_status] || '';
    let y = drawPdfLetterhead(doc, lh, { x: M, title: 'BILL PASSING SHEET', note });
    if (y < 10) { doc.setFont(undefined, 'bold'); doc.setFontSize(16); doc.text('BILL PASSING SHEET', W / 2, 14, { align: 'center' }); doc.setFont(undefined, 'normal'); y = 20; }
    doc.setDrawColor(180); doc.line(M, y, W - M, y); y += 2;
    const right = (v) => ({ content: v, styles: { halign: 'right' } });
    const bold = (v, extra = {}) => ({ content: v, styles: { fontStyle: 'bold', ...extra } });
    const grns = [...new Set(lines.map(l => l.grn_no).filter(Boolean))];
    const pos = [...new Set(lines.map(l => l.po_no).filter(Boolean))];
    const matchSaid = cancelled ? 'Cancelled' : `${MATCH[inv.live ? inv.live.status : inv.status] || inv.status}${inv.live && inv.live.status !== inv.status ? ' (checked again now)' : ''}`;

    autoTable(doc, {
        startY: y, theme: 'grid', margin: { left: M, right: M },
        body: [
            [{ content: `Supplier\n${plain(inv.supplier_name)}${inv.supplier_gstin ? `\nGSTIN ${inv.supplier_gstin}` : ''}`, colSpan: 2 }, `Supplier's invoice no.\n${plain(inv.invoice_no)}`, `Invoice date\n${dmy(inv.invoice_date)}`],
            [`GST\n${inv.tax_type === 'INTER' ? 'IGST (other state)' : inv.tax_type === 'INTRA' ? 'CGST + SGST (same state)' : '—'}`, `Goods receipts\n${grns.join(', ') || '—'}`, `Purchase orders\n${pos.join(', ') || '—'}`, `Match (tolerance ${m.tolerance_pct ?? '—'}%)\n${matchSaid}`],
        ],
        styles: { fontSize: 8.5, textColor: [15, 23, 42], lineColor: [148, 163, 184], lineWidth: 0.2, cellPadding: 1.8, valign: 'top' },
        columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 50 }, 2: { cellWidth: 46 } },
    });

    // Lines: as billed, against what was received and the PO.
    const value = (l) => (l.value != null ? l.value : l.taxable);
    const net = (l) => (l.net_taxable != null ? l.net_taxable : l.taxable);
    const anyDisc = lines.some(l => l.line_discount || l.discount);
    const head = ['#', 'Item / GRN / PO', 'HSN', 'Qty', 'Rate Rs', ...(anyDisc ? ['Value Rs', 'Discount Rs'] : []), 'Taxable Rs', 'GST Rs'];
    autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 3, theme: 'grid', margin: { left: M, right: M, bottom: 16 },
        head: [head],
        body: lines.map((l, i) => {
            const disc = r2((l.line_discount || 0) + (l.discount || 0));
            const rateSaid = `${inr(l.rate)}${l.line_discount_pct ? `\nless ${l.line_discount_pct}%` : ''}${l.po_rate != null && Math.abs(l.po_rate - l.rate) > 0.00005 ? `\nPO ${inr(l.po_rate)}` : ''}`;
            return [String(i + 1), `${plain(l.label)}\n${l.grn_no || ''}${l.grn_line_no ? ` line ${l.grn_line_no}` : ''} · ${l.po_no || ''}${l.po_line_no ? ` line ${l.po_line_no}` : ''}`, l.hsn_code || '',
                right(`${qty(l.qty)} ${l.purchase_uom || ''}`), right(rateSaid), ...(anyDisc ? [right(inr(value(l))), right(disc ? `-${inr(disc)}` : '-')] : []), right(inr(net(l))), right(`${inr(l.gst)}\n${l.gst_pct}%${l.po_gst_pct != null && l.po_gst_pct !== l.gst_pct ? ` (PO ${l.po_gst_pct}%)` : ''}`)];
        }),
        foot: [[{ content: `Total · ${lines.length} line${lines.length === 1 ? '' : 's'}`, colSpan: 5 }, ...(anyDisc ? [right(inr(lines.reduce((s, l) => s + value(l), 0))), right(`-${inr(lines.reduce((s, l) => s + (l.line_discount || 0) + (l.discount || 0), 0))}`)] : []), right(inr(lines.reduce((s, l) => s + net(l), 0))), right(inr(lines.reduce((s, l) => s + (l.gst || 0), 0)))]],
        showFoot: 'lastPage',
        styles: { fontSize: 7.5, textColor: [15, 23, 42], lineColor: [100, 116, 139], lineWidth: 0.2, cellPadding: 1.5, valign: 'top' },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: anyDisc
            ? { 0: { cellWidth: 7 }, 2: { cellWidth: 12 }, 3: { cellWidth: 18 }, 4: { cellWidth: 17 }, 5: { cellWidth: 21 }, 6: { cellWidth: 18 }, 7: { cellWidth: 21 }, 8: { cellWidth: 19 } }
            : { 0: { cellWidth: 7 }, 2: { cellWidth: 12 }, 3: { cellWidth: 20 }, 4: { cellWidth: 18 }, 5: { cellWidth: 24 }, 6: { cellWidth: 22 } },
    });

    if ((inv.charges || []).length) {
        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 3, theme: 'grid', margin: { left: M, right: M, bottom: 16 },
            head: [['Charge', 'Description', 'Amount Rs', 'GST %']],
            body: inv.charges.map(c => [KIND[c.kind] || c.kind, plain(c.description) || '-', right(`${c.kind === 'DISCOUNT' ? '-' : ''}${inr(c.amount)}`), right(String(c.gst_pct))]),
            styles: { fontSize: 8, textColor: [15, 23, 42], lineColor: [100, 116, 139], lineWidth: 0.2, cellPadding: 1.5 },
            headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: 'bold' },
        });
    }

    // Totals: as printed on the invoice beside what the lines and charges come to.
    const worked = { taxable: t.taxable, gst: t.gst, total: t.total };
    const diff = (a, b) => (b == null ? '' : Math.abs(r2(a - b)) > 0.004 ? `${a - b > 0 ? '+' : ''}${inr(r2(a - b))}` : '-');
    const tax = inv.tax_type === 'INTER' ? [['IGST', inv.igst_amount]] : [['CGST', inv.cgst_amount], ['SGST', inv.sgst_amount]];
    const rows = [];
    if (t.goods != null) rows.push(['Goods', '', right(inr(t.goods)), '']);
    if (t.line_discount) rows.push(['Less line discounts', '', right(`-${inr(t.line_discount)}`), '']);
    if (t.discount) rows.push([`Less overall discount${t.discount_pct ? ` (${t.discount_pct}%)` : ''}`, '', right(`-${inr(t.discount)}`), '']);
    if (t.charges) rows.push(['Freight and charges', '', right(inr(t.charges)), '']);
    rows.push([bold('Taxable value'), right(inr(inv.taxable_amount)), right(worked.taxable != null ? inr(worked.taxable) : ''), right(diff(inv.taxable_amount, worked.taxable))]);
    const workedTax = t.gst == null ? {} : inv.tax_type === 'INTER' ? { IGST: t.gst } : { CGST: r2(t.gst / 2), SGST: r2(t.gst - r2(t.gst / 2)) };
    tax.forEach(([k, v]) => rows.push([k, right(inr(v)), right(workedTax[k] != null ? inr(workedTax[k]) : ''), right(diff(Number(v || 0), workedTax[k]))]));
    rows.push(['GST total', right(inr(r2(Number(inv.cgst_amount || 0) + Number(inv.sgst_amount || 0) + Number(inv.igst_amount || 0)))), right(worked.gst != null ? inr(worked.gst) : ''), right(diff(r2(Number(inv.cgst_amount || 0) + Number(inv.sgst_amount || 0) + Number(inv.igst_amount || 0)), worked.gst))]);
    if (inv.tcs_amount) rows.push(['TCS', right(inr(inv.tcs_amount)), '', '']);
    if (inv.round_off_amount) rows.push(['Round-off', right(inr(inv.round_off_amount)), '', '']);
    rows.push([bold('Invoice total'), right(bold(inr(inv.total_amount)).content), right(worked.total != null ? inr(worked.total) : ''), right(diff(inv.total_amount, worked.total))]);
    if (inv.debited_amount > 0) {
        rows.push(['Less approved debit notes', right(`-${inr(inv.debited_amount)}`), '', '']);
        rows.push([bold('Net payable'), right(inr(inv.net_amount)), '', '']);
    }
    if (doc.lastAutoTable.finalY > H - 90) doc.addPage();
    const startTotals = doc.lastAutoTable.finalY > H - 90 ? 16 : doc.lastAutoTable.finalY + 3;
    autoTable(doc, {
        startY: startTotals, theme: 'grid', margin: { left: M, right: W / 2 + 2, bottom: 16 },
        head: [['', 'On the invoice Rs', 'From the lines Rs', 'Difference']],
        body: rows,
        styles: { fontSize: 8, textColor: [15, 23, 42], lineColor: [148, 163, 184], lineWidth: 0.2, cellPadding: 1.4 },
        headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 },
    });
    const totalsEnd = doc.lastAutoTable.finalY;
    // Tax summary by GST rate, beside the totals.
    const byRate = t.by_rate || [];
    if (byRate.length) {
        autoTable(doc, {
            startY: startTotals, theme: 'grid', margin: { left: W / 2 + 2, right: M, bottom: 16 },
            head: [['GST', 'HSN', 'Taxable Rs', inv.tax_type === 'INTER' ? 'IGST Rs' : 'CGST + SGST Rs']],
            body: byRate.map(r => [`${r.gst_pct}%`, (r.hsn || []).join(', ') || '-', right(inr(r.taxable)), right(inr(r.gst))]),
            foot: [['Total', '', right(inr(byRate.reduce((s, r) => s + r.taxable, 0))), right(inr(byRate.reduce((s, r) => s + r.gst, 0)))]],
            styles: { fontSize: 8, textColor: [15, 23, 42], lineColor: [148, 163, 184], lineWidth: 0.2, cellPadding: 1.4 },
            headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 },
            footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        });
    }
    y = Math.max(totalsEnd, doc.lastAutoTable.finalY) + 4;

    // The match's questions, and why it was held or approved despite them.
    const notes = [
        ...(m.blocking || []).map(x => `[Does not match] ${plain(x)}`),
        ...(m.warnings || []).map(x => `[Warning] ${plain(x)}`),
        ...(inv.hold_reason && inv.approval_status === 'ON_HOLD' ? [`[On hold${inv.held_by_name ? `, ${inv.held_by_name}` : ''}] ${plain(inv.hold_reason)}`] : []),
        ...(inv.override_note ? [`[Approved despite the mismatch${inv.override_by_name ? `, ${inv.override_by_name}` : ''}] ${plain(inv.override_note)}`] : []),
        ...(cancelled ? [`[Cancelled${inv.cancelled_by_name ? `, ${inv.cancelled_by_name}` : ''}] ${plain(inv.cancelled_reason)}`] : []),
        ...(inv.notes ? [`[Notes] ${plain(inv.notes)}`] : []),
    ];
    if (notes.length) {
        if (y > H - 40) { doc.addPage(); y = 16; }
        autoTable(doc, {
            startY: y, theme: 'plain', margin: { left: M, right: M, bottom: 16 },
            head: [['Checks and notes']], body: notes.map(x => [x]),
            styles: { fontSize: 7.5, textColor: [30, 41, 59], cellPadding: 1 },
            headStyles: { fontStyle: 'bold', fontSize: 8.5, textColor: [15, 23, 42] },
        });
        y = doc.lastAutoTable.finalY + 4;
    }
    if ((inv.debit_notes || []).length) {
        autoTable(doc, {
            startY: y, theme: 'grid', margin: { left: M, right: M, bottom: 16 },
            head: [['Debit note', 'Date', 'For', 'Status', 'Amount Rs']],
            body: inv.debit_notes.map(d => [d.debit_no, dmy(d.note_date), d.reason_code, d.status, right(inr(d.total_amount))]),
            styles: { fontSize: 8, textColor: [15, 23, 42], lineColor: [148, 163, 184], lineWidth: 0.2, cellPadding: 1.4 },
            headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        });
        y = doc.lastAutoTable.finalY + 4;
    }

    // Signatures: who entered, submitted and approved it, with dates.
    y += 4;
    if (y > H - 34) { doc.addPage(); y = 16; }
    const boxW = (W - 2 * M - 8) / 3;
    const when = (d) => (d ? dmy(d) : '');
    [['Entered by (accounts)', inv.created_by_name, when(inv.created_at)], ['Submitted by', inv.submitted_by_name, when(inv.submitted_at)], ['Approved for payment', inv.approved_by_name, when(inv.approved_at)]].forEach(([label, name, date], i) => {
        const x = M + i * (boxW + 4);
        doc.setDrawColor(148, 163, 184); doc.rect(x, y, boxW, 20);
        doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.text(label, x + 2, y + 4.5); doc.setFont(undefined, 'normal');
        if (name) { doc.setFontSize(8.5); doc.text(plain(name), x + boxW - 2, y + 13.5, { align: 'right' }); }
        if (date) { doc.setFontSize(7.5); doc.setTextColor(100, 116, 139); doc.text(date, x + boxW - 2, y + 18, { align: 'right' }); doc.setTextColor(0); }
    });
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p += 1) {
        doc.setPage(p);
        doc.setFontSize(7); doc.setTextColor(100, 116, 139);
        doc.text(`Computer-generated${printedBy ? ` · printed by ${plain(printedBy)}` : ''} · ${plain(inv.supplier_name)} invoice ${plain(inv.invoice_no)}${(inv.documents || []).length ? ` · scan on file (${inv.documents.length})` : ' · no scan on file'}`, M, H - 7);
        doc.text(`Page ${p} of ${pages}`, W - M, H - 7, { align: 'right' });
        doc.setTextColor(0);
    }
    doc.save(`BillPassing-${String(inv.supplier_name || '').replace(/[^\w]+/g, '-').slice(0, 24)}-${String(inv.invoice_no).replace(/[^\w-]+/g, '-')}.pdf`);
}
