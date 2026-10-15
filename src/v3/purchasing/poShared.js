// Purchase order labels, money formatting, amount in words (Indian system)
// and the PO PDF / Excel (jsPDF + autotable, xlsx — as the other 3.0 exports).
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export const PO_STATUS = {
    DRAFT:           { label: 'Draft',           cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    PENDING_APPROVAL: { label: 'Waiting for approval', cls: 'bg-rose-50 text-rose-700 border-rose-300' },
    ISSUED:          { label: 'Issued',          cls: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
    PARTLY_RECEIVED: { label: 'Partly received', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
    RECEIVED:        { label: 'Received',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    SHORT_CLOSED:    { label: 'Short-closed',    cls: 'bg-slate-50 text-slate-500 border-slate-300' },
    CANCELLED:       { label: 'Cancelled',       cls: 'bg-slate-50 text-slate-400 border-slate-200 line-through' },
};

// Why a line holds quantity with no requisition (server: EXTRA_REASONS in purchaseOrdersController.js).
export const EXTRA_REASONS = [
    ['ADVANCE', 'Advance buy for an expected order'], ['MOQ', 'Supplier minimum / pack size'], ['PRICE', 'Price advantage / bulk rate'],
    ['SAMPLE', 'Sample / trial'], ['STOCK', 'Store stock (spares / general use)'], ['OTHER', 'Other'],
];

export const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

// 1,23,45,678.50 → "Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight and Fifty Paise Only"
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`);
const three = (n) => [Math.floor(n / 100) ? `${ONES[Math.floor(n / 100)]} Hundred` : '', n % 100 ? two(n % 100) : ''].filter(Boolean).join(' ');
export function amountInWords(amount) {
    const rupees = Math.floor(Math.round(Number(amount || 0) * 100) / 100);
    const paise = Math.round((Number(amount || 0) - rupees) * 100);
    const parts = [];
    let n = rupees;
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) parts.push(`${crore >= 100 ? three(crore) : two(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (n) parts.push(three(n));
    const words = parts.join(' ') || 'Zero';
    return `Rupees ${words}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

const fileBase = (po) => `PurchaseOrder-${po.po_no.replace(/[^\w-]+/g, '-')}${po.revision_no ? `-rev${po.revision_no}` : ''}`;
const ddmmyyyy = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');

// assets (Settings → Documents for POs): { logo, signature, seal } images from the company profile, or null.
export function exportPoPdf(po, company, assets = {}) {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const intra = po.tax_mode === 'INTRA';
    let y = 14;
    // Letterhead (logo per Settings → Documents)
    let x0 = 14;
    if (assets.logo) {
        const h = 14;
        const w = Math.min(40, (h * assets.logo.w) / assets.logo.h);
        try { doc.addImage(assets.logo.dataUrl, assets.logo.format, 14, 8, w, (w * assets.logo.h) / assets.logo.w, undefined, 'FAST'); x0 = 14 + w + 4; } catch { /* unreadable image: text only */ }
    }
    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text(company?.trade_name || company?.legal_name || 'Purchase order', x0, y); doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    const addr = [company?.address_line1, company?.address_line2, [company?.city, company?.state].filter(Boolean).join(', ')].filter(Boolean).join(', ');
    if (addr) { y += 4.5; doc.text(addr, x0, y, { maxWidth: pageW - x0 - 14 }); }
    // Billed on the delivery unit's own GSTIN when it has one (Settings → Company addresses).
    const billGstin = po.delivery_address?.gstin || company?.gstin;
    if (billGstin) { y += 4; doc.text(`GSTIN: ${billGstin}   State: ${po.company_state_name || ''} (${po.company_state_code})${po.delivery_address?.gstin ? `   (${po.delivery_address.name})` : ''}`, x0, y); }
    y = Math.max(y + 7, assets.logo ? 28 : 0);
    doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text('PURCHASE ORDER', pageW / 2, y, { align: 'center' }); doc.setFont(undefined, 'normal');
    if (po.status === 'DRAFT' || po.status === 'PENDING_APPROVAL' || po.status === 'CANCELLED') {
        y += 5; doc.setFontSize(9); doc.setTextColor(190, 18, 60);
        doc.text(po.status !== 'CANCELLED' ? 'DRAFT — not issued, not valid for supply' : `CANCELLED: ${po.cancelled_reason || ''}`, pageW / 2, y, { align: 'center' });
        doc.setTextColor(0, 0, 0);
    }
    autoTable(doc, {
        startY: y + 3,
        body: [[
            { content: `Supplier\n${po.supplier_name}\n${[po.supplier_address, [po.supplier_city, po.supplier_pincode].filter(Boolean).join(' ')].filter(Boolean).join('\n')}\nGSTIN: ${po.supplier_gstin || 'unregistered'}\nState: ${po.supplier_state_name || ''} (${po.supplier_state_code})${po.supplier_contact || po.supplier_phone ? `\nContact: ${[po.supplier_contact, po.supplier_phone].filter(Boolean).join(', ')}` : ''}` },
            { content: `PO no.: ${po.po_no}${po.revision_no ? `   (revision ${po.revision_no})` : ''}\nPO date: ${ddmmyyyy(po.po_date)}\nDelivery: ${ddmmyyyy(po.delivery_date) === '—' ? 'per line' : ddmmyyyy(po.delivery_date)}\nPayment terms: ${po.payment_terms_days} days\nTax: ${intra ? 'CGST + SGST (same state)' : 'IGST (inter-state)'}${po.issued_at ? `\nIssued: ${new Date(po.issued_at).toLocaleDateString('en-IN')}${po.issued_by_name ? ` by ${po.issued_by_name}` : ''}` : ''}${po.delivery_address ? `\nDeliver to: ${po.delivery_address.name}, ${[po.delivery_address.address_line1, po.delivery_address.address_line2, po.delivery_address.city, po.delivery_address.pin_code].filter(Boolean).join(', ')}` : ''}${po.purchase_contact ? `\nContact: ${[po.purchase_contact.name, po.purchase_contact.phone, po.purchase_contact.email].filter(Boolean).join(', ')}` : ''}` },
        ]],
        theme: 'grid', styles: { fontSize: 8, cellPadding: 2, valign: 'top' }, columnStyles: { 0: { cellWidth: (pageW - 28) / 2 } },
        margin: { left: 14, right: 14 },
    });
    const taxHead = intra ? ['CGST', 'SGST'] : ['IGST'];
    autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 3,
        head: [['#', 'Item', 'HSN', 'Qty', 'Unit', 'Rate', 'Taxable', 'GST %', ...taxHead, 'Amount', 'Delivery']],
        body: po.lines.map(l => [l.line_no, `${l.label}${l.notes ? `\n${l.notes}` : ''}`, l.hsn_code || '', qtyFmt(l.qty), l.purchase_uom, inr(l.rate), inr(l.value), `${l.gst_pct}%`,
            ...(intra ? [inr(l.cgst), inr(l.sgst)] : [inr(l.igst)]), inr(l.total), ddmmyyyy(l.delivery_date)]),
        foot: [['', 'Total', '', '', '', '', inr(po.totals.taxable), '', ...(intra ? [inr(po.totals.cgst), inr(po.totals.sgst)] : [inr(po.totals.igst)]), inr(po.totals.total), '']],
        styles: { fontSize: 7.5, cellPadding: 1.5, valign: 'top' }, headStyles: { fillColor: [79, 70, 229], fontSize: 7.5 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 7 }, 1: { cellWidth: 46 }, 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' } },
        margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.text(`Grand total: Rs. ${inr(po.totals.total)}`, pageW - 14, y, { align: 'right' }); doc.setFont(undefined, 'normal');
    y += 5; doc.setFontSize(8); doc.text(amountInWords(po.totals.total), 14, y, { maxWidth: pageW - 28 });
    if (po.terms) { y += 7; doc.setFont(undefined, 'bold'); doc.text('Terms', 14, y); doc.setFont(undefined, 'normal'); y += 4; doc.text(po.terms, 14, y, { maxWidth: pageW - 28 }); y += doc.splitTextToSize(po.terms, pageW - 28).length * 3.5; }
    if (y > pageH - 40) { doc.addPage(); y = 20; }
    y = Math.max(y + 18, pageH - 36);
    doc.text(`For ${company?.trade_name || company?.legal_name || ''}`, pageW - 14, y, { align: 'right' });
    // Signature / seal / signatory (Settings → Documents for POs)
    const img = (a, w, x, yy) => { try { doc.addImage(a.dataUrl, a.format, x, yy, w, (w * a.h) / a.w, undefined, 'FAST'); } catch { /* skip unreadable image */ } };
    if (assets.seal) img(assets.seal, 18, pageW - 14 - 62, y + 1);
    if (assets.signature) img(assets.signature, 30, pageW - 14 - 30, y + 1.5);
    const ds = po.doc_settings || {};
    doc.text(ds.signatory_name ? `${ds.signatory_name}${ds.signatory_designation ? `, ${ds.signatory_designation}` : ''}` : 'Authorised signatory', pageW - 14, y + 16, { align: 'right' });
    if (ds.signatory_name) { doc.setFontSize(7); doc.text('Authorised signatory', pageW - 14, y + 19.5, { align: 'right' }); doc.setFontSize(8); }
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
        doc.text(`${po.po_no}${po.revision_no ? ` rev ${po.revision_no}` : ''} · generated ${new Date().toLocaleString('en-IN')}`, 14, pageH - 8);
        doc.text(`Page ${i} of ${pages}`, pageW - 14, pageH - 8, { align: 'right' }); doc.setTextColor(0, 0, 0);
    }
    doc.save(`${fileBase(po)}.pdf`);
}

export function exportPoExcel(po) {
    const intra = po.tax_mode === 'INTRA';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(po.lines.map(l => ({
        'PO no.': po.po_no, Supplier: po.supplier_name, Line: l.line_no, Item: l.label, HSN: l.hsn_code || '', Qty: l.qty, Unit: l.purchase_uom,
        'Usage qty': l.usage_qty, 'Usage unit': l.uom, Rate: l.rate, Taxable: l.value, 'GST %': l.gst_pct,
        ...(intra ? { CGST: l.cgst, SGST: l.sgst } : { IGST: l.igst }), Amount: l.total, Delivery: l.delivery_date || '',
        Requisitions: l.requisitions.map(r => `${r.pr_no} line ${r.pr_line_no} (${r.qty})`).join(', '),
        'Covers orders': l.covers.map(c => `${c.order_no} ${c.qty}`).join(', '), Uncommitted: l.uncommitted || '',
        'No requisition': l.extra_qty || '', 'Why': l.extra_qty ? [l.extra_reason_label, l.extra_note].filter(Boolean).join(' — ') : '',
    }))), 'Lines');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(po.history.map(h => ({
        When: new Date(h.created_at).toLocaleString('en-IN'), Action: h.action, Revision: h.revision_no || '', By: h.user_name || '', Reason: h.reason || '', Detail: (h.detail?.summary || []).join('\n'),
    }))), 'History');
    XLSX.writeFile(wb, `${fileBase(po)}.xlsx`);
}
