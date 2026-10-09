// BOM text helpers + PDF / Excel export (jsPDF + autotable, xlsx — same
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

const fileBase = (card) => `BOM-${card.bom.style_code}-v${card.bom.version_no}`.replace(/[^\w.-]+/g, '_');

// ── BOM PDF: plain ruled grid ───────────────────────────────────────────────
// Every cell 1px solid black, no fills; headers bold only. Title + meta rows, then one table per
// section (Fabric, Trims) whose header (section row + two-row column header) repeats on each page.
// Trims show the article only (no vendor) and are sorted by the stage they are issued at.
const PX = 0.2646;                                   // 1 px in mm
const PAD = { top: 1.06, bottom: 1.06, left: 1.59, right: 1.59 };   // ~4px 6px
const GRID = { lineWidth: PX, lineColor: [0, 0, 0], fillColor: false, textColor: [0, 0, 0], valign: 'top', cellPadding: PAD };

// "28: 1 · 30: 1.1 · 32: 1.2" + unit, wrapped into two lines.
function consumptionCell(l) {
    if (l.consumption_basis === 'PER_GARMENT') return `${fmt(l.qty_per_garment)} ${l.uom} / garment`;
    const parts = l.sizes.map(z => `${z.size_name}: ${fmt(z.qty)}`);
    const half = Math.ceil(parts.length / 2);
    return `${parts.slice(0, half).join(' · ')}\n${parts.slice(half).join(' · ')} ${l.uom}`.trim();
}
const itemText = (l, g) => (l.kind === 'trim' ? (g.article || g.label) : g.label);

