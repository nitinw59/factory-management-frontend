import React, { useState, useEffect } from 'react';
import {
    X, Loader2, CheckCircle2, Clock, AlertCircle, Package,
    Layers, Scissors, Truck, ChevronDown, ChevronUp,
    BarChart2, FileText, AlertTriangle, Box
} from 'lucide-react';
import { productionManagerApi } from '../../api/productionManagerApi';

// ─── SHARED ───────────────────────────────────────────────────────────────────

const Spinner = () => (
    <div className="flex justify-center items-center h-48">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-500" />
    </div>
);

const SectionEmpty = ({ label }) => (
    <p className="text-slate-400 italic text-sm text-center py-8">{label}</p>
);

const StatusBadge = ({ status }) => {
    const map = {
        COMPLETED:   'bg-emerald-100 text-emerald-700 border-emerald-200',
        IN_PROGRESS: 'bg-indigo-100  text-indigo-700  border-indigo-200',
        PENDING:     'bg-yellow-50   text-yellow-700   border-yellow-200',
        NOT_STARTED: 'bg-gray-100    text-gray-500     border-gray-200',
        DRAFT:       'bg-gray-100    text-gray-500     border-gray-200',
        ISSUED:      'bg-amber-100   text-amber-700    border-amber-200',
        DISPATCHED:  'bg-purple-100  text-purple-700   border-purple-200',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${map[status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {status ? status.replace(/_/g, ' ') : 'N/A'}
        </span>
    );
};

const TabBtn = ({ label, icon: Icon, active, onClick, count }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
        }`}
    >
        <Icon size={13} />
        {label}
        {count != null && (
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                {count}
            </span>
        )}
    </button>
);

const InfoGrid = ({ items }) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map(({ label, value }) => (
            <div key={label}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-slate-700">{value ?? '—'}</p>
            </div>
        ))}
    </div>
);

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────

const ProgressBar = ({ done, total, color = 'bg-indigo-500' }) => {
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className={`${color} h-full rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] font-bold text-slate-500 w-14 text-right shrink-0">
                {done}/{total} ({pct}%)
            </span>
        </div>
    );
};

// ─── TAB: OVERVIEW ────────────────────────────────────────────────────────────

