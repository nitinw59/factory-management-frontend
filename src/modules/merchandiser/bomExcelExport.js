// Downloads a linked BOM as an Excel workbook — Summary / Fabric Consumptions /
// Materials / Ratio Groups sheets. Adapted from BomDashboardPage.jsx's
// handleDownloadExcel (same section shape, same "one row per size for
// PER_SIZE trims" flattening) against the bomApi.getById(bomId) payload.

import * as XLSX from 'xlsx';

export function generateBomExcel(bom) {
    if (!bom) return;
    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet([
        { Field: 'BOM Name', Value: bom.bom_name || '' },
        { Field: 'Product', Value: bom.product?.name || '' },
        { Field: 'Status', Value: bom.status || '' },
        { Field: 'Created By', Value: bom.created_by?.name || '' },
        { Field: 'Approved By', Value: bom.approved_by?.name || '' },
    ]);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    const fabricRows = (bom.fabric_consumptions || []).map((fc, i) => ({
        'S.No': i + 1,
        Fabric: fc.fabric_role ? `${fc.fabric_role} (generic)` : (fc.fabric_type_name || `Fabric #${fc.fabric_type_id}`),
        'Consumption (in/pc)': fc.consumption_inches ?? '',
        Comments: fc.comments || '',
    }));
    if (fabricRows.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fabricRows), 'Fabric Consumptions');
    }

    const stageNameById = new Map((bom.product_stages || []).map(s => [String(s.production_line_type_id), s.stage_name]));
    const materialRows = [];
    (bom.material_consumptions || []).forEach(mc => {
        const base = {
            Stage: mc.production_line_type_id ? (stageNameById.get(String(mc.production_line_type_id)) || `Stage #${mc.production_line_type_id}`) : 'Unassigned',
            'Trim Item': mc.trim_item_name || `Trim #${mc.trim_item_id}`,
            'Item Code': mc.item_code || '',
            UOM: mc.unit_of_measure || '',
            'Calc Type': mc.calculation_type,
            'Wastage %': mc.wastage_percentage || 0,
            Placement: mc.placement_description || '',
            Comments: mc.comments || '',
        };
        if (mc.calculation_type === 'FIXED') {
            materialRows.push({ ...base, Size: 'ALL', Qty: mc.fixed_quantity ?? '', 'Target Variant Size': '' });
        } else {
            (mc.size_consumptions || []).forEach(sc => {
                materialRows.push({ ...base, Size: sc.size || '', Qty: sc.quantity ?? '', 'Target Variant Size': sc.target_variant_size || '' });
            });
        }
    });
    if (materialRows.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(materialRows), 'Materials');
    }

    const ratioRows = [];
    (bom.ratio_groups || []).forEach(rg => {
        (rg.items || []).filter(it => it.size).forEach(it => {
            ratioRows.push({
                'Ratio Group': rg.ratio_group_name || '',
                Size: it.size,
                Pieces: it.number_of_pieces,
                'Marker Length (in)': rg.marker_length_inches || '',
                Notes: rg.notes || '',
            });
        });
    });
    if (ratioRows.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ratioRows), 'Ratio Groups');
    }

    const safeName = (bom.bom_name || `BOM-${bom.id}`).trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');
    XLSX.writeFile(wb, `${safeName}.xlsx`);
}
