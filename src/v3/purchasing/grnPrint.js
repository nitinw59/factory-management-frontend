// Fabric inward challan (26 Oct 2026, asked: "fabric inward challan print from 2.0 to 3.0 … make sure it works in
// garment factory practically"; decided: printable while waiting for approval with a stamp, the roll list always,
// single copy with a 2-copy option). 2.0's paper form (src/modules/purchase_department/fabricInwardChallanPdfGenerator.js)
// rebuilt on the 3.0 GRN, A4 portrait, fabric lines only:
//
//   Page 1    letterhead | FABRIC INWARD CHALLAN · copy label
//             details: GRN no. · received on · supplier DC no. / date · PO no. | supplier, GSTIN · vehicle · received by
//                      | status · approved by · for orders
//             lines: # · fabric (mill · article, composition / GSM) · shade · rolls · accepted · rejected (reason) · unit ·
//                    PO ordered / received · blank remarks; ruled to 10 rows; a Total row per unit (m and kg never added)
//             signature boxes: received by (fabric store) · checked by (QC) · authorised by (purchase manager)
//   Roll list next page(s): per line a heading row, its rolls (roll no. · dye lot · qty · width · location) with blank
//             "Checked ✓" / "Actual qty" columns for the store to fill by hand, a line subtotal; grand total per unit
//   Footer    GRN no. · computer-generated · printed by / at · page x of N (per copy)
//   Stamp     waiting for approval: NOT APPROVED — NOT IN STOCK; rejected / withdrawn / reversed: that word
// Two copies = the same pages again, marked STORE COPY / ACCOUNTS COPY.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPdfLetterhead } from '../components/letterhead';

const M = 8;                                    // page margin (mm)
const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const SHADE = [241, 245, 249];
const RED = [190, 18, 60];
const num = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 }));
const dmy = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const unitOf = (u) => String(u || 'm').toUpperCase();
const STAMP = { PENDING_APPROVAL: 'NOT APPROVED', REJECTED: 'REJECTED', WITHDRAWN: 'WITHDRAWN', REVERSED: 'REVERSED' };
const STATUS_TEXT = {
    PENDING_APPROVAL: 'Waiting for approval — NOT IN STOCK',
    APPROVED: 'Approved — in stock',
    REJECTED: 'Rejected — not in stock',
    WITHDRAWN: 'Withdrawn to correct — not in stock',
    REVERSED: 'Reversed — taken out of stock',
};

export const fabricLinesOf = (g) => (g?.lines || []).filter(l => l.kind === 'FABRIC');
export const hasFabric = (g) => fabricLinesOf(g).length > 0;

const fabricOf = (l) => (l.mill || l.article_code ? `${l.mill || ''}${l.article_code ? ` · ${l.article_code}` : ''}` : l.label || 'Fabric');
const specOf = (l) => [l.composition, l.gsm ? `${num(l.gsm)} GSM` : null].filter(Boolean).join(' · ');
// The shade name only when it adds to the code (masters often repeat it: "MICRO CHECKS 184" / "MICRO CHECKS 184").
const shadeOf = (l) => {
    const code = String(l.shade_code || '').trim(); const name = String(l.shade_name || '').trim();
    return !name || code.toUpperCase().includes(name.toUpperCase()) ? code : code ? `${code} ${name}` : name;
};
const qtyOf = (l) => (l.rolls?.length ? l.rolls.reduce((s, r) => s + (Number(r.qty) || 0), 0) : Number(l.usage_qty) || 0);

// Totals per unit: { unit: { rolls, accepted, rejected } } in first-seen order.
function totalsByUnit(lines) {
    const m = new Map();
    for (const l of lines) {
        const u = unitOf(l.uom);
        const t = m.get(u) || { rolls: 0, accepted: 0, rejected: 0 };
        t.rolls += l.rolls?.length || 0; t.accepted += qtyOf(l); t.rejected += Number(l.rejected_qty) || 0;
        m.set(u, t);
    }
    return [...m.entries()];
}

