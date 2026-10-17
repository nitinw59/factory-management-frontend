// Packing and dispatch documents (17 Oct 2026):
//   carton label (100 × 150 mm): company, carton no. and "n of N", buyer / order / buyer PO, style, colour × size
//                                assortment with quantities, total pieces, weight;
//   dispatch note (A4 portrait): letterhead, DN no. / date, consignee, order / buyer PO, vehicle / transporter / LR /
//                                invoice, cartons with their assortment, totals per colour × size, signatures.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const dmy = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const GRID = { theme: 'grid', styles: { textColor: 0, lineColor: 0, lineWidth: 0.1 }, headStyles: { fillColor: [235, 238, 243], textColor: 0, fontStyle: 'bold', lineColor: 0, lineWidth: 0.1 } };
const nameOf = (c) => (c?.trade_name || c?.legal_name || '').toUpperCase();
function logoAt(doc, logo, x, y, h) {
    if (!logo?.dataUrl) return 0;
    try { const w = Math.min(h * 3, (h * (logo.w || 1)) / (logo.h || 1)); doc.addImage(logo.dataUrl, logo.format || 'PNG', x, y, w, h); return w + 3; } catch { return 0; }
}

// Carton label(s): one page per carton. `cartons` — cartons with assortment; `order` — order head; total = cartons of the order.
export function exportCartonLabels(cartons, order, total, company = null, assets = {}) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [100, 150] });
    cartons.forEach((ct, i) => {
        if (i) doc.addPage([100, 150], 'portrait');
        const M = 6; const W = 100 - 2 * M;
        const lw = logoAt(doc, assets.logo, M, 5, 9);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(nameOf(company) || ' ', M + lw, 11);
        doc.setLineWidth(0.4); doc.line(M, 16, M + W, 16);
        doc.setFontSize(16); doc.text(ct.carton_no, M, 25);
        doc.setFontSize(10); doc.text(`Carton ${ct.carton_index} of ${total}`, M + W, 25, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        const rows = [['Buyer', order.customer_name], ['Order', order.order_no], ['Buyer PO', order.buyer_po_no || '—'], ['Style', `${ct.style_code} · line ${ct.line_no}`]];
        autoTable(doc, { ...GRID, startY: 29, margin: { left: M, right: M }, body: rows, styles: { ...GRID.styles, fontSize: 8.5, cellPadding: 1.2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 22 } } });
        autoTable(doc, {
            ...GRID, startY: doc.lastAutoTable.finalY + 3, margin: { left: M, right: M },
            head: [['Colour', 'Size', 'Pcs']], body: [...ct.assortment.map(a => [a.colour, a.size, a.qty]), [{ content: 'TOTAL', colSpan: 2, styles: { fontStyle: 'bold' } }, { content: String(ct.qty), styles: { fontStyle: 'bold' } }]],
            styles: { ...GRID.styles, fontSize: 9, cellPadding: 1.3 }, columnStyles: { 2: { halign: 'right', cellWidth: 16 } },
        });
        let y = doc.lastAutoTable.finalY + 6;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        doc.text(`Net qty: ${ct.qty} pcs`, M, y); if (ct.weight_kg) doc.text(`Gross wt: ${ct.weight_kg} kg`, M + W, y, { align: 'right' });
        y = Math.max(y + 6, 140);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90);
        doc.text(`Packed ${dmy(ct.closed_at || ct.created_at)}`, M, 145); doc.setTextColor(0);
    });
    doc.save(cartons.length === 1 ? `Carton-${cartons[0].carton_no.replace(/[^\w-]+/g, '-')}.pdf` : `Cartons-${order.order_no.replace(/[^\w-]+/g, '-')}.pdf`);
}

