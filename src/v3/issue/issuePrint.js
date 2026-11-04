// Fabric slips on paper (4 Nov 2026, "Phase C: records"): the slip, the pick list in rack order with a barcode per roll, roll
// labels, and the slip list as Excel or PDF. A roll's barcode is R<id>: unique across fabrics, unlike the roll number.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPdfLetterhead } from '../components/letterhead';
import { newWorkbook, saveWorkbook, BOX, FONT, BOLD } from '../components/xlsxSave';
import { todayLocal } from '../salesOrders/SalesOrderStatusBadge';

export const fmtN = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
export const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const STATUS = {
    DRAFT: { label: 'Draft', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    SUBMITTED: { label: 'Waiting for cutting', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
    RECEIVED: { label: 'Received', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
    REJECTED: { label: 'Refused', cls: 'bg-rose-50 text-rose-800 border-rose-300' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};
// Quantities per unit, as yards and metres can't be added together: [{ uom, qty }] → "1,200 m + 340 yd".
export const unitsText = (list) => {
    const sums = new Map();
    for (const u of list || []) sums.set(u.uom, (sums.get(u.uom) || 0) + (Number(u.qty) || 0));
    return [...sums.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([uom, n]) => `${fmtN(n)} ${uom}`).join(' + ') || '—';
};
// How long cutting took: "45 min", "3.2 h", "2.1 days".
export const tookText = (from, to) => {
    if (!from || !to) return '';
    const h = (new Date(to) - new Date(from)) / 3600000;
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
    return h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.round(h / 2.4) / 10} days`;
};

// A slip's rolls: what is planned until cutting decides, then what it decided; older and trim slips from their lines.
export const slipRows = (s) => {
    if (s.planned?.length) return s.planned.map(p => ({ label: p.label, roll_no: p.roll_no, code: p.code, dye_lot: p.dye_lot, width: p.width, width_unit: p.width_unit, location: p.location, qty: p.qty, uom: p.uom, status: p.status, reason: p.reason }));
    return (s.lines || []).flatMap(l => (l.rolls?.length
        ? l.rolls.map(r => ({ label: l.label, roll_no: r.roll_no, code: `R${r.roll_id}`, dye_lot: r.dye_lot, qty: r.qty, uom: l.uom, returned_qty: r.returned_qty, status: 'RECEIVED' }))
        : [{ label: l.label, qty: l.qty, uom: l.uom, returned_qty: l.returned_qty, status: 'RECEIVED' }]));
};
const STATE = { PENDING: 'Waiting', RECEIVED: 'Received', REJECTED: 'Refused' };
const fileNo = (s) => s.issue_no.replace(/[^\w-]+/g, '-');

function heading(doc, lh, title, note) {
    const W = doc.internal.pageSize.getWidth();
    let y = drawPdfLetterhead(doc, lh, { title, note });
    if (y < 10) { doc.setFont(undefined, 'bold'); doc.setFontSize(16); doc.text(title, W / 2, 14, { align: 'center' }); y = 20; }
    doc.setDrawColor(180); doc.line(8, y, W - 8, y);
    return y + 5;
}
function pageNumbers(doc) {
    const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Page ${i} of ${pages}`, W - 8, H - 6, { align: 'right' }); doc.setTextColor(0); }
}
const TABLE = { theme: 'grid', styles: { fontSize: 8, cellPadding: 1.3, lineColor: [200, 200, 200], lineWidth: 0.1, textColor: 20 }, headStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' }, margin: { left: 8, right: 8, bottom: 12 }, showFoot: 'lastPage' };

export function exportIssueSlip(s, lh) {
    const trim = s.series === 'TI' || s.lines?.some(l => l.kind === 'TRIM');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    let y = heading(doc, lh, trim ? 'TRIM ISSUE SLIP' : 'FABRIC ISSUE SLIP', trim ? 'Trim store to line' : 'Fabric store to cutting');
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.text(s.issue_no, 8, y);
    doc.text(`Status: ${(STATUS[s.status] || {}).label || s.status}`, W - 8, y, { align: 'right' }); doc.setFont(undefined, 'normal'); y += 5;
    doc.setFontSize(9);
    const lines = [
        `Order ${s.order_no} · ${s.customer_name}${s.cut_batch_code ? ` · batch ${s.cut_batch_code}` : ''} · to ${s.stage} · date ${s.issue_date.split('-').reverse().join('/')}`,
        `Prepared by ${s.issued_by_name || '—'}${s.submitted_at ? ` · submitted by ${s.submitted_by_name || '—'} on ${when(s.submitted_at)}` : ''}`,
        s.status === 'RECEIVED' || s.status === 'REJECTED' ? `${s.status === 'REJECTED' ? 'Refused' : 'Received'} by ${s.received_by_name || s.received_by}${s.received_at ? ` on ${when(s.received_at)}` : ''}` : null,
        s.status === 'CANCELLED' ? `Cancelled by ${s.cancelled_by_name || '—'} on ${when(s.cancelled_at)}: ${s.cancel_reason}` : null,
        s.gate_override ? `Cutting gate: released${s.gate_released_by ? ` by ${s.gate_released_by}` : ''}${s.gate_release_reason ? `: ${s.gate_release_reason}` : ''}` : null,
        s.mixed_lots ? `Mixed dye lots: ${s.lot_reason || '—'}${s.lots_accepted_by_name ? ` · accepted by ${s.lots_accepted_by_name}` : ''}` : null,
        s.backdate_reason ? `Dated in the past: ${s.backdate_reason}` : null,
        s.notes ? `Note: ${s.notes}` : null,
    ].filter(Boolean);
    for (const l of lines) for (const part of doc.splitTextToSize(l, W - 16)) { doc.text(part, 8, y); y += 4.2; }
    const rows = slipRows(s);
    const right = { halign: 'right' };
    autoTable(doc, {
        ...TABLE, startY: y + 1,
        head: [['#', trim ? 'Item' : 'Fabric', 'Roll', 'Lot', { content: 'Qty', styles: right }, 'Status']],
        body: rows.map((r, i) => [i + 1, r.label, r.roll_no || '—', r.dye_lot || '—', `${fmtN(r.qty)} ${r.uom}`, `${STATE[r.status] || r.status}${r.reason ? `: ${r.reason}` : ''}${r.returned_qty ? ` · ${fmtN(r.returned_qty)} returned` : ''}`]),
        foot: [[{ content: `Total · ${rows.length} line${rows.length === 1 ? '' : 's'}`, colSpan: 4 }, { content: unitsText(rows.filter(r => r.status !== 'REJECTED')), styles: right }, '']],
        columnStyles: { 0: { cellWidth: 8 }, 4: right },
    });
    const by = doc.lastAutoTable.finalY + 24;
    doc.setFontSize(9); doc.setDrawColor(120);
    [['Issued by', 8], ['Received by', W / 2 + 4]].forEach(([t, x]) => { doc.line(x, by, x + W / 2 - 16, by); doc.text(t, x, by + 4); });
    pageNumbers(doc);
    doc.save(`${trim ? 'TrimIssue' : 'FabricIssue'}-${fileNo(s)}.pdf`);
}

async function barcode(code) {
    const JsBarcode = (await import('jsbarcode')).default;
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, code, { format: 'CODE128', displayValue: true, fontSize: 18, height: 50, margin: 4 });
    return { data: canvas.toDataURL('image/png'), ratio: canvas.width / canvas.height };
}

// The store's walk: rolls in rack order, each with its barcode and a box to tick.
export async function exportPickList(s, lh) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = heading(doc, lh, 'PICK LIST', 'Fabric store');
    doc.setFontSize(9);
    doc.text(`${s.issue_no} · order ${s.order_no} · ${s.customer_name}${s.notes ? ` · ${s.notes}` : ''}`, 8, y); y += 3;
    const rows = slipRows(s).filter(r => r.status !== 'REJECTED').sort((a, b) => (a.location ? 0 : 1) - (b.location ? 0 : 1) || String(a.location || '').localeCompare(String(b.location || ''), undefined, { numeric: true }) || String(a.roll_no).localeCompare(String(b.roll_no), undefined, { numeric: true }));
    const codes = await Promise.all(rows.map(r => barcode(r.code)));
    const right = { halign: 'right' };
    autoTable(doc, {
        ...TABLE, startY: y + 1,
        head: [['', 'Location', 'Fabric', 'Roll', 'Lot', { content: 'Qty', styles: right }, 'Barcode']],
        body: rows.map(r => ['', r.location || '—', r.label, r.roll_no, r.dye_lot || '—', `${fmtN(r.qty)} ${r.uom}`, '']),
        foot: [[{ content: `Total · ${rows.length} roll${rows.length === 1 ? '' : 's'}`, colSpan: 5 }, { content: unitsText(rows), styles: right }, '']],
        bodyStyles: { minCellHeight: 14, valign: 'middle' }, columnStyles: { 0: { cellWidth: 7 }, 5: right, 6: { cellWidth: 44 } },
        didDrawCell: (c) => {
            if (c.section !== 'body' || c.column.index !== 6) return;
            const b = codes[c.row.index];
            const h = 12; doc.addImage(b.data, 'PNG', c.cell.x + 1, c.cell.y + 1, Math.min(h * b.ratio, 42), h);
        },
    });
    pageNumbers(doc);
    doc.save(`PickList-${fileNo(s)}.pdf`);
}