export function exportTrimCardPdf(card) {
    const sizeName = new Map(card.sizes.map(z => [z.id, z.name]));
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = { left: 10, right: 10, top: 10, bottom: 12 };
    const W = pageW - margin.left - margin.right;
    const nCol = card.colours.length || 1;
    const colW = [W * 0.26, W * 0.22, W * 0.10, ...Array(nCol).fill((W * 0.42) / nCol)];
    const all = 3 + nCol;
    const base = { theme: 'plain', margin, tableWidth: W, styles: { ...GRID, fontSize: 9 }, headStyles: { ...GRID, fontSize: 9, fontStyle: 'bold' }, bodyStyles: { ...GRID }, rowPageBreak: 'avoid' };

    // Title + meta (one table)
    const generated = new Date().toLocaleString('en-IN');
    const meta = [[
        { content: `Style: ${card.bom.style_code} — ${card.bom.style_name}` },
        { content: `Status: ${card.bom.status.replace('_', ' ')}` },
        { content: `Sizes: ${card.sizes.map(z => z.name).join(', ')}\nGenerated: ${generated}` },
    ]];
    if (!card.ready) meta.push([{ content: `NOT READY: ${card.problems.length} unresolved item(s) — marked "!" below`, colSpan: 3, styles: { fontStyle: 'bold' } }]);
    autoTable(doc, {
        ...base, startY: margin.top,
        head: [[{ content: `BOM — ${card.bom.style_code} · v${card.bom.version_no}`, colSpan: 3, styles: { halign: 'center', fontSize: 12, fontStyle: 'bold' } }]],
        body: meta,
        columnStyles: { 0: { cellWidth: W * 0.36 }, 1: { cellWidth: W * 0.18 }, 2: { cellWidth: W * 0.46 } },
    });
    let y = doc.lastAutoTable.finalY;

    const section = (title, lines, subHeader) => {
        if (!lines.length) return;
        const head = [
            [{ content: title, colSpan: all, styles: { halign: 'center', fontStyle: 'bold' } }],
            [{ content: 'Line', rowSpan: 2 }, { content: 'Consumption', rowSpan: 2 }, { content: 'Wastage', rowSpan: 2, styles: { halign: 'center' } },
                ...card.colours.map(c => ({ content: `${c.name}${c.tone_name ? ` (${c.tone_name})` : ''}`, styles: { halign: 'center' } }))],
            card.colours.map(() => ({ content: subHeader, styles: { halign: 'center', fontStyle: 'bold', fontSize: 8 } })),
        ];
        const body = [];
        for (const l of lines) {
            // Sub-rows: one per size group when the item changes by size (e.g. Foam), else one.
            const perColour = card.colours.map(c => {
                const cell = l.cells[c.id];
                if (!cell) return [''];
                const rows = cell.groups.map(g => (g.size_ids ? `${g.size_ids.map(z => sizeName.get(z) || '?').join(', ')} » ${itemText(l, g)}`   /* "→" isn't in the PDF's standard font */ : itemText(l, g)));
                const probs = cell.problems.map(p => `! ${p}`);
                return rows.length ? rows.map((r, k) => (k === rows.length - 1 && probs.length ? `${r}\n${probs.join('\n')}` : r)) : [probs.join('\n') || '—'];
            });
            const n = Math.max(1, ...perColour.map(r => r.length));
            for (let k = 0; k < n; k++) {
                const row = [];
                if (k === 0) {
                    row.push(
                        { content: `${l.title}\n${lineDetail(l)}`, rowSpan: n, _line: { title: l.title, detail: lineDetail(l) } },
                        { content: consumptionCell(l), rowSpan: n },
                        { content: Number(l.wastage_pct) ? `${fmt(l.wastage_pct)}%` : '—', rowSpan: n, styles: { halign: 'center' } },
                    );
                }
                for (const rows of perColour) row.push(rows[k] ?? '');
                body.push(row);
            }
        }
        autoTable(doc, {
            ...base, startY: y, head, body, showHead: 'everyPage',
            columnStyles: Object.fromEntries(colW.map((w, k) => [k, { cellWidth: w }])),
            didParseCell: (d) => {
                if (d.section === 'body' && String(d.cell.raw?.content ?? d.cell.raw ?? '').includes('! ')) d.cell.styles.textColor = [190, 18, 60];
            },
            // Line cell: name bold, then parts / issue stage smaller and grey.
            willDrawCell: (d) => { if (d.section === 'body' && d.cell.raw?._line) { d.cell._lines = d.cell.raw._line; d.cell.text = []; } },
            didDrawCell: (d) => {
                const ln = d.cell._lines;
                if (!ln) return;
                const x = d.cell.x + PAD.left, w = d.cell.width - PAD.left - PAD.right;
                let yy = d.cell.y + PAD.top + 3.2;
                doc.setFont(undefined, 'bold'); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
                for (const t of doc.splitTextToSize(ln.title, w)) { doc.text(t, x, yy); yy += 3.8; }
                if (ln.detail) {
                    doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 100, 100);
                    for (const t of doc.splitTextToSize(ln.detail, w)) { doc.text(t, x, yy); yy += 3.2; }
                    doc.setTextColor(0, 0, 0);
                }
                doc.setFontSize(9); doc.setFont(undefined, 'normal');
            },
        });
        y = doc.lastAutoTable.finalY;
    };
    section('Fabric', card.fabric, 'Supplier · Article · Shade');
    const trims = [...card.trims].map((l, k) => ({ l, k }))
        .sort((a, b) => (a.l.issue_stage_sort ?? 9999) - (b.l.issue_stage_sort ?? 9999) || a.k - b.k).map(x => x.l);
    section('Trims', trims, 'Article');
    if (card.warnings.length) { doc.setFontSize(8); doc.text(card.warnings.join('  ·  '), margin.left, Math.min(y + 5, doc.internal.pageSize.getHeight() - 6)); }
    doc.save(`${fileBase(card)}.pdf`);
    return doc;
}

export function exportTrimCardExcel(card) {
    const sizeName = new Map(card.sizes.map(s => [s.id, s.name]));
    const wb = XLSX.utils.book_new();
    // Grid: one row per line, one column per colour (like the printed card)
    const grid = [...card.fabric, ...card.trims].map(l => ({
        Type: l.kind === 'fabric' ? 'Fabric' : 'Trim', Line: l.title, Detail: lineDetail(l), Consumption: consumptionText(l),
        ...Object.fromEntries(card.colours.map(c => [c.name, cellLines(l.cells[c.id], sizeName).join(' | ')])),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(grid), 'BOM');
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
