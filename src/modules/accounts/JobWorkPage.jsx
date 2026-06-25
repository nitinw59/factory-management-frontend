import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { jobWorkApi } from '../../api/jobWorkApi';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    Loader, Package, AlertCircle, FileText, ChevronDown, ChevronUp,
    RefreshCw, CheckCircle2, X, Truck, Clock, Printer, ArrowDownCircle,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────

const CHALLAN_STATUS = {
    DRAFT:    { label: 'Draft',    cls: 'bg-slate-100 text-slate-600',     Icon: Clock        },
    SENT:     { label: 'Active',   cls: 'bg-amber-100 text-amber-700',     Icon: Truck        },
    RECEIVED: { label: 'Received', cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
};

const RECEIVE_OPTS = [
    { value: 'APPROVED',    label: 'Approved',    cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { value: 'QC_REJECTED', label: 'QC Rejected', cls: 'text-rose-700 bg-rose-50 border-rose-200'         },
    { value: 'REPAIRED',    label: 'Repaired',    cls: 'text-amber-700 bg-amber-50 border-amber-200'      },
];

// ── Size helpers ───────────────────────────────────────────────────────────────

const SIZE_ORDER = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL'];
const sortSizes = (sizeSet) => [...sizeSet].sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a.toUpperCase()), bi = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    const an = parseFloat(a), bn = parseFloat(b);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return a.localeCompare(b);
});

// Groups items by roll, carries per-item array for receive submission
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
            groups[rollKey] = {
                rollKey, rollLabel, color,
                sizes: {}, items: [], total: 0,
                approved: 0, rejected: 0,
            };
        }
        groups[rollKey].sizes[size] = (groups[rollKey].sizes[size] || 0) + 1;
        groups[rollKey].items.push(item);
        groups[rollKey].total++;
        if (item.received_status === 'APPROVED')    groups[rollKey].approved++;
        if (item.received_status === 'QC_REJECTED') groups[rollKey].rejected++;
    });
    return { groups: Object.values(groups), sizes: sortSizes(sizeSet) };
};

// ── PDF generator ──────────────────────────────────────────────────────────────