// One label per roll: stick it on the roll once, then every scan finds it.
export async function exportRollLabels(s) {
    const rows = slipRows(s).filter(r => r.code);
    const codes = await Promise.all(rows.map(r => barcode(r.code)));
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const LW = 95; const LH = 52; const M = 8; const G = 4;
    rows.forEach((r, i) => {
        const n = i % 10;
        if (i > 0 && n === 0) doc.addPage();
        const x = M + (n % 2) * (LW + G); const y = M + Math.floor(n / 2) * (LH + G);
        doc.setDrawColor(150); doc.rect(x, y, LW, LH);
        doc.setFont(undefined, 'bold'); doc.setFontSize(14); doc.text(`Roll ${r.roll_no}`, x + 3, y + 7);
        doc.setFont(undefined, 'normal'); doc.setFontSize(8);
        doc.text(doc.splitTextToSize(r.label, LW - 6).slice(0, 2), x + 3, y + 12);
        doc.setFontSize(9);
        doc.text(`Lot ${r.dye_lot || '—'}${r.width ? ` · ${r.width} ${r.width_unit}` : ''}${r.location ? ` · ${r.location}` : ''}`, x + 3, y + 21);
        const b = codes[i]; const h = 25;
        doc.addImage(b.data, 'PNG', x + 3, y + 24, Math.min(h * b.ratio, LW - 6), h);
    });
    doc.save(`RollLabels-${fileNo(s)}.pdf`);
}

