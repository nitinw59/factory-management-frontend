// Trim card PDF — draws the model from trimCardLayout.buildCard(), the same one the preview shows.
// A4 landscape, plain ruled grid (black 1px lines, no fills), like the factory's paper card.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPdfLetterhead } from '../components/letterhead';

const PX = 0.2646;                                   // 1 px in mm
const PAD = { top: 1.2, bottom: 1.2, left: 1.6, right: 1.6 };
const GRID = { lineWidth: PX * 1.5, lineColor: [0, 0, 0], fillColor: false, textColor: [0, 0, 0], valign: 'top', cellPadding: PAD, fontSize: 9 };
const RED = [190, 18, 60];

export function exportTrimCardFactoryPdf(m, lh = null) {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = { left: 10, right: 10, top: 10, bottom: 12 };
    const W = pageW - margin.left - margin.right;
    const base = { theme: 'plain', margin, tableWidth: W, styles: { ...GRID }, headStyles: { ...GRID, fontStyle: 'bold' }, bodyStyles: { ...GRID }, rowPageBreak: 'avoid' };

    // Company letterhead (logo + name + address) when "Company name" is ticked, then TRIM CARD.
    const withLh = m.company && lh;   // company left, TRIM CARD right
    let y = withLh ? drawPdfLetterhead(doc, lh, { x: margin.left, y: 5, title: m.title }) - 3 : margin.top + 5;
    if (!withLh) { doc.setFont(undefined, 'bold'); doc.setFontSize(15); doc.text(m.title, margin.left, y); }
    if (m.company && !lh) {
        doc.setFontSize(13); doc.text(m.company.name, pageW / 2, y, { align: 'center' });
        if (m.company.sub) { doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.text(m.company.sub, pageW / 2, y + 4.5, { align: 'center' }); }
    }
    doc.setFont(undefined, 'normal');
    y += m.company?.sub && !lh ? 8 : 4;

    // Header fields: label / value pairs, up to three pairs a row.
    if (m.header.length) {
        const per = 3;
        const body = [];
        for (let k = 0; k < m.header.length; k += per) {
            const row = [];
            m.header.slice(k, k + per).forEach(([label, value]) => row.push({ content: label, styles: { fontStyle: 'bold' } }, value || ' '));
            while (row.length < per * 2) row.push('');
            body.push(row);
        }
        autoTable(doc, {
            ...base, startY: y, body,
            columnStyles: Object.fromEntries(Array.from({ length: per * 2 }, (_, k) => [k, { cellWidth: k % 2 ? (W / per) * 0.72 : (W / per) * 0.28 }])),
        });
        y = doc.lastAutoTable.finalY + 2;
    }

    // Main grid: line label + one column per colour.
    const n = Math.max(1, m.colours.length);
    const labelW = Math.min(W * 0.2, 48);
    const colW = (W - labelW) / n;
    const body = m.grid.map(r => [
        { content: r.sub ? `${r.label}\n${r.sub}` : r.label, styles: { fontStyle: 'bold', ...(r.swatch && { minCellHeight: 22 }) } },
        ...r.cells.map(lines => ({ content: lines.join('\n'), _bad: lines.some(t => t.startsWith('! ')), styles: { fontStyle: r.bold ? 'bold' : 'normal', ...(r.swatch && { minCellHeight: 22 }) } })),
    ]);
    autoTable(doc, {
        ...base, startY: y, showHead: 'everyPage',
        head: [[{ content: 'Colour', styles: { fontStyle: 'bold' } }, ...m.colours.map(c => ({ content: c.name, styles: { halign: 'center' } }))]],
        body,
        columnStyles: Object.fromEntries([[0, { cellWidth: labelW }], ...m.colours.map((_, k) => [k + 1, { cellWidth: colW }])]),
        didParseCell: (d) => { if (d.section === 'body' && d.cell.raw?._bad) d.cell.styles.textColor = RED; },
    });
    y = doc.lastAutoTable.finalY;

    // Size-wise strips.
    if (m.strips.length) {
        autoTable(doc, {
            ...base, startY: y + 2,
            body: m.strips.map(s => [{ content: s.label, styles: { fontStyle: 'bold' } }, s.lines.join('\n')]),
            columnStyles: { 0: { cellWidth: labelW }, 1: { cellWidth: W - labelW } },
        });
        y = doc.lastAutoTable.finalY;
    }

    // Bottom construction boxes: one column each, at most 7 a row.
    if (m.bottom.length) {
        for (let k = 0; k < m.bottom.length; k += 7) {
            const part = m.bottom.slice(k, k + 7);
            autoTable(doc, {
                ...base, startY: y + 2,
                head: [part.map(b => ({ content: b.label, styles: { halign: 'center', fontSize: 8 } }))],
                body: [part.map(b => ({ content: b.text || ' ', styles: { minCellHeight: 20 } }))],
                columnStyles: Object.fromEntries(part.map((_, i) => [i, { cellWidth: W / part.length }])),
            });
            y = doc.lastAutoTable.finalY;
        }
    }

    // Sign-off.
    if (m.footer) {
        let fy = y + 14;
        if (fy > pageH - margin.bottom) { doc.addPage(); fy = margin.top + 10; }
        doc.setFontSize(10); doc.setFont(undefined, 'bold');
        doc.text('Prepared by: ____________________', margin.left, fy);
        doc.text('Checked by: ____________________', margin.left + W / 3, fy);
        doc.text('Approved by: ____________________', margin.left + (2 * W) / 3, fy);
        doc.setFont(undefined, 'normal');
    }

    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(110);
        doc.text(`${m.title} · page ${p} of ${pages}`, pageW - margin.right, pageH - 5, { align: 'right' });
        doc.setTextColor(0);
    }
    doc.save(`${m.file}.pdf`);
    return doc;
}
