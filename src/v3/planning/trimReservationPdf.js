// Trim reservation sheet (PDF) for one order — what the store physically reserves.
// Grouped by trim type, then by trim item: the type cell is merged over all its items, each item's
// quantities (total, to buy in, allocated, issued, short) are merged over its colour rows. Colour-
// matched items list the colour(s) they serve; items common to all colours or matched by tone show one
// row with the colours together. Blank "Reserved (tick)" and "Bin / location" columns are for the store to
// fill in by hand. jsPDF + autotable, like the other 3.0 printouts.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmt = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });
const dmy = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

// Trim types → items → colour rows (quantity of the item for those colours under that trim type).
function groups(data) {
    const trims = data.items.filter(i => i.kind === 'TRIM');
    const byType = new Map();
    for (const it of trims) for (const r of it.rows) {
        const type = r.trim_type || r.bom_line;
        if (!byType.has(type)) byType.set(type, { type, sort: r.bom_sort ?? 0, items: new Map() });
        const g = byType.get(type);
        g.sort = Math.min(g.sort, r.bom_sort ?? 0);
        if (!g.items.has(it.key)) g.items.set(it.key, { it, colours: new Map(), grouped: false, uses: new Set() });
        const e = g.items.get(it.key);
        e.uses.add(r.bom_line);
        if (r.source === 'ALL' || r.source === 'TONE') e.grouped = true;
        e.colours.set(r.colour, (e.colours.get(r.colour) || 0) + r.required_qty);
    }
    return [...byType.values()].sort((a, b) => a.sort - b.sort || a.type.localeCompare(b.type)).map(g => ({
        type: g.type,
        items: [...g.items.values()].sort((a, b) => a.it.label.localeCompare(b.it.label)).map(e => {
            const cols = [...e.colours.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            const qty = cols.reduce((s, [, q]) => s + q, 0);
            // One row for a common / tone-matched item (colours together); one row per colour otherwise.
            const rows = e.grouped || cols.length > 6
                ? [{ colour: cols.length === data.colours.length ? `All ${cols.length} colours` : cols.map(c => c[0]).join(', '), qty }]
                : cols.map(([colour, q]) => ({ colour, qty: q }));
            return { ...e, rows, qty };
        }),
    }));
}

export function exportTrimReservationPdf(data, printedBy) {
    const o = data.order;
    const gs = groups(data);
    const items = gs.flatMap(g => g.items);
    const doc = new jsPDF({ orientation: 'landscape' });
    const W = doc.internal.pageSize.getWidth();

    doc.setFontSize(15); doc.setFont(undefined, 'bold');
    doc.text(`TRIM RESERVATION SHEET — ${o.order_no}`, 14, 15);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(`Customer: ${o.customer_name}${o.buyer_po_no ? `   Buyer PO: ${o.buyer_po_no}` : ''}   Ship: ${dmy(o.first_ship_date)}   Status: ${String(o.status).toLowerCase()}`, 14, 21);
    doc.text(`Styles: ${data.lines.map(l => `L${l.line_no} ${l.style_code} (${l.ordered_pieces} pcs)`).join(', ')}`, 14, 26);
    const short = items.filter(e => e.it.shortfall > 0).length;
    doc.text(`${gs.length} trim type(s) · ${items.length} item(s) · ${items.length - short} fully allocated · ${short} short`, 14, 31);
    doc.text(`Printed ${new Date().toLocaleString('en-IN')}${printedBy ? ` by ${printedBy}` : ''}`, W - 14, 15, { align: 'right' });

    const body = [];
    for (const g of gs) {
        const typeRows = g.items.reduce((s, e) => s + e.rows.length, 0);
        g.items.forEach((e, ii) => {
            const it = e.it;
            e.rows.forEach((r, ri) => {
                const row = [];
                if (ii === 0 && ri === 0) row.push({ content: g.type, rowSpan: typeRows, styles: { fontStyle: 'bold', fillColor: [238, 242, 255], valign: 'middle' } });
                if (ri === 0) {
                    const span = e.rows.length;
                    const shortCell = it.shortfall > 0 ? { content: fmt(it.shortfall, it.uom), rowSpan: span, styles: { textColor: [190, 18, 60], fontStyle: 'bold', halign: 'right', valign: 'middle' } }
                        : { content: '—', rowSpan: span, styles: { halign: 'center', valign: 'middle', textColor: [4, 120, 87] } };
                    row.push(
                        { content: `${it.label}${it.issue_stages.length ? `\nissue at ${it.issue_stages.join(', ')}` : ''}`, rowSpan: span, styles: { fontStyle: 'bold', valign: 'middle' } },
                        { content: it.uom, rowSpan: span, styles: { halign: 'center', valign: 'middle' } },
                    );
                    row.push(r.colour, { content: fmt(r.qty, it.uom), styles: { halign: 'right' } });
                    row.push(
                        { content: fmt(it.required_display, it.uom), rowSpan: span, styles: { halign: 'right', valign: 'middle', fontStyle: 'bold' } },
                        { content: it.purchase_qty != null ? `${fmt(it.purchase_qty, 'pcs')} ${it.purchase_uom}` : '—', rowSpan: span, styles: { halign: 'right', valign: 'middle' } },
                        { content: fmt(it.allocated, it.uom), rowSpan: span, styles: { halign: 'right', valign: 'middle', fontStyle: 'bold', fillColor: [236, 253, 245] } },
                        { content: it.issued > 0 ? fmt(it.issued, it.uom) : '—', rowSpan: span, styles: { halign: 'right', valign: 'middle' } },
                        shortCell,
                        { content: '', rowSpan: span },
                        { content: '', rowSpan: span },
                    );
                } else {
                    row.push(r.colour, { content: fmt(r.qty, it.uom), styles: { halign: 'right' } });
                }
                body.push(row);
            });
        });
    }

    autoTable(doc, {
        startY: 36,
        head: [['Trim type', 'Item', 'Unit', 'Colour', 'Qty', 'Item total', 'To buy in', 'Allocated\n(reserve)', 'Issued', 'Short', 'Reserved\n(tick)', 'Bin / location']],
        body,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.6, lineColor: [203, 213, 225], lineWidth: 0.2, valign: 'middle' },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
        columnStyles: {
            0: { cellWidth: 26 }, 1: { cellWidth: 56 }, 2: { cellWidth: 11 }, 3: { cellWidth: 30 }, 4: { cellWidth: 17 },
            5: { cellWidth: 18 }, 6: { cellWidth: 19 }, 7: { cellWidth: 20 }, 8: { cellWidth: 14 }, 9: { cellWidth: 15 }, 10: { cellWidth: 16 }, 11: { cellWidth: 'auto', minCellWidth: 30 },
        },
        rowPageBreak: 'avoid',
        showHead: 'everyPage',
        didDrawPage: () => {
            const n = doc.internal.getNumberOfPages();
            doc.setFontSize(8); doc.setTextColor(100);
            doc.text(`${o.order_no} · trim reservation · page ${n}`, W - 14, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
            doc.setTextColor(0);
        },
    });

    let y = doc.lastAutoTable.finalY + 14;
    if (y > doc.internal.pageSize.getHeight() - 16) { doc.addPage(); y = 24; }
    doc.setFontSize(9);
    doc.text('Reserved by: ____________________', 14, y);
    doc.text('Checked by: ____________________', 110, y);
    doc.text('Date: ______________', 206, y);
    doc.setFontSize(7.5); doc.setTextColor(100);
    doc.text('Allocated = quantity booked to this order in 3.0, to keep aside physically. Short = still not covered (allocate free stock or raise a requisition).', 14, y + 7);
    doc.setTextColor(0);
    doc.save(`Trim-reservation-${o.order_no.replace(/[^\w-]+/g, '-')}.pdf`);
}
