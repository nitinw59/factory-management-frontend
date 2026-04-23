import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Truck, Search, Loader2, AlertCircle,
    CheckCircle2, Clock, Package, FileText,
    ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import { dispatchManagerApi } from '../../api/dispatchManagerApi';
import BatchDispatchModal from './BatchDispatchModal';

// ─── SHARED ───────────────────────────────────────────────────────────────────

const Spinner = () => (
    <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-500" />
    </div>
);

const DispatchStatusBadge = ({ status }) => {
    const map = {
        OPEN:    'bg-blue-100    text-blue-700    border-blue-200',
        PARTIAL: 'bg-amber-100   text-amber-700   border-amber-200',
        CLOSED:  'bg-emerald-100 text-emerald-700 border-emerald-200',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${map[status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {status ?? 'N/A'}
        </span>
    );
};

const PipelineProgress = ({ total, completed }) => {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-400'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-[9px] font-bold text-slate-400 w-14 shrink-0">{completed}/{total} stages</span>
        </div>
    );
};

// ─── BATCH CARD ───────────────────────────────────────────────────────────────

const BatchCard = ({ batch, onOpenDispatch }) => {
    const q  = batch.quantities || {};
    const ss = batch.stage_summary || {};

    const dispatchPct = q.total_cut > 0
        ? Math.min(100, Math.round((q.total_dispatched / q.total_cut) * 100))
        : 0;

    const borderColor =
        batch.dispatch_status === 'CLOSED'  ? 'border-l-emerald-400' :
        batch.dispatch_status === 'PARTIAL' ? 'border-l-amber-400'   :
                                              'border-l-blue-400';

    return (
        <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${borderColor} shadow-sm hover:shadow-md transition-shadow`}>
            <div className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <p className="font-mono font-black text-slate-800 text-sm">{batch.batch_code}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{batch.product?.name}</p>
                    </div>
                    <DispatchStatusBadge status={batch.dispatch_status} />
                </div>

                {/* SO + Customer */}
                <div className="text-xs text-slate-600 mb-3 space-y-0.5">
                    <p><span className="text-slate-400">SO:</span> <span className="font-semibold">{batch.sales_order?.order_number}</span>
                        {batch.sales_order?.buyer_po_number && <span className="text-slate-400 ml-1">· BPO: {batch.sales_order.buyer_po_number}</span>}
                    </p>
                    <p><span className="text-slate-400">Customer:</span> <span className="font-semibold">{batch.sales_order?.customer}</span></p>
                </div>

                {/* Quantities */}
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                    {[
                        { label: 'Cut',        value: q.total_cut,         color: 'bg-slate-50'    },
                        { label: 'Approved',   value: q.approved_garments, color: 'bg-emerald-50'  },
                        { label: 'Dispatched', value: q.total_dispatched,  color: 'bg-blue-50'     },
                        { label: 'Remaining',  value: q.remaining,         color: 'bg-amber-50'    },
                    ].map(({ label, value, color }) => (
                        <div key={label} className={`${color} rounded-lg p-1.5 text-center border border-black/5`}>
                            <p className="font-black text-slate-800 text-sm">{value ?? 0}</p>
                            <p className="text-[8px] font-bold uppercase text-slate-400">{label}</p>
                        </div>
                    ))}
                </div>

                {/* Dispatch progress bar */}
                <div className="mb-3">
                    <div className="flex justify-between text-[9px] text-slate-400 mb-1">
                        <span>Dispatch progress</span>
                        <span>{dispatchPct}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${dispatchPct === 100 ? 'bg-emerald-500' : 'bg-indigo-400'}`}
                            style={{ width: `${dispatchPct}%` }}
                        />
                    </div>
                </div>

                {/* Pipeline */}
                {ss.total > 0 && <PipelineProgress total={ss.total} completed={ss.completed} />}
            </div>

            {/* Footer actions */}
            <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between bg-slate-50 rounded-b-xl">
                <span className="text-[10px] text-slate-400 font-medium">
                    {batch.receipt_count} receipt{batch.receipt_count !== 1 ? 's' : ''}
                    {batch.is_dispatch_closed && (
                        <span className="ml-2 text-emerald-600 font-bold flex items-center gap-0.5 inline-flex">
                            <CheckCircle2 size={10} /> Closed
                        </span>
                    )}
                </span>
                <button
                    onClick={() => onOpenDispatch(batch.id, batch.batch_code)}
                    className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                    <Truck size={11} /> Manage
                </button>
            </div>
        </div>
    );
};

// ─── STATUS GROUP ─────────────────────────────────────────────────────────────

