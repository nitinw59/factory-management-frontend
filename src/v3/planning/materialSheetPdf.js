// Order BOM (PDF) for one sales order — the bill of material with quantities (was "material requirement sheet") — fabric and trims, per line and colour,
// with the calculation shown (ordered → planned pieces with cut allowance, consumption, wastage).
// Input: GET /planning/orders/:id/material-sheet. Approved order = the stored requirements with
// allocated / issued / short; otherwise an ESTIMATE (same calculation, nothing stored).
// A4 landscape, ruled grid, header repeated per page — like the other 3.0 printouts.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadLetterhead, drawPdfLetterhead } from '../components/letterhead';

const PX = 0.2646;
const GRID = { lineWidth: PX * 1.5, lineColor: [0, 0, 0], fillColor: false, textColor: [0, 0, 0], valign: 'middle', cellPadding: { top: 1, bottom: 1, left: 1.4, right: 1.4 }, fontSize: 7.5 };
const RED = [190, 18, 60];
const fmt = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });
const dmy = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

// "1.26" when every size uses the same consumption, else "28: 1.2 · 30: 1.25 …".
function consumption(detail) {
    const vals = [...new Set(detail.map(d => Number(d.consumption)))];
    if (vals.length === 1) return fmt(vals[0], 'm');
    const seen = new Map();
    for (const d of detail) if (!seen.has(d.size)) seen.set(d.size, d.consumption);
    return [...seen.entries()].map(([s, c]) => `${s}: ${fmt(c, 'm')}`).join(' · ');
}

// Planned pieces per order line: any one BOM line covers every colour and size of the line.
function plannedByLine(items) {
    const per = new Map();
    for (const it of items) for (const r of it.rows) {
        const k = `${r.line_no}|${r.bom_line}`;
        per.set(k, (per.get(k) || 0) + r.planned_pieces);
    }
    const out = new Map();
    for (const [k, v] of per) { const line = k.split('|')[0]; out.set(line, Math.max(out.get(line) || 0, v)); }
    return out;
}

// Fetch the sheet (and the company letterhead) and download it. Throws the API error for the caller to show.
export async function downloadMaterialSheet(planningApi, adminApi, orderId, printedBy) {
    const [{ data }, lh] = await Promise.all([planningApi.materialSheet(orderId), loadLetterhead()]);
    return exportMaterialSheetPdf(data, { lh, printedBy });
}

