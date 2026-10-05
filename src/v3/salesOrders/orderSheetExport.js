// Sales order sheet — PDF and Excel (jsPDF + autotable, xlsx; same libraries
// as the BOM trim card). Input: GET /v3/sales-orders/:id, plus the company
// profile (optional letterhead). Also the order-list Excel export.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { SO_STATUS, fmtDate, todayLocal } from './SalesOrderStatusBadge';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const fileBase = (order) => `SalesOrder-${order.order_no.replace(/[^\w-]+/g, '-')}${order.revision_no ? `-rev${order.revision_no}` : ''}`;
const statusText = (o) => `${SO_STATUS[o.status]?.label || o.status}${o.revision_no ? ` · revision ${o.revision_no}` : ''}`;

// Grid of one line: rows = colours with any quantity (or all BOM colours), columns = sizes.
function lineGrid(line) {
    const q = new Map(line.qty.map(x => [`${x.garment_colour_id}:${x.size_id}`, Number(x.qty)]));
    const colours = line.colours.filter(c => line.sizes.some(s => q.get(`${c.garment_colour_id}:${s.size_id}`)));
    const rows = colours.map(c => {
        const cells = line.sizes.map(s => q.get(`${c.garment_colour_id}:${s.size_id}`) || 0);
        return { colour: c.name, cells, total: cells.reduce((a, b) => a + b, 0) };
    });
    const colTotals = line.sizes.map((s, i) => rows.reduce((n, r) => n + r.cells[i], 0));
    return { rows, colTotals, total: colTotals.reduce((a, b) => a + b, 0) };
}