function drawCopy(doc, g, lh, { copyLabel, printedBy }) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const lines = fabricLinesOf(g);
    const others = (g.lines || []).length - lines.length;
    const firstPage = doc.getNumberOfPages();

    // ── Letterhead ──────────────────────────────────────────────────────────
    let y = drawPdfLetterhead(doc, lh, { x: M, title: 'FABRIC INWARD CHALLAN', note: copyLabel || '' });
    if (y < 10) {
        doc.setFont(undefined, 'bold'); doc.setFontSize(16); doc.text('FABRIC INWARD CHALLAN', W / 2, 14, { align: 'center' });
        if (copyLabel) { doc.setFontSize(8); doc.text(copyLabel, W - M, 14, { align: 'right' }); }
        doc.setFont(undefined, 'normal'); y = 20;
    }
    doc.setDrawColor(180); doc.line(M, y, W - M, y); y += 2;

    // ── Details ─────────────────────────────────────────────────────────────
    const cell = (label, value, extra = {}) => ({ content: `${label}\n${value || '—'}`, ...extra });
    const supplier = [g.supplier_name, g.supplier_gstin ? `GSTIN ${g.supplier_gstin}` : (g.supplier_is_cash ? 'Cash purchase' : 'GSTIN —'),
        [g.supplier_address, g.supplier_city].filter(Boolean).join(', ')].filter(Boolean).join('\n');
    const orders = [...new Set(lines.flatMap(l => (l.bought_for || []).map(o => o.order_no)))];
    const approved = g.approved_at ? `${g.approved_by_name || 'within tolerance'} · ${when(g.approved_at)}` : '';
    autoTable(doc, {
        startY: y, theme: 'grid', margin: { left: M, right: M },
        body: [
            [cell('Challan (GRN) no.', g.grn_no), cell('Received on', dmy(g.received_date)),
                cell('Supplier DC / challan', `${g.challan_no || ''}${g.challan_date ? ` · ${dmy(g.challan_date)}` : ''}`), cell('PO no.', g.po_no)],
            [cell('Supplier', supplier, { colSpan: 2 }), cell('Vehicle no.', g.vehicle_no), cell('Received by', g.received_by_name)],
            [cell('Status', STATUS_TEXT[g.status] || g.status, g.status === 'APPROVED' ? {} : { styles: { textColor: RED, fontStyle: 'bold' } }),
                cell('Approved by', approved), cell('For orders', orders.join(', '), { colSpan: 2 })],
        ],
        styles: { fontSize: 8.5, textColor: INK, lineColor: [148, 163, 184], lineWidth: 0.2, cellPadding: 1.8, valign: 'top' },
        columnStyles: { 0: { cellWidth: (W - 2 * M) / 4 }, 1: { cellWidth: (W - 2 * M) / 4 }, 2: { cellWidth: (W - 2 * M) / 4 }, 3: { cellWidth: (W - 2 * M) / 4 } },
        // The first line is the label: its line is kept blank (the height stays) and drawn small and muted.
        willDrawCell: (d) => { if (d.section === 'body') { d.cell.label = d.cell.text[0]; d.cell.text = ['', ...d.cell.text.slice(1)]; } },
        didDrawCell: (d) => {
            if (d.section !== 'body' || !d.cell.label) return;
            doc.setFontSize(6.5); doc.setTextColor(...MUTED); doc.setFont(undefined, 'normal');
            doc.text(String(d.cell.label).toUpperCase(), d.cell.x + 1.8, d.cell.y + 4);
            doc.setTextColor(...INK);
        },
    });
    y = doc.lastAutoTable.finalY + 3;

    // ── Lines (one row per fabric · shade) ──────────────────────────────────
    const body = lines.map((l, i) => [
        String(i + 1),
        specOf(l) ? `${fabricOf(l)}\n${specOf(l)}` : fabricOf(l),
        shadeOf(l),
        String(l.rolls?.length || 0),
        num(qtyOf(l)),
        l.rejected_qty > 0 ? `${num(l.rejected_qty)}${l.rejection_reason ? `\n${l.rejection_reason}` : ''}` : '',
        unitOf(l.uom),
        `${num(l.ordered_qty)} / ${num(l.received_on_po)}`,
        '',
    ]);
    // Ruled to 10 rows, like the paper form, so hand-written remarks have room.
    while (body.length < 10) body.push(['', '', '', '', '', '', '', '', '']);
    const foot = totalsByUnit(lines).map(([u, t]) => ['', `Total (${u})`, '', { content: String(t.rolls), styles: { halign: 'center' } },
        { content: num(t.accepted), styles: { halign: 'right' } }, { content: t.rejected ? num(t.rejected) : '', styles: { halign: 'right' } }, { content: u, styles: { halign: 'center' } }, '', '']);
    autoTable(doc, {
        startY: y, theme: 'grid', margin: { left: M, right: M, bottom: 16 },
        head: [['#', 'Fabric', 'Shade', 'Rolls', 'Accepted', 'Rejected', 'Unit', 'PO ordered / received', 'Remarks']],
        body, foot, showFoot: 'lastPage',
        styles: { fontSize: 8, textColor: INK, lineColor: [100, 116, 139], lineWidth: 0.2, cellPadding: 1.6, valign: 'middle', minCellHeight: 7 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', halign: 'center' },
        footStyles: { fillColor: SHADE, textColor: INK, fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 7, halign: 'center' }, 1: { cellWidth: 46 }, 2: { cellWidth: 30 }, 3: { cellWidth: 12, halign: 'center' },
            4: { cellWidth: 20, halign: 'right' }, 5: { cellWidth: 20, halign: 'right' }, 6: { cellWidth: 11, halign: 'center' },
            7: { cellWidth: 22, halign: 'right' }, 8: { cellWidth: 'auto' },
        },
    });
    y = doc.lastAutoTable.finalY + 3;
    doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    const notes = [
        'PO ordered / received: the PO line\'s ordered quantity and what is received on it so far (this GRN counts once approved).',
        others > 0 ? `${others} trim / store line(s) on this GRN are not on this fabric challan.` : null,
    ].filter(Boolean);
    for (const n of notes) { doc.text(n, M, y + 2); y += 3.8; }
    doc.setTextColor(...INK);
    if (g.notes) { doc.setFontSize(8.5); const t = doc.splitTextToSize(`Notes: ${g.notes}`, W - 2 * M); doc.text(t, M, y + 3); y += 3 + t.length * 4; }

    // ── Signatures ──────────────────────────────────────────────────────────
    y += 6;
    if (y > H - 40) { doc.addPage(); y = 16; }
    const boxW = (W - 2 * M - 8) / 3;
    [['Received by (fabric store)', g.received_by_name], ['Checked by (QC)', ''], ['Authorised by (purchase manager)', g.status === 'APPROVED' ? g.approved_by_name : '']]
        .forEach(([label, name], i) => {
            const x = M + i * (boxW + 4);
            doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.3); doc.rect(x, y, boxW, 22);
            doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.text(label, x + 2, y + 4.5); doc.setFont(undefined, 'normal');
            doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text('Signature & date', x + 2, y + 20); doc.setTextColor(...INK);
            if (name) { doc.setFontSize(8.5); doc.text(name, x + boxW - 2, y + 20, { align: 'right' }); }
        });

    // ── Roll list (always, from a new page) ─────────────────────────────────
    doc.addPage();
    doc.setFont(undefined, 'bold'); doc.setFontSize(12); doc.text(`ROLL LIST — ${g.grn_no}`, M, 13);
    doc.setFont(undefined, 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
    doc.text(`${g.supplier_name || ''} · DC ${g.challan_no || '—'} · received ${dmy(g.received_date)}${copyLabel ? ` · ${copyLabel}` : ''}`, M, 18);
    doc.text('Tick each roll as it is checked and racked; write the actual quantity where it differs.', W - M, 18, { align: 'right' });
    doc.setTextColor(...INK);
    const rollBody = [];
    lines.forEach((l, i) => {
        const shade = shadeOf(l);
        rollBody.push([{ content: `${i + 1}. ${fabricOf(l)}${shade ? ` · ${shade}` : ''} — ${l.rolls?.length || 0} roll(s), ${num(qtyOf(l))} ${unitOf(l.uom)}`, colSpan: 8, styles: { fillColor: SHADE, fontStyle: 'bold' } }]);
        (l.rolls || []).forEach((r, k) => rollBody.push([
            String(k + 1), r.roll_no || '', r.dye_lot || '', num(r.qty), r.width ? `${num(r.width)} ${r.width_unit || ''}`.trim() : '', r.location || '', '', '',
        ]));
        if (!l.rolls?.length) rollBody.push([{ content: 'No rolls entered on this line.', colSpan: 8, styles: { textColor: MUTED, fontStyle: 'italic' } }]);
        rollBody.push(['', { content: `Subtotal line ${i + 1}`, colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `${num(qtyOf(l))} ${unitOf(l.uom)}`, styles: { fontStyle: 'bold', halign: 'right' } }, '', '', '', '']);
    });
    const rollFoot = totalsByUnit(lines).map(([u, t]) => ['', { content: `Total — ${t.rolls} roll(s)`, colSpan: 2, styles: { halign: 'right' } },
        { content: `${num(t.accepted)} ${u}`, styles: { halign: 'right' } }, '', '', '', '']);
    autoTable(doc, {
        startY: 21, theme: 'grid', margin: { left: M, right: M, top: 12, bottom: 16 },
        head: [['#', 'Roll no.', 'Dye lot', 'Qty', 'Width', 'Location', 'Checked', 'Actual qty']],
        body: rollBody, foot: rollFoot, showHead: 'everyPage', showFoot: 'lastPage',
        styles: { fontSize: 8, textColor: INK, lineColor: [148, 163, 184], lineWidth: 0.2, cellPadding: 1.4, minCellHeight: 6 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: SHADE, textColor: INK, fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 30 }, 2: { cellWidth: 28 }, 3: { cellWidth: 22, halign: 'right' },
            4: { cellWidth: 22 }, 5: { cellWidth: 30 }, 6: { cellWidth: 20 }, 7: { cellWidth: 'auto' },
        },
    });

    // ── Footer and stamp on this copy's pages ───────────────────────────────
    const last = doc.getNumberOfPages();
    const n = last - firstPage + 1;
    const mark = STAMP[g.status];
    for (let p = firstPage; p <= last; p += 1) {
        doc.setPage(p);
        doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3); doc.line(M, H - 11, W - M, H - 11);
        doc.setFontSize(7); doc.setTextColor(...MUTED);
        doc.text(`Computer-generated · printed${printedBy ? ` by ${printedBy}` : ''} on ${when(new Date())}`, M, H - 7);
        doc.text(`${g.grn_no}${copyLabel ? ` · ${copyLabel}` : ''} · page ${p - firstPage + 1} of ${n}`, W - M, H - 7, { align: 'right' });
        if (mark) {
            try {
                doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.12 }));
                doc.setFont(undefined, 'bold'); doc.setFontSize(mark.length > 10 ? 64 : 80); doc.setTextColor(...RED);
                doc.text(mark, W / 2, H / 2 + 30, { align: 'center', angle: 35 });
                if (g.status === 'PENDING_APPROVAL') { doc.setFontSize(40); doc.text('NOT IN STOCK', W / 2 + 12, H / 2 + 52, { align: 'center', angle: 35 }); }
                doc.restoreGraphicsState(); doc.setFont(undefined, 'normal');
            } catch { /* no transparency: the status cell still says it */ }
        }
        doc.setTextColor(...INK);
    }
}

// g: the GRN as GET /purchasing/grns/:id returns it; lh: loadLetterhead(); copies 1 | 2.
export function exportFabricInwardChallan(g, lh, { copies = 1, printedBy = '' } = {}) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const labels = copies === 2 ? ['STORE COPY', 'ACCOUNTS COPY'] : [''];
    labels.forEach((copyLabel, i) => {
        if (i > 0) doc.addPage();
        drawCopy(doc, g, lh, { copyLabel, printedBy });
    });
    doc.save(`FabricInwardChallan-${String(g.grn_no).replace(/[^\w-]+/g, '-')}${copies === 2 ? '-2copies' : ''}.pdf`);
    return doc;
}
