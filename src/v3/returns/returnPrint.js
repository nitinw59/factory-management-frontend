// Material return slip PDF (21 Oct 2026, owner: "both cutting manager and fabric store manager can see and download
// material returned slip"): company letterhead, MR3 no., order, lines (tag / fabric · colour / from / sent / received /
// status), totals per unit, prepared / submitted / received by and when, notes; signature boxes.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPdfLetterhead } from '../components/letterhead';

const num = (v) => (v == null ? '' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 }));
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const itemOf = (l) => (l.kind === 'END_BIT' ? `${l.tag} (${l.end_bit_kind === 'RESERVE' ? 'reserve' : 'lay piece'})` : l.kind === 'ROLL' ? `Roll ${l.roll_no} (not cut)` : 'Pocketing / lining');
export const fromOf = (l) => (l.kind === 'END_BIT' ? `roll ${l.roll_no || '—'}${l.source_floor_no ? ` · batch #${l.source_floor_no}` : ''}` : l.kind === 'ROLL' ? (l.dye_lot ? `lot ${l.dye_lot}` : '') : 'left at cutting');
export const LINE_STATUS = { PENDING: 'To receive', RECEIVED: 'Received', NOT_RECEIVED: 'Not received' };

export function exportReturnSlip(mr, lh) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    let y = drawPdfLetterhead(doc, lh, { title: 'MATERIAL RETURN SLIP', note: 'Cutting room → fabric store' });
    if (y < 10) { doc.setFont(undefined, 'bold'); doc.setFontSize(16); doc.text('MATERIAL RETURN SLIP', W / 2, 14, { align: 'center' }); y = 20; }
    doc.setDrawColor(180); doc.line(8, y, W - 8, y); y += 5;
    doc.setFontSize(10); doc.setFont(undefined, 'bold');
    doc.text(mr.return_no, 8, y); doc.text(`Status: ${mr.status === 'RECEIVED' ? 'Received' : mr.status === 'SUBMITTED' ? 'Submitted — waiting for the store' : mr.status === 'CANCELLED' ? 'Cancelled' : 'Draft'}`, W - 8, y, { align: 'right' });
    doc.setFont(undefined, 'normal'); y += 5;
    doc.setFontSize(9);
    doc.text(`Order ${mr.order_no} · ${mr.customer_name}${mr.styles ? ` · ${mr.styles}` : ''}`, 8, y); y += 5;
    doc.text(`Prepared by ${mr.created_by_name || '—'} on ${when(mr.created_at)}`, 8, y);
    doc.text(`Submitted by ${mr.submitted_by_name || '—'} on ${when(mr.submitted_at)}`, W - 8, y, { align: 'right' }); y += 5;
    if (mr.received_at) { doc.text(`Received by ${mr.received_by_name || '—'} on ${when(mr.received_at)}`, 8, y); y += 5; }
    if (mr.notes) { doc.text(doc.splitTextToSize(`Note: ${mr.notes}`, W - 16), 8, y); y += 5; }
    const body = mr.lines.map((l, i) => [i + 1, itemOf(l), `${l.fabric_label}${l.colour ? ` · ${l.colour}` : ''}`, fromOf(l), `${num(l.listed_qty)} ${l.uom}`,
        l.status === 'RECEIVED' ? `${num(l.received_qty)} ${l.uom}` : l.status === 'NOT_RECEIVED' ? '0' : '',
        `${LINE_STATUS[l.status]}${l.not_received_reason ? ` — ${l.not_received_reason}` : ''}${l.remnant_roll_no ? ` → roll ${l.remnant_roll_no}` : ''}${l.receive_note ? ` (${l.receive_note})` : ''}`]);
    const foot = (mr.totals || []).map(t => ['', `Total (${t.uom})`, '', '', `${num(t.listed)} ${t.uom}`, mr.status === 'RECEIVED' ? `${num(t.received)} ${t.uom}` : '', '']);
    autoTable(doc, {
        startY: y + 1, head: [['#', 'Item', 'Fabric · colour', 'From', 'Sent', 'Received', 'Status']], body, foot,
        styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [30, 41, 59] }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 7 }, 4: { halign: 'right' }, 5: { halign: 'right' } }, margin: { left: 8, right: 8 }, showFoot: 'lastPage',
    });
    y = doc.lastAutoTable.finalY + 6;
    if (mr.receive_note) { doc.setFontSize(9); doc.text(doc.splitTextToSize(`Store note: ${mr.receive_note}`, W - 16), 8, y); y += 7; }
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(8.5); doc.setDrawColor(150);
    [['Sent by (cutting room)', mr.submitted_by_name], ['Received by (fabric store)', mr.received_by_name]].forEach(([label, name], i) => {
        const x = 8 + i * ((W - 16) / 2 + 2);
        doc.rect(x, y, (W - 16) / 2 - 2, 20);
        doc.text(label, x + 2, y + 5); if (name) doc.text(name, x + 2, y + 17);
    });
    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p += 1) { doc.setPage(p); doc.setFontSize(7); doc.setTextColor(120); doc.text(`${mr.return_no} · page ${p} of ${pages}`, W - 8, 290, { align: 'right' }); doc.setTextColor(0); }
    doc.save(`${mr.return_no.replace(/\//g, '-')}.pdf`);
}
