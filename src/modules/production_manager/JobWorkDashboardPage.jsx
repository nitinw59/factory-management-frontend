import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { lineLoaderApi } from '../../api/lineLoaderApi';
import { jobWorkApi } from '../../api/jobWorkApi';
import { storeManagerApi } from '../../api/storeManagerApi';
import { productionManagerApi } from '../../api/productionManagerApi';
import {
    RefreshCw, Package, ChevronDown, ChevronUp, Loader,
    CheckCircle2, AlertCircle, Send, FileText, Plus, X,
    Truck, ClipboardList, History, Printer,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Helpers ────────────────────────────────────────────────────────────────────

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

const CHALLAN_STATUS = {
    DRAFT:     { label: 'Draft',            cls: 'bg-slate-100 text-slate-600' },
    SENT:      { label: 'Active',           cls: 'bg-amber-100 text-amber-700' },
    RECEIVED:  { label: 'Received',         cls: 'bg-emerald-100 text-emerald-700' },
};

// ── StageNode (read-only pipeline card) ────────────────────────────────────────

const StageNode = ({ stage, progress }) => {
    const status = progress?.status ?? 'LOCKED';
    const rollsDone = progress?.roll_summary?.completed ?? 0;
    const rollsTotal = progress?.roll_summary?.total_on_line ?? 0;

    const statusCfg = {
        COMPLETED:   { headerCls: 'bg-emerald-600', badge: 'DONE',   badgeCls: 'bg-emerald-100 text-emerald-700' },
        IN_PROGRESS: { headerCls: 'bg-blue-600',    badge: 'ACTIVE', badgeCls: 'bg-blue-100 text-blue-700' },
        PENDING:     { headerCls: 'bg-amber-500',   badge: 'PENDING', badgeCls: 'bg-amber-100 text-amber-700' },
    }[status] ?? { headerCls: 'bg-slate-400', badge: 'NOT STARTED', badgeCls: 'bg-slate-100 text-slate-500' };

    return (
        <div className="flex flex-col rounded-xl border border-slate-200 overflow-hidden w-[148px] shrink-0 opacity-80">
            <div className={`${statusCfg.headerCls} text-white px-2.5 py-1.5 flex items-center justify-between`}>
                <span className="font-black text-[10px] uppercase tracking-widest truncate">{stage.line_type_name}</span>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${statusCfg.badgeCls}`}>{statusCfg.badge}</span>
            </div>
            <div className="p-2.5 bg-white flex flex-col gap-1.5">
                {progress?.line_name && (
                    <span className="text-[10px] font-bold text-slate-500 truncate">{progress.line_name}</span>
                )}
                {rollsTotal > 0 && (
                    <div>
                        <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                            <span>Rolls</span>
                            <span>{rollsDone}/{rollsTotal}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${pct(rollsDone, rollsTotal)}%` }}
                            />
                        </div>
                    </div>
                )}
                {progress?.garment_wip && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                        {progress.garment_wip.approved > 0 && (
                            <span className="text-[9px] font-black px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">{progress.garment_wip.approved} ✓</span>
                        )}
                        {progress.garment_wip.in_progress > 0 && (
                            <span className="text-[9px] font-black px-1 py-0.5 rounded bg-blue-100 text-blue-700">{progress.garment_wip.in_progress} in prog</span>
                        )}
                        {progress.garment_wip.pending > 0 && (
                            <span className="text-[9px] font-black px-1 py-0.5 rounded bg-slate-100 text-slate-500">{progress.garment_wip.pending} pend</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── JobWorkStageNode ───────────────────────────────────────────────────────────

const JobWorkStageNode = ({ stage, progress, challans, onCreateChallan }) => {
    const pendingCount = progress?.garment_wip?.pending ?? '—';
    const challanCount = challans?.length ?? 0;
    const sentCount    = challans?.filter(c => c.status === 'SENT').length ?? 0;
    const doneCount    = challans?.filter(c => c.status === 'RECEIVED').length ?? 0;

    return (
        <div className="flex flex-col rounded-xl border-2 border-amber-400 overflow-hidden w-[168px] shrink-0 ring-2 ring-amber-200">
            <div className="bg-amber-500 text-white px-2.5 py-1.5 flex items-center justify-between">
                <span className="font-black text-[10px] uppercase tracking-widest truncate">{stage.line_type_name}</span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white/20 uppercase">EXTERNAL</span>
            </div>
            <div className="p-2.5 bg-amber-50 flex flex-col gap-2">
                {progress?.line_name && (
                    <span className="text-[10px] font-bold text-amber-700 truncate">{progress.line_name}</span>
                )}
                <div className="flex items-end gap-1.5">
                    <span className="text-3xl font-black text-amber-700 leading-none">{pendingCount}</span>
                    <span className="text-[10px] font-bold text-amber-600 mb-0.5">garments pending</span>
                </div>
                {challanCount > 0 && (
                    <div className="text-[10px] font-bold text-slate-600 space-y-0.5">
                        {sentCount > 0    && <div className="flex items-center gap-1"><Truck size={9} className="text-blue-500" /> {sentCount} challan{sentCount > 1 ? 's' : ''} sent</div>}
                        {doneCount > 0    && <div className="flex items-center gap-1"><CheckCircle2 size={9} className="text-emerald-500" /> {doneCount} received</div>}
                    </div>
                )}
                <button
                    onClick={onCreateChallan}
                    className="mt-0.5 w-full flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition active:scale-95"
                >
                    <Plus size={10} /> Create Challan
                </button>
            </div>
        </div>
    );
};

// ── StageConnector ─────────────────────────────────────────────────────────────

const StageConnector = () => (
    <div className="flex items-center shrink-0 px-1">
        <div className="w-6 h-0.5 bg-slate-300" />
        <div className="w-0 h-0 border-t-[4px] border-b-[4px] border-l-[6px] border-t-transparent border-b-transparent border-l-slate-300" />
    </div>
);

// ── ChallanRow ─────────────────────────────────────────────────────────────────

const ChallanRow = ({ challan, onSend, isSending, onViewDetail }) => {
    const cfg = CHALLAN_STATUS[challan.status] ?? CHALLAN_STATUS.DRAFT;
    return (
        <div className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center gap-3">
                <FileText size={14} className="text-slate-400 shrink-0" />
                <div>
                    <div className="text-xs font-black text-slate-700">
                        {challan.challan_number ?? `Challan #${challan.id}`}
                    </div>
                    <div className="text-[10px] text-slate-400">
                        {challan.vendor_name ?? 'Vendor'} · {challan.total_items ?? 0} garments
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${cfg.cls}`}>{cfg.label}</span>
                {challan.status === 'DRAFT' && (
                    <button
                        onClick={onSend}
                        disabled={isSending}
                        className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                    >
                        {isSending ? <Loader size={10} className="animate-spin" /> : <Send size={10} />} Send
                    </button>
                )}
                <button
                    onClick={() => onViewDetail(challan.id)}
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                >
                    <FileText size={10} /> View
                </button>
            </div>
        </div>
    );
};

// ── BatchJobCard ───────────────────────────────────────────────────────────────

const BatchJobCard = ({ batch, challans, jobWorkLineIds, onCreateChallan, onSendChallan, sendingChallanId, onViewDetail }) => {
    const [expanded, setExpanded] = useState(true);

    const progressMap = {};
    (batch.progress || []).forEach(p => { progressMap[p.product_cycle_flow_id] = p; });

    const completedSteps = (batch.progress || []).filter(p => p.status === 'COMPLETED').length;
    const totalSteps     = batch.total_steps ?? batch.cycle_flow?.length ?? 0;
    const completionPct  = pct(completedSteps, totalSteps);

    const batchChallans  = challans || [];

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Card header */}
            <div
                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition"
                onClick={() => setExpanded(e => !e)}
            >
                <div className="flex items-center gap-3">
                    <Package size={16} className="text-slate-400 shrink-0" />
                    <div>
                        <div className="text-sm font-black text-slate-800">
                            #{batch.batch_id} · <span className="font-mono">{batch.batch_code}</span>
                        </div>
                        <div className="text-xs text-slate-500">{batch.product_name}</div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-2">
                        <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-indigo-500 rounded-full transition-all"
                                style={{ width: `${completionPct}%` }}
                            />
                        </div>
                        <span className="text-xs font-bold text-slate-500">{completionPct}%</span>
                    </div>
                    {batchChallans.length > 0 && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            {batchChallans.length} challan{batchChallans.length > 1 ? 's' : ''}
                        </span>
                    )}
                    {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
            </div>

            {expanded && (
                <div className="border-t border-slate-100">
                    {/* Pipeline */}
                    <div className="px-4 py-4 overflow-x-auto">
                        <div className="flex items-center gap-0 min-w-max">
                            {(batch.cycle_flow || []).map((stage, i) => {
                                const progress = progressMap[stage.id];
                                const stagChallans = batchChallans.filter(c =>
                                    (progress?.line_id && c.production_line_id === progress.line_id) ||
                                    (progress?.line_name && c.line_name === progress.line_name)
                                );
                                const isJobWork = progress?.line_id != null && jobWorkLineIds.has(progress.line_id);

                                return (
                                    <React.Fragment key={stage.id}>
                                        {i > 0 && <StageConnector />}
                                        {isJobWork ? (
                                            <JobWorkStageNode
                                                stage={stage}
                                                progress={progress}
                                                challans={stagChallans}
                                                onCreateChallan={() => onCreateChallan(batch, stage, progress)}
                                            />
                                        ) : (
                                            <StageNode stage={stage} progress={progress} />
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>

                    {/* Challans panel */}
                    {batchChallans.length > 0 && (
                        <div className="px-4 pb-4 space-y-2">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Challans</div>
                            {batchChallans.map(c => (
                                <ChallanRow
                                    key={c.id}
                                    challan={c}
                                    onSend={() => onSendChallan(batch.batch_id, c.id)}
                                    isSending={sendingChallanId === c.id}
                                    onViewDetail={onViewDetail}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ── ChallanDetailModal ─────────────────────────────────────────────────────────

// Standard garment size sort order
const SIZE_ORDER = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL'];
const sortSizes = (sizeSet) => [...sizeSet].sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a.toUpperCase());
    const bi = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    const an = parseFloat(a), bn = parseFloat(b);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return a.localeCompare(b);
});

// Group challan items by fabric roll, counting per size
const buildRollGroups = (items) => {
    const sizeSet = new Set();
    const groups  = {};
    (items || []).forEach(item => {
        const rollKey   = String(item.roll_id ?? item.roll_number ?? 'Unknown');
        const rollLabel = String(item.roll_number ?? item.roll_id ?? '—');
        const color     = item.color_name ?? '—';
        const size      = item.size ?? '—';
        sizeSet.add(size);
        if (!groups[rollKey]) {
            groups[rollKey] = { rollLabel, color, sizes: {}, total: 0, approved: 0, rejected: 0 };
        }
        groups[rollKey].sizes[size] = (groups[rollKey].sizes[size] || 0) + 1;
        groups[rollKey].total++;
        if (item.received_status === 'APPROVED')    groups[rollKey].approved++;
        if (item.received_status === 'QC_REJECTED') groups[rollKey].rejected++;
    });
    return { groups: Object.values(groups), sizes: sortSizes(sizeSet) };
};

const generateChallanPDF = (detail) => {
    const doc       = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const challanRef = detail.challan_number ?? `CHALLAN-${detail.id}`;

    // ── Letterhead ──────────────────────────────────────────────────────────────
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('MATRIX OVERSEAS', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
        ['PLOT NO. 24,26,27, K T STEEL PLOT PREMISSES,', 'R K CNG PUMP, WIMCO NAKA, AMBERNATH 421505.', 'Phone: +918591383476'],
        pageWidth / 2, 27, { align: 'center', lineHeightFactor: 1.5 }
    );
    doc.setDrawColor(0); doc.setLineWidth(0.5);
    doc.line(14, 44, pageWidth - 14, 44);

    doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text('JOB WORK CHALLAN', 14, 53);

    // ── Info block (two columns) ─────────────────────────────────────────────────
    const c2 = 110;
    const rows = [
        ['Challan No:',  challanRef,                               'Vendor:',    detail.vendor_name ?? '—'],
        ['Batch Code:',  detail.batch_code ?? '—',                 'Line:',      detail.line_name ?? '—'],
        ['Product:',     detail.product_name ?? '—',               'Status:',    detail.status ?? '—'],
        ['Batch ID:',    `#${detail.production_batch_id ?? '—'}`,  'Total Pcs:', `${detail.items?.length ?? 0}`],
    ];
    let y = 63;
    rows.forEach(([l1, v1, l2, v2]) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text(l1, 14, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(v1), 42, y);
        doc.setFont('helvetica', 'bold');
        doc.text(l2, c2, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(v2), c2 + 24, y);
        y += 7;
    });

    if (detail.notes) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('Notes:', 14, y);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(detail.notes, pageWidth - 42);
        doc.text(lines, 42, y);
        y += lines.length * 5 + 2;
    }

    // ── Size ratio (if available) ─────────────────────────────────────────────────
    if (detail.size_ratio && Object.keys(detail.size_ratio).length > 0) {
        y += 3;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('Size Ratio:', 14, y);
        doc.setFont('helvetica', 'normal');
        const ratioStr = Object.entries(detail.size_ratio)
            .map(([s, r]) => `[${s}: ${r}]`).join('   ');
        doc.text(ratioStr, 42, y);
        y += 9;
    }

    // ── Roll-grouped garment table ────────────────────────────────────────────────
    const { groups, sizes } = buildRollGroups(detail.items);
    const isReceived = detail.status === 'RECEIVED';

    const head = [['Roll No', 'Color', ...sizes, 'Total', ...(isReceived ? ['Appr.', 'QC Rej.'] : [])]];

    const body = groups.map(g => [
        g.rollLabel,
        g.color,
        ...sizes.map(s => g.sizes[s] ?? 0),
        g.total,
        ...(isReceived ? [g.approved, g.rejected] : []),
    ]);

    // Totals footer row
    const sizeTotals   = sizes.map(s => groups.reduce((n, g) => n + (g.sizes[s] || 0), 0));
    const grandTotal   = detail.items?.length ?? 0;
    const approvedTot  = groups.reduce((n, g) => n + g.approved, 0);
    const rejectedTot  = groups.reduce((n, g) => n + g.rejected, 0);
    const footerRow    = [
        { content: 'TOTAL', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } },
        ...sizeTotals.map(n => ({ content: String(n), styles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } })),
        { content: String(grandTotal), styles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } },
        ...(isReceived ? [
            { content: String(approvedTot),  styles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } },
            { content: String(rejectedTot),  styles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } },
        ] : []),
    ];

    autoTable(doc, {
        startY: y + 4,
        head,
        body,
        foot: [footerRow],
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], lineColor: [0, 0, 0], lineWidth: 0.5 },
        bodyStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5 },
        footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5 },
        alternateRowStyles: { fillColor: [255, 255, 255] },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 30 } },
    });

    // ── Signatures ───────────────────────────────────────────────────────────────
    const sigY = doc.lastAutoTable.finalY + 28;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Authorized by (Production Manager)', 14, sigY);
    doc.line(14, sigY + 1, 90, sigY + 1);
    doc.text('Vendor Acknowledgement', pageWidth - 90, sigY);
    doc.line(pageWidth - 90, sigY + 1, pageWidth - 14, sigY + 1);

    doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5);
    doc.text(
        'This is a computer-generated challan and requires signatures for physical transit.',
        pageWidth / 2, sigY + 14, { align: 'center' }
    );

    doc.save(`${challanRef}.pdf`);
};