const generateChallanPDF = (detail) => {
    const doc        = new jsPDF();
    const pageWidth  = doc.internal.pageSize.width;
    const challanRef = detail.challan_number ?? `CHALLAN-${detail.id}`;

    doc.setFontSize(22); doc.setFont('helvetica', 'bold');
    doc.text('MATRIX OVERSEAS', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(9);  doc.setFont('helvetica', 'normal');
    doc.text(
        ['PLOT NO. 24,26,27, K T STEEL PLOT PREMISSES,', 'R K CNG PUMP, WIMCO NAKA, AMBERNATH 421505.', 'Phone: +918591383476'],
        pageWidth / 2, 27, { align: 'center', lineHeightFactor: 1.5 }
    );
    doc.setDrawColor(0); doc.setLineWidth(0.5);
    doc.line(14, 44, pageWidth - 14, 44);

    doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text('JOB WORK CHALLAN', 14, 53);

    const c2   = 110;
    const meta = [
        ['Challan No:',  challanRef,                              'Vendor:',    detail.vendor_name ?? '—'],
        ['Batch Code:',  detail.batch_code ?? '—',               'Line:',      detail.line_name ?? '—'],
        ['Product:',     detail.product_name ?? '—',             'Status:',    detail.status ?? '—'],
        ['Batch ID:',    `#${detail.production_batch_id ?? '—'}`, 'Total Pcs:', `${detail.items?.length ?? 0}`],
    ];
    let y = 63;
    meta.forEach(([l1, v1, l2, v2]) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text(l1, 14, y); doc.setFont('helvetica', 'normal'); doc.text(String(v1), 42, y);
        doc.setFont('helvetica', 'bold');
        doc.text(l2, c2, y); doc.setFont('helvetica', 'normal'); doc.text(String(v2), c2 + 24, y);
        y += 7;
    });

    if (detail.notes) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Notes:', 14, y);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(detail.notes, pageWidth - 42);
        doc.text(lines, 42, y);
        y += lines.length * 5 + 2;
    }

    if (detail.size_ratio && Object.keys(detail.size_ratio).length > 0) {
        y += 3;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Size Ratio:', 14, y);
        doc.setFont('helvetica', 'normal');
        doc.text(Object.entries(detail.size_ratio).map(([s, r]) => `[${s}: ${r}]`).join('   '), 42, y);
        y += 9;
    }

    const { groups, sizes } = buildRollGroups(detail.items);
    const isReceived = detail.status === 'RECEIVED';
    const head       = [['Roll No', 'Color', ...sizes, 'Total', ...(isReceived ? ['Appr.', 'QC Rej.'] : [])]];
    const body       = groups.map(g => [
        g.rollLabel, g.color,
        ...sizes.map(s => g.sizes[s] ?? 0),
        g.total,
        ...(isReceived ? [g.approved, g.rejected] : []),
    ]);
    const sizeTotals  = sizes.map(s => groups.reduce((n, g) => n + (g.sizes[s] || 0), 0));
    const grandTotal  = detail.items?.length ?? 0;
    const footerRow   = [
        { content: 'TOTAL', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [255,255,255], textColor: [0,0,0] } },
        ...sizeTotals.map(n => ({ content: String(n), styles: { fontStyle: 'bold', fillColor: [255,255,255], textColor: [0,0,0] } })),
        { content: String(grandTotal), styles: { fontStyle: 'bold', fillColor: [255,255,255], textColor: [0,0,0] } },
        ...(isReceived ? [
            { content: String(groups.reduce((n,g)=>n+g.approved,0)), styles:{fontStyle:'bold',fillColor:[255,255,255],textColor:[0,0,0]} },
            { content: String(groups.reduce((n,g)=>n+g.rejected,0)), styles:{fontStyle:'bold',fillColor:[255,255,255],textColor:[0,0,0]} },
        ] : []),
    ];

    autoTable(doc, {
        startY: y + 4, head, body, foot: [footerRow], theme: 'grid',
        headStyles: { fillColor:[0,0,0], textColor:[255,255,255], lineColor:[0,0,0], lineWidth:0.5 },
        bodyStyles: { fillColor:[255,255,255], textColor:[0,0,0], lineColor:[0,0,0], lineWidth:0.5 },
        footStyles: { fillColor:[255,255,255], textColor:[0,0,0], lineColor:[0,0,0], lineWidth:0.5 },
        alternateRowStyles: { fillColor:[255,255,255] },
        styles: { fontSize:9, cellPadding:3 },
        columnStyles: { 0:{cellWidth:22}, 1:{cellWidth:30} },
    });

    const sigY = doc.lastAutoTable.finalY + 28;
    doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text('Authorized by (Production Manager)', 14, sigY);
    doc.line(14, sigY+1, 90, sigY+1);
    doc.text('Vendor Acknowledgement', pageWidth-90, sigY);
    doc.line(pageWidth-90, sigY+1, pageWidth-14, sigY+1);
    doc.setFont('helvetica','italic'); doc.setFontSize(7.5);
    doc.text('This is a computer-generated challan and requires signatures for physical transit.', pageWidth/2, sigY+14, { align:'center' });

    doc.save(`${challanRef}.pdf`);
};

// ── ReceiveModal ───────────────────────────────────────────────────────────────

