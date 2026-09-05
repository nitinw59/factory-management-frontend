// Trim requirements Excel export — Completed / In Progress / Pending (with
// stock per candidate variant) / Raised PRs / Reserved Variants Summary
// sheets. Standalone function (XLSX.utils.json_to_sheet-per-sheet, one final
// XLSX.writeFile — the house convention, see BomDashboardPage.jsx's
// handleDownloadExcel) — replaces the old inline `generateTrimExcel` that
// lived inside ProductionTrackingModal.
//
// Unlike the old version, buckets are driven by the backend's own
// per-requirement `status` field (via getTrimCellStatus) rather than a T&A
// timeline item's status, so every trim requirement is covered — not only
// ones that happened to have a linked T&A milestone.

import * as XLSX from 'xlsx';
import { fmt } from './merchandiserShared';
import { getTrimCellStatus } from './requirementCellStatus';
import { buildTrimReserveItem } from './RequirementCellDrilldownModal';
import { buildReservedVariantRows, buildReservedVariantSummary, coveredColorsLabel, nameAndNumber } from './trimReservationUtils';

const fmtD = (d) => d ? new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : null;

export function generateTrimRequirementsExcel({ sop, salesOrder, trimRequirements = [] }) {
    const rows = trimRequirements.map(r => ({ raw: r, reserveItem: buildTrimReserveItem(r), cell: getTrimCellStatus(r) }));

    const completed  = rows.filter(x => x.cell.color === 'green');
    const inProgress = rows.filter(x => x.cell.color === 'blue');
    const pending     = rows.filter(x => x.cell.color === 'red' || x.cell.color === 'yellow');
    const withOpenPR  = rows.filter(x => (x.raw.purchase_requirements || []).length > 0);

    const trimNameOf = (r) => r.trim_item_name || 'Trim';
    const requestedVariantOf = (r) => nameAndNumber(r.color_name, r.color_number);

    // Reservation-shaped rows — one per actual reservation record (a single
    // color's requirement can be split across more than one reservation, e.g.
    // a partial exact match plus a substitute topping up the rest), used for
    // both Completed and In Progress sheets.
    const reservationRows = ({ raw: r }) => buildReservedVariantRows([r]).map(v => ({
        'Reserved Variant':       v.reserved_item_name,
        'Reserved Variant Color': nameAndNumber(v.reserved_color_name, v.reserved_color_number),
        'Requested Variant':      requestedVariantOf(r),
        'Required':               `${fmt(v.required)} ${v.unit}`,
        'Reserved':               `${fmt(v.reserved)} ${v.unit}`,
        'Substitute':             v.is_substitute ? 'Yes' : 'No',
    }));
    const reservationCols = [{ wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];

    // Pending — nothing's reserved yet, so instead show every candidate variant (the exact
    // match, plus each configured substitute) with its CURRENT stock, one row per
    // candidate, so it's a long list you can scan for what's actually available to pull.
    const pendingRows = [];
    pending.forEach(({ raw: r, reserveItem }) => {
        const base = {
            'Trim Item':          trimNameOf(r),
            'Requested Variant':  requestedVariantOf(r),
            'Required':           `${fmt(r.quantity_required)} ${r.unit_of_measure || 'pcs'}`,
        };
        const candidates = [];
        if (reserveItem.exact_variant_id != null) {
            candidates.push({
                'Candidate Type':          'Exact match',
                'Candidate Variant Color': requestedVariantOf(r),
                'In Stock':                `${fmt(reserveItem.exact_variant_stock)} ${r.unit_of_measure || 'pcs'}`,
            });
        }
        (reserveItem.substitutes || []).forEach(s => {
            candidates.push({
                'Candidate Type':          'Substitute',
                'Candidate Variant Color': nameAndNumber(s.color_name, s.color_number),
                'In Stock':                `${fmt(s.in_stock)} ${r.unit_of_measure || 'pcs'}`,
            });
        });
        if (candidates.length === 0) {
            candidates.push({ 'Candidate Type': '—', 'Candidate Variant Color': '—', 'In Stock': '—' });
        }
        candidates.forEach(c => pendingRows.push({ ...base, ...c }));
    });
    const pendingCols = [{ wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 12 }];

    // Raised PRs — any requirement (in any bucket) that actually has a purchase
    // requirement raised against it, one row per PR (an item can have more than
    // one over time — e.g. a cancelled one followed by a re-raise).
    const raisedRows = [];
    withOpenPR.forEach(({ raw: r }) => {
        (r.purchase_requirements || []).forEach(pr => {
            const qty = Number(pr.quantity_required ?? pr.quantity ?? 0);
            const uom = pr.unit_of_measure || pr.uom || r.unit_of_measure || 'pcs';
            raisedRows.push({
                'Trim Item':         trimNameOf(r),
                'Requested Variant': requestedVariantOf(r),
                'PR ID':             pr.id ?? pr.requirement_id ?? '—',
                'Status':            (pr.status || 'PENDING').toString().replace(/_/g, ' '),
                'Urgency':           pr.urgency || '—',
                'Quantity':          `${fmt(qty)} ${uom}`,
                'PO Code':           pr.po_code || pr.purchase_order_code || '—',
                'Supplier':          pr.supplier_name || '—',
                'Expected Date':     pr.expected_date ? fmtD(pr.expected_date) : '—',
                'Raised Date':       pr.created_at ? fmtD(pr.created_at) : '—',
                'Notes':             pr.notes || '',
            });
        });
    });
    const raisedCols = [
        { wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 10 },
        { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 30 },
    ];

    // Reserved Variants Summary — one row per physical reserved variant across
    // the whole SOP, with reserved quantities SUMMED across every requested
    // color it's covering (e.g. a BLACK variant used as both its own exact
    // match and a substitute for M GRAY shows as one combined total, not two
    // separate rows) — sorted so a trim item's variants sit together.
    const summaryRows = buildReservedVariantSummary(trimRequirements)
        .sort((a, b) =>
            (a.trim_item_name || '').localeCompare(b.trim_item_name || '')
            || nameAndNumber(a.reserved_color_name, a.reserved_color_number).localeCompare(nameAndNumber(b.reserved_color_name, b.reserved_color_number))
        )
        .map(g => ({
            'Trim Item':              g.trim_item_name,
            'Reserved Variant':       g.reserved_item_name,
            'Reserved Variant Color': nameAndNumber(g.reserved_color_name, g.reserved_color_number),
            'Colors Covered':         g.covered.length,
            'Covers':                 coveredColorsLabel(g.covered),
            'Total Required':         `${fmt(g.total_required)} ${g.unit}`,
            'Total Reserved':         `${fmt(g.total_reserved)} ${g.unit}`,
            'Substitute':             g.any_substitute ? 'Yes' : 'No',
        }));
    const summaryCols = [{ wch: 18 }, { wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 12 }];

    // Order Info — sheet-level header context: which sales order/product this
    // export covers, and which production batch(es) — if any exist yet — these
    // trim requirements are backing.
    const batches = sop.batches || [];
    const wsInfoRows = [
        { Field: 'Sales Order',   Value: salesOrder?.order_number || '—' },
        { Field: 'Customer',      Value: salesOrder?.customer_name || '—' },
        { Field: 'Product',       Value: sop.product_name || '—' },
        { Field: 'Batch Numbers', Value: batches.length > 0 ? batches.map(b => `#${b.batch_id}`).join(', ') : '—' },
        { Field: 'Batch Code',    Value: batches.length > 0 ? batches.map(b => b.batch_code).filter(Boolean).join(', ') || '—' : '—' },
        { Field: 'Generated',     Value: new Date().toLocaleDateString('en', { dateStyle: 'medium' }) },
    ];

    const wb = XLSX.utils.book_new();

    const wsInfo = XLSX.utils.json_to_sheet(wsInfoRows);
    wsInfo['!cols'] = [{ wch: 16 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Order Info');

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary['!cols'] = summaryCols;
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Reserved Variants Summary');

    const wsCompleted = XLSX.utils.json_to_sheet(completed.flatMap(reservationRows));
    wsCompleted['!cols'] = reservationCols;
    XLSX.utils.book_append_sheet(wb, wsCompleted, 'Completed');

    const wsInProgress = XLSX.utils.json_to_sheet(inProgress.flatMap(reservationRows));
    wsInProgress['!cols'] = reservationCols;
    XLSX.utils.book_append_sheet(wb, wsInProgress, 'In Progress');

    const wsPending = XLSX.utils.json_to_sheet(pendingRows);
    wsPending['!cols'] = pendingCols;
    XLSX.utils.book_append_sheet(wb, wsPending, 'Pending - Stock Options');

    const wsRaised = XLSX.utils.json_to_sheet(raisedRows);
    wsRaised['!cols'] = raisedCols;
    XLSX.utils.book_append_sheet(wb, wsRaised, 'Raised PRs');

    const ts = new Date().toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
    const soPart = salesOrder?.order_number ? `SO${salesOrder.order_number}-` : '';
    XLSX.writeFile(wb, `trim-requirements-${soPart}${(sop.product_name || 'product').replace(/\s+/g, '-')}-${ts}.xlsx`);
}