export function exportOrderPdf(order, company) {
    const widest = Math.max(0, ...order.lines.map(l => l.sizes.length));
    const doc = new jsPDF({ orientation: widest > 9 ? 'landscape' : 'portrait' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = 14;

    // Letterhead
    const coName = company?.trade_name || company?.legal_name;
    if (coName) {
        doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text(coName, 14, y); doc.setFont(undefined, 'normal');
        const addr = [company.address_line1, company.address_line2, [company.city, company.state].filter(Boolean).join(', ')].filter(Boolean).join(', ');
        doc.setFontSize(8);
        if (addr) { y += 4.5; doc.text(addr, 14, y, { maxWidth: pageW - 28 }); }
        if (company.gstin) { y += 4; doc.text(`GSTIN: ${company.gstin}`, 14, y); }
        y += 6;
    }

    doc.setFontSize(15); doc.setFont(undefined, 'bold');
    doc.text(`Sales order ${order.order_no}`, 14, y);
    doc.setFontSize(10);
    doc.text(statusText(order), pageW - 14, y, { align: 'right' });
    doc.setFont(undefined, 'normal');
    y += 3;
    if (order.status !== 'APPROVED') {
        y += 4;
        doc.setTextColor(190, 18, 60); doc.setFontSize(9);
        doc.text(order.status === 'CANCELLED' ? `CANCELLED: ${order.cancelled_reason || ''}` : 'NOT APPROVED — for reference only', 14, y);
        doc.setTextColor(0, 0, 0);
    }

    const active = order.lines.filter(l => l.status === 'ACTIVE');
    autoTable(doc, {
        startY: y + 3,
        body: [
            ['Customer', order.customer_name, 'Order date', fmtDate(order.order_date)],
            ['Buyer PO no.', order.buyer_po_no || '—', 'Total pieces', fmt(order.total_qty)],
            ['Created by', order.created_by_name || '—', 'Approved', order.approved_at ? `${new Date(order.approved_at).toLocaleDateString('en-IN')}${order.approved_by_name ? ` by ${order.approved_by_name}` : ''}` : '—'],
        ],
        theme: 'plain', styles: { fontSize: 9, cellPadding: 1.2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 28 }, 2: { fontStyle: 'bold', cellWidth: 28 } },
        margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 4;

    // Summary of lines
    autoTable(doc, {
        startY: y,
        head: [['Line', 'Style', 'BOM', 'Ship date', 'Pieces']],
        body: active.map(l => [l.line_no, `${l.style_code} — ${l.style_name}`, `v${l.bom_version}`, fmtDate(l.ship_date), fmt(l.total_qty)]),
        foot: [['', 'Total', '', '', fmt(order.total_qty)]],
        styles: { fontSize: 8.5 }, headStyles: { fillColor: [79, 70, 229] }, footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
        columnStyles: { 0: { cellWidth: 12 }, 4: { halign: 'right' } },
        margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 7;

    // One colour × size grid per line
    for (const l of active) {
        const g = lineGrid(l);
        if (y > pageH - 40) { doc.addPage(); y = 16; }
        doc.setFontSize(10); doc.setFont(undefined, 'bold');
        doc.text(`Line ${l.line_no} · ${l.style_code} — ${l.style_name}`, 14, y);
        doc.setFont(undefined, 'normal'); doc.setFontSize(8.5);
        doc.text(`BOM v${l.bom_version}   |   Ship ${fmtDate(l.ship_date)}   |   ${fmt(g.total)} pcs`, pageW - 14, y, { align: 'right' });
        autoTable(doc, {
            startY: y + 2,
            head: [['Colour', ...l.sizes.map(s => s.size_name), 'Total']],
            body: g.rows.length ? g.rows.map(r => [r.colour, ...r.cells.map(v => (v ? fmt(v) : '')), fmt(r.total)]) : [['No quantities', ...l.sizes.map(() => ''), '0']],
            foot: [['Total', ...g.colTotals.map(fmt), fmt(g.total)]],
            styles: { fontSize: 8, halign: 'right', cellPadding: 1.4 },
            headStyles: { fillColor: [71, 85, 105], halign: 'right' }, footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], halign: 'right' },
            columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 38 } },
            didParseCell: (d) => { if (d.column.index === 0) d.cell.styles.halign = 'left'; },
            margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + (l.notes ? 4 : 7);
        if (l.notes) { doc.setFontSize(8); doc.text(`Notes: ${l.notes}`, 14, y, { maxWidth: pageW - 28 }); y += 7; }
    }

    const cancelled = order.lines.filter(l => l.status === 'CANCELLED');
    if (cancelled.length) {
        if (y > pageH - 20) { doc.addPage(); y = 16; }
        doc.setFontSize(8.5);
        doc.text(`Cancelled lines: ${cancelled.map(l => `Line ${l.line_no} ${l.style_code} (${l.cancelled_reason})`).join('; ')}`, 14, y, { maxWidth: pageW - 28 });
        y += 7;
    }
    if (order.notes) {
        if (y > pageH - 20) { doc.addPage(); y = 16; }
        doc.setFontSize(8.5); doc.text(`Order notes: ${order.notes}`, 14, y, { maxWidth: pageW - 28 });
    }

    // Footer on every page
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
        doc.text(`${order.order_no} · ${statusText(order)} · generated ${new Date().toLocaleString('en-IN')}`, 14, pageH - 8);
        doc.text(`Page ${i} of ${pages}`, pageW - 14, pageH - 8, { align: 'right' });
        doc.setTextColor(0, 0, 0);
    }
    doc.save(`${fileBase(order)}.pdf`);
}

export function exportOrderExcel(order) {
    const wb = XLSX.utils.book_new();
    const active = order.lines.filter(l => l.status === 'ACTIVE');

    // Order: header facts, then the line summary
    const head = [
        ['Sales order', order.order_no], ['Status', statusText(order)], ['Customer', order.customer_name],
        ['Buyer PO no.', order.buyer_po_no || ''], ['Order date', order.order_date], ['Total pieces', order.total_qty],
        ['Created by', order.created_by_name || ''], ['Approved', order.approved_at ? new Date(order.approved_at).toLocaleString('en-IN') : ''],
        ['Notes', order.notes || ''], [],
        ['Line', 'Style', 'Style name', 'BOM version', 'Ship date', 'Pieces', 'Status', 'Notes / reason'],
        ...order.lines.map(l => [l.line_no, l.style_code, l.style_name, `v${l.bom_version}`, l.ship_date || '', l.total_qty, l.status, l.status === 'CANCELLED' ? l.cancelled_reason : (l.notes || '')]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(head), 'Order');

    // Quantities: each line's colour × size grid, one block after another
    const grid = [];
    for (const l of active) {
        const g = lineGrid(l);
        grid.push([`Line ${l.line_no}`, `${l.style_code} — ${l.style_name}`, `BOM v${l.bom_version}`, `Ship ${l.ship_date || ''}`]);
        grid.push(['Colour', ...l.sizes.map(s => s.size_name), 'Total']);
        g.rows.forEach(r => grid.push([r.colour, ...r.cells, r.total]));
        grid.push(['Total', ...g.colTotals, g.total], []);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), 'Quantities');

    // Flat: one row per line × colour × size — for filters and pivots
    const flat = [];
    for (const l of active) {
        const colour = new Map(l.colours.map(c => [c.garment_colour_id, c.name]));
        const size = new Map(l.sizes.map(s => [s.size_id, s.size_name]));
        for (const x of l.qty) {
            flat.push({ 'Order no.': order.order_no, Customer: order.customer_name, Line: l.line_no, Style: l.style_code, 'BOM version': l.bom_version,
                'Ship date': l.ship_date || '', Colour: colour.get(x.garment_colour_id) || '?', Size: size.get(x.size_id) || '?', Pieces: Number(x.qty) });
        }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), 'Flat');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(order.history.map(h => ({
        When: new Date(h.created_at).toLocaleString('en-IN'), Action: h.action, Revision: h.revision_no || '', By: h.user_name || '',
        Reason: h.reason || '', Changes: (h.changes?.summary || []).join('\n'),
    }))), 'History');

    XLSX.writeFile(wb, `${fileBase(order)}.xlsx`);
}

// The sales order list as shown (filters applied).
export function exportOrderListExcel(rows) {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
        'Order no.': r.order_no, 'Order date': r.order_date, Customer: r.customer_name, 'Buyer PO no.': r.buyer_po_no || '',
        Styles: r.styles || '', Lines: r.line_count, Pieces: r.total_qty, 'First ship date': r.first_ship_date || '',
        Status: SO_STATUS[r.status]?.label || r.status, Revision: r.revision_no || '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales orders');
    XLSX.writeFile(wb, `SalesOrders-${todayLocal()}.xlsx`);
}
