// BOM PDF — Ratio Groups / Fabric Consumptions / Materials & Trims (by stage),
// mirroring fabricRequirementsPdfGenerator.js's convention: standalone
// generator returning a blob (company-profile fetch is the caller's job),
// jsPDF + jspdf-autotable, same header/section/pagination style. Reuses
// materialsByStage from BomPreviewModal.jsx so the PDF groups trims by stage
// exactly the way the on-screen preview does.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { materialsByStage } from './BomPreviewModal';

export function generateBomPdf({ bom, company }) {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`Bill of Materials — ${bom.bom_name || `#${bom.id}`}`, 14, 18);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(
        `${bom.product?.name ? `Product: ${bom.product.name}   |   ` : ''}Generated: ${new Date().toLocaleDateString('en', { dateStyle: 'medium' })}${company?.name ? `   |   ${company.name}` : ''}`,
        14, 25
    );

    let y = 32;
    const ensureSpace = (needed = 20) => { if (y + needed > 280) { doc.addPage(); y = 14; } };

    const sectionHeading = (label) => {
        ensureSpace(10);
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(label, 14, y);
        doc.setFont(undefined, 'normal');
        y += 6;
    };

    // ── Ratio Groups ──
    const ratioGroups = bom.ratio_groups || [];
    if (ratioGroups.length > 0) {
        sectionHeading('Ratio Groups');
        ratioGroups.forEach((rg, i) => {
            ensureSpace(16);
            const rows = (rg.items || []).filter(it => it.size).map(it => [it.size, it.number_of_pieces]);
            autoTable(doc, {
                startY: y,
                head: [[{ content: rg.ratio_group_name || `Group ${i + 1}`, colSpan: 2, styles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 } }], ['Size', 'Pieces']],
                body: rows.length > 0 ? rows : [['—', '—']],
                styles: { fontSize: 8 },
                headStyles: { fillColor: [99, 102, 241] },
                columnStyles: { 1: { halign: 'right' } },
                margin: { left: 14, right: 14 },
            });
            y = doc.lastAutoTable.finalY + 5;
        });
    }

    // ── Fabric Consumptions ──
    const fabricConsumptions = bom.fabric_consumptions || [];
    if (fabricConsumptions.length > 0) {
        sectionHeading('Fabric Consumptions');
        autoTable(doc, {
            startY: y,
            head: [['Fabric', 'Consumption (in/pc)', 'Comments']],
            body: fabricConsumptions.map(fc => [
                fc.fabric_role ? `${fc.fabric_role} (generic)` : (fc.fabric_type_name || `Fabric #${fc.fabric_type_id}`),
                fc.consumption_inches ?? '—',
                fc.comments || '—',
            ]),
            styles: { fontSize: 8 },
            headStyles: { fillColor: [14, 165, 233] },
            columnStyles: { 1: { halign: 'right' } },
            margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 8;
    }

    // ── Materials & Trims — grouped by the product's own workflow stage ──
    const stageGroups = materialsByStage(bom);
    if (stageGroups.length > 0) {
        sectionHeading('Materials & Trims');
        stageGroups.forEach(group => {
            ensureSpace(16);
            const rows = group.materials.map(mc => {
                const qty = mc.calculation_type === 'FIXED'
                    ? `${mc.fixed_quantity ?? ''} ${mc.unit_of_measure || ''}`.trim() + ' / pc'
                    : (mc.size_consumptions || []).map(sc => `${sc.size || '—'}: ${sc.quantity}${mc.unit_of_measure ? ` ${mc.unit_of_measure}` : ''}`).join(', ') || '—';
                return [
                    mc.trim_item_name || `Trim #${mc.trim_item_id}`,
                    mc.item_code || '—',
                    mc.calculation_type,
                    qty,
                    mc.placement_description || '—',
                ];
            });
            autoTable(doc, {
                startY: y,
                head: [[{ content: `${group.label} (${group.materials.length})`, colSpan: 5, styles: { fillColor: group.key === 'unassigned' ? [254, 243, 199] : [237, 233, 254], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 } }], ['Trim Item', 'Code', 'Calc Type', 'Qty', 'Placement']],
                body: rows,
                styles: { fontSize: 7.5 },
                headStyles: { fillColor: [124, 58, 237] },
                margin: { left: 14, right: 14 },
            });
            y = doc.lastAutoTable.finalY + 5;
        });
    }

    if (ratioGroups.length === 0 && fabricConsumptions.length === 0 && stageGroups.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(160);
        doc.text('This BOM has no ratio groups, fabric consumptions, or materials defined.', 14, y);
        doc.setTextColor(0);
    }

    // Footer — page numbers
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFontSize(7.5);
        doc.setTextColor(160);
        doc.text(`Page ${p} of ${pageCount}`, pageW - 14, 290, { align: 'right' });
        doc.setTextColor(0);
    }

    return doc.output('blob');
}
