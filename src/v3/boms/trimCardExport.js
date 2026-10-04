// Trim card text helpers + PDF / Excel export (jsPDF + autotable, xlsx — same
// libraries as the 2.0 BOM export). Input is the /boms/:id/trim-card result.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export const SOURCE_LABEL = { EXACT: 'Exact colour', TONE: 'By tone', ALL: 'All colours' };

const fmt = (n) => Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export const consumptionText = (l) => (l.consumption_basis === 'PER_GARMENT'
    ? `${fmt(l.qty_per_garment)} ${l.uom}/garment`
    : `${l.sizes.map(s => `${s.size_name} ${fmt(s.qty)}`).join(', ')} ${l.uom}`)
    + (Number(l.wastage_pct) ? ` +${fmt(l.wastage_pct)}%` : '');

export const lineDetail = (l) => (l.kind === 'fabric'
    ? (l.parts.length ? `Parts: ${l.parts.join(', ')}` : '')
    : `Issued at ${l.issue_stage_name}`);

// One cell → printable lines: "label" or "S, M: label"; problems prefixed "!".
export function cellLines(cell, sizeName) {
    if (!cell) return [];
    const out = cell.groups.map(g => (g.size_ids ? `${g.size_ids.map(s => sizeName.get(s) || '?').join(', ')}: ${g.label}` : g.label));
    return [...out, ...cell.problems.map(p => `! ${p}`)];
}

const fileBase = (card) => `TrimCard-${card.bom.style_code}-v${card.bom.version_no}`.replace(/[^\w.-]+/g, '_');

export function exportTrimCardPdf(card) {
    const sizeName = new Map(card.sizes.map(s => [s.id, s.name]));
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`Trim card — ${card.bom.style_code} · BOM v${card.bom.version_no}`, 14, 16);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`${card.bom.style_name}   |   Status: ${card.bom.status.replace('_', ' ')}   |   Sizes: ${card.sizes.map(s => s.name).join(', ')}   |   Generated: ${new Date().toLocaleString()}`, 14, 22);
    let y = 28;
    if (!card.ready) {
        doc.setTextColor(190, 18, 60);
        doc.text(`NOT READY: ${card.problems.length} unresolved item(s) — marked "!" below.`, 14, y);
        doc.setTextColor(0, 0, 0);
        y += 5;
    }
    const head = [['Line', 'Consumption', ...card.colours.map(c => `${c.name}${c.tone_name ? `\n(${c.tone_name})` : ''}`)]];
    const section = (title, lines) => {
        if (!lines.length) return;
        autoTable(doc, {
            startY: y,
            head: [[{ content: title, colSpan: head[0].length, styles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' } }], ...head],
            body: lines.map(l => [
                `${l.title}${lineDetail(l) ? `\n${lineDetail(l)}` : ''}`,
                consumptionText(l),
                ...card.colours.map(c => cellLines(l.cells[c.id], sizeName).join('\n') || '—'),
            ]),
            styles: { fontSize: 7, cellPadding: 1.5, valign: 'top' },
            headStyles: { fillColor: [79, 70, 229], fontSize: 7 },
            columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' }, 1: { cellWidth: 30 } },
            didParseCell: (d) => { if (d.section === 'body' && String(d.cell.raw).includes('! ')) d.cell.styles.textColor = [190, 18, 60]; },
            margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 6;
    };
    section('Fabric', card.fabric);
    section('Trims', card.trims);
    if (card.warnings.length) { doc.setFontSize(8); doc.text(card.warnings.join('  ·  '), 14, Math.min(y, 200)); }
    doc.save(`${fileBase(card)}.pdf`);
}

export function exportTrimCardExcel(card) {
    const sizeName = new Map(card.sizes.map(s => [s.id, s.name]));
    const wb = XLSX.utils.book_new();
    // Grid: one row per line, one column per colour (like the printed card)
    const grid = [...card.fabric, ...card.trims].map(l => ({
        Type: l.kind === 'fabric' ? 'Fabric' : 'Trim', Line: l.title, Detail: lineDetail(l), Consumption: consumptionText(l),
        ...Object.fromEntries(card.colours.map(c => [c.name, cellLines(l.cells[c.id], sizeName).join(' | ')])),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(grid), 'Trim card');
    // Flat: one row per line × colour × size group — easy to filter / pivot
    const flat = [];
    for (const l of [...card.fabric, ...card.trims]) {
        for (const c of card.colours) {
            const cell = l.cells[c.id];
            if (!cell) continue;
            for (const g of cell.groups) {
                flat.push({ Type: l.kind === 'fabric' ? 'Fabric' : 'Trim', Line: l.title, Colour: c.name, Tone: c.tone_name || '',
                    Sizes: g.size_ids ? g.size_ids.map(s => sizeName.get(s)).join(', ') : 'All', Item: g.label, From: SOURCE_LABEL[cell.source] || '',
                    Unit: l.uom, 'Qty / garment': l.consumption_basis === 'PER_GARMENT' ? Number(l.qty_per_garment) : 'per size', 'Wastage %': Number(l.wastage_pct) });
            }
            for (const p of cell.problems) flat.push({ Type: l.kind === 'fabric' ? 'Fabric' : 'Trim', Line: l.title, Colour: c.name, Tone: c.tone_name || '', Item: `UNRESOLVED: ${p}` });
        }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), 'By colour');
    if (card.problems.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(card.problems.map(p => ({ Line: p.line || '', Colour: p.colour || '', Problem: p.reason }))), 'Problems');
    }
    XLSX.writeFile(wb, `${fileBase(card)}.xlsx`);
}
