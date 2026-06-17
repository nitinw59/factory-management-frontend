import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Truck, Search, Loader2, AlertCircle, Package, RefreshCw, X,
    CalendarDays, ShoppingCart, ChevronDown, ChevronUp,
    Receipt, Clock, User, FileText,
} from 'lucide-react';
import { dispatchManagerApi } from '../../api/dispatchManagerApi';
import BatchDispatchModal from './BatchDispatchModal';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
};

const STAGE_LABELS = {
    cutting:         'Cut',
    preparatory:     'Prep',
    sewing:          'Sew',
    sewing_assembly: 'Assmbly',
    'POST ASSEMBLY': 'Post',
};

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
    const map = {
        OPEN:        'bg-blue-100    text-blue-700    border-blue-200',
        PARTIAL:     'bg-amber-100   text-amber-700   border-amber-200',
        CLOSED:      'bg-emerald-100 text-emerald-700 border-emerald-200',
        SHIPPED:     'bg-indigo-100  text-indigo-700  border-indigo-200',
        IN_PROGRESS: 'bg-indigo-100  text-indigo-700  border-indigo-200',
        NOT_STARTED: 'bg-gray-100    text-gray-500    border-gray-200',
        PENDING:     'bg-yellow-50   text-yellow-700  border-yellow-200',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${map[status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {status?.replace(/_/g, ' ') ?? 'N/A'}
        </span>
    );
};

// ─── STAGE PIPELINE ───────────────────────────────────────────────────────────

const StagePipeline = ({ stages, totalCut }) => {
    if (!stages?.length) return null;
    return (
        <div className="flex items-center gap-0 flex-wrap">
            {stages.map((s, i) => {
                const label   = STAGE_LABELS[s.line_type] || s.line_type;
                const pct     = totalCut > 0 ? Math.round((s.approved / totalCut) * 100) : 0;
                const done    = pct >= 100;
                const partial = pct > 0 && !done;
                return (
                    <div key={s.sequence_no} className="flex items-center">
                        <div className={`flex flex-col items-center px-2 py-1 rounded-lg min-w-[44px] ${
                            done    ? 'bg-emerald-50 border border-emerald-200' :
                            partial ? 'bg-amber-50   border border-amber-200'   :
                                      'bg-slate-50   border border-slate-200'
                        }`}>
                            <span className={`text-[7px] font-black uppercase tracking-wide leading-none mb-0.5 ${
                                done ? 'text-emerald-500' : partial ? 'text-amber-500' : 'text-slate-400'
                            }`}>
                                {label}
                            </span>
                            <span className={`text-[11px] font-black tabular-nums leading-none ${
                                done ? 'text-emerald-700' : partial ? 'text-amber-700' : 'text-slate-400'
                            }`}>
                                {s.approved.toLocaleString()}
                            </span>
                        </div>
                        {i < stages.length - 1 && (
                            <div className={`w-3 h-px mx-0.5 ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ─── RECEIPT LIST ─────────────────────────────────────────────────────────────

const ReceiptList = ({ receipts }) => {
    if (!receipts?.length) return (
        <p className="text-[10px] text-slate-400 italic py-1">No receipts recorded.</p>
    );
    return (
        <div className="space-y-2">
            {receipts.map(r => (
                <div key={r.receipt_id} className="flex gap-3 bg-white rounded-xl border border-slate-100 px-3 py-2.5 shadow-sm">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Receipt size={13} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono font-black text-[10px] text-slate-700">{r.receipt_number}</span>
                            <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded tabular-nums">
                                {(r.quantity_dispatched || 0).toLocaleString()} pcs
                            </span>
                        </div>
                        <div className="flex items-center gap-3 text-[9px] text-slate-400 flex-wrap">
                            <span className="flex items-center gap-1"><Clock size={8} /> {fmtDate(r.dispatch_date)}</span>
                            {r.dispatched_by && <span className="flex items-center gap-1"><User size={8} /> {r.dispatched_by}</span>}
                        </div>
                        {r.notes && (
                            <p className="text-[9px] text-slate-500 mt-1.5 flex items-start gap-1">
                                <FileText size={8} className="mt-0.5 shrink-0 text-slate-400" />
                                {r.notes}
                            </p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

// ─── BATCH CARD ───────────────────────────────────────────────────────────────

const BatchCard = ({ batch, onOpenDispatch }) => {
    const [showReceipts, setShowReceipts] = useState(false);

    const q        = batch.quantities     || {};
    const ds       = batch.dispatch_summary || {};
    const ss       = batch.stage_summary  || {};
    const receipts = ds.receipts          || [];

    const dispatched  = ds.total_dispatched || 0;
    const totalCut    = q.total_cut        || 0;
    const dispatchPct = totalCut > 0 ? Math.min(100, Math.round((dispatched / totalCut) * 100)) : 0;

    const accent = ds.status === 'CLOSED'  ? { l: 'border-l-emerald-400', hdr: 'bg-emerald-50/70',  border: 'border-emerald-200' }
        :          ds.status === 'PARTIAL' ? { l: 'border-l-amber-400',   hdr: 'bg-amber-50/70',    border: 'border-amber-200'   }
        :                                    { l: 'border-l-blue-400',     hdr: 'bg-blue-50/70',     border: 'border-blue-200'    };

    return (
        <div className={`bg-white rounded-2xl border ${accent.border} border-l-4 ${accent.l} shadow-sm hover:shadow-md transition-shadow overflow-hidden`}>

            {/* Card header */}
            <div className={`${accent.hdr} px-4 py-3 flex items-start justify-between gap-3`}>
                <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-mono font-black text-slate-800 text-xs">{batch.batch_code}</span>
                        <StatusBadge status={ds.status} />
                    </div>
                    <p className="text-xs font-semibold text-slate-700 truncate">{batch.product?.name || '—'}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                        {batch.purchase_order?.po_code}
                        {batch.purchase_order?.po_code && ' · '}
                        Batch #{batch.batch_index}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-lg font-black text-slate-800 leading-none tabular-nums">
                        {dispatched.toLocaleString()}
                        <span className="text-xs font-bold text-slate-400"> / {totalCut.toLocaleString()}</span>
                    </p>
                    <p className="text-[9px] text-slate-400 font-bold mt-0.5">pcs dispatched</p>
                    {ds.last_dispatch_date && (
                        <p className="text-[9px] text-slate-400 mt-0.5 tabular-nums">Last: {fmtDate(ds.last_dispatch_date)}</p>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="px-4 py-3 space-y-3">

                {/* Dispatch progress bar */}
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[8px] font-bold uppercase text-slate-400 tracking-wider">Dispatch progress</span>
                        <span className="text-[9px] font-black text-slate-600 tabular-nums">{dispatchPct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${dispatchPct === 100 ? 'bg-emerald-500' : 'bg-indigo-400'}`}
                            style={{ width: `${dispatchPct}%` }}
                        />
                    </div>
                </div>

                {/* Production pipeline */}
                {q.stage_counts?.length > 0 && (
                    <div>
                        <p className="text-[8px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Pipeline · {ss.completed || 0}/{ss.total || 0} stages</p>
                        <div className="overflow-x-auto pb-0.5">
                            <StagePipeline stages={q.stage_counts} totalCut={totalCut} />
                        </div>
                    </div>
                )}

                {/* Receipts section */}
                <div className="border-t border-slate-100 pt-3">
                    <button
                        onClick={() => setShowReceipts(s => !s)}
                        className="flex items-center justify-between w-full text-left group"
                    >
                        <div className="flex items-center gap-2">
                            <Receipt size={11} className="text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-600">
                                {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
                            </span>
                            {receipts.length > 0 && (
                                <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded tabular-nums">
                                    {receipts.reduce((s, r) => s + (r.quantity_dispatched || 0), 0).toLocaleString()} pcs
                                </span>
                            )}
                        </div>
                        {receipts.length > 0 && (
                            showReceipts
                                ? <ChevronUp  size={12} className="text-slate-400" />
                                : <ChevronDown size={12} className="text-slate-400" />
                        )}
                    </button>
                    {showReceipts && (
                        <div className="mt-2">
                            <ReceiptList receipts={receipts} />
                        </div>
                    )}
                </div>
            </div>

            {/* Card footer */}
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[9px] text-slate-400">
                    {ds.is_closed
                        ? <span className="text-emerald-600 font-bold">✓ Fully dispatched</span>
                        : <span className="font-medium tabular-nums">{(totalCut - dispatched).toLocaleString()} pcs remaining</span>
                    }
                </div>
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

// ─── SO SECTION ───────────────────────────────────────────────────────────────

const SOSection = ({ so, batches, onOpenDispatch }) => {
    const allClosed = batches.every(b => b.dispatch_summary?.is_closed);
    const [open, setOpen] = useState(!allClosed);

    const totalCut        = batches.reduce((s, b) => s + (b.quantities?.total_cut                    || 0), 0);
    const totalDispatched = batches.reduce((s, b) => s + (b.dispatch_summary?.total_dispatched        || 0), 0);
    const anyPartial      = batches.some(b  => b.dispatch_summary?.status === 'PARTIAL');
    const pct             = totalCut > 0 ? Math.min(100, Math.round((totalDispatched / totalCut) * 100)) : 0;

    const hdrCls = allClosed
        ? 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50'
        : anyPartial
        ? 'border-amber-200  bg-amber-50/60  hover:bg-amber-50'
        : 'border-blue-200   bg-blue-50/60   hover:bg-blue-50';

    return (
        <div className="mb-6">
            <button
                onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border ${hdrCls} text-left transition-all mb-3`}
            >
                <ShoppingCart size={15} className="text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{so.order_number || '—'}</span>
                        {so.buyer_po_number && (
                            <span className="text-[10px] font-mono text-slate-400 bg-white/70 border border-slate-200 px-1.5 py-0.5 rounded">
                                {so.buyer_po_number}
                            </span>
                        )}
                        {so.status && <StatusBadge status={so.status} />}
                    </div>
                    {so.customer && <p className="text-[10px] text-slate-500 mt-0.5">{so.customer}</p>}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right hidden sm:block">
                        <p className="text-xs font-black text-slate-700 tabular-nums">
                            {totalDispatched.toLocaleString()} / {totalCut.toLocaleString()} pcs
                        </p>
                        <p className="text-[9px] font-bold text-slate-400">
                            {pct}% dispatched · {batches.length} batch{batches.length !== 1 ? 'es' : ''}
                        </p>
                    </div>
                    {open
                        ? <ChevronUp   size={14} className="text-slate-400" />
                        : <ChevronDown size={14} className="text-slate-400" />
                    }
                </div>
            </button>

            {open && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pl-2">
                    {batches.map(b => (
                        <BatchCard key={b.id} batch={b} onOpenDispatch={onOpenDispatch} />
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
    { label: 'All',     value: 'ALL'     },
    { label: 'Open',    value: 'OPEN'    },
    { label: 'Partial', value: 'PARTIAL' },
    { label: 'Closed',  value: 'CLOSED'  },
];

const PERIOD_OPTS = [
    { label: 'Today',      value: 'today'  },
    { label: 'This Week',  value: 'week'   },
    { label: 'This Month', value: 'month'  },
    { label: 'All Time',   value: 'all'    },
    { label: 'Custom',     value: 'custom' },
];

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function DispatchDashboardPage() {
    const [batches,      setBatches]      = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);
    const [search,       setSearch]       = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [activeBatch,  setActiveBatch]  = useState(null);
    const [period,       setPeriod]       = useState('all');
    const [customFrom,   setCustomFrom]   = useState('');
    const [customTo,     setCustomTo]     = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await dispatchManagerApi.getDashboardData();
            const raw = res.data?.data || res.data || [];
            setBatches(raw);
        } catch (e) {
            setError('Failed to load dispatch data.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const periodBatches = useMemo(() => {
        if (period === 'all') return batches;
        const now = new Date();
        let start, end;
        if      (period === 'today') { start = new Date(now); start.setHours(0, 0, 0, 0); }
        else if (period === 'week')  { start = new Date(now); start.setDate(start.getDate() - start.getDay()); start.setHours(0, 0, 0, 0); }
        else if (period === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
        else if (period === 'custom') {
            if (customFrom) { start = new Date(customFrom); start.setHours(0, 0, 0, 0); }
            if (customTo)   { end   = new Date(customTo);   end.setHours(23, 59, 59, 999); }
            if (!start && !end) return batches;
        }
        return batches.filter(b => {
            const date = b.dispatch_summary?.closed_at || b.created_at;
            if (!date) return false;
            const d = new Date(date);
            if (start && d < start) return false;
            if (end   && d > end)   return false;
            return true;
        });
    }, [batches, period, customFrom, customTo]);

    const filtered = useMemo(() => {
        let result = periodBatches;
        if (statusFilter !== 'ALL') {
            result = result.filter(b => b.dispatch_summary?.status === statusFilter);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(b =>
                String(b.id || '').includes(q) ||
                (b.batch_code                || '').toLowerCase().includes(q) ||
                (b.product?.name             || '').toLowerCase().includes(q) ||
                (b.sales_order?.order_number || '').toLowerCase().includes(q) ||
                (b.sales_order?.customer     || '').toLowerCase().includes(q) ||
                (b.purchase_order?.po_code   || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [periodBatches, search, statusFilter]);

    const soGroups = useMemo(() => {
        const map = new Map();
        filtered.forEach(b => {
            const key = b.sales_order?.order_number || '__unknown__';
            if (!map.has(key)) map.set(key, { so: b.sales_order || { order_number: key }, batches: [] });
            map.get(key).batches.push(b);
        });
        return [...map.values()];
    }, [filtered]);

    const kpi = useMemo(() => ({
        open:            periodBatches.filter(b => !b.dispatch_summary?.is_closed).length,
        partial:         periodBatches.filter(b =>  b.dispatch_summary?.status === 'PARTIAL').length,
        closed:          periodBatches.filter(b =>  b.dispatch_summary?.is_closed).length,
        totalDispatched: periodBatches.reduce((s, b) => s + (b.dispatch_summary?.total_dispatched || 0), 0),
    }), [periodBatches]);

    const counts = useMemo(() => ({
        total:   batches.length,
        OPEN:    batches.filter(b => b.dispatch_summary?.status === 'OPEN').length,
        PARTIAL: batches.filter(b => b.dispatch_summary?.status === 'PARTIAL').length,
        CLOSED:  batches.filter(b => b.dispatch_summary?.is_closed).length,
    }), [batches]);

    return (
        <div className="min-h-screen bg-slate-50">

            {/* ── Header ── */}
            <div className="bg-white border-b border-slate-200 px-6 py-5 sticky top-0 z-20">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Truck className="text-indigo-600" size={22} />
                        <h1 className="text-xl font-extrabold text-slate-800">Dispatch Portal</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Period selector */}
                        <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl px-1 py-1">
                            <CalendarDays size={13} className="text-slate-400 ml-1 shrink-0" />
                            {PERIOD_OPTS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setPeriod(opt.value)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        period === opt.value
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-slate-500 hover:bg-white hover:text-slate-800'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                            {period === 'custom' && (
                                <>
                                    <div className="w-px h-4 bg-slate-300 mx-0.5" />
                                    <input
                                        type="date" value={customFrom}
                                        onChange={e => setCustomFrom(e.target.value)}
                                        className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-400"
                                    />
                                    <span className="text-[10px] font-bold text-slate-400">→</span>
                                    <input
                                        type="date" value={customTo} min={customFrom}
                                        onChange={e => setCustomTo(e.target.value)}
                                        className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-400"
                                    />
                                </>
                            )}
                        </div>
                        <button
                            onClick={fetchData} disabled={loading}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
                        </button>
                    </div>
                </div>

                {/* KPI strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                        { label: 'Open Batches',     value: kpi.open,                                sub: 'open + partial',   bg: 'bg-blue-50',    val: 'text-blue-700',    border: 'border-blue-200'    },
                        { label: 'Partial Batches',  value: kpi.partial,                             sub: 'in progress',      bg: 'bg-amber-50',   val: 'text-amber-700',   border: 'border-amber-200'   },
                        { label: 'Closed Batches',   value: kpi.closed,                              sub: 'fully dispatched', bg: 'bg-emerald-50', val: 'text-emerald-700', border: 'border-emerald-200' },
                        { label: 'Pieces Dispatched', value: kpi.totalDispatched.toLocaleString(),   sub: 'across all batches', bg: 'bg-indigo-50', val: 'text-indigo-700',  border: 'border-indigo-200' },
                    ].map(c => (
                        <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-3`}>
                            <p className={`text-2xl font-black leading-none tabular-nums ${c.val}`}>{c.value}</p>
                            <p className="text-[9px] font-bold uppercase text-slate-400 mt-1 tracking-wider">{c.label}</p>
                            <p className="text-[9px] text-slate-400">{c.sub}</p>
                        </div>
                    ))}
                </div>

                {/* Search + status pills */}
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                        <input
                            type="text" placeholder="Search batch, SO, product, customer…"
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none w-72"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                        {STATUS_FILTERS.map(f => {
                            const count = f.value === 'ALL' ? counts.total : (counts[f.value] ?? 0);
                            return (
                                <button
                                    key={f.value}
                                    onClick={() => setStatusFilter(f.value)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                                        statusFilter === f.value
                                            ? 'bg-white shadow-sm text-slate-800 border border-slate-200'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {f.label}
                                    <span className="text-[9px] font-black text-slate-400 tabular-nums">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                    <span className="ml-auto text-xs text-slate-400 font-medium">
                        {soGroups.length} order{soGroups.length !== 1 ? 's' : ''} · {filtered.length} batch{filtered.length !== 1 ? 'es' : ''}
                    </span>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="p-6">
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="animate-spin h-8 w-8 text-indigo-500" />
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm font-medium">
                        <AlertCircle size={16} /> {error}
                    </div>
                ) : soGroups.length === 0 ? (
                    <div className="flex flex-col items-center py-24 gap-3 text-slate-400">
                        <Package size={40} />
                        <p className="text-sm font-bold">No batches found</p>
                        {(search || statusFilter !== 'ALL') && (
                            <button
                                onClick={() => { setSearch(''); setStatusFilter('ALL'); }}
                                className="text-xs font-bold text-indigo-600 hover:underline"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                ) : (
                    soGroups.map(({ so, batches: sb }) => (
                        <SOSection
                            key={so.order_number || '__unknown__'}
                            so={so}
                            batches={sb}
                            onOpenDispatch={(id, code) => setActiveBatch({ id, code })}
                        />
                    ))
                )}
            </div>

            {/* ── Modal ── */}
            {activeBatch && (
                <BatchDispatchModal
                    batchId={activeBatch.id}
                    batchCode={activeBatch.code}
                    onClose={() => { setActiveBatch(null); fetchData(); }}
                    canCreateDispatch={true}
                    canCloseBatch={true}
                />
            )}
        </div>
    );
}
