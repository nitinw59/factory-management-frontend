// Trim requirements PDF export — replaces the old Excel workbook. Instead of
// one .xlsx with 5 sheets, this produces one PDF per bucket (Reserved
// Variants Summary / Completed / In Progress / Pending / Raised PRs) — picked
// individually from a dropdown (see SopHeaderToolbar.jsx), or all at once —
// each following the same conventions as the store-manager portal's
// TrimOrderSummaryPage.jsx `handleDownloadPDF` — the established "trim order
// summary" PDF elsewhere in this app:
//   - jsPDF + jspdf-autotable, `theme: 'grid'` (visible borders on every cell)
//   - a 2-column "Order Information / Product-Batch Information" grid table
//     right under the title, each cell holding several \n-joined lines
//   - a red "ACTION REQUIRED" banner + red-headed table for anything pending/
//     not-yet-covered, ahead of everything else
//   - list-like columns (there: "Used For", here: "Covers") built as
//     `\n`-joined bullet lines inside one cell — autoTable renders embedded
//     newlines as real multi-line rows and grows row height on its own, so a
//     long covered-colors list never gets clipped (unlike a plain XLSX cell)
//   - doc.save(filename) directly, no intermediate blob/anchor plumbing
//
// Buckets are driven by the backend's own per-requirement `status` field (via
// getTrimCellStatus), same as the old Excel export.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmt } from './merchandiserShared';
import { getTrimCellStatus } from './requirementCellStatus';
import { buildTrimReserveItem } from './RequirementCellDrilldownModal';
import { buildReservedVariantRows, buildReservedVariantSummary, nameAndNumber } from './trimReservationUtils';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// Same semantic color language FabricRequirementsGrid/TrimRequirementsGrid/
// RequirementCellDrilldownModal already use (red/blue/yellow(amber)/green)
// via requirementCellStatus.js — reused here as table-header accents instead
// of introducing a new palette. "Pending" is red to match TrimOrderSummaryPage's
// own red "not fully allocated" alert convention.
const ACCENTS = {
    summary:    [124, 58, 237], // violet-600 — this app's default accent, no direct fabric/trim status equivalent
    completed:  [5, 150, 105],  // emerald-600 / green
    inProgress: [37, 99, 235],  // blue-600
    pending:    [220, 38, 38],  // red-600
    raised:     [217, 119, 6],  // amber-600 / yellow
};

const GRID_HEAD_STYLE = (accent) => ({ fillColor: accent, textColor: 255, fontStyle: 'bold', fontSize: 8.5 });
const GRID_BODY_STYLE = { fontSize: 8, textColor: [30, 41, 59], lineColor: [203, 213, 225], lineWidth: 0.2 };

// Title + "Order Information / Product & Batch Information" 2-col table —
// the same shape as TrimOrderSummaryPage's "Batch Information | Order
// Information" table, just with an extra Buyer PO / Delivery Date line.
const drawHeader = (doc, { title, sop, salesOrder, batchLabel, startY = 14 }) => {
    doc.setFontSize(15);
    doc.setFont(undefined, 'bold');
    doc.text(title, 14, startY + 4);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100);
    doc.text(`Generated: ${fmtDate(new Date())}`, 14, startY + 10);
    doc.setTextColor(0);

    autoTable(doc, {
        startY: startY + 14,
        head: [['Order Information', 'Product & Batch Information']],
        body: [[
            `Sales Order: ${salesOrder?.order_number ? `SO-${salesOrder.order_number}` : '—'}\nCustomer: ${salesOrder?.customer_name || salesOrder?.buyer_name || '—'}\nBuyer PO: ${salesOrder?.buyer_po_number || '—'}\nDelivery: ${salesOrder?.delivery_date ? fmtDate(salesOrder.delivery_date) : '—'}`,
            `Product: ${sop.product_name || '—'}\nFabric Type: ${sop.fabric_type_name || '—'}\nBatch(es): ${batchLabel}`,
        ]],
        theme: 'grid',
        headStyles: { fillColor: 255, textColor: 0, lineWidth: 0.1, lineColor: 0, fontStyle: 'bold', fontSize: 9 },
        styles: { textColor: 0, lineWidth: 0.1, lineColor: 0, cellPadding: 4, fontSize: 8.5 },
    });
    return doc.lastAutoTable.finalY + 8;
};

// Mirrors TrimOrderSummaryPage's red "ACTION REQUIRED" block exactly (same
// rect/line/text calls) — used only on the Pending PDF, the one bucket that
// actually matches that "not yet covered" case.
const drawAlertBanner = (doc, text) => {
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(239, 68, 68);
    doc.setLineWidth(0.8);
    doc.rect(14, 14, 182, 12, 'FD');
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(153, 27, 27);
    doc.text(text, 105, 22, { align: 'center' });
    doc.setTextColor(0);
    doc.setFont(undefined, 'normal');
    doc.setDrawColor(0);
    return 30;
};