// Dispatch note.
export function exportDispatchNote(d, company = null, assets = {}) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.width; const H = doc.internal.pageSize.height; const M = 12; const CW = W - 2 * M;
    const lw = logoAt(doc, assets.logo, M, 8, 14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(nameOf(company) || ' ', M + lw, 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const addr = [company?.address_line1, company?.address_line2, company?.city, company?.state, company?.pin_code].filter(Boolean).join(', ');
    if (addr) doc.text(addr, M + lw, 20, { maxWidth: CW - lw - 60 });
    if (company?.gstin) doc.text(`GSTIN ${company.gstin}`, M + lw, 24);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('DISPATCH NOTE', W - M, 15, { align: 'right' });
    doc.setFontSize(10); doc.text(d.dispatch_no, W - M, 21, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(`Date ${dmy(d.dispatch_date)}${d.status !== 'DISPATCHED' ? `  ·  ${d.status.toLowerCase()}` : ''}`, W - M, 26, { align: 'right' });
    doc.setLineWidth(0.4); doc.line(M, 30, W - M, 30);
    autoTable(doc, {
        ...GRID, startY: 33, margin: { left: M, right: M },
        body: [
            ['Consignee', d.customer_name, 'Order', d.order_no],
            ['Destination', d.destination || '', 'Buyer PO', d.buyer_po_no || ''],
            ['Vehicle no.', d.vehicle_no || '', 'Invoice no.', d.invoice_no || ''],
            ['Transporter', d.transporter || '', 'LR no.', d.lr_no || ''],
        ],
        styles: { ...GRID.styles, fontSize: 8.5, cellPadding: 1.5 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26 }, 2: { fontStyle: 'bold', cellWidth: 24 } },
    });
    // Cartons with their assortment.
    const body = [];
    for (const c of d.cartons) {
        c.assortment.forEach((a, i) => body.push([i === 0 ? c.carton_no : '', i === 0 ? c.style_code : '', a.colour, a.size, a.qty, i === 0 ? (c.weight_kg ? `${c.weight_kg}` : '') : '']));
    }
    body.push([{ content: `${d.cartons.length} carton(s)`, colSpan: 4, styles: { fontStyle: 'bold' } }, { content: String(d.qty), styles: { fontStyle: 'bold' } }, { content: String(Math.round(d.cartons.reduce((s, c) => s + (c.weight_kg || 0), 0) * 100) / 100 || ''), styles: { fontStyle: 'bold' } }]);
    autoTable(doc, {
        ...GRID, startY: doc.lastAutoTable.finalY + 5, margin: { left: M, right: M },
        head: [['Carton', 'Style', 'Colour', 'Size', 'Pcs', 'Kg']], body,
        styles: { ...GRID.styles, fontSize: 8, cellPadding: 1.3 }, columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
    // Totals per colour × size.
    const sizes = [...new Set(d.cartons.flatMap(c => c.assortment.map(a => a.size)))];
    const colours = [...new Set(d.cartons.flatMap(c => c.assortment.map(a => a.colour)))];
    const tot = (col, sz) => d.cartons.reduce((s, c) => s + c.assortment.filter(a => a.colour === col && a.size === sz).reduce((t, a) => t + a.qty, 0), 0);
    if (sizes.length) {
        autoTable(doc, {
            ...GRID, startY: doc.lastAutoTable.finalY + 5, margin: { left: M, right: M },
            head: [['Total by colour × size', ...sizes, 'Total']],
            body: colours.map(col => [col, ...sizes.map(sz => tot(col, sz) || ''), sizes.reduce((s, sz) => s + tot(col, sz), 0)]),
            styles: { ...GRID.styles, fontSize: 8, cellPadding: 1.3, halign: 'center' }, columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
        });
    }
    let y = doc.lastAutoTable.finalY + 8;
    if (d.notes) { doc.setFontSize(8); doc.text(`Notes: ${d.notes}`, M, y, { maxWidth: CW }); y += 8; }
    y = Math.max(y + 16, H - 22);
    if (y > H - 8) { doc.addPage(); y = 40; }
    doc.setFontSize(8.5);
    ['Prepared by', 'Checked by (security)', 'Driver', `For ${nameOf(company) || 'the company'}`].forEach((t, i) => { const x = M + (i * CW) / 4; doc.line(x, y, x + CW / 4 - 8, y); doc.text(t, x, y + 4); });
    doc.save(`DispatchNote-${d.dispatch_no.replace(/[^\w-]+/g, '-')}.pdf`);
}
