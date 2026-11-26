// Trim kit documents (21 Oct 2026, "Trim kits — store picking, handover and returns"): the pick list the store keeper
// fills the kit from (what to put in, the stock, an empty Picked column, a note column, signature) and the valuation bill
// of a handover (signed quantities × item rate, as 2.0's auto bill at signing). Both carry the company letterhead.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPdfLetterhead } from '../components/letterhead';
import { groupKitLines, byStage, stageKey, stageName, pickCaps, freeStockLine, SHORT_REASON } from './trimKitShared';

const num = (v, d = 3) => (v == null ? '' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: d }));
const money = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const head = (doc, k, lh, title, kit = null) => {
    let y = drawPdfLetterhead(doc, lh, { title });
    if (y < 10) { doc.setFont(undefined, 'bold'); doc.setFontSize(15); doc.text(title, 105, 14, { align: 'center' }); y = 20; }
    doc.setDrawColor(180); doc.line(8, y, 202, y); y += 5;
    if (kit) {
        // the kit number, large (26 Nov 2026, owner: no bag label yet — the store writes the kit number on the bag with a
        // marker; the line loader finds the kit by it)
        doc.setDrawColor(30); doc.setLineWidth(0.6); doc.rect(8, y - 1, 194, 17); doc.setLineWidth(0.2);
        doc.setFont(undefined, 'bold'); doc.setFontSize(24); doc.text(kit.kit_no, 12, y + 10);
        doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.text('KIT NO. — write it on the bag', 198, y + 4, { align: 'right' });
        doc.text(`Trim order ${k.trim_order_no}`, 198, y + 9, { align: 'right' });
        if (kit.status !== 'PREPARING') doc.text(String(kit.status).toLowerCase(), 198, y + 14, { align: 'right' });
        y += 21;
    }
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.text(`${kit ? '' : `${k.trim_order_no}  ·  `}${k.floor_no ? `batch #${k.floor_no}` : ''}`, 8, y); doc.setFont(undefined, 'normal');
    doc.setFontSize(9); doc.text(`${k.order_no} · ${k.customer_name}${k.batch_code ? ` · ${k.batch_code}` : ''}`, 8, y + 5);
    const goes = kit ? [kit.goes_to ? `Goes to: ${kit.goes_to}` : 'Goes to: any line', kit.stages?.length ? `Stages: ${kit.stages.join(', ')}` : ''].filter(Boolean).join('   ·   ')
        : (k.batch_lines?.length ? `Goes to: ${k.batch_lines.map(l => l.name).join(', ')}` : '');
    if (goes) doc.text(goes, 8, y + 10);
    return y + (goes ? 14 : 9);
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
// Trim orders and kits (26 Nov 2026): with a kit — that kit's pick list (what is in it, the kit number large, its line and
// stages; then what the trim order still owes outside it); without — the trim order's "what can go in a kit now" sheet.
export function exportPickList(k, lh, kit = null) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = head(doc, k, lh, kit ? 'TRIM KIT — PICK LIST' : 'TRIM ORDER — WHAT CAN GO IN A KIT NOW', kit);
    const oc = k.over_cut;
    if (!kit && oc?.cells?.length) {
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
        doc.text(`Everything cut is on the trim order; over-cut comes from free stock (not this order's allocation)${oc.status === 'PENDING' ? ' — over-cut approval pending, the kits do not wait' : ''}.`, 8, y + 3);
        doc.setTextColor(0); y += 7;
    }
    const amt = (g, q, units) => (g.in_units ? `${units} ${g.purchase_uom} (${num(q)} ${g.uom})` : `${num(q)} ${g.uom}`);
    // 22 Nov 2026: trim type column; rows by issue stage, trim type, line no. (# stays the trim order line no.).
    // Never a 0 line (26 Nov 2026): a kit lists what is in it; the order sheet only what can go in now, at what can go in.
    const lineOf = new Map(k.lines.map(l => [l.id, l]));
    const rows = kit
        ? byStage(groupKitLines(kit.lines.map(kl => ({ ...lineOf.get(kl.order_line_id), can_now: kl.qty, can_units: kl.units, wait_why: null, kit_pick: kl.pick || null })))).map(g => ({ g, cp: pickCaps(g) }))
        : byStage(groupKitLines(k.lines.filter(l => l.to_kit > 0))).map(g => ({ g, cp: pickCaps(g) })).filter(x => x.cp.total > 0);
    const groups = rows.map(x => x.g);
    const types = new Set(groups.map(g => g.type_name).filter(Boolean));
    const part = (x, free) => {   // what goes in for the order part (free = false) or the over-cut part (free = true)
        const ls = x.g.lines.map((l, i) => ({ l, c: x.cp.caps[i] })).filter(z => freeStockLine(z.l) === free);
        return { qty: ls.reduce((a, z) => a + z.c.qty, 0), units: ls.reduce((a, z) => a + (z.c.units || 0), 0) };
    };
    // A kit already put in (ready, signed — 26 Nov 2026, owner: "why is picked column and notes empty … user has entered put
    // in and if less reason"): Picked = what the store entered, Note = less than could go in, with the reason. A kit being
    // prepared keeps both blank, to write on while picking.
    const done = Boolean(kit) && kit.status !== 'PREPARING';
    const pickedText = (x) => {
        const g = x.g; const o = part(x, false); const ov = part(x, true); const put = amt(g, o.qty + ov.qty, o.units + ov.units);
        const short = g.lines.reduce((a, l) => a + (Number(l.kit_pick?.short) || 0), 0);
        return short > 1e-9 ? `${put} of ${num(o.qty + ov.qty + short)} ${g.uom}` : put;
    };
    const noteText = (x) => x.g.lines.filter(l => Number(l.kit_pick?.short) > 1e-9).map(l => `${x.g.lines.length > 1 ? (freeStockLine(l) ? 'over-cut: ' : 'order: ') : ''}${num(l.kit_pick.short)} ${l.uom} short — ${(SHORT_REASON[l.kit_pick.reason] || l.kit_pick.reason || '').toLowerCase()}${l.kit_pick.note ? ` (${l.kit_pick.note})` : ''}${l.kit_pick.adjusted ? ` · stock adjusted -${num(l.kit_pick.adjusted)}` : ''}`).join('\n');
    const labelsRow = kit && kit.labels_qty > 0 ? [[{ content: 'GARMENT BARCODE LABELS', colSpan: 9, styles: { fillColor: [224, 231, 255], fontStyle: 'bold', textColor: 30, halign: 'left' } }],
        ['L', 'Labels', 'Garment barcode labels (printed by the store)', `${kit.labels_qty} pcs`, '—', `${kit.labels_qty} pcs`, '', done ? `${kit.labels_qty} pcs` : '', '']] : [];
    autoTable(doc, {
        startY: y,
        head: [['#', 'Trim type', 'Item', 'For the order', 'Over-cut', kit ? 'In the kit' : 'Can go in', 'In stock', 'Picked', 'Note']],
        // a header row per issue stage (26 Nov 2026) — the store picks one stage's section at a time
        body: [...rows.flatMap((x, i) => {
            const g = x.g; const o = part(x, false); const ov = part(x, true);
            const row = [g.line_no, g.type_name || '—', `${g.label}${g.extra ? ' (extra line)' : ''}${!kit && x.cp.cause ? ' — rest waits' : ''}`,
                o.qty > 0 ? amt(g, o.qty, o.units) : '—', ov.qty > 0 ? amt(g, ov.qty, ov.units) : '—', amt(g, o.qty + ov.qty, o.units + ov.units),
                `${num(g.stock_on_hand)} ${g.uom}`, done ? pickedText(x) : '', done ? noteText(x) : ''];
            if (i > 0 && stageKey(rows[i - 1].g) === stageKey(g)) return [row];
            const n = rows.filter(z => stageKey(z.g) === stageKey(g)).length;
            return [[{ content: `${stageName(g).toUpperCase()} — ${n} item(s)`, colSpan: 9, styles: { fillColor: [226, 232, 240], fontStyle: 'bold', textColor: 30, halign: 'left' } }], row];
        }), ...labelsRow],
        foot: [[{ content: `Total · ${groups.length} item(s) · ${types.size} trim type(s)${labelsRow.length ? ' + garment labels' : ''}`, colSpan: 3 }, '', '', '', '',
            done ? `${groups.length + (labelsRow.length ? 1 : 0)} line(s)` : '', done ? (() => { const n = rows.filter(x => noteText(x)).length; return n ? `${n} short` : 'none short'; })() : '']],
        ...GRID, showFoot: 'lastPage', styles: { ...GRID.styles, fontSize: 8, cellPadding: 1.6, minCellHeight: 8, valign: 'middle' },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', valign: 'middle' },
        footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
        // a done kit: narrower number columns so Picked and Note fit and the item keeps its width
        columnStyles: done
            ? { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 22 }, 3: { halign: 'right', cellWidth: 20 }, 4: { halign: 'right', cellWidth: 15 }, 5: { halign: 'right', cellWidth: 22, fontStyle: 'bold' }, 6: { halign: 'right', cellWidth: 18 }, 7: { cellWidth: 20, halign: 'right' }, 8: { cellWidth: 32, fontSize: 7 } }
            : { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 24 }, 3: { halign: 'right', cellWidth: 24 }, 4: { halign: 'right', cellWidth: 20 }, 5: { halign: 'right', cellWidth: 27, fontStyle: 'bold' }, 6: { halign: 'right', cellWidth: 20 }, 7: { cellWidth: 14 }, 8: { cellWidth: 20 } },
        didParseCell: (d) => { if (d.section === 'head' && [3, 4, 5, 6].includes(d.column.index)) d.cell.styles.halign = 'right'; },
        margin: { left: 8, right: 8 },
    });
    y = doc.lastAutoTable.finalY + 8;
    // Not in the kit (26 Nov 2026, owner: "also add list of items not in store in pdf as well as kit page"): what the trim
    // order still owes outside every open kit — with why it waits and what is on order. Printed apart, marked not to pick.
    const missing = byStage(groupKitLines(k.lines.filter(l => l.to_kit > 0))).map(g => ({ g, cp: pickCaps(g) }))
        .map(x => ({ ...x, wait: x.g.in_units ? x.g.units_to_kit - (kit ? 0 : x.cp.total) : Math.round((x.g.to_kit - (kit ? 0 : x.cp.total)) * 1000) / 1000 })).filter(x => x.wait > 1e-9);
    if (missing.length) {
        const WHY = { stock: 'not in store', res: `not reserved for ${k.order_no}`, free: 'no free stock for the over-cut' };
        const due = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(10); doc.setFont(undefined, 'bold');
        doc.text(kit ? `NOT IN THIS KIT — ${missing.length} item(s) still owed on ${k.trim_order_no} · not to pick for this kit` : `NOT IN A KIT YET — ${missing.length} item(s) · can't go in now, still owed on the trim order`, 8, y); doc.setFont(undefined, 'normal');
        autoTable(doc, {
            startY: y + 2,
            head: [['#', 'Stage', 'Trim type', 'Item', 'Still owed', kit ? 'Not in a kit' : 'Waits', 'Why', 'On order']],
            body: missing.map(x => {
                const g = x.g; const unit = g.in_units ? g.purchase_uom : g.uom;
                const why = kit && x.cp.total > 0 ? (x.cp.cause ? `${num(x.cp.total)} ${unit} can go in another kit · rest ${WHY[x.cp.cause]}` : 'can go in another kit') : WHY[x.cp.cause || 'stock'];
                return [g.line_no, stageName(g), g.type_name || '—', g.label, g.in_units ? `${g.units_owed} ${g.purchase_uom}` : `${num(g.remaining)} ${g.uom}`,
                    `${num(x.wait)} ${unit}`, why, g.on_order ? `${num(g.on_order.qty)} ${g.on_order.uom} · ${g.on_order.pos}${g.on_order.due ? ` · due ${due(g.on_order.due)}` : ''}` : (x.cp.cause === 'res' || x.cp.total > 0 ? '—' : 'not on any open PO')];
            }),
            foot: [[{ content: `Total · ${missing.length} item(s) · ${missing.filter(x => x.g.on_order).length} on order`, colSpan: 8 }]],
            ...GRID, showFoot: 'lastPage', styles: { ...GRID.styles, fontSize: 7.5, cellPadding: 1.4, valign: 'middle' },
            headStyles: { fillColor: [159, 18, 57], textColor: 255, fontStyle: 'bold' }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 20 }, 2: { cellWidth: 24 }, 4: { halign: 'right', cellWidth: 22 }, 5: { halign: 'right', cellWidth: 20, fontStyle: 'bold' }, 6: { cellWidth: 26 }, 7: { cellWidth: 34 } },
            didParseCell: (d) => { if (d.section === 'head' && [4, 5].includes(d.column.index)) d.cell.styles.halign = 'right'; },
            margin: { left: 8, right: 8 },
        });
        y = doc.lastAutoTable.finalY + 8;
    }
    if (y > 262) { doc.addPage(); y = 20; }
    doc.setFontSize(8.5); doc.setDrawColor(150);
    ['Picked by (store keeper)', 'Checked by (store manager)'].forEach((label, i) => { const x = 8 + i * 98; doc.rect(x, y, 94, 18); doc.text(label, x + 2, y + 5); });
    doc.setFontSize(7.5); doc.setTextColor(90);
    doc.text(kit ? (done ? `Printed ${when(new Date())} — Picked and Note are what the store entered when it put the kit in (${kit.status === 'SIGNED' ? 'signed' : 'ready for pickup'}).`
        : `Printed ${when(new Date())} — less in the bag than shown? Edit the kit in 3.0 before marking it ready (a reason is asked).`)
        : `Printed ${when(new Date())} — make the kit in 3.0 (New kit), then print its pick list and write the kit no. on the bag.`, 8, y + 25); doc.setTextColor(0);
    const ref = kit ? kit.kit_no : k.trim_order_no;
    footer(doc, `${ref} pick list`);
    doc.save(`${ref.replace(/\//g, '-')}-pick-list.pdf`);
}

export function exportKitBill(k, bill, lh) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const kit = (k.kits || []).find(t => t.handover_id === bill.handover_id) || null;
    let y = head(doc, k, lh, 'TRIM VALUATION BILL', kit);
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