export function exportMaterialSheetPdf(d, { lh = null, company = null, printedBy = null } = {}) {
    const o = d.order;
    const est = !!d.estimate;
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = { left: 10, right: 10, top: 10, bottom: 12 };
    const W = pageW - margin.left - margin.right;
    const base = { theme: 'plain', margin, tableWidth: W, styles: { ...GRID }, headStyles: { ...GRID, fontStyle: 'bold', halign: 'center' }, bodyStyles: { ...GRID }, rowPageBreak: 'avoid' };

    // Company letterhead (logo + name), then the title
    // Company left, ORDER BOM right (ESTIMATE in red before approval); plain title without a profile.
    let y = lh ? drawPdfLetterhead(doc, lh, { x: margin.left, y: 5, title: est ? 'ORDER BOM — ESTIMATE' : 'ORDER BOM', titleColor: est ? RED : null }) - 3 : margin.top + 5;
    if (!lh) {
        doc.setFont(undefined, 'bold'); doc.setFontSize(15); doc.text('ORDER BOM', margin.left, y);
        const name = company?.trade_name || company?.legal_name;
        if (name) { doc.setFontSize(12); doc.text(name, pageW / 2 + 20, y, { align: 'center' }); }
        if (est) { doc.setTextColor(...RED); doc.setFontSize(13); doc.text('ESTIMATE', pageW - margin.right, y, { align: 'right' }); doc.setTextColor(0); }
    }
    doc.setFont(undefined, 'normal');
    y += 3;

    // Order
    autoTable(doc, {
        ...base, startY: y,
        body: [
            [{ content: 'Order', styles: { fontStyle: 'bold' } }, o.order_no, { content: 'Customer', styles: { fontStyle: 'bold' } }, o.customer_name || '', { content: 'Buyer PO', styles: { fontStyle: 'bold' } }, o.buyer_po_no || '—'],
            [{ content: 'Status', styles: { fontStyle: 'bold' } }, `${String(o.status).toLowerCase()}${o.revision_no ? ` · rev ${o.revision_no}` : ''}`, { content: 'First ship', styles: { fontStyle: 'bold' } }, dmy(o.first_ship_date),
                { content: 'Printed', styles: { fontStyle: 'bold' } }, `${new Date().toLocaleString('en-IN')}${printedBy ? ` · ${printedBy}` : ''}`],
        ],
        columnStyles: { 0: { cellWidth: W * 0.08 }, 1: { cellWidth: W * 0.22 }, 2: { cellWidth: W * 0.08 }, 3: { cellWidth: W * 0.3 }, 4: { cellWidth: W * 0.08 }, 5: { cellWidth: W * 0.24 } },
    });
    y = doc.lastAutoTable.finalY;
    if (est) {
        doc.setFontSize(8); doc.setTextColor(...RED);
        doc.text(`Estimate: the order is not approved, so nothing is planned or stored yet. Cut allowance = the default (${fmt(d.settings?.default_cut_allowance_pct, 'm')}%). Approve the order for the final requirement.`, margin.left, y + 4);
        doc.setTextColor(0); y += 5;
    }

    // Lines
    const planned = plannedByLine(d.items);
    const active = d.lines.filter(l => l.status === 'ACTIVE');
    autoTable(doc, {
        ...base, startY: y + 2,
        head: [['Line', 'Style', 'Style BOM', 'Ship date', 'Ordered pcs', 'Cut allowance', 'Planned pcs']],
        body: active.map(l => [l.line_no, `${l.style_code}${l.style_name && l.style_name !== l.style_code ? ` — ${l.style_name}` : ''}`, (l.bom_version ? `v${l.bom_version}` : 'BOM pending'), dmy(l.ship_date),
            { content: fmt(l.ordered_pieces, 'pcs'), styles: { halign: 'right' } }, { content: `${fmt(l.cut_allowance_pct ?? 0, 'm')}%`, styles: { halign: 'right' } },
            { content: fmt(planned.get(String(l.line_no)) || 0, 'pcs'), styles: { halign: 'right', fontStyle: 'bold' } }]),
        columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 14 }, 3: { cellWidth: 22 }, 4: { cellWidth: 24 }, 5: { cellWidth: 24 }, 6: { cellWidth: 24 } },
    });
    y = doc.lastAutoTable.finalY;

    // Fabric and trims: one block per item (item + totals merged over its rows).
    const section = (title, items, trims) => {
        if (!items.length) return;
        const head = [[
            'Item', 'Line', 'Used for', 'Colour', 'Ordered', 'Planned', 'Cons. / pc', 'Wast.', 'Required', 'Item total',
            ...(trims ? ['To buy in'] : []), ...(est ? [] : ['Allocated', 'Issued', 'Short']),
        ]];
        const body = [];
        for (const it of items) {
            const rows = [...it.rows].sort((a, b) => a.line_no - b.line_no || a.colour.localeCompare(b.colour));
            rows.forEach((r, k) => {
                const row = [];
                if (k === 0) {
                    // "Used for" already names the BOM line; trims add where they are issued.
                    const sub = trims && it.issue_stages.length ? `\nissue at ${it.issue_stages.join(', ')}` : '';
                    row.push({ content: `${it.label}${sub}`, rowSpan: rows.length, styles: { fontStyle: 'bold', valign: 'top' } });
                }
                row.push(
                    { content: String(r.line_no), styles: { halign: 'center' } }, r.bom_line, r.colour,
                    { content: fmt(r.ordered_pieces, 'pcs'), styles: { halign: 'right' } },
                    { content: fmt(r.planned_pieces, 'pcs'), styles: { halign: 'right' } },
                    { content: `${consumption(r.detail || [])} ${it.uom}`, styles: { halign: 'right' } },
                    { content: `${fmt(r.detail?.[0]?.wastage_pct || 0, 'm')}%`, styles: { halign: 'right' } },
                    { content: fmt(r.required_qty, it.uom), styles: { halign: 'right' } },
                );
                if (k === 0) {
                    const span = { rowSpan: rows.length };
                    row.push({ content: `${fmt(it.required_display, it.uom)} ${it.uom}`, ...span, styles: { halign: 'right', fontStyle: 'bold' } });
                    if (trims) row.push({ content: it.purchase_qty != null ? `${fmt(it.purchase_qty, 'pcs')} ${it.purchase_uom}` : '—', ...span, styles: { halign: 'right' } });
                    if (!est) {
                        row.push(
                            { content: fmt(it.allocated, it.uom), ...span, styles: { halign: 'right' } },
                            { content: it.issued > 0 ? fmt(it.issued, it.uom) : '—', ...span, styles: { halign: 'right' } },
                            { content: it.shortfall > 0 ? fmt(it.shortfall, it.uom) : '—', ...span, styles: { halign: 'right', fontStyle: 'bold', textColor: it.shortfall > 0 ? RED : [0, 0, 0] } },
                        );
                    }
                }
                body.push(row);
            });
        }
        const fixed = { 1: 9, 2: 26, 3: 22, 4: 14, 5: 14, 6: 26, 7: 11, 8: 18, 9: 20 };
        let k = 10;
        if (trims) fixed[k++] = 18;
        if (!est) { fixed[k++] = 16; fixed[k++] = 13; fixed[k++] = 15; }
        autoTable(doc, {
            ...base, startY: y + 3, showHead: 'everyPage',
            head: [[{ content: `${title} (${items.length} item${items.length === 1 ? '' : 's'})`, colSpan: head[0].length, styles: { halign: 'left', fontSize: 9 } }], head[0]],
            body,
            columnStyles: { 0: { cellWidth: 'auto' }, ...Object.fromEntries(Object.entries(fixed).map(([c, w]) => [c, { cellWidth: w }])) },
        });
        y = doc.lastAutoTable.finalY;
    };
    const fabric = d.items.filter(i => i.kind === 'FABRIC').sort((a, b) => a.label.localeCompare(b.label));
    const trims = d.items.filter(i => i.kind === 'TRIM').sort((a, b) => (a.usage[0] || '').localeCompare(b.usage[0] || '') || a.label.localeCompare(b.label));
    section('FABRIC', fabric, false);
    section('TRIMS', trims, true);
    if (!d.items.length) { doc.setFontSize(10); doc.text('No material: the order has no pieces yet.', margin.left, y + 8); y += 8; }

    // Sign-off
    let fy = y + 14;
    if (fy > pageH - margin.bottom) { doc.addPage(); fy = margin.top + 10; }
    doc.setFontSize(10); doc.setFont(undefined, 'bold');
    doc.text('Prepared by: ____________________', margin.left, fy);
    doc.text('Checked by: ____________________', margin.left + W / 2, fy);
    doc.setFont(undefined, 'normal');

    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(110);
        doc.text('Required = planned pieces × consumption per piece × (1 + wastage %); planned pieces = ordered × (1 + cut allowance %), rounded up per size.', margin.left, pageH - 5);
        doc.text(`${o.order_no} · order BOM${est ? ' (estimate)' : ''} · page ${p} of ${pages}`, pageW - margin.right, pageH - 5, { align: 'right' });
        doc.setTextColor(0);
    }
    doc.save(`Order-BOM-${est ? 'estimate-' : ''}${o.order_no}`.replace(/[^\w.-]+/g, '-') + '.pdf');
    return doc;
}
