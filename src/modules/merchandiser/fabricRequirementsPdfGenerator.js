// Fabric requirements PDF — one table per fully-reserved ("green") fabric
// requirement, grouped by the color of each reserved roll, with a grand-total
// footer. Standalone generator returning a blob (company-profile fetch is the
// caller's job, same convention as salesOrderPdfGenerator.js) — replaces the
// old inline `generateFabricPDF` that lived inside ProductionTrackingModal.
//
// Unlike the old version, this is driven by the backend's own per-requirement
// `status` field (via getFabricCellStatus) rather than a T&A timeline item's
// status, so it covers every fully-reserved fabric requirement on the SOP —
// not only ones that happened to have a linked T&A milestone.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmt } from './merchandiserShared';
import { getFabricCellStatus } from './requirementCellStatus';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en', { dateStyle: 'short' }) : '—';

export async function generateFabricRequirementsPdf({ sop, salesOrder, fabricRequirements = [], company }) {
    const completed = fabricRequirements.filter(r => getFabricCellStatus(r)?.color === 'green');

    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();

    const soLabel = salesOrder?.order_number ? `SO #${salesOrder.order_number}` : 'SO —';
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`Fabric Requirements — ${soLabel} — ${sop.product_name}`, 14, 18);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleDateString('en', { dateStyle: 'medium' })}${company?.name ? `   |   ${company.name}` : ''}`, 14, 25);

    let y = 32;
    let grandRequired = 0;
    let grandReserved = 0;

    if (completed.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(160);
        doc.text('No fully-reserved fabric requirements yet.', 14, y);
        doc.setTextColor(0);
    }

    completed.forEach((r, idx) => {
        grandRequired += r.meters_required || 0;
        grandReserved += r.meters_reserved || 0;

        if (y > 255) { doc.addPage(); y = 14; }

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text(`${r.fabric_type_name}${r.color_name ? ' – ' + r.color_name : ''}${r.color_number ? ` · ${r.color_number}` : ''}`, 14, y);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(80);
        doc.text(
            `Required: ${fmt(r.meters_required)} m   |   Reserved: ${fmt(r.meters_reserved)} m${r.calculation_breakdown ? `   |   Formula: ${r.calculation_breakdown.base_quantity_per_set ?? ''}m × ${r.calculation_breakdown.total_sets ?? ''} sets + ${r.calculation_breakdown.wastage_percentage ?? 0}% waste` : ''}`,
            14, y + 5
        );
        doc.setTextColor(0);
        y += 12;

        const reservations = r.reservations || [];

        if (reservations.length === 0) {
            doc.setFontSize(8);
            doc.setTextColor(160);
            doc.text('No rolls reserved.', 18, y);
            doc.setTextColor(0);
            y += 6;
        } else {
            const byColor = {};
            reservations.forEach(res => {
                const key = `${res.roll_color_name || 'Unknown'}|||${res.roll_color_number || ''}`;
                if (!byColor[key]) byColor[key] = [];
                byColor[key].push(res);
            });

            Object.entries(byColor).forEach(([colorKey, rolls]) => {
                const [colorName, colorNumber] = colorKey.split('|||');
                const colorTotal = rolls.reduce((s, rv) => s + parseFloat(rv.meters_reserved || 0), 0);
                const colorLabel = `${colorName}${colorNumber ? ` (${colorNumber})` : ''}  —  ${colorTotal.toFixed(2)} m reserved`;

                autoTable(doc, {
                    startY: y,
                    head: [
                        [{ content: colorLabel, colSpan: 7, styles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 } }],
                        ['Roll ID', 'Bale No.', 'Reserved (m)', 'Roll Total (m)', 'Status', 'Supplier', 'Bill Date'],
                    ],
                    body: [
                        ...rolls.map(rv => [
                            rv.fabric_roll_id,
                            rv.roll_bale_no || '—',
                            fmt(rv.meters_reserved),
                            fmt(rv.roll_total_meters),
                            rv.roll_status || '—',
                            rv.supplier_name || '—',
                            fmtDate(rv.intake_bill_date),
                        ]),
                        [
                            { content: 'Subtotal', colSpan: 2, styles: { fontStyle: 'bold' } },
                            { content: `${colorTotal.toFixed(2)} m`, styles: { fontStyle: 'bold' } },
                            '', '', '', '',
                        ],
                    ],
                    styles: { fontSize: 7.5 },
                    headStyles: { fillColor: [99, 102, 241] },
                    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
                });
                y = doc.lastAutoTable.finalY + 5;
            });
        }

        if (idx < completed.length - 1) {
            if (y > 255) { doc.addPage(); y = 14; }
            doc.setDrawColor(210);
            doc.line(14, y, pageW - 14, y);
            doc.setDrawColor(0);
            y += 6;
        }
    });

    if (completed.length > 0) {
        if (y > 255) { doc.addPage(); y = 14; }
        autoTable(doc, {
            startY: y + 6,
            head: [['', 'Total Required (m)', 'Total Reserved (m)']],
            body: [['Grand Total', `${grandRequired.toFixed(2)} m`, `${grandReserved.toFixed(2)} m`]],
            styles: { fontSize: 9, fontStyle: 'bold' },
            headStyles: { fillColor: [30, 41, 59] },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        });
    }

    return doc.output('blob');
}