const ReceiveModal = ({ detail, onClose, onReceived }) => {
    const { groups, sizes } = useMemo(() => buildRollGroups(detail.items), [detail.items]);

    // rollOutcomes: { [rollKey]: 'APPROVED' | 'QC_REJECTED' | 'REPAIRED' }
    const [rollOutcomes, setRollOutcomes] = useState(() => {
        const init = {};
        groups.forEach(g => { init[g.rollKey] = 'APPROVED'; });
        return init;
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError]           = useState('');

    const setAll = (status) =>
        setRollOutcomes(prev => Object.fromEntries(Object.keys(prev).map(k => [k, status])));

    const counts = useMemo(() => {
        const c = { APPROVED: 0, QC_REJECTED: 0, REPAIRED: 0 };
        groups.forEach(g => { c[rollOutcomes[g.rollKey]] = (c[rollOutcomes[g.rollKey]] || 0) + g.total; });
        return c;
    }, [rollOutcomes, groups]);

    const handleSubmit = async () => {
        setError('');
        setSubmitting(true);
        try {
            // Expand roll-level outcomes to per-item payload
            const items = groups.flatMap(g =>
                g.items.map(item => ({
                    challan_item_id: item.challan_item_id,
                    received_status: rollOutcomes[g.rollKey],
                }))
            );
            await jobWorkApi.receiveChallan(detail.id, items);
            onReceived();
        } catch (err) {
            const msg = err?.response?.data?.error || err?.response?.data?.message || 'Failed to receive challan.';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <div className="text-sm font-black text-slate-800">Receive Job Work Challan</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                            {detail.challan_number ?? `Challan #${detail.id}`} · {detail.vendor_name}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 transition">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {/* Quick actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest mr-1">Set all:</span>
                        {RECEIVE_OPTS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setAll(opt.value)}
                                className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg border transition ${opt.cls}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Roll table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest text-[10px]">Roll</th>
                                    <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest text-[10px]">Color</th>
                                    {sizes.map(s => (
                                        <th key={s} className="px-2 py-2 text-center font-black text-slate-500 uppercase tracking-widest text-[10px]">{s}</th>
                                    ))}
                                    <th className="px-3 py-2 text-right font-black text-slate-500 uppercase tracking-widest text-[10px]">Pcs</th>
                                    <th className="px-4 py-2 text-left font-black text-slate-500 uppercase tracking-widest text-[10px]">Outcome</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {groups.map(g => {
                                    const chosen = rollOutcomes[g.rollKey];
                                    const optCfg = RECEIVE_OPTS.find(o => o.value === chosen);
                                    return (
                                        <tr key={g.rollKey} className="hover:bg-slate-50">
                                            <td className="px-3 py-2.5 font-mono text-slate-600">{g.rollLabel}</td>
                                            <td className="px-3 py-2.5 text-slate-500">{g.color}</td>
                                            {sizes.map(s => (
                                                <td key={s} className="px-2 py-2.5 text-center font-bold text-slate-700">
                                                    {g.sizes[s] ?? 0}
                                                </td>
                                            ))}
                                            <td className="px-3 py-2.5 text-right font-black text-slate-800">{g.total}</td>
                                            <td className="px-4 py-2">
                                                <select
                                                    value={chosen}
                                                    onChange={e => setRollOutcomes(prev => ({ ...prev, [g.rollKey]: e.target.value }))}
                                                    className={`text-[10px] font-black uppercase tracking-widest rounded-lg border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer ${optCfg?.cls ?? ''}`}
                                                >
                                                    {RECEIVE_OPTS.map(o => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Running tally */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                            <div className="text-2xl font-black text-emerald-700">{counts.APPROVED}</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mt-0.5">Approved</div>
                        </div>
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
                            <div className="text-2xl font-black text-rose-700">{counts.QC_REJECTED}</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-rose-600 mt-0.5">QC Rejected</div>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                            <div className="text-2xl font-black text-amber-700">{counts.REPAIRED}</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mt-0.5">Repaired</div>
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            <AlertCircle size={13} /> {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50 rounded-b-2xl">
                    <div className="text-xs text-slate-400">
                        {detail.items?.length ?? 0} garments · {groups.length} rolls
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="flex items-center gap-1.5 px-5 py-2 text-sm font-black uppercase tracking-widest rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
                        >
                            {submitting ? <Loader size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                            Confirm Receive
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── ChallanDetailModal ─────────────────────────────────────────────────────────

const ChallanDetailModal = ({ challanId, onClose, onReceived }) => {
    const [detail,   setDetail]   = useState(null);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState('');
    const [showReceive, setShowReceive] = useState(false);

    const fetchDetail = useCallback(() => {
        setLoading(true); setError('');
        jobWorkApi.getChallan(challanId)
            .then(res => setDetail(res.data))
            .catch(() => setError('Failed to load challan details.'))
            .finally(() => setLoading(false));
    }, [challanId]);

    useEffect(() => { fetchDetail(); }, [fetchDetail]);

    const cfg = detail ? (CHALLAN_STATUS[detail.status] ?? CHALLAN_STATUS.DRAFT) : null;

    const handleReceived = () => {
        setShowReceive(false);
        fetchDetail();
        onReceived?.();
    };

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
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
                                <>
                                    <button
                                        onClick={() => generateChallanPDF(detail)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg bg-slate-800 hover:bg-slate-900 text-white transition"
                                    >
                                        <Printer size={12} /> PDF
                                    </button>
                                    {detail.status === 'SENT' && (
                                        <button
                                            onClick={() => setShowReceive(true)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition"
                                        >
                                            <ArrowDownCircle size={12} /> Receive
                                        </button>
                                    )}
                                </>
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
                                {/* Status chip + notes */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest ${cfg.cls}`}>
                                        <cfg.Icon size={11} /> {cfg.label}
                                    </span>
                                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                                        {detail.items?.length ?? 0} garments
                                    </span>
                                    {detail.notes && (
                                        <span className="text-xs text-slate-400 italic">"{detail.notes}"</span>
                                    )}
                                </div>

                                {/* Batch context + size ratio */}
                                <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 space-y-3">
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                        {[
                                            ['Batch',   `#${detail.production_batch_id}${detail.batch_code ? ` · ${detail.batch_code}` : ''}`],
                                            ['Product', detail.product_name ?? '—'],
                                            ['Vendor',  detail.vendor_name  ?? '—'],
                                            ['Line',    detail.line_name    ?? '—'],
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

                                {/* Receive summary (RECEIVED only) */}
                                {detail.status === 'RECEIVED' && (
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { label: 'Approved',    val: detail.summary?.approved,    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                                            { label: 'QC Rejected', val: detail.summary?.qc_rejected, cls: 'bg-rose-50 text-rose-700 border-rose-200'           },
                                            { label: 'Repaired',    val: detail.summary?.repaired,    cls: 'bg-amber-50 text-amber-700 border-amber-200'         },
                                        ].map(({ label, val, cls }) => (
                                            <div key={label} className={`rounded-xl border p-3 text-center ${cls}`}>
                                                <div className="text-2xl font-black">{val ?? '—'}</div>
                                                <div className="text-[10px] font-bold uppercase tracking-widest mt-0.5">{label}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Active challan notice */}
                                {detail.status === 'SENT' && (
                                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                                        <Truck size={14} className="text-amber-600 shrink-0" />
                                        <span className="text-xs font-bold text-amber-800">
                                            This challan is currently with the vendor. Click <strong>Receive</strong> when goods return from job work.
                                        </span>
                                    </div>
                                )}

                                {/* Roll-grouped garment summary */}
                                {detail.items?.length > 0 && (() => {
                                    const { groups, sizes } = buildRollGroups(detail.items);
                                    const isRec       = detail.status === 'RECEIVED';
                                    const sizeTotals  = sizes.map(s => groups.reduce((n, g) => n + (g.sizes[s] || 0), 0));
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
                                                                    <td key={s} className="px-2 py-2 text-center font-bold text-slate-700">{g.sizes[s] ?? 0}</td>
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
                                                            <td colSpan={2} className="px-3 py-2 font-black text-slate-500 uppercase tracking-widest text-[10px] text-right">Total</td>
                                                            {sizeTotals.map((n, i) => (
                                                                <td key={i} className="px-2 py-2 text-center font-black text-slate-800">{n}</td>
                                                            ))}
                                                            <td className="px-3 py-2 text-right font-black text-slate-900">{detail.items.length}</td>
                                                            {isRec && <>
                                                                <td className="px-2 py-2 text-right font-black text-emerald-700">{groups.reduce((n,g)=>n+g.approved,0)}</td>
                                                                <td className="px-2 py-2 text-right font-black text-rose-700">{groups.reduce((n,g)=>n+g.rejected,0)}</td>
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

            {showReceive && detail && (
                <ReceiveModal
                    detail={detail}
                    onClose={() => setShowReceive(false)}
                    onReceived={handleReceived}
                />
            )}
        </>
    );
};

// ── ChallanRow ─────────────────────────────────────────────────────────────────

const ChallanRow = ({ challan, onViewDetail }) => {
    const cfg  = CHALLAN_STATUS[challan.status] ?? CHALLAN_STATUS.DRAFT;
    const Icon = cfg.Icon;
    return (
        <button
            onClick={() => onViewDetail(challan.id)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition text-left active:scale-[0.99]"
        >
            <div className="flex items-center gap-3">
                <FileText size={14} className="text-slate-400 shrink-0" />
                <div>
                    <div className="text-sm font-black text-slate-700">
                        {challan.challan_number ?? `Challan #${challan.id}`}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                        {challan.vendor_name ?? 'Vendor'} · {challan.total_items ?? 0} garments
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest ${cfg.cls}`}>
                    <Icon size={9} /> {cfg.label}
                </span>
                <span className="text-[10px] text-slate-400 font-bold">View →</span>
            </div>
        </button>
    );
};

// ── BatchChallanGroup ──────────────────────────────────────────────────────────

const BatchChallanGroup = ({ batchId, batchCode, productName, challans, onViewDetail }) => {
    const [expanded, setExpanded] = useState(true);
    const counts = challans.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {});
    const hasActive = counts.SENT > 0;

    return (
        <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${hasActive ? 'border-amber-300' : 'border-slate-200'}`}>
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition text-left"
            >
                <div className="flex items-center gap-3">
                    <Package size={15} className={hasActive ? 'text-amber-500' : 'text-slate-400'} />
                    <div>
                        <span className="text-sm font-black text-slate-800">
                            #{batchId} · <span className="font-mono">{batchCode}</span>
                        </span>
                        <span className="text-xs text-slate-400 block mt-0.5">{productName}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {Object.entries(counts).map(([status, n]) => {
                        const c = CHALLAN_STATUS[status];
                        return c ? (
                            <span key={status} className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${c.cls}`}>
                                {n} {c.label}
                            </span>
                        ) : null;
                    })}
                    {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
            </button>

            {expanded && (
                <div className="border-t border-slate-100 px-5 py-4 space-y-2.5">
                    {challans.map(c => (
                        <ChallanRow key={c.id} challan={c} onViewDetail={onViewDetail} />
                    ))}
                </div>
            )}
        </div>
    );
};

// ── JobWorkPage ────────────────────────────────────────────────────────────────

const JobWorkPage = () => {
    const [challansMap, setChallansMap]         = useState({});  // keyed by batch_id
    const [batchMeta,   setBatchMeta]           = useState({});  // batch_id → { batch_code, product_name }
    const [isLoading,   setIsLoading]           = useState(true);
    const [error,       setError]               = useState('');
    const [viewingChallanId, setViewingChallanId] = useState(null);

    const loadData = useCallback(async () => {
        setIsLoading(true); setError('');
        try {
            const res         = await jobWorkApi.getChallans();
            const allChallans = res.data || [];
            const map = {}, meta = {};
            allChallans.forEach(c => {
                const bid = c.production_batch_id;
                if (!map[bid])  map[bid]  = [];
                if (!meta[bid]) meta[bid] = { batch_code: c.batch_code, product_name: c.product_name };
                map[bid].push(c);
            });
            setChallansMap(map);
            setBatchMeta(meta);
        } catch {
            setError('Failed to load job work data.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Active challans (SENT = out with vendor)
    const activeChallans = useMemo(() =>
        Object.values(challansMap).flat().filter(c => c.status === 'SENT'),
    [challansMap]);

    // Batch groups sorted: active first
    const batchGroups = useMemo(() => {
        return Object.entries(challansMap)
            .map(([batchId, challans]) => ({
                batchId: Number(batchId),
                ...batchMeta[batchId],
                challans,
                hasActive: challans.some(c => c.status === 'SENT'),
            }))
            .sort((a, b) => (b.hasActive ? 1 : 0) - (a.hasActive ? 1 : 0));
    }, [challansMap, batchMeta]);

    const totalPending = activeChallans.length;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-black text-slate-800 tracking-tight">Job Work Challans</h1>
                    <p className="text-sm text-slate-400 mt-0.5">Manage external vendor challans — receive and verify returned goods.</p>
                </div>
                <button
                    onClick={loadData}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50 bg-white"
                >
                    <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {/* Active alert banner */}
            {!isLoading && totalPending > 0 && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-4 flex items-center gap-3">
                    <Truck size={18} className="text-amber-600 shrink-0" />
                    <div>
                        <div className="text-sm font-black text-amber-800">
                            {totalPending} challan{totalPending > 1 ? 's' : ''} currently with vendors
                        </div>
                        <div className="text-xs text-amber-600 mt-0.5">
                            Click any <span className="font-bold">Active</span> challan below and press <span className="font-bold">Receive</span> to record incoming goods.
                        </div>
                    </div>
                </div>
            )}

            {/* States */}
            {isLoading && (
                <div className="flex items-center justify-center py-16 text-slate-400">
                    <Loader size={20} className="animate-spin mr-2" /> Loading…
                </div>
            )}
            {!isLoading && error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertCircle size={15} /> {error}
                </div>
            )}
            {!isLoading && !error && batchGroups.length === 0 && (
                <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                    <FileText size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-bold">No job work challans found.</p>
                </div>
            )}

            {!isLoading && !error && batchGroups.map(({ batchId, batch_code, product_name, challans }) => (
                <BatchChallanGroup
                    key={batchId}
                    batchId={batchId}
                    batchCode={batch_code}
                    productName={product_name}
                    challans={challans}
                    onViewDetail={setViewingChallanId}
                />
            ))}

            {viewingChallanId && (
                <ChallanDetailModal
                    challanId={viewingChallanId}
                    onClose={() => setViewingChallanId(null)}
                    onReceived={loadData}
                />
            )}
        </div>
    );
};

export default JobWorkPage;
