// Production Workflow → Excel export. One row per production batch, joining
// SO/SOP order context with batch-level fabric, cycle-stage (approved +
// repaired garment counts per stage) and dispatch totals.
//
// Stage quantities reuse the existing per-batch stage-quantities endpoint
// (already used for the workflow graph's chip hover, so the numbers agree
// with what's on screen and with BatchDrilldownModal's Cycles tab) rather
// than a new bulk endpoint — export is an occasional, user-initiated action,
// so N parallel calls (capped) is an acceptable trade for reusing
// already-correct per-processing-mode logic. Fabric assigned / pieces
// dispatched / cut pieces ARE bulk-fetched (one call, GROUP BY SUM) — those
// are trivial aggregations with no per-product branching.
//
// gatherProductionWorkflowBatchData() below does all of the above fetching
// and is shared with ProductionWorkflowTableView.jsx (the on-screen Excel-like
// grid) — both consumers read the same batch/totals/stageQty entries so the
// numbers never drift between the download and the on-screen table.

import * as XLSX from 'xlsx';
import { productionManagerApi } from '../../api/productionManagerApi';

const fmtD = (d) => d ? new Date(d).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const statusLabel = (s) => s ? String(s).replace(/_/g, ' ') : '—';

// Same SO → SOP → batch shape the dashboard itself walks (see sopsOf/
// allBatchesOf in ProductionWorkflowDashboard.jsx), but paired with the
// owning SOP so each row can carry order-qty/fabric-type context.
//
// A SOP with no batches yet (or an SO with no product lines at all) still
// gets a row — batch: null — so the export doesn't silently drop order
// lines where production hasn't started. Cancelled orders are skipped:
// they were never headed to production, so a blank batch there isn't a
// pending gap, it's just moot.
const batchRowsOf = (so) => {
    const rows = [];
    const sops = so.products || [];
    const isCancelled = so.so_status === 'CANCELLED';

    for (const sop of sops) {
        const batches = sop.batches || [];
        if (batches.length > 0) {
            for (const b of batches) rows.push({ so, sop, batch: b });
        } else if (!isCancelled) {
            rows.push({ so, sop, batch: null });
        }
    }
    for (const b of (so.batches || [])) rows.push({ so, sop: null, batch: b });
    if (sops.length === 0 && !isCancelled) {
        rows.push({ so, sop: null, batch: null });
    }
    return rows;
};

async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const idx = next++;
            results[idx] = await fn(items[idx], idx);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
    return results;
}

// Fetches everything needed to render one row per batch (bulk totals +
// per-batch stage quantities) and returns the raw entries plus the union of
// stage names across every included batch (different products can have
// different cycle flows), ordered by the lowest sequence_no any product uses
// it at. Consumers (Excel export, on-screen table) derive their own
// formatted columns from these entries.
export async function gatherProductionWorkflowBatchData(salesOrders = []) {
    const batchRows = salesOrders.flatMap(batchRowsOf);

    const totalsRes = await productionManagerApi.getWorkflowBatchTotals();
    const totalsByBatch = new Map((totalsRes.data || []).map(t => [t.batch_id, t]));

    const stageResults = await mapLimit(batchRows, 6, ({ batch }) =>
        batch
            ? productionManagerApi.getBatchStageQuantities(batch.batch_id)
                .then(res => new Map((res.data || []).map(s => [String(s.flow_id), s])))
                .catch(() => new Map())
            : Promise.resolve(new Map())
    );

    const stageOrder = new Map(); // line_type_name -> min sequence_no
    batchRows.forEach(({ batch }) => {
        if (!batch) return;
        (batch.stage_pipeline || []).forEach(s => {
            const prev = stageOrder.get(s.line_type_name);
            if (prev == null || s.sequence_no < prev) stageOrder.set(s.line_type_name, s.sequence_no);
        });
    });
    const stageNames = [...stageOrder.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);

    const entries = batchRows.map(({ so, sop, batch }, i) => ({
        so, sop, batch,
        totals: batch ? (totalsByBatch.get(batch.batch_id) || {}) : {},
        stageQty: stageResults[i],
    }));

    return { entries, stageNames };
}