const describe = ({ status, search, from, to, total }) => [status ? `Status: ${status}` : 'All statuses', search ? `Search: "${search}"` : null, from ? `from ${from}` : null, to ? `to ${to}` : null, `${total} slip${total === 1 ? '' : 's'}`, `Exported ${when(new Date())}`].filter(Boolean).join(' · ');
const flags = (r) => [r.slip_mixed_lots || r.mixed_lots ? 'mixed dye lots' : null, r.gate_override ? `gate released${r.gate_released_by ? ` by ${r.gate_released_by}` : ''}` : null, r.backdate_reason ? 'dated in the past' : null, r.rolls_refused ? `${r.rolls_refused} refused` : null, r.has_returns ? 'with returns' : null].filter(Boolean).join(', ');

export async function exportSlipsExcel(rows, filter) {
    const wb = await newWorkbook();
    const ws = wb.addWorksheet('Fabric slips');
    const cols = [['Slip', 18], ['Status', 18], ['Date', 11], ['Order', 18], ['Customer', 26], ['Batch', 18], ['Fabric', 40], ['Lots', 12], ['Rolls', 7], ['Qty', 10], ['Unit', 6], ['Sent by', 16], ['Sent at', 18], ['Received by', 16], ['Received at', 18], ['Took', 9], ['Flags', 30], ['Notes', 30]];
    ws.columns = cols.map(([, width]) => ({ width }));
    ws.getCell(1, 1).value = 'Fabric slips'; ws.getCell(1, 1).font = { ...BOLD, size: 13 };
    ws.getCell(2, 1).value = describe({ ...filter, total: rows.length }); ws.getCell(2, 1).font = FONT;
    const write = (n, vals, font) => vals.forEach((v, i) => { const c = ws.getCell(n, i + 1); c.value = v ?? ''; c.font = font; c.border = BOX; });
    write(4, cols.map(([l]) => l), BOLD);
    let n = 5;
    const sums = new Map();
    for (const r of rows) {
        // one row per unit, so the quantity stays a number
        for (const u of (r.totals?.length ? r.totals : [{ uom: '', qty: null }])) {
            write(n, [r.issue_no, STATUS[r.status]?.label || r.status, r.issue_date, r.order_no, r.customer_name, r.batch_code, r.fabrics, (r.lots || []).join(', '), r.rolls, u.qty, u.uom, r.submitted_by_name || r.issued_by_name, r.submitted_at ? when(r.submitted_at) : '', r.status === 'RECEIVED' || r.status === 'REJECTED' ? r.received_by : '', r.received_at ? when(r.received_at) : '', tookText(r.submitted_at, r.received_at), flags(r), r.notes], FONT);
            ws.getCell(n, 10).numFmt = '#,##0.###';
            if (u.uom && r.status !== 'CANCELLED') { const x = sums.get(u.uom) || { qty: 0, rolls: 0 }; x.qty += u.qty; sums.set(u.uom, x); }
            n++;
        }
    }
    for (const [uom, x] of [...sums.entries()].sort()) { write(n, [`Total ${uom} (not cancelled)`, '', '', '', '', '', '', '', '', x.qty, uom, '', '', '', '', '', '', ''], BOLD); ws.getCell(n, 10).numFmt = '#,##0.###'; n++; }
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    if (rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
    await saveWorkbook(wb, `Fabric-slips-${todayLocal()}.xlsx`);
}

export function exportSlipsPdf(rows, filter, lh) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let y = heading(doc, lh, 'FABRIC SLIPS');
    doc.setFontSize(9); doc.text(describe({ ...filter, total: rows.length }), 8, y); y += 2;
    const right = { halign: 'right' };
    const live = rows.filter(r => r.status !== 'CANCELLED');
    autoTable(doc, {
        ...TABLE, startY: y + 1,
        head: [['Slip', 'Status', 'Date', 'Order', 'Fabric', 'Lots', { content: 'Rolls', styles: right }, { content: 'Qty', styles: right }, 'Sent by', 'Received', 'Flags']],
        body: rows.map(r => [r.issue_no, STATUS[r.status]?.label || r.status, r.issue_date.split('-').reverse().join('/'), `${r.order_no}\n${r.customer_name}${r.batch_code ? `\n${r.batch_code}` : ''}`, r.fabrics || '—', (r.lots || []).join(', ') || '—', r.rolls, unitsText(r.totals), r.submitted_by_name || r.issued_by_name || '—',
            r.status === 'RECEIVED' || r.status === 'REJECTED' ? `${r.received_by}${r.received_at ? `\n${when(r.received_at)}` : ''}` : '—', flags(r) || '—']),
        foot: [[{ content: `Total · ${rows.length} slip${rows.length === 1 ? '' : 's'} (cancelled not counted)`, colSpan: 6 }, { content: String(live.reduce((a, r) => a + r.rolls, 0)), styles: right }, { content: unitsText(live.flatMap(r => r.totals || [])), styles: right }, { content: '', colSpan: 3 }]],
        columnStyles: { 6: right, 7: right },
    });
    pageNumbers(doc);
    doc.save(`Fabric-slips-${todayLocal()}.pdf`);
}