const ChallanDetailModal = ({ challanId, onClose }) => {
    const [detail,  setDetail]  = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        jobWorkApi.getChallan(challanId)
            .then(res => setDetail(res.data))
            .catch(() => setError('Failed to load challan details.'))
            .finally(() => setLoading(false));
    }, [challanId]);

    const cfg = detail ? (CHALLAN_STATUS[detail.status] ?? CHALLAN_STATUS.DRAFT) : null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <div className="text-sm font-black text-slate-800">
                            {detail?.challan_number ?? `Challan #${challanId}`}
                        </div>
                        {detail && (
                            <div className="text-xs text-slate-400 mt-0.5">
                                {detail.vendor_name}
                                {detail.production_batch_id && <> · Batch #{detail.production_batch_id}</>}
                                {detail.line_name && <> · {detail.line_name}</>}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {detail && !loading && (
                            <button
                                onClick={() => generateChallanPDF(detail)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg bg-slate-800 hover:bg-slate-900 text-white transition"
                            >
                                <Printer size={12} /> PDF
                            </button>
                        )}
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 transition">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {loading && (
                        <div className="flex items-center justify-center py-10 text-slate-400">
                            <Loader size={16} className="animate-spin mr-2" /> Loading…
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            <AlertCircle size={13} /> {error}
                        </div>
                    )}
                    {detail && !loading && (
                        <>
                            {/* Status + summary chips */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest ${cfg.cls}`}>
                                    {cfg.label}
                                </span>
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                                    {detail.items?.length ?? 0} garments
                                </span>
                                {detail.notes && (
                                    <span className="text-xs text-slate-400 italic">"{detail.notes}"</span>
                                )}
                            </div>

                            {/* Batch context */}
                            <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 space-y-3">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                    {[
                                        ['Batch', `#${detail.production_batch_id}${detail.batch_code ? ` · ${detail.batch_code}` : ''}`],
                                        ['Product', detail.product_name ?? '—'],
                                        ['Vendor', detail.vendor_name ?? '—'],
                                        ['Line', detail.line_name ?? '—'],
                                    ].map(([lbl, val]) => (
                                        <div key={lbl}>
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{lbl}</div>
                                            <div className="text-xs font-bold text-slate-700 mt-0.5">{val}</div>
                                        </div>
                                    ))}
                                </div>
                                {detail.size_ratio && Object.keys(detail.size_ratio).length > 0 && (
                                    <div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Size Ratio</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {Object.entries(detail.size_ratio).map(([size, ratio]) => (
                                                <span key={size} className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700">
                                                    {size}: {ratio}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Receive summary (if RECEIVED) */}
                            {detail.status === 'RECEIVED' && (
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { label: 'Approved',    val: detail.summary?.approved,    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                                        { label: 'QC Rejected', val: detail.summary?.qc_rejected, cls: 'bg-rose-50 text-rose-700 border-rose-200' },
                                        { label: 'Repaired',    val: detail.summary?.repaired,    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                                    ].map(({ label, val, cls }) => (
                                        <div key={label} className={`rounded-xl border p-3 text-center ${cls}`}>
                                            <div className="text-2xl font-black">{val ?? '—'}</div>
                                            <div className="text-[10px] font-bold uppercase tracking-widest mt-0.5">{label}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Roll-grouped garment summary */}
                            {detail.items?.length > 0 && (() => {
                                const { groups, sizes } = buildRollGroups(detail.items);
                                const isRec = detail.status === 'RECEIVED';
                                const sizeTotals = sizes.map(s => groups.reduce((n, g) => n + (g.sizes[s] || 0), 0));
                                return (
                                    <div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                                            Garments by Roll · {detail.items.length} pcs · {groups.length} rolls
                                        </div>
                                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                                            <table className="w-full text-xs border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-200">
                                                        <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest text-[10px]">Roll</th>
                                                        <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest text-[10px]">Color</th>
                                                        {sizes.map(s => (
                                                            <th key={s} className="px-2 py-2 text-center font-black text-slate-500 uppercase tracking-widest text-[10px]">{s}</th>
                                                        ))}
                                                        <th className="px-3 py-2 text-right font-black text-slate-500 uppercase tracking-widest text-[10px]">Total</th>
                                                        {isRec && <>
                                                            <th className="px-2 py-2 text-right font-black text-emerald-600 uppercase tracking-widest text-[10px]">OK</th>
                                                            <th className="px-2 py-2 text-right font-black text-rose-600 uppercase tracking-widest text-[10px]">Rej.</th>
                                                        </>}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {groups.map((g, i) => (
                                                        <tr key={i} className="hover:bg-slate-50">
                                                            <td className="px-3 py-2 font-mono text-slate-600">{g.rollLabel}</td>
                                                            <td className="px-3 py-2 text-slate-500">{g.color}</td>
                                                            {sizes.map(s => (
                                                                <td key={s} className="px-2 py-2 text-center text-slate-700 font-bold">
                                                                    {g.sizes[s] ?? 0}
                                                                </td>
                                                            ))}
                                                            <td className="px-3 py-2 text-right font-black text-slate-800">{g.total}</td>
                                                            {isRec && <>
                                                                <td className="px-2 py-2 text-right font-bold text-emerald-600">{g.approved}</td>
                                                                <td className="px-2 py-2 text-right font-bold text-rose-600">{g.rejected}</td>
                                                            </>}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                                                        <td colSpan={2} className="px-3 py-2 font-black text-slate-600 uppercase tracking-widest text-[10px] text-right">Total</td>
                                                        {sizeTotals.map((n, i) => (
                                                            <td key={i} className="px-2 py-2 text-center font-black text-slate-800">{n}</td>
                                                        ))}
                                                        <td className="px-3 py-2 text-right font-black text-slate-900">{detail.items.length}</td>
                                                        {isRec && <>
                                                            <td className="px-2 py-2 text-right font-black text-emerald-700">
                                                                {groups.reduce((n, g) => n + g.approved, 0)}
                                                            </td>
                                                            <td className="px-2 py-2 text-right font-black text-rose-700">
                                                                {groups.reduce((n, g) => n + g.rejected, 0)}
                                                            </td>
                                                        </>}
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })()}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── CreateChallanModal ─────────────────────────────────────────────────────────

const CreateChallanModal = ({ modalData, suppliers, onClose, onCreated }) => {
    const { batch, stage, progress } = modalData;

    const [garments,      setGarments]      = useState([]);
    const [loadingGarments, setLoadingGarments] = useState(true);
    const [selectedIds,   setSelectedIds]   = useState(new Set());
    const [vendorId,      setVendorId]      = useState('');
    const [notes,         setNotes]         = useState('');
    const [submitting,    setSubmitting]    = useState(false);
    const [error,         setError]         = useState('');

    useEffect(() => {
        setLoadingGarments(true);
        jobWorkApi.getPendingGarments(batch.batch_id)
            .then(res => setGarments(res.data || []))
            .catch(() => setError('Failed to load pending garments.'))
            .finally(() => setLoadingGarments(false));
    }, [batch.batch_id]);

    const toggleAll = () => {
        if (selectedIds.size === garments.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(garments.map(g => Number(g.finishing_garment_log_id))));
        }
    };

    const toggleOne = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSubmit = async () => {
        if (!vendorId) { setError('Select a vendor.'); return; }
        if (selectedIds.size === 0) { setError('Select at least one garment.'); return; }
        if (!progress?.line_id) { setError('This stage has no assigned production line yet. Activate the stage in Line Loader first.'); return; }
        setError('');
        setSubmitting(true);
        try {
            await jobWorkApi.createChallan({
                production_batch_id: Number(batch.batch_id),
                production_line_id:  Number(progress.line_id),
                vendor_id:           Number(vendorId),
                notes:               notes || null,
                garment_ids:         [...selectedIds].map(Number),
            });
            onCreated(batch.batch_id);
        } catch (err) {
            const msg = err?.response?.data?.error || err?.response?.data?.message || 'Failed to create challan.';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <div className="text-sm font-black text-slate-800">Create Job Work Challan</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                            Batch #{batch.batch_id} · {stage.line_type_name}
                            {progress?.line_name && <> · {progress.line_name}</>}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {/* Vendor */}
                    <div>
                        <label className="block text-xs font-black text-slate-600 uppercase tracking-widest mb-1.5">Vendor</label>
                        <select
                            value={vendorId}
                            onChange={e => setVendorId(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        >
                            <option value="">Select vendor…</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-xs font-black text-slate-600 uppercase tracking-widest mb-1.5">Notes (optional)</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            placeholder="Any instructions for the vendor…"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                    </div>

                    {/* Garment picker */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-black text-slate-600 uppercase tracking-widest">
                                Garments
                                {!loadingGarments && <span className="ml-1.5 text-slate-400">({garments.length} pending)</span>}
                            </label>
                            {garments.length > 0 && (
                                <button onClick={toggleAll} className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest">
                                    {selectedIds.size === garments.length ? 'Deselect all' : 'Select all'}
                                </button>
                            )}
                        </div>
                        {loadingGarments ? (
                            <div className="flex items-center justify-center py-6 text-slate-400">
                                <Loader size={16} className="animate-spin mr-2" /> Loading…
                            </div>
                        ) : garments.length === 0 ? (
                            <div className="text-center py-6 text-slate-400 text-sm">No pending garments found.</div>
                        ) : (
                            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                                {garments.map(g => {
                                    const gid = Number(g.finishing_garment_log_id);
                                    return (
                                        <label key={gid} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(gid)}
                                                onChange={() => toggleOne(gid)}
                                                className="accent-amber-500"
                                            />
                                            <div className="text-xs">
                                                <span className="font-bold text-slate-700">{g.garment_uid}</span>
                                                {g.size && <span className="ml-1.5 text-slate-400">Size {g.size}</span>}
                                                {g.piece_sequence != null && <span className="ml-1.5 text-slate-400">Piece #{g.piece_sequence}</span>}
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            <AlertCircle size={13} /> {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between shrink-0">
                    <span className="text-xs text-slate-400">{selectedIds.size} selected</span>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition">Cancel</button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || selectedIds.size === 0 || !vendorId}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-black rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? <Loader size={13} className="animate-spin" /> : <FileText size={13} />}
                            Create Draft
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── HistoricChallansPanel ──────────────────────────────────────────────────────

const HistoricChallansPanel = ({ groups, onViewDetail }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div
                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition"
                onClick={() => setExpanded(e => !e)}
            >
                <div className="flex items-center gap-2">
                    <History size={15} className="text-slate-400 shrink-0" />
                    <span className="text-sm font-black text-slate-700">Challan History</span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {groups.reduce((n, g) => n + g.challans.length, 0)} challans · {groups.length} batch{groups.length !== 1 ? 'es' : ''}
                    </span>
                </div>
                {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </div>

            {expanded && (
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {groups.map(group => (
                        <div key={group.batch_id} className="px-4 py-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <Package size={13} className="text-slate-300 shrink-0" />
                                <span className="text-xs font-black text-slate-600">
                                    #{group.batch_id} · <span className="font-mono">{group.batch_code}</span>
                                </span>
                                {group.product_name && (
                                    <span className="text-xs text-slate-400">{group.product_name}</span>
                                )}
                            </div>
                            {group.challans.map(c => (
                                <ChallanRow
                                    key={c.id}
                                    challan={c}
                                    onSend={() => {}}
                                    isSending={false}
                                    onViewDetail={onViewDetail}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── JobWorkDashboardPage ───────────────────────────────────────────────────────

const JobWorkDashboardPage = () => {
    const { logout } = useAuth();
    const navigate   = useNavigate();

    const [batches,          setBatches]          = useState([]);
    const [suppliers,        setSuppliers]        = useState([]);
    const [challansMap,      setChallansMap]      = useState({});
    const [jobWorkLineIds,   setJobWorkLineIds]   = useState(new Set());
    const [modalData,        setModalData]        = useState(null);
    const [isLoading,        setIsLoading]        = useState(true);
    const [error,            setError]            = useState('');
    const [sendingChallanId, setSendingChallanId] = useState(null);
    const [viewingChallanId, setViewingChallanId] = useState(null);

    // Only show batches that have ≥1 stage assigned to a job-work line
    const filteredBatches = useMemo(() => {
        if (jobWorkLineIds.size === 0) return [];
        return batches.filter(batch =>
            (batch.progress || []).some(p => p.line_id != null && jobWorkLineIds.has(p.line_id))
        );
    }, [batches, jobWorkLineIds]);

    // All DRAFT challans across all batches — drives the dispatch panel
    const draftChallans = useMemo(() => {
        return Object.values(challansMap).flat().filter(c => c.status === 'DRAFT');
    }, [challansMap]);

    // Challans for batch IDs not in the active list (completed / archived batches)
    const historicChallans = useMemo(() => {
        const activeBatchIds = new Set(filteredBatches.map(b => b.batch_id));
        const groups = {};
        Object.entries(challansMap).forEach(([batchId, challans]) => {
            if (!activeBatchIds.has(Number(batchId))) {
                const sample = challans[0];
                groups[batchId] = {
                    batch_id:    Number(batchId),
                    batch_code:  sample?.batch_code  ?? `#${batchId}`,
                    product_name: sample?.product_name ?? '',
                    challans,
                };
            }
        });
        return Object.values(groups);
    }, [challansMap, filteredBatches]);

    const loadBatches = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const res = await lineLoaderApi.getDashboardData();
            const data = res.data || [];
            setBatches(data);

            const challansRes = await jobWorkApi.getChallans().catch(() => ({ data: [] }));
            const allChallans = challansRes.data || [];
            const map = {};
            allChallans.forEach(c => {
                const bid = c.production_batch_id;
                if (!map[bid]) map[bid] = [];
                map[bid].push(c);
            });
            setChallansMap(map);
        } catch {
            setError('Failed to load dashboard data.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBatches();
        storeManagerApi.getSuppliers()
            .then(res => setSuppliers(res.data || []))
            .catch(() => {});
        productionManagerApi.getFactoryLayoutData()
            .then(res => {
                const ids = new Set(
                    (res.data?.lines || []).filter(l => l.is_job_work).map(l => l.id)
                );
                setJobWorkLineIds(ids);
            })
            .catch(() => {});
    }, [loadBatches]);

    const refreshBatchChallans = useCallback(async (batchId) => {
        try {
            const res = await jobWorkApi.getChallans({ batch_id: batchId });
            setChallansMap(prev => ({ ...prev, [batchId]: res.data || [] }));
        } catch { /* silent */ }
    }, []);

    const handleCreateChallan = (batch, stage, progress) => {
        setModalData({ batch, stage, progress });
    };

    const handleChallanCreated = async (batchId) => {
        setModalData(null);
        await refreshBatchChallans(batchId);
    };

    const handleSendChallan = async (batchId, challanId) => {
        setSendingChallanId(challanId);
        try {
            await jobWorkApi.sendChallan(challanId);
            await refreshBatchChallans(batchId);
        } catch {
            alert('Failed to send challan.');
        } finally {
            setSendingChallanId(null);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Page header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-black text-slate-800 tracking-tight">Job Work Dashboard</h1>
                    <p className="text-xs text-slate-400 mt-0.5">Manage external vendor challans for finishing stages</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadBatches}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:border-slate-300 transition disabled:opacity-50 bg-white"
                    >
                        <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            <div className="px-6 py-6 max-w-7xl mx-auto space-y-6">

                {/* ── Ready to Dispatch panel ── */}
                {draftChallans.length > 0 && (
                    <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                            <ClipboardList size={15} className="text-amber-600 shrink-0" />
                            <span className="text-sm font-black text-amber-800 tracking-tight">
                                Ready to Dispatch
                            </span>
                            <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
                                {draftChallans.length} draft{draftChallans.length > 1 ? 's' : ''} pending
                            </span>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {draftChallans.map(c => (
                                <div key={c.id} className="flex items-center justify-between px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <FileText size={14} className="text-amber-500 shrink-0" />
                                        <div>
                                            <div className="text-xs font-black text-slate-800">
                                                {c.challan_number ?? `Challan #${c.id}`}
                                            </div>
                                            <div className="text-[10px] text-slate-400 mt-0.5">
                                                {c.batch_code} · {c.product_name} · {c.vendor_name} · {c.total_items} garments
                                                {c.line_name && <> · {c.line_name}</>}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleSendChallan(c.production_batch_id, c.id)}
                                        disabled={sendingChallanId === c.id}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50 shrink-0"
                                    >
                                        {sendingChallanId === c.id
                                            ? <Loader size={11} className="animate-spin" />
                                            : <Send size={11} />}
                                        Issue
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {isLoading && (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <Loader size={20} className="animate-spin mr-2" /> Loading batches…
                    </div>
                )}

                {!isLoading && error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <AlertCircle size={15} /> {error}
                    </div>
                )}

                {!isLoading && !error && filteredBatches.length === 0 && (
                    <div className="text-center py-16 text-slate-400">
                        <Package size={32} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No active batches with job work stages found.</p>
                    </div>
                )}

                {!isLoading && filteredBatches.map(batch => (
                    <BatchJobCard
                        key={batch.batch_id}
                        batch={batch}
                        challans={challansMap[batch.batch_id] || []}
                        jobWorkLineIds={jobWorkLineIds}
                        onCreateChallan={handleCreateChallan}
                        onSendChallan={handleSendChallan}
                        sendingChallanId={sendingChallanId}
                        onViewDetail={setViewingChallanId}
                    />
                ))}

                {/* ── Challan History (completed batches) ── */}
                {!isLoading && historicChallans.length > 0 && (
                    <HistoricChallansPanel
                        groups={historicChallans}
                        onViewDetail={setViewingChallanId}
                    />
                )}
            </div>

            {modalData && (
                <CreateChallanModal
                    modalData={modalData}
                    suppliers={suppliers}
                    onClose={() => setModalData(null)}
                    onCreated={handleChallanCreated}
                />
            )}

            {viewingChallanId && (
                <ChallanDetailModal
                    challanId={viewingChallanId}
                    onClose={() => setViewingChallanId(null)}
                />
            )}
        </div>
    );
};

export default JobWorkDashboardPage;
