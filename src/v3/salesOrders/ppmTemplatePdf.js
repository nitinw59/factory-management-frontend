// PPM (pre-production meeting) sheet — the factory's paper form as a printable template for one
// sales order line, A4 portrait. The order's own facts are filled in (buyer, style, order no.,
// quantity, colours, delivery date); everything decided at the meeting is left blank to write by
// hand. The signed sheet is scanned and uploaded back to the order (Documents tab).
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const PX = 0.2646;
const GRID = { lineWidth: PX * 1.5, lineColor: [0, 0, 0], fillColor: false, textColor: [0, 0, 0], valign: 'middle', cellPadding: { top: 0.9, bottom: 0.9, left: 1.4, right: 1.4 }, fontSize: 7.5 };
const L = { fontStyle: 'bold', fontSize: 7 };   // printed labels

// Left block: group → fields; right column: fields. Same rows as the paper form.
const LEFT = [
    ['TRIMS DETAILS', ['Zipper', 'Thread shade', 'Label']],
    ['FABRIC DETAILS', ['Body fabric', 'Fabric contents', 'Shade', 'Shrinkage']],
    ['CUTTING DETAILS', ['Pocketing', 'Canvas', 'Emb. placement']],
    ['STITCHING DETAILS', ['F. pckt', 'Bk. pckt', 'W/B constn.', 'Bottom']],
    ['THREAD DETAILS TKT', ['O/L', 'T/S']],
    ['BARTACK / RUNTACK DETAILS', ['Bartack', 'Runtack']],
];
const RIGHT = ['Button', 'Hook-eye', 'Metal tab', 'Lining', 'Wash', 'Press', 'Fusing', 'Gripper W/B', 'Binding', 'SPI', 'Fly',
    'No. of loops', 'Button attaching thread', 'Extra button', 'Safety stitch', 'Button shanking'];
const COMMENTS = ['Measurement comments', 'Special comments', 'Other remarks', 'Trims remark for merchandiser', 'General comments', 'Risk analysis', 'Button shanking'];
const QUALITY = ['HOD', 'QM', 'QA, Line QC', 'Cutting', 'Maintenance', 'Merchandiser'];
const PRODUCTION = ['Sample', 'PM', 'Floor inch.', 'LE', 'Line sup.', 'C.A.D'];

const dmy = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : '');