const OverviewTab = ({ data }) => {
    const h = data.batch_header || {};
    const sr = data.size_ratios || [];
    const il = data.interlining_requirements || [];

    return (
        <div className="space-y-5">
            {/* Chain */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Production Chain</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-600">
                    {[
                        { icon: FileText,  label: h.sales_order?.order_number,  sub: 'Sales Order' },
                        { icon: Package,   label: h.purchase_order?.po_code,     sub: 'PO' },
                        { icon: Scissors,  label: h.product?.name,               sub: 'Product' },
                        { icon: Box,       label: h.id,                  sub: 'Batch' },
                    ].map(({ icon: Icon, label, sub }, i) => (
                        <React.Fragment key={sub}>
                            {i > 0 && <span className="text-slate-300">→</span>}
                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
                                <Icon size={11} className="text-indigo-400 shrink-0" />
                                <div>
                                    <p className="text-[10px] text-slate-400 leading-none">{sub}</p>
                                    <p className="font-bold text-slate-700 text-xs">{label ?? '—'}</p>
                                </div>
                            </div>
                        </React.Fragment>
                    ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-200">
                    <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Customer</p>
                        <p className="text-sm font-semibold text-slate-700">{h.sales_order?.customer?.name ?? h.customer_name ?? '—'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Supplier</p>
                        <p className="text-sm font-semibold text-slate-700">{h.purchase_order?.supplier?.name ?? h.supplier_name ?? '—'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Status</p>
                        <StatusBadge status={h.batch_status || h.status} />
                    </div>
                </div>
            </div>

            {/* Size Ratios */}
            {sr.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Size Ratios</p>
                    <div className="flex flex-wrap gap-2">
                        {sr.map(({ size, ratio }) => (
                            <div key={size} className="flex flex-col items-center bg-indigo-50 border border-indigo-100 rounded-lg overflow-hidden min-w-[3rem]">
                                <span className="w-full text-center bg-indigo-100 text-indigo-800 text-[9px] font-bold py-0.5">{size}</span>
                                <span className="text-indigo-900 font-black text-sm py-1.5">{ratio}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Interlining */}
            {il.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Interlining Requirements</p>
                    <div className="space-y-2">
                        {il.map((req, i) => {
                            const fulfilled = req.fulfilled_meters ?? 0;
                            const required  = parseFloat(req.required_meters) || 0;
                            return (
                                <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-xs font-bold text-slate-700">{req.color_name ?? `Color ${req.interlining_color_id}`}</span>
                                        <span className="text-[10px] text-slate-500">{fulfilled}m / {required}m required</span>
                                    </div>
                                    <ProgressBar done={fulfilled} total={required} color="bg-amber-400" />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── TAB: CYCLE STAGES ────────────────────────────────────────────────────────

const stageBarColor = (status) => {
    if (status === 'COMPLETED')   return 'bg-emerald-500';
    if (status === 'IN_PROGRESS') return 'bg-indigo-500';
    return 'bg-slate-200';
};

const CycleStagesTab = ({ stages }) => {
    if (!stages?.length) return <SectionEmpty label="No production cycles recorded." />;

    return (
        <div className="space-y-3">
            {stages.map((stage, idx) => {
                const prog     = stage.progress || {};
                const tracking = stage.tracking_data;
                const status   = prog.status || (stage.assigned_line_id ? 'PENDING' : 'NOT_STARTED');

                // Determine done/total from tracking stats or progress fields
                const total = tracking?.stats?.total ?? prog.total_pieces ?? 0;
                const done  = tracking?.stats?.passed ?? tracking?.stats?.completed ??
                              (status === 'COMPLETED' ? total : 0);

                const startedAt   = prog.started_at   ? new Date(prog.started_at).toLocaleString()   : null;
                const completedAt = prog.completed_at ? new Date(prog.completed_at).toLocaleString() : null;

                return (
                    <div key={stage.flow_id ?? idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">
                                        #{idx + 1}
                                    </span>
                                    <span className="text-sm font-bold text-slate-800">
                                        {stage.line_type_name ?? stage.stage_name ?? `Stage ${idx + 1}`}
                                    </span>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    {stage.line_name ? `Line: ${stage.line_name}` : 'No line assigned'}
                                    {stage.processing_mode && ` · Mode: ${stage.processing_mode}`}
                                </p>
                            </div>
                            <StatusBadge status={status} />
                        </div>

                        {/* Progress bar */}
                        <ProgressBar done={done} total={total || 1} color={stageBarColor(status)} />

                        {/* Tracking breakdown */}
                        {tracking?.breakdown?.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                                {tracking.breakdown.map((item, bi) => (
                                    <div key={bi} className="flex flex-col items-center bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 min-w-[4rem]">
                                        <span className="text-base font-black text-slate-800">{item.count ?? item.value ?? 0}</span>
                                        <span className="text-[9px] text-slate-400 font-bold uppercase">{item.label ?? item.status ?? `Cat ${bi}`}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Timeline */}
                        {(startedAt || completedAt) && (
                            <div className="flex gap-4 mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                                {startedAt   && <span><span className="font-bold">Started:</span> {startedAt}</span>}
                                {completedAt && <span><span className="font-bold">Completed:</span> {completedAt}</span>}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ─── TAB: ROLLS ───────────────────────────────────────────────────────────────

const RollsTab = ({ rolls }) => {
    const [open, setOpen] = useState(new Set());
    const toggle = (id) => setOpen(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

    if (!rolls?.length) return <SectionEmpty label="No rolls assigned to this batch." />;

    return (
        <div className="space-y-2">
            {rolls.map((roll) => {
                const rollId  = roll.roll_id ?? roll.id;
                const isOpen  = open.has(rollId);
                const shortage = roll.shortage;

                return (
                    <div key={rollId} className="border border-slate-200 rounded-xl overflow-hidden">
                        <button
                            onClick={() => toggle(rollId)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <span className="font-mono font-bold text-slate-700 text-sm">
                                    Roll #{roll.roll_code ?? rollId}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                    {roll.fabric_type} · {roll.fabric_color}
                                </span>
                                {shortage?.has_shortage && (
                                    <span className="flex items-center gap-0.5 text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                                        <AlertTriangle size={9} /> Shortage
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] text-slate-400">{roll.meters ?? roll.meter ?? '—'}m · {roll.lays_count ?? 0} lays</span>
                                {isOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                            </div>
                        </button>
                        {isOpen && (
                            <div className="px-4 py-3 bg-white grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                {[
                                    { label: 'Meters',       value: `${roll.meters ?? roll.meter ?? '—'}m` },
                                    { label: 'Lays',         value: roll.lays_count ?? '—' },
                                    { label: 'End Bits',     value: roll.end_bits   ?? '—' },
                                    { label: 'Cut Pieces',   value: roll.cut_pieces_count ?? '—' },
                                    { label: 'Fabric Type',  value: roll.fabric_type  ?? '—' },
                                    { label: 'Fabric Color', value: roll.fabric_color ?? '—' },
                                    shortage?.has_shortage && { label: 'Shortage', value: `${shortage.shortage_meters}m` },
                                ].filter(Boolean).map(({ label, value }) => (
                                    <div key={label}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
                                        <p className="font-semibold text-slate-700">{value}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ─── TAB: CUT PIECES ──────────────────────────────────────────────────────────

const LIFECYCLE_COLS = ['at_cut', 'numbered', 'prepared', 'sewn', 'assembled', 'approved', 'rejected'];

const CutPiecesTab = ({ summary }) => {
    if (!summary?.length) return <SectionEmpty label="No cut piece data available." />;

    return (
        <div className="space-y-4">
            {summary.map((rollSummary, ri) => (
                <div key={ri} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                        <span className="font-mono font-bold text-slate-700 text-sm">Roll #{rollSummary.roll_id}</span>
                    </div>
                    {(rollSummary.parts || []).map((part, pi) => (
                        <div key={pi} className="px-4 py-3 border-b border-slate-100 last:border-b-0">
                            <p className="text-xs font-bold text-slate-600 mb-2">{part.part_name}</p>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-[10px]">
                                    <thead>
                                        <tr className="text-slate-400 border-b border-slate-100">
                                            <th className="text-left py-1 pr-3 font-bold">Size</th>
                                            {LIFECYCLE_COLS.map(c => (
                                                <th key={c} className="text-center py-1 px-2 font-bold uppercase">{c.replace('_', ' ')}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(part.sizes || []).map((sz, si) => (
                                            <tr key={si} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="py-1.5 pr-3 font-bold text-slate-700">{sz.size}</td>
                                                {LIFECYCLE_COLS.map(col => (
                                                    <td key={col} className="text-center py-1.5 px-2">
                                                        <span className={`font-bold ${sz[col] > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                                                            {sz[col] ?? 0}
                                                        </span>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

// ─── TAB: DEFECTS ─────────────────────────────────────────────────────────────

const DefectSection = ({ title, defects }) => {
    if (!defects) return null;
    const cats    = defects.by_category || [];
    const records = defects.records     || [];
    const total   = cats.reduce((s, c) => s + (c.count || 0), 0);

    return (
        <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-600">{title}</p>
                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">{total} total</span>
            </div>
            {cats.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-3">
                    {cats.map((cat, i) => (
                        <div key={i} className="bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 text-center">
                            <p className="font-black text-red-700 text-base">{cat.count}</p>
                            <p className="text-[9px] text-red-500 font-bold uppercase">{cat.category ?? cat.defect_type ?? `Type ${i + 1}`}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-slate-400 italic text-xs mb-3">No defect categories recorded.</p>
            )}
            {records.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="min-w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                            <tr>
                                <th className="px-3 py-2 text-left">Type</th>
                                <th className="px-3 py-2 text-left">Description</th>
                                <th className="px-3 py-2 text-left">Stage</th>
                                <th className="px-3 py-2 text-left">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {records.slice(0, 20).map((r, ri) => (
                                <tr key={ri} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 font-semibold text-red-700">{r.defect_type ?? r.category ?? '—'}</td>
                                    <td className="px-3 py-2 text-slate-600">{r.description ?? '—'}</td>
                                    <td className="px-3 py-2 text-slate-500">{r.stage_name ?? '—'}</td>
                                    <td className="px-3 py-2 text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {records.length > 20 && (
                        <p className="text-center text-[10px] text-slate-400 py-2 bg-slate-50">+{records.length - 20} more</p>
                    )}
                </div>
            )}
        </div>
    );
};

const DefectsTab = ({ defects }) => {
    if (!defects) return <SectionEmpty label="No defect data available." />;
    const hasAny = (defects.piece_defects?.records?.length || 0) + (defects.garment_defects?.records?.length || 0) > 0;
    if (!hasAny) return (
        <div className="flex flex-col items-center py-12 gap-2">
            <CheckCircle2 size={36} className="text-emerald-400" />
            <p className="text-emerald-600 font-bold">No defects recorded</p>
        </div>
    );
    return (
        <div>
            <DefectSection title="Piece Defects"   defects={defects.piece_defects} />
            <DefectSection title="Garment Defects" defects={defects.garment_defects} />
        </div>
    );
};

// ─── TAB: DISPATCH ────────────────────────────────────────────────────────────

const DispatchTab = ({ receipts }) => {
    if (!receipts?.length) return <SectionEmpty label="No dispatches yet." />;

    return (
        <div className="space-y-3">
            {receipts.map((receipt, ri) => (
                <div key={receipt.dispatch_id ?? ri} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                        <span className="font-bold text-slate-700 text-sm">Dispatch #{receipt.dispatch_id}</span>
                        <span className="text-[10px] text-slate-400">
                            {receipt.dispatched_at ? new Date(receipt.dispatched_at).toLocaleDateString() : '—'}
                        </span>
                    </div>
                    {(receipt.items || []).length > 0 && (
                        <table className="min-w-full text-xs">
                            <thead className="text-slate-400 font-bold uppercase text-[10px]">
                                <tr>
                                    <th className="text-left pb-1">Item</th>
                                    <th className="text-right pb-1">Qty</th>
                                    <th className="text-right pb-1">Size</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {receipt.items.map((item, ii) => (
                                    <tr key={ii}>
                                        <td className="py-1 text-slate-600">{item.product_name ?? item.description ?? '—'}</td>
                                        <td className="py-1 text-right font-bold text-slate-700">{item.quantity ?? '—'}</td>
                                        <td className="py-1 text-right text-slate-500">{item.size ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            ))}
        </div>
    );
};

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────

const TABS = [
    { key: 'overview', label: 'Overview',       icon: BarChart2  },
    { key: 'cycles',   label: 'Cycles',          icon: Layers     },
    { key: 'rolls',    label: 'Rolls',            icon: Package    },
    { key: 'pieces',   label: 'Cut Pieces',       icon: Scissors   },
    { key: 'defects',  label: 'Defects',          icon: AlertCircle},
    { key: 'dispatch', label: 'Dispatch',         icon: Truck      },
];

const BatchDrilldownModal = ({ batchId, batchCode, onClose }) => {
    const [data, setData]     = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]   = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        setLoading(true);
        productionManagerApi.getBatchDrilldownFull(batchId)
            .then(res => setData(res.data))
            .catch(err => setError(err?.response?.data?.error || err.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, [batchId]);

    const tabCount = (key) => {
        if (!data) return null;
        if (key === 'rolls')    return data.rolls?.length;
        if (key === 'cycles')   return data.cycle_stages?.length;
        if (key === 'pieces')   return data.cut_piece_summary?.length;
        if (key === 'dispatch') return data.dispatch_receipts?.length;
        if (key === 'defects') {
            const p = data.defects?.piece_defects?.records?.length   || 0;
            const g = data.defects?.garment_defects?.records?.length || 0;
            return p + g || null;
        }
        return null;
    };

    const h = data?.batch_header || {};
    const title = batchId ? `Batch: ${batchId}` : `Batch #${batchCode}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl shrink-0">
                    <div className="flex items-center gap-3">
                        <div>
                            <h3 className="font-black text-lg text-slate-800">{title}</h3>
                            {h.product?.name && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {h.product.name}
                                    {h.sales_order?.customer?.name && ` · ${h.sales_order.customer.name}`}
                                </p>
                            )}
                        </div>
                        {h.batch_status && <StatusBadge status={h.batch_status} />}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tab bar */}
                <div className="flex overflow-x-auto border-b border-slate-100 bg-white shrink-0 px-2">
                    {TABS.map(t => (
                        <TabBtn
                            key={t.key}
                            label={t.label}
                            icon={t.icon}
                            active={activeTab === t.key}
                            onClick={() => setActiveTab(t.key)}
                            count={tabCount(t.key)}
                        />
                    ))}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? <Spinner /> : error ? (
                        <div className="flex flex-col items-center py-12 gap-2 text-red-500">
                            <AlertCircle size={32} />
                            <p className="font-bold text-sm">{error}</p>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'overview' && <OverviewTab data={data} />}
                            {activeTab === 'cycles'   && <CycleStagesTab stages={data.cycle_stages} />}
                            {activeTab === 'rolls'    && <RollsTab rolls={data.rolls} />}
                            {activeTab === 'pieces'   && <CutPiecesTab summary={data.cut_piece_summary} />}
                            {activeTab === 'defects'  && <DefectsTab defects={data.defects} />}
                            {activeTab === 'dispatch' && <DispatchTab receipts={data.dispatch_receipts} />}
                        </>
                    )}
                </div>

                <div className="flex justify-end px-6 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
                    <button onClick={onClose} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold text-sm transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BatchDrilldownModal;