const StatusGroup = ({ title, icon: Icon, colorClass, batches, onOpenDispatch, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);

    if (!batches.length) return null;

    return (
        <div className="mb-6 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <button
                onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center justify-between px-5 py-3.5 ${colorClass} border-b border-slate-100 transition-colors`}
            >
                <div className="flex items-center gap-2">
                    <Icon size={16} className="text-slate-600" />
                    <span className="font-bold text-slate-700 text-sm">{title}</span>
                    <span className="text-[10px] font-black bg-white/80 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 shadow-sm">
                        {batches.length}
                    </span>
                </div>
                {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>
            {open && (
                <div className="p-5 bg-slate-50/50 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {batches.map(batch => (
                            <BatchCard key={batch.id} batch={batch} onOpenDispatch={onOpenDispatch} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function DispatchDashboardPage() {
    const [batches, setBatches]       = useState([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState(null);
    const [search, setSearch]         = useState('');
    const [activeBatch, setActiveBatch] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await dispatchManagerApi.getDashboardData();
            setBatches(res.data?.data || res.data || []);
        } catch (err) {
            setError('Failed to load dispatch data.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filtered = useMemo(() => {
        if (!search.trim()) return batches;
        const lower = search.toLowerCase();
        return batches.filter(b =>
            (b.batch_code               || '').toLowerCase().includes(lower) ||
            (b.product?.name            || '').toLowerCase().includes(lower) ||
            (b.sales_order?.order_number|| '').toLowerCase().includes(lower) ||
            (b.sales_order?.customer    || '').toLowerCase().includes(lower) ||
            (b.purchase_order?.po_code  || '').toLowerCase().includes(lower)
        );
    }, [batches, search]);

    const open    = filtered.filter(b => b.dispatch_status === 'OPEN');
    const partial = filtered.filter(b => b.dispatch_status === 'PARTIAL');
    const closed  = filtered.filter(b => b.dispatch_status === 'CLOSED');

    const stats = {
        total:      batches.length,
        open:       batches.filter(b => b.dispatch_status === 'OPEN').length,
        partial:    batches.filter(b => b.dispatch_status === 'PARTIAL').length,
        closed:     batches.filter(b => b.dispatch_status === 'CLOSED').length,
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Page header */}
            <div className="bg-white border-b border-slate-200 px-6 py-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Truck className="text-indigo-600" size={22} />
                        <h1 className="text-xl font-extrabold text-slate-800">Dispatch Dashboard</h1>
                    </div>
                    <button onClick={fetchData} disabled={loading} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                    {[
                        { label: 'Total Batches', value: stats.total,   color: 'text-slate-800'   },
                        { label: 'Open',          value: stats.open,    color: 'text-blue-700'    },
                        { label: 'Partial',       value: stats.partial, color: 'text-amber-700'   },
                        { label: 'Closed',        value: stats.closed,  color: 'text-emerald-700' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                            <p className={`text-2xl font-black ${color}`}>{value}</p>
                            <p className="text-[10px] font-bold uppercase text-slate-400 mt-0.5">{label}</p>
                        </div>
                    ))}
                </div>

                {/* Search */}
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search batch, SO, customer…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                    />
                </div>
            </div>

            {/* Body */}
            <div className="p-6">
                {loading ? <Spinner /> : error ? (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm font-medium">
                        <AlertCircle size={16} /> {error}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-20 gap-3 text-slate-400">
                        <Package size={40} />
                        <p className="font-bold text-lg">{search ? 'No batches match your search.' : 'No batches yet.'}</p>
                    </div>
                ) : (
                    <>
                        <StatusGroup title="Open — Awaiting First Dispatch" icon={Clock}         colorClass="bg-blue-50/70    hover:bg-blue-50"    batches={open}    onOpenDispatch={(id, code) => setActiveBatch({ id, code })} defaultOpen />
                        <StatusGroup title="Partial — In Progress"          icon={Truck}         colorClass="bg-amber-50/70   hover:bg-amber-50"   batches={partial} onOpenDispatch={(id, code) => setActiveBatch({ id, code })} defaultOpen />
                        <StatusGroup title="Closed"                         icon={CheckCircle2}  colorClass="bg-emerald-50/70 hover:bg-emerald-50" batches={closed}  onOpenDispatch={(id, code) => setActiveBatch({ id, code })} defaultOpen={false} />
                    </>
                )}
            </div>

            {activeBatch && (
                <BatchDispatchModal
                    batchId={activeBatch.id}
                    batchCode={activeBatch.code}
                    onClose={() => { setActiveBatch(null); fetchData(); }}
                />
            )}
        </div>
    );
}