export function exportPpmTemplate(order, line, company) {
    const doc = new jsPDF({ orientation: 'portrait' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = { left: 8, right: 8, top: 8, bottom: 8 };
    const W = pageW - margin.left - margin.right;
    const base = { theme: 'plain', margin, tableWidth: W, styles: { ...GRID }, headStyles: { ...GRID, fontStyle: 'bold' }, bodyStyles: { ...GRID }, rowPageBreak: 'avoid' };
    const name = company?.trade_name || company?.legal_name || '';
    const place = company?.city ? `, ${String(company.city).toUpperCase()}` : '';

    // Title block: company / PRE-PRODUCTION MEETING / doc no. and date.
    autoTable(doc, {
        ...base, startY: margin.top,
        body: [
            [{ content: `${name.toUpperCase()}${place}` || 'PRE-PRODUCTION MEETING', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fontSize: 11 } }, { content: 'DATE:', styles: L }],
            [{ content: 'PRE-PRODUCTION MEETING', styles: { halign: 'center', fontStyle: 'bold', fontSize: 10 } }, { content: 'DOC No:', styles: L }, ''],
        ],
        columnStyles: { 0: { cellWidth: W * 0.62 }, 1: { cellWidth: W * 0.13 }, 2: { cellWidth: W * 0.25 } },
    });

    // Order facts (filled from 3.0) and the meeting's own (blank).
    const colours = (line.colours || []).filter(c => (line.qty || []).some(x => x.garment_colour_id === c.garment_colour_id && Number(x.qty) > 0)).map(c => c.name);
    const orderNo = [order.buyer_po_no, order.order_no].filter(Boolean).join(' / ');
    autoTable(doc, {
        ...base, startY: doc.lastAutoTable.finalY,
        body: [
            [{ content: 'NAME OF BUYER', styles: L }, order.customer_name || '', { content: 'ORDER QUANTITY', styles: L }, Number(line.total_qty || 0).toLocaleString('en-IN')],
            [{ content: 'STYLE NO', styles: L }, `${line.style_code}${line.style_name && line.style_name !== line.style_code ? ` — ${line.style_name}` : ''}`, { content: 'NAME OF LINE', styles: L }, ''],
            [{ content: 'FIT', styles: L }, '', { content: 'SAMPLE TYPE', styles: L }, ''],
            [{ content: 'ORDER NUMBER', styles: L }, orderNo, { content: 'DELIVERY DATE', styles: L }, dmy(line.ship_date)],
            [{ content: 'COLOURS', styles: L }, { content: colours.join(', '), colSpan: 3 }],
        ],
        columnStyles: { 0: { cellWidth: W * 0.17 }, 1: { cellWidth: W * 0.33 }, 2: { cellWidth: W * 0.17 }, 3: { cellWidth: W * 0.33 } },
    });

    // Details: grouped fields on the left, single fields on the right, all values blank.
    const leftRows = LEFT.flatMap(([group, fields]) => fields.map((f, k) => ({ group: k === 0 ? { content: group, rowSpan: fields.length, styles: { ...L, fontSize: 6.5, halign: 'center' } } : null, field: f })));
    const n = Math.max(leftRows.length, RIGHT.length);
    const details = Array.from({ length: n }, (_, k) => {
        const r = leftRows[k];
        const row = [];
        if (r?.group) row.push(r.group);
        row.push({ content: r ? r.field.toUpperCase() : '', styles: { ...L, fontSize: 6.5, halign: 'center' } }, '');
        row.push({ content: RIGHT[k] ? RIGHT[k].toUpperCase() : '', styles: { ...L, fontSize: 6.5, halign: 'center' } }, '');
        return row;
    });
    autoTable(doc, {
        ...base, startY: doc.lastAutoTable.finalY,
        body: details,
        bodyStyles: { ...GRID, minCellHeight: 5.6 },
        columnStyles: { 0: { cellWidth: W * 0.15 }, 1: { cellWidth: W * 0.14 }, 2: { cellWidth: W * 0.27 }, 3: { cellWidth: W * 0.17 }, 4: { cellWidth: W * 0.27 } },
    });

    // Comment boxes, ruled for handwriting.
    autoTable(doc, {
        ...base, startY: doc.lastAutoTable.finalY,
        body: COMMENTS.map(c => [{ content: c.toUpperCase(), styles: { ...L, fontSize: 6.5, halign: 'center' } }, '']),
        bodyStyles: { ...GRID, minCellHeight: 10 },
        columnStyles: { 0: { cellWidth: W * 0.17 }, 1: { cellWidth: W * 0.83 } },
        didDrawCell: (d) => {
            if (d.section !== 'body' || d.column.index !== 1) return;
            doc.setDrawColor(150); doc.setLineWidth(PX);
            doc.line(d.cell.x, d.cell.y + d.cell.height / 2, d.cell.x + d.cell.width, d.cell.y + d.cell.height / 2);
            doc.setDrawColor(0);
        },
    });

    // Sign-off: quality team and production team.
    autoTable(doc, {
        ...base, startY: doc.lastAutoTable.finalY + 2,
        head: [[{ content: 'QUALITY TEAM', colSpan: 2, styles: { halign: 'center' } }, { content: 'PRODUCTION TEAM', colSpan: 2, styles: { halign: 'center' } }]],
        body: QUALITY.map((q, k) => [{ content: q.toUpperCase(), styles: L }, '', { content: PRODUCTION[k].toUpperCase(), styles: L }, '']),
        bodyStyles: { ...GRID, minCellHeight: 7 },
        columnStyles: { 0: { cellWidth: W * 0.17 }, 1: { cellWidth: W * 0.33 }, 2: { cellWidth: W * 0.17 }, 3: { cellWidth: W * 0.33 } },
    });

    doc.setFontSize(6.5); doc.setTextColor(110);
    doc.text(`Printed ${new Date().toLocaleString('en-IN')} from 3.0 · ${order.order_no} line ${line.line_no}. Upload the signed sheet to the order (Documents).`, margin.left, doc.internal.pageSize.getHeight() - 4);
    doc.setTextColor(0);
    doc.save(`PPM-${order.order_no}-L${line.line_no}-${line.style_code}`.replace(/[^\w.-]+/g, '_') + '.pdf');
    return doc;
}