const safe = (s) => (s || 'file').toString().replace(/\s+/g, '-').replace(/[\\/:*?"<>|]+/g, '-');

const saveSpec = ({ rows, title, sop, salesOrder, batchLabel, accent, head, body, columnStyles, filename, alertText }) => {
    const doc = new jsPDF();
    const alertStartY = alertText ? drawAlertBanner(doc, alertText) : 14;
    const startY = drawHeader(doc, { title, sop, salesOrder, batchLabel, startY: alertStartY });
    autoTable(doc, {
        startY,
        head: [head],
        body,
        theme: 'grid',
        headStyles: GRID_HEAD_STYLE(accent),
        styles: GRID_BODY_STYLE,
        columnStyles: columnStyles || {},
    });
    doc.save(filename);
};

// Computes the 5 bucket "specs" (rows + jsPDF table config) once, shared by
// both the dropdown's row-count preview and the actual save calls, so the
// bucketing/formatting logic lives in exactly one place.
const buildBucketSpecs = ({ sop, salesOrder, trimRequirements = [] }) => {
    const rows = trimRequirements.map(r => ({ raw: r, reserveItem: buildTrimReserveItem(r), cell: getTrimCellStatus(r) }));

    const completed   = rows.filter(x => x.cell.color === 'green');
    const inProgress  = rows.filter(x => x.cell.color === 'blue');
    const pending      = rows.filter(x => x.cell.color === 'red' || x.cell.color === 'yellow');
    const withOpenPR   = rows.filter(x => (x.raw.purchase_requirements || []).length > 0);

    const trimNameOf = (r) => r.trim_item_name || 'Trim';
    const requestedVariantOf = (r) => nameAndNumber(r.color_name, r.color_number);

    const batches = sop.batches || [];
    const batchLabel = batches.length > 0
        ? batches.map(b => b.batch_code || `#${b.batch_id}`).filter(Boolean).join(', ')
        : '—';

    const soPart = salesOrder?.order_number ? `SO${salesOrder.order_number}-` : '';
    const baseName = `trim-requirements-${soPart}${safe(sop.product_name)}`;
    const common = { sop, salesOrder, batchLabel };

    // ── Reserved Variants Summary — one row per physical variant reserved,
    // reserved quantities SUMMED across every requested color it's covering.
    // "Covers" is a \n-joined bullet list (autoTable grows the row to fit it —
    // this is what actually fixes a long covered-colors list getting clipped).
    const summaryGroups = buildReservedVariantSummary(trimRequirements)
        .sort((a, b) =>
            (a.trim_item_name || '').localeCompare(b.trim_item_name || '')
            || nameAndNumber(a.reserved_color_name, a.reserved_color_number).localeCompare(nameAndNumber(b.reserved_color_name, b.reserved_color_number))
        );

    // ── Completed / In Progress — one row per actual reservation record.
    const reservationHead = ['Reserved Variant', 'Reserved Variant Color', 'Requested Variant', 'Required', 'Reserved', 'Substitute'];
    const reservationBodyFor = (bucket) => bucket.flatMap(({ raw: r }) => buildReservedVariantRows([r]).map(v => ([
        v.reserved_item_name,
        nameAndNumber(v.reserved_color_name, v.reserved_color_number),
        requestedVariantOf(r),
        `${fmt(v.required)} ${v.unit}`,
        `${fmt(v.reserved)} ${v.unit}`,
        v.is_substitute ? 'Yes' : 'No',
    ])));

    // ── Pending — nothing reserved yet; show every candidate variant (exact
    // match + configured substitutes) with current stock.
    const pendingBody = [];
    pending.forEach(({ raw: r, reserveItem }) => {
        const base = [trimNameOf(r), requestedVariantOf(r), `${fmt(r.quantity_required)} ${r.unit_of_measure || 'pcs'}`];
        const candidates = [];
        if (reserveItem.exact_variant_id != null) {
            candidates.push(['Exact match', requestedVariantOf(r), `${fmt(reserveItem.exact_variant_stock)} ${r.unit_of_measure || 'pcs'}`]);
        }
        (reserveItem.substitutes || []).forEach(s => {
            candidates.push(['Substitute', nameAndNumber(s.color_name, s.color_number), `${fmt(s.in_stock)} ${r.unit_of_measure || 'pcs'}`]);
        });
        if (candidates.length === 0) candidates.push(['—', '—', '—']);
        candidates.forEach(c => pendingBody.push([...base, ...c]));
    });

    // ── Raised PRs — any requirement (any bucket) with a purchase requirement
    // actually raised against it, one row per PR.
    const raisedBody = [];
    withOpenPR.forEach(({ raw: r }) => {
        (r.purchase_requirements || []).forEach(pr => {
            const qty = Number(pr.quantity_required ?? pr.quantity ?? 0);
            const uom = pr.unit_of_measure || pr.uom || r.unit_of_measure || 'pcs';
            raisedBody.push([
                trimNameOf(r), requestedVariantOf(r), pr.id ?? pr.requirement_id ?? '—',
                (pr.status || 'PENDING').toString().replace(/_/g, ' '), pr.urgency || '—',
                `${fmt(qty)} ${uom}`, pr.po_code || pr.purchase_order_code || '—', pr.supplier_name || '—',
                pr.expected_date ? fmtDate(pr.expected_date) : '—', pr.created_at ? fmtDate(pr.created_at) : '—', pr.notes || '',
            ]);
        });
    });

    return [
        {
            key: 'summary', label: 'Reserved Variants Summary', rows: summaryGroups,
            title: 'Trim Requirements — Reserved Variants Summary', ...common, accent: ACCENTS.summary,
            head: ['Trim Item', 'Reserved Variant Color', 'Colors Covered', 'Covers', 'Total Required', 'Total Reserved', 'Substitute'],
            body: summaryGroups.map(g => ([
                g.trim_item_name,
                nameAndNumber(g.reserved_color_name, g.reserved_color_number),
                g.covered.length,
                g.covered.map(c => `• ${nameAndNumber(c.requested_color_name, c.requested_color_number)}`).join('\n'),
                `${fmt(g.total_required)} ${g.unit}`,
                `${fmt(g.total_reserved)} ${g.unit}`,
                g.any_substitute ? 'Yes' : 'No',
            ])),
            columnStyles: { 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
            filename: `${baseName}-summary.pdf`,
        },
        {
            key: 'completed', label: 'Completed', rows: completed,
            title: 'Trim Requirements — Completed (Fully Reserved)', ...common, accent: ACCENTS.completed,
            head: reservationHead, body: reservationBodyFor(completed),
            columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
            filename: `${baseName}-completed.pdf`,
        },
        {
            key: 'inProgress', label: 'In Progress', rows: inProgress,
            title: 'Trim Requirements — In Progress (Partially Reserved)', ...common, accent: ACCENTS.inProgress,
            head: reservationHead, body: reservationBodyFor(inProgress),
            columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
            filename: `${baseName}-in-progress.pdf`,
        },
        {
            key: 'pending', label: 'Pending - Stock Options', rows: pending,
            title: 'Trim Requirements — Pending (Stock Options)', ...common, accent: ACCENTS.pending,
            alertText: `⚠  ACTION REQUIRED — ${pending.length} trim requirement${pending.length > 1 ? 's' : ''} NOT YET RESERVED`,
            head: ['Trim Item', 'Requested Variant', 'Required', 'Candidate Type', 'Candidate Variant Color', 'In Stock'],
            body: pendingBody,
            columnStyles: { 2: { halign: 'right' }, 5: { halign: 'right' } },
            filename: `${baseName}-pending.pdf`,
        },
        {
            key: 'raised', label: 'Raised PRs', rows: raisedBody,
            title: 'Trim Requirements — Raised Purchase Requirements', ...common, accent: ACCENTS.raised,
            head: ['Trim Item', 'Requested Variant', 'PR ID', 'Status', 'Urgency', 'Quantity', 'PO Code', 'Supplier', 'Expected Date', 'Raised Date', 'Notes'],
            body: raisedBody,
            columnStyles: { 5: { halign: 'right' } },
            filename: `${baseName}-raised-prs.pdf`,
        },
    ];
};

// Cheap, synchronous preview for the export dropdown — key/label/row-count
// per bucket, so empty buckets can be shown disabled instead of the user
// picking one and getting nothing.
export function getTrimPdfBuckets({ sop, salesOrder, trimRequirements = [] }) {
    return buildBucketSpecs({ sop, salesOrder, trimRequirements }).map(({ key, label, rows }) => ({ key, label, count: rows.length }));
}

// Generates and downloads exactly one bucket's PDF. Returns false (without
// saving) if that bucket has no rows.
export function generateTrimRequirementsPdf({ sop, salesOrder, trimRequirements = [], bucketKey }) {
    const spec = buildBucketSpecs({ sop, salesOrder, trimRequirements }).find(s => s.key === bucketKey);
    if (!spec || spec.rows.length === 0) return false;
    saveSpec(spec);
    return true;
}

// Generates and downloads every non-empty bucket's PDF in one go.
export function generateAllTrimRequirementsPdfs({ sop, salesOrder, trimRequirements = [] }) {
    const specs = buildBucketSpecs({ sop, salesOrder, trimRequirements });
    const downloaded = [];
    const skipped = [];
    specs.forEach(spec => {
        if (spec.rows.length === 0) { skipped.push(spec.label); return; }
        saveSpec(spec);
        downloaded.push(spec.label);
    });
    return { downloaded, skipped };
}
