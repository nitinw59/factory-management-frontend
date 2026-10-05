// Purchase requisition status labels and the PR / buy list exports
// (jsPDF + autotable, xlsx — same libraries as the other 3.0 exports).
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';

export const PR_STATUS = {
    DRAFT:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    SUBMITTED: { label: 'Submitted', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
    APPROVED:  { label: 'Approved',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    REJECTED:  { label: 'Rejected',  cls: 'bg-rose-50 text-rose-700 border-rose-300' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-slate-50 text-slate-400 border-slate-200 line-through' },
};

const n = (v, max = 3) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: max });
const fileBase = (pr) => `Requisition-${pr.pr_no.replace(/[^\w-]+/g, '-')}`;

export function exportPrPdf(pr, company) {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = 14;
    const coName = company?.trade_name || company?.legal_name;
    if (coName) {
        doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text(coName, 14, y); doc.setFont(undefined, 'normal');
        const addr = [company.address_line1, company.address_line2, [company.city, company.state].filter(Boolean).join(', ')].filter(Boolean).join(', ');
        doc.setFontSize(8);
        if (addr) { y += 4.5; doc.text(addr, 14, y, { maxWidth: pageW - 28 }); }
        if (company.gstin) { y += 4; doc.text(`GSTIN: ${company.gstin}`, 14, y); }
        y += 6;
    }
    doc.setFontSize(15); doc.setFont(undefined, 'bold'); doc.text(`Purchase requisition ${pr.pr_no}`, 14, y);
    doc.setFontSize(10); doc.text(PR_STATUS[pr.status]?.label || pr.status, pageW - 14, y, { align: 'right' }); doc.setFont(undefined, 'normal');
    y += 5;
    doc.setFontSize(8.5);
    const who = [`Raised by ${pr.created_by_name || '—'} on ${new Date(pr.created_at).toLocaleDateString('en-IN')}`,
        pr.approved_at ? `Approved by ${pr.approved_by_name || '—'} on ${new Date(pr.approved_at).toLocaleDateString('en-IN')}` : null].filter(Boolean).join('   |   ');
    doc.text(who, 14, y);
    if (pr.status !== 'APPROVED') { y += 4.5; doc.setTextColor(190, 18, 60); doc.text(pr.status === 'CANCELLED' ? `CANCELLED: ${pr.cancelled_reason || ''}` : 'NOT APPROVED — not for ordering', 14, y); doc.setTextColor(0, 0, 0); }
    autoTable(doc, {
        startY: y + 4,
        head: [['#', 'Item', 'Type', 'Quantity', 'Unit', 'Usage qty', 'Needed by', 'For orders', 'Notes']],
        body: pr.lines.map(l => [l.line_no, l.label, l.type_name || '', n(l.purchase_qty), l.purchase_uom, `${n(l.usage_qty)} ${l.uom}`, fmtDate(l.needed_by),
            [...l.orders.map(o => `${o.order_no}: ${n(o.covers)}${o.from_surplus ? ' (surplus)' : ''}`), l.uncommitted > 0 ? `uncommitted: ${n(l.uncommitted)}` : ''].filter(Boolean).join('\n'), l.notes || '']),
        styles: { fontSize: 8, cellPadding: 1.5, valign: 'top' }, headStyles: { fillColor: [79, 70, 229] },
        columnStyles: { 0: { cellWidth: 8 }, 3: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'right' } },
        margin: { left: 14, right: 14 },
    });
    if (pr.notes) { doc.setFontSize(8.5); doc.text(`Notes: ${pr.notes}`, 14, doc.lastAutoTable.finalY + 6, { maxWidth: pageW - 28 }); }
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
        doc.text(`${pr.pr_no} · ${PR_STATUS[pr.status]?.label || pr.status} · generated ${new Date().toLocaleString('en-IN')}`, 14, pageH - 8);
        doc.text(`Page ${i} of ${pages}`, pageW - 14, pageH - 8, { align: 'right' }); doc.setTextColor(0, 0, 0);
    }
    doc.save(`${fileBase(pr)}.pdf`);
}

export function exportPrExcel(pr) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pr.lines.map(l => ({
        'PR no.': pr.pr_no, Status: PR_STATUS[pr.status]?.label || pr.status, Line: l.line_no, Item: l.label, Type: l.type_name || '',
        Quantity: l.purchase_qty, Unit: l.purchase_uom, 'Usage qty': l.usage_qty, 'Usage unit': l.uom, 'Raised for orders': l.for_orders,
        'Covers orders': l.covers, Uncommitted: l.uncommitted || '', 'Needed by': l.needed_by || '', Notes: l.notes || '',
    }))), 'Lines');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pr.lines.flatMap(l => l.orders.map(o => ({
        Line: l.line_no, Item: l.label, 'Order no.': o.order_no, Customer: o.customer_name, 'Order status': o.order_status, Unit: l.uom,
        'Raised for': o.raised_for, Covers: o.covers, 'From surplus': o.from_surplus ? 'yes' : '',
    })))), 'Orders');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pr.history.map(h => ({
        When: new Date(h.created_at).toLocaleString('en-IN'), Action: h.action, By: h.user_name || '', Reason: h.reason || '', Detail: (h.detail?.summary || []).join('\n'),
    }))), 'History');
    XLSX.writeFile(wb, `${fileBase(pr)}.xlsx`);
}

export function exportBuyListExcel(rows) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(r => ({
        Item: r.label, Type: r.type_name || '', 'To raise': r.to_raise, Unit: r.uom, 'Buy qty': r.purchase_qty, 'Buy unit': r.purchase_uom,
        'Needed by': r.needed_by || '', Late: r.late ? 'yes' : '', Orders: r.orders.map(o => `${o.order_no} (${o.to_raise})`).join(', '),
    }))), 'Buy list');
    XLSX.writeFile(wb, `BuyList-${todayLocal()}.xlsx`);
}