export async function generateProductionWorkflowExcel(salesOrders = []) {
    const { entries, stageNames } = await gatherProductionWorkflowBatchData(salesOrders);

    const today = new Date();
    const rows = entries.map(({ so, sop, batch, totals, stageQty }) => {
        const orderDate = so.order_date ? new Date(so.order_date) : null;
        const daysSinceOrder = orderDate ? Math.round((today - orderDate) / 86400000) : '—';

        if (!batch) {
            const row = {
                'Sales Order':               so.order_number || '—',
                'SO Status':                 statusLabel(so.so_status),
                'Customer':                  so.customer_name || '—',
                'Product':                   sop?.product_name || '—',
                'Fabric Type':               sop?.fabric_type || '—',
                'Order Qty (Total Pieces)':  sop?.total_quantity ?? '—',
                'Buyer PO':                  so.buyer_po_number || '—',
                'Order Date':                fmtD(so.order_date),
                'Delivery Date':             fmtD(so.delivery_date),
                'Order Value':               so.total_amount != null ? Number(so.total_amount) : '—',
                'Batch ID':                  '—',
                'Batch Created':             '—',
                'Total Rolls Assigned':      '—',
                'Total Fabric Assigned (m)': '—',
            };
            stageNames.forEach(name => { row[name] = '—'; });
            row['Batch Cut Pieces']        = '—';
            row['Total Dispatched (pcs)']  = '—';
            row['Pending / Balance (pcs)'] = '—';
            row['Batch Status']            = 'PRE PRODUCTION';
            row['Days Since Order']        = daysSinceOrder;
            return row;
        }

        const dispatched = totals.pieces_dispatched || 0;
        // Garment-level cut count — matches the batch drilldown modal's "Primary
        // Pieces Cut" stat (one canonical primary part per product), not the raw
        // total_primary_pieces on the workflow payload, which sums cut_piece_log
        // rows across EVERY primary part and over-counts on products with more
        // than one (e.g. FRONT+BACK+BELT all marked PRIMARY triples the count).
        const cutPieces = totals.cut_pieces ?? 0;

        const row = {
            'Sales Order':               so.order_number || '—',
            'SO Status':                 statusLabel(so.so_status),
            'Customer':                  so.customer_name || '—',
            'Product':                   batch.product_name || sop?.product_name || '—',
            'Fabric Type':               sop?.fabric_type || '—',
            'Order Qty (Total Pieces)':  sop?.total_quantity ?? '—',
            'Buyer PO':                  so.buyer_po_number || '—',
            'Order Date':                fmtD(so.order_date),
            'Delivery Date':             fmtD(so.delivery_date),
            'Order Value':               so.total_amount != null ? Number(so.total_amount) : '—',
            'Batch ID':                  batch.batch_id,
            'Batch Created':             fmtD(batch.created_at),
            'Total Rolls Assigned':      totals.roll_count ?? 0,
            'Total Fabric Assigned (m)': totals.fabric_meters_assigned ?? 0,
        };

        stageNames.forEach(name => {
            const stage = (batch.stage_pipeline || []).find(s => s.line_type_name === name);
            if (!stage) { row[name] = '—'; return; }
            const qty = stageQty.get(String(stage.flow_id));
            row[name] = qty?.done ?? '—';
        });

        row['Batch Cut Pieces']        = cutPieces;
        row['Total Dispatched (pcs)']  = dispatched;
        row['Pending / Balance (pcs)'] = Math.max(cutPieces - dispatched, 0);
        row['Batch Status']            = statusLabel(batch.overall_status);
        row['Days Since Order']        = daysSinceOrder;

        return row;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
        { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
        { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
        { wch: 12 }, { wch: 16 },
        ...stageNames.map(() => ({ wch: 12 })),
        { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Batches');

    const ts = new Date().toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
    XLSX.writeFile(wb, `production-workflow-batches-${ts}.xlsx`);
}
