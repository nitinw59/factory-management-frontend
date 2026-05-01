import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Truck, Search, Loader2, AlertCircle,
    Package, RefreshCw, X,
    ShoppingCart, ChevronDown, ChevronUp
} from 'lucide-react';
import { dispatchManagerApi } from '../../api/dispatchManagerApi';
import BatchDispatchModal from './BatchDispatchModal';

// ─── SHARED ───────────────────────────────────────────────────────────────────

const Spinner = () => (
    <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-500" />
    </div>
);

const StatusBadge = ({ status }) => {
    const map = {
        OPEN:        'bg-blue-100    text-blue-700    border-blue-200',
        PARTIAL:     'bg-amber-100   text-amber-700   border-amber-200',
        CLOSED:      'bg-emerald-100 text-emerald-700 border-emerald-200',
        COMPLETED:   'bg-emerald-100 text-emerald-700 border-emerald-200',
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

// ─── MINI BARS ────────────────────────────────────────────────────────────────

const MiniBar = ({ value, total, colorFull, colorPartial }) => {
    const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
    return (
        <div className="flex items-center gap-1.5">
            <div className="flex-1 bg-slate-100 rounded-full h-1 overflow-hidden min-w-[48px]">
                <div
                    className={`h-full rounded-full transition-all ${pct === 100 ? colorFull : colorPartial}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-[9px] text-slate-400 font-bold whitespace-nowrap">{pct}%</span>
        </div>
    );
};

// ─── BATCH ROW ────────────────────────────────────────────────────────────────

const BatchRow = ({ batch, onOpenDispatch }) => {
    const q  = batch.quantities   || {};
    const ss = batch.stage_summary || {};

    const borderColor =
        batch.dispatch_status === 'CLOSED'  ? 'border-l-emerald-400' :
        batch.dispatch_status === 'PARTIAL' ? 'border-l-amber-400'   :
                                              'border-l-blue-400';

    return (
        <div className={`flex items-center gap-4 bg-white border border-slate-200 border-l-4 ${borderColor} rounded-xl px-4 py-3 hover:shadow-sm transition-shadow`}>

            {/* Identity */}
            <div className="min-w-[170px]">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-mono font-black text-slate-800 text-xs">BATCH #{batch.id}</span>
                    <StatusBadge status={batch.dispatch_status} />
                </div>
                <p className="text-[10px] text-slate-400 truncate max-w-[160px]">{batch.product?.name || '—'}</p>
            </div>

            {/* Pipeline stages */}
            <div className="flex-1 min-w-[110px]">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Pipeline</p>
                <MiniBar
                    value={ss.completed || 0}
                    total={ss.total || 1}
                    colorFull="bg-emerald-500"
                    colorPartial="bg-indigo-400"
                />
                <p className="text-[9px] text-slate-400 mt-0.5">{ss.completed || 0}/{ss.total || 0} stages</p>
            </div>

            {/* Quantity grid */}
            <div className="grid grid-cols-3 gap-3 min-w-[200px]">
                {[
                    { label: 'Cut',        value: q.total_cut        ?? 0 },
                    { label: 'Dispatched', value: q.total_dispatched ?? 0 },
                    { label: 'Remaining',  value: q.remaining        ?? 0 },
                ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                        <p className="font-black text-slate-800 text-sm leading-none">{value}</p>
                        <p className="text-[8px] font-bold uppercase text-slate-400 mt-0.5">{label}</p>
                    </div>
                ))}
            </div>

            {/* Dispatch progress */}
            <div className="flex-1 min-w-[90px]">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Dispatch</p>
                <MiniBar
                    value={q.total_dispatched || 0}
                    total={q.total_cut || 0}
                    colorFull="bg-emerald-500"
                    colorPartial="bg-blue-400"
                />
            </div>

            {/* Receipts */}
            <div className="text-center min-w-[44px]">
                <p className="font-black text-slate-700 text-sm leading-none">{batch.receipt_count || 0}</p>
                <p className="text-[8px] font-bold uppercase text-slate-400 mt-0.5">Receipts</p>
            </div>

            {/* Action */}
            <button
                onClick={() => onOpenDispatch(batch.id, batch.batch_code)}
                className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
                <Truck size={11} /> Manage
            </button>
        </div>
    );
};

// ─── SO GROUP ─────────────────────────────────────────────────────────────────

const SOGroup = ({ so, batches, onOpenDispatch, defaultOpen }) => {
    const [open, setOpen] = useState(defaultOpen);

    const totalDispatched = batches.reduce((s, b) => s + (b.quantities?.total_dispatched || 0), 0);
    const totalCut        = batches.reduce((s, b) => s + (b.quantities?.total_cut        || 0), 0);
    const allClosed       = batches.every(b => b.dispatch_status === 'CLOSED');
    const anyPartial      = batches.some(b  => b.dispatch_status === 'PARTIAL');
    const aggPct          = totalCut > 0 ? Math.min(100, Math.round((totalDispatched / totalCut) * 100)) : 0;

    const headerBg = allClosed ? 'bg-emerald-50/80' : anyPartial ? 'bg-amber-50/80' : 'bg-blue-50/80';

    return (
        <div className="mb-4 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <button
                onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center gap-3 px-5 py-3 ${headerBg} border-b border-slate-100 hover:brightness-95 transition-all text-left`}
            >
                <ShoppingCart size={14} className="text-slate-500 shrink-0" />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{so.order_number || 'Unknown SO'}</span>
                        {so.buyer_po_number && (
                            <span className="text-[10px] text-slate-400 font-mono bg-white/70 border border-slate-200 px-1.5 py-0.5 rounded">
                                BPO: {so.buyer_po_number}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">{so.customer || '—'}</p>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                    {/* Aggregate dispatch */}
                    <div className="text-right hidden sm:block">
                        <p className="text-xs font-black text-slate-700">{totalDispatched} / {totalCut} pcs</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{aggPct}% dispatched</p>
                    </div>

                    {/* Batch count pill */}
                    <span className="text-[10px] font-black bg-white/80 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                        {batches.length} batch{batches.length !== 1 ? 'es' : ''}
                    </span>

                    {open
                        ? <ChevronUp  size={14} className="text-slate-400" />
                        : <ChevronDown size={14} className="text-slate-400" />
                    }
                </div>
            </button>

            {open && (
                <div className="p-4 bg-slate-50/30 space-y-2">
                    {batches.map(batch => (
                        <BatchRow key={batch.id} batch={batch} onOpenDispatch={onOpenDispatch} />
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
    { label: 'All',     value: 'ALL',     color: 'text-slate-700'   },
    { label: 'Open',    value: 'OPEN',    color: 'text-blue-700'    },
    { label: 'Partial', value: 'PARTIAL', color: 'text-amber-700'   },
    { label: 'Closed',  value: 'CLOSED',  color: 'text-emerald-700' },
];

export default function DispatchDashboardPage() {
    const [batches,      setBatches]      = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);
    const [search,       setSearch]       = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [activeBatch,  setActiveBatch]  = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await dispatchManagerApi.getDashboardData();
            setBatches(res.data?.data || res.data || []);
        } catch {
            setError('Failed to load dispatch data.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filtered = useMemo(() => {
        let result = batches;
        if (statusFilter !== 'ALL') {
            result = result.filter(b => b.dispatch_status === statusFilter);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            result  = result.filter(b =>
                String(b.id                  || '').includes(q)               ||
                (b.product?.name             || '').toLowerCase().includes(q) ||
                (b.sales_order?.order_number || '').toLowerCase().includes(q) ||
                (b.sales_order?.customer     || '').toLowerCase().includes(q) ||
                (b.purchase_order?.po_code   || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [batches, search, statusFilter]);

    // Group by SO — split into active and fully-closed
    const { activeGroups, closedGroups } = useMemo(() => {
        const map = new Map();
        filtered.forEach(b => {
            const key = b.sales_order?.order_number || '__unknown__';
            if (!map.has(key)) map.set(key, { so: b.sales_order || { order_number: key }, batches: [] });
            map.get(key).batches.push(b);
        });
        const groups = [...map.values()];
        return {
            activeGroups: groups.filter(g => !g.batches.every(b => b.dispatch_status === 'CLOSED')),
            closedGroups: groups.filter(g =>  g.batches.every(b => b.dispatch_status === 'CLOSED')),
        };
    }, [filtered]);

    const counts = useMemo(() => ({
        total:   batches.length,
        open:    batches.filter(b => b.dispatch_status === 'OPEN').length,
        partial: batches.filter(b => b.dispatch_status === 'PARTIAL').length,
        closed:  batches.filter(b => b.dispatch_status === 'CLOSED').length,
        pieces:  batches.reduce((s, b) => s + (b.quantities?.total_dispatched || 0), 0),
    }), [batches]);

    return (
        <div className="min-h-screen bg-slate-50">

            {/* ── Header ── */}
            <div className="bg-white border-b border-slate-200 px-6 py-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Truck className="text-indigo-600" size={22} />
                        <h1 className="text-xl font-extrabold text-slate-800">Dispatch Dashboard</h1>
                    </div>
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>

                {/* KPI strip */}
                <div className="grid grid-cols-5 gap-3 mb-4">
                    {[
                        { label: 'Total Batches',     value: counts.total,   color: 'text-slate-800'   },
                        { label: 'Open',              value: counts.open,    color: 'text-blue-700'    },
                        { label: 'Partial',           value: counts.partial, color: 'text-amber-700'   },
                        { label: 'Closed',            value: counts.closed,  color: 'text-emerald-700' },
                        { label: 'Pieces Dispatched', value: counts.pieces,  color: 'text-indigo-700'  },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                            <p className={`text-2xl font-black ${color}`}>{value}</p>
                            <p className="text-[10px] font-bold uppercase text-slate-400 mt-0.5">{label}</p>
                        </div>
                    ))}
                </div>

                {/* Search + status pills */}
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search batch, SO, customer…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none w-64"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                        {STATUS_FILTERS.map(f => {
                            const count = f.value === 'ALL' ? counts.total : counts[f.value.toLowerCase()] ?? 0;
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
                                    <span className={`text-[9px] font-black ${statusFilter === f.value ? f.color : 'text-slate-400'}`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="p-6">
                {loading ? <Spinner /> : error ? (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm font-medium">
                        <AlertCircle size={16} /> {error}
                    </div>
                ) : (activeGroups.length + closedGroups.length) === 0 ? (
                    <div className="flex flex-col items-center py-20 gap-3 text-slate-400">
                        <Package size={40} />
                        <p className="font-bold text-lg">
                            {search || statusFilter !== 'ALL' ? 'No batches match your filters.' : 'No batches yet.'}
                        </p>
                    </div>
                ) : (
                    <>
                        {activeGroups.map(({ so, batches: soBatches }, i) => (
                            <SOGroup
                                key={so.order_number || i}
                                so={so}
                                batches={soBatches}
                                onOpenDispatch={(id, code) => setActiveBatch({ id, code })}
                                defaultOpen={i < 5}
                            />
                        ))}

                        {closedGroups.length > 0 && (
                            <>
                                <div className="flex items-center gap-3 my-5">
                                    <div className="flex-1 border-t border-slate-200" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Closed Orders ({closedGroups.length})
                                    </span>
                                    <div className="flex-1 border-t border-slate-200" />
                                </div>
                                {closedGroups.map(({ so, batches: soBatches }, i) => (
                                    <SOGroup
                                        key={so.order_number || `closed-${i}`}
                                        so={so}
                                        batches={soBatches}
                                        onOpenDispatch={(id, code) => setActiveBatch({ id, code })}
                                        defaultOpen={false}
                                    />
                                ))}
                            </>
                        )}
                    </>
                )}
            </div>

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
