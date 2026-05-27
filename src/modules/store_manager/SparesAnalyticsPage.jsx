import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Package, Boxes, IndianRupee, AlertCircle, AlertTriangle,
    BarChart3, TrendingDown, X, Loader2, ChevronRight, ArrowDownUp,
    Search, Filter, FileText,
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';

import { sparesApi } from '../../api/sparesApi';

// --- helpers ---
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
};
const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN');
const fmtDateTime = (s) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return s; }
};
const fmtDate = (s) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); }
    catch { return s; }
};

const SOURCE_KIND_STYLES = {
    inward_create: { label: 'Inward', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    invoice_issue: { label: 'Issue',  cls: 'bg-red-50 text-red-700 border-red-200' },
    manual:        { label: 'Manual', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};
const SourceChip = ({ kind }) => {
    const s = SOURCE_KIND_STYLES[kind] || { label: kind || '—', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
    return <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${s.cls}`}>{s.label}</span>;
};

// --- KPI card (icon-tile pattern from QCAnalyticsDashboard) ---
const KpiCard = ({ label, value, sub, icon: Icon, colorClass, bgClass }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-3">
        <div className={`p-2.5 rounded-lg ${bgClass} shrink-0`}>
            <Icon size={20} className={colorClass} />
        </div>
        <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-slate-500 tracking-wide">{label}</p>
            <p className={`text-2xl font-extrabold leading-tight ${colorClass}`}>{value}</p>
            {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
    </div>
);

// =============================================================================
// Drilldown Modal
// =============================================================================
const DrilldownModal = ({ spareId, onClose }) => {
    const [days, setDays] = useState(90);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDrilldown = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const r = await sparesApi.getSpareDrilldown(spareId, { days, recent_limit: 25 });
            setData(r.data?.data ?? r.data);
        } catch (e) {
            setError(e.response?.data?.error || e.message || 'Failed to load drilldown.');
        } finally {
            setLoading(false);
        }
    }, [spareId, days]);

    useEffect(() => { if (spareId) fetchDrilldown(); }, [spareId, fetchDrilldown]);

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 bg-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <Package className="w-5 h-5 text-indigo-600 shrink-0" />
                    <h3 className="font-bold text-gray-900 text-lg truncate">
                        {data?.part?.name || 'Loading...'}
                        {data?.part?.part_number && (
                            <span className="ml-2 text-sm font-mono text-gray-500">{data.part.part_number}</span>
                        )}
                    </h3>
                    {data?.part?.category_name && (
                        <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">{data.part.category_name}</span>
                    )}
                    {data?.part?.current_stock !== undefined && (
                        <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded">stock: {fmtNum(data.part.current_stock)}</span>
                    )}
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-700 flex items-center gap-1.5 text-sm font-medium" type="button">
                    <X size={18} /> Close
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-6xl mx-auto p-6 space-y-5">
                    {loading && (
                        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
                    )}
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex gap-2 items-start">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                        </div>
                    )}
                    {!loading && data && (
                        <>
                            {/* Lifetime KPIs */}
                            <div>
                                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Lifetime</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <KpiCard label="Inward units" value={fmtNum(data.lifetime?.lifetime_inward_units)}
                                        icon={Boxes} colorClass="text-emerald-700" bgClass="bg-emerald-50" />
                                    <KpiCard label="Consumed units" value={fmtNum(data.lifetime?.lifetime_consumed_units)}
                                        icon={TrendingDown} colorClass="text-red-700" bgClass="bg-red-50" />
                                    <KpiCard label="Inward value" value={fmtINR(data.lifetime?.lifetime_inward_value)}
                                        icon={IndianRupee} colorClass="text-emerald-700" bgClass="bg-emerald-50" />
                                    <KpiCard label="Consumed value" value={fmtINR(data.lifetime?.lifetime_consumed_value)}
                                        icon={IndianRupee} colorClass="text-red-700" bgClass="bg-red-50" />
                                </div>
                                {(data.lifetime?.first_event_at || data.lifetime?.last_event_at) && (
                                    <p className="text-xs text-slate-400 mt-2">
                                        First event: {fmtDateTime(data.lifetime?.first_event_at)} · Last: {fmtDateTime(data.lifetime?.last_event_at)}
                                    </p>
                                )}
                            </div>

                            {/* Window controls + window KPIs */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Window</h4>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500">Days:</span>
                                        <select
                                            value={days}
                                            onChange={e => setDays(parseInt(e.target.value, 10))}
                                            className="text-xs font-bold text-gray-700 border border-gray-300 rounded p-1 bg-white"
                                        >
                                            {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <KpiCard label={`Inward units · last ${data.window?.days}d`} value={fmtNum(data.window?.inward_units)}
                                        icon={Boxes} colorClass="text-emerald-700" bgClass="bg-emerald-50" />
                                    <KpiCard label={`Consumed units · last ${data.window?.days}d`} value={fmtNum(data.window?.consumed_units)}
                                        icon={TrendingDown} colorClass="text-red-700" bgClass="bg-red-50" />
                                </div>
                            </div>

                            {/* Daily series chart */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4" /> Daily Inward vs Consumed
                                </h4>
                                {(!data.daily_series || data.daily_series.length === 0) ? (
                                    <div className="text-sm text-slate-400 italic py-8 text-center">No daily movement in this window.</div>
                                ) : (
                                    <div style={{ width: '100%', height: 260 }}>
                                        <ResponsiveContainer>
                                            <AreaChart data={data.daily_series} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                                                <defs>
                                                    <linearGradient id="inwardGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                    </linearGradient>
                                                    <linearGradient id="consumedGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                <XAxis dataKey="day" tickFormatter={fmtDate} tick={{ fontSize: 11 }} />
                                                <YAxis tick={{ fontSize: 11 }} />
                                                <RechartsTooltip
                                                    labelFormatter={fmtDate}
                                                    contentStyle={{ fontSize: 12 }}
                                                />
                                                <Area type="monotone" dataKey="inward_units" name="Inward" stroke="#10b981" fill="url(#inwardGrad)" />
                                                <Area type="monotone" dataKey="consumed_units" name="Consumed" stroke="#ef4444" fill="url(#consumedGrad)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>

                            {/* Recent ledger */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-slate-500" />
                                    <h4 className="text-sm font-bold text-slate-700">Recent Ledger</h4>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50 text-slate-500 uppercase">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Date</th>
                                                <th className="px-3 py-2 text-left">Source</th>
                                                <th className="px-3 py-2 text-right">Δ</th>
                                                <th className="px-3 py-2 text-right">Stock After</th>
                                                <th className="px-3 py-2 text-right">Unit Price</th>
                                                <th className="px-3 py-2 text-left">Reference</th>
                                                <th className="px-3 py-2 text-left">By</th>
                                                <th className="px-3 py-2 text-left">Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(data.recent_ledger || []).length === 0 ? (
                                                <tr><td colSpan="8" className="text-center text-slate-400 italic py-8">No recent entries.</td></tr>
                                            ) : data.recent_ledger.map(row => {
                                                const delta = Number(row.delta) || 0;
                                                return (
                                                    <tr key={row.id} className="hover:bg-slate-50/60">
                                                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDateTime(row.created_at)}</td>
                                                        <td className="px-3 py-2"><SourceChip kind={row.source_kind} /></td>
                                                        <td className={`px-3 py-2 text-right font-mono font-bold ${delta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                            {delta > 0 ? `+${fmtNum(delta)}` : fmtNum(delta)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-mono">{fmtNum(row.stock_after)}</td>
                                                        <td className="px-3 py-2 text-right font-mono">{row.unit_price ? fmtINR(row.unit_price) : '—'}</td>
                                                        <td className="px-3 py-2 font-mono text-xs text-slate-500">
                                                            {row.grn_number || (row.source_inward_id ? `#${row.source_inward_id}` : '—')}
                                                        </td>
                                                        <td className="px-3 py-2 text-slate-600">{row.user_name || '—'}</td>
                                                        <td className="px-3 py-2 text-slate-500 max-w-[280px] truncate" title={row.notes || ''}>{row.notes || '—'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// =============================================================================
// Ledger Section
// =============================================================================
const LedgerSection = ({ spares, onSpareClick }) => {
    const [filters, setFilters] = useState({
        spare_part_id: '',
        source_kind: '',
        from: '',
        to: '',
        limit: 100,
    });
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchLedger = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
            const r = await sparesApi.getSparesLedger(params);
            setRows(r.data?.data ?? r.data ?? []);
        } catch {
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { fetchLedger(); }, [fetchLedger]);

    const updateFilter = (patch) => setFilters(prev => ({ ...prev, ...patch }));

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Stock Ledger</h2>
                <span className="text-xs text-slate-400">({rows.length} rows)</span>
            </div>

            {/* Filters */}
            <div className="px-4 py-3 border-b border-slate-200 bg-white grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Spare</label>
                    <select
                        value={filters.spare_part_id}
                        onChange={e => updateFilter({ spare_part_id: e.target.value })}
                        className="w-full text-xs border border-slate-300 rounded p-1.5 bg-white"
                    >
                        <option value="">All spares</option>
                        {spares.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.name}{s.part_number ? ` · ${s.part_number}` : ''}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Source</label>
                    <select
                        value={filters.source_kind}
                        onChange={e => updateFilter({ source_kind: e.target.value })}
                        className="w-full text-xs border border-slate-300 rounded p-1.5 bg-white"
                    >
                        <option value="">All sources</option>
                        <option value="inward_create">Inward</option>
                        <option value="invoice_issue">Issue</option>
                        <option value="manual">Manual</option>
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">From</label>
                    <input type="date" value={filters.from} onChange={e => updateFilter({ from: e.target.value })}
                        className="w-full text-xs border border-slate-300 rounded p-1.5" />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">To</label>
                    <input type="date" value={filters.to} onChange={e => updateFilter({ to: e.target.value })}
                        className="w-full text-xs border border-slate-300 rounded p-1.5" />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Limit</label>
                    <select
                        value={filters.limit}
                        onChange={e => updateFilter({ limit: parseInt(e.target.value, 10) })}
                        className="w-full text-xs border border-slate-300 rounded p-1.5 bg-white"
                    >
                        {[100, 250, 500, 1000].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                {loading ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
                ) : (
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase">
                            <tr>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Spare</th>
                                <th className="px-3 py-2 text-left">Category</th>
                                <th className="px-3 py-2 text-left">Source</th>
                                <th className="px-3 py-2 text-right">Δ</th>
                                <th className="px-3 py-2 text-right">Before</th>
                                <th className="px-3 py-2 text-right">After</th>
                                <th className="px-3 py-2 text-left">Reference</th>
                                <th className="px-3 py-2 text-left">By</th>
                                <th className="px-3 py-2 text-left">Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.length === 0 ? (
                                <tr><td colSpan="10" className="text-center text-slate-400 italic py-8">No ledger rows match your filters.</td></tr>
                            ) : rows.map(row => {
                                const delta = Number(row.delta) || 0;
                                return (
                                    <tr key={row.id} className="hover:bg-slate-50/60 cursor-pointer"
                                        onClick={() => onSpareClick(row.spare_part_id)}>
                                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDateTime(row.created_at)}</td>
                                        <td className="px-3 py-2">
                                            <div className="font-semibold text-slate-800">{row.spare_part_name || row.name || `#${row.spare_part_id}`}</div>
                                            {row.part_number && <div className="text-[10px] font-mono text-slate-400">{row.part_number}</div>}
                                        </td>
                                        <td className="px-3 py-2 text-slate-500">{row.category_name || '—'}</td>
                                        <td className="px-3 py-2"><SourceChip kind={row.source_kind} /></td>
                                        <td className={`px-3 py-2 text-right font-mono font-bold ${delta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                            {delta > 0 ? `+${fmtNum(delta)}` : fmtNum(delta)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtNum(row.stock_before)}</td>
                                        <td className="px-3 py-2 text-right font-mono">{fmtNum(row.stock_after)}</td>
                                        <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                                            {row.grn_number || (row.source_inward_id ? `#${row.source_inward_id}` : '—')}
                                        </td>
                                        <td className="px-3 py-2 text-slate-600">{row.user_name || '—'}</td>
                                        <td className="px-3 py-2 text-slate-500 max-w-[280px] truncate" title={row.notes || ''}>{row.notes || '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

// =============================================================================
// Main Page
// =============================================================================
const PRESETS = [
    { key: '7d',  days: 7,  label: '7d' },
    { key: '30d', days: 30, label: '30d' },
    { key: '90d', days: 90, label: '90d' },
];

const SparesAnalyticsPage = () => {
    // Window controls — preset OR custom (from/to)
    const [preset, setPreset] = useState('30d');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const activeWindow = useMemo(() => {
        if (from && to) return { from, to, days: null };
        const p = PRESETS.find(x => x.key === preset) || PRESETS[1];
        return { from: daysAgo(p.days), to: todayStr(), days: p.days };
    }, [preset, from, to]);

    const [summary, setSummary] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(true);

    const [groupBy, setGroupBy] = useState('day');
    const [yMetric, setYMetric] = useState('consumed_units'); // 'consumed_units' | 'consumed_value'
    const [series, setSeries] = useState([]);
    const [seriesLoading, setSeriesLoading] = useState(true);

    const [topLimit, setTopLimit] = useState(10);
    const [topCategory, setTopCategory] = useState('');
    const [categories, setCategories] = useState([]);
    const [topList, setTopList] = useState([]);
    const [topLoading, setTopLoading] = useState(true);

    const [spares, setSpares] = useState([]); // for ledger filter
    const [drillSpareId, setDrillSpareId] = useState(null);

    // Load categories + spares list (for filters) once.
    useEffect(() => {
        sparesApi.getCategories().then(d => setCategories(d || [])).catch(() => setCategories([]));
        sparesApi.getAllSpares().then(d => setSpares(d || [])).catch(() => setSpares([]));
    }, []);

    // Summary
    useEffect(() => {
        setSummaryLoading(true);
        const days = activeWindow.days ?? Math.max(
            1,
            Math.round((new Date(activeWindow.to) - new Date(activeWindow.from)) / (1000 * 60 * 60 * 24))
        );
        sparesApi.getSparesAnalyticsSummary(days)
            .then(r => setSummary(r.data?.data ?? r.data))
            .catch(() => setSummary(null))
            .finally(() => setSummaryLoading(false));
    }, [activeWindow]);

    // Consumption series
    useEffect(() => {
        setSeriesLoading(true);
        sparesApi.getSparesConsumption({
            from: activeWindow.from,
            to: activeWindow.to,
            group_by: groupBy,
        })
            .then(r => {
                const body = r.data?.data ?? r.data;
                setSeries(body?.series || []);
            })
            .catch(() => setSeries([]))
            .finally(() => setSeriesLoading(false));
    }, [activeWindow, groupBy]);

    // Top consumed
    useEffect(() => {
        setTopLoading(true);
        sparesApi.getSparesTopConsumed({
            from: activeWindow.from,
            to: activeWindow.to,
            limit: topLimit,
            category_id: topCategory || undefined,
        })
            .then(r => setTopList(r.data?.data ?? r.data ?? []))
            .catch(() => setTopList([]))
            .finally(() => setTopLoading(false));
    }, [activeWindow, topLimit, topCategory]);

    const handlePreset = (key) => {
        setPreset(key);
        setFrom('');
        setTo('');
    };
    const handleFromChange = (v) => { setFrom(v); setPreset(''); };
    const handleToChange = (v) => { setTo(v); setPreset(''); };

    return (
        <div className="min-h-screen bg-gray-100 p-6 font-inter text-gray-900">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* HEADER */}
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
                            <BarChart3 className="mr-3 text-indigo-600" /> Spares Analytics
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Window: <span className="font-semibold text-gray-700">{activeWindow.from}</span> → <span className="font-semibold text-gray-700">{activeWindow.to}</span>
                        </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
                            {PRESETS.map(p => (
                                <button
                                    key={p.key}
                                    onClick={() => handlePreset(p.key)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${preset === p.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-end gap-2">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">From</label>
                                <input type="date" value={from} onChange={e => handleFromChange(e.target.value)}
                                    className="text-xs border border-slate-300 rounded p-1.5 bg-white" />
                            </div>
                            <span className="text-slate-400 text-xs pb-2">→</span>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">To</label>
                                <input type="date" value={to} onChange={e => handleToChange(e.target.value)}
                                    className="text-xs border border-slate-300 rounded p-1.5 bg-white" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPI STRIP */}
                {summaryLoading ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
                ) : summary ? (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                            <KpiCard label="Total spares" value={fmtNum(summary.stock?.total_spares)}
                                icon={Package} colorClass="text-indigo-700" bgClass="bg-indigo-50" />
                            <KpiCard label="Units in stock" value={fmtNum(summary.stock?.total_units_in_stock)}
                                icon={Boxes} colorClass="text-slate-700" bgClass="bg-slate-100" />
                            <KpiCard label="Inventory value" value={fmtINR(summary.stock?.total_inventory_value)}
                                icon={IndianRupee} colorClass="text-emerald-700" bgClass="bg-emerald-50" />
                            <KpiCard label="Out of stock" value={fmtNum(summary.stock?.out_of_stock_count)}
                                icon={AlertCircle} colorClass="text-red-700" bgClass="bg-red-50" />
                            <KpiCard label="Low stock" value={fmtNum(summary.stock?.low_stock_count)}
                                icon={AlertTriangle} colorClass="text-amber-700" bgClass="bg-amber-50" />
                        </div>
                        {/* Window sub-row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-4">
                                <p className="text-[10px] font-bold uppercase text-emerald-700 tracking-wider">Inward · last {summary.window_days}d</p>
                                <div className="flex items-baseline gap-4 mt-1">
                                    <span className="text-xl font-extrabold text-emerald-700">{fmtNum(summary.inward_window?.inward_units)}</span>
                                    <span className="text-xs text-slate-500">units</span>
                                    <span className="text-sm font-bold text-emerald-700">{fmtINR(summary.inward_window?.inward_value)}</span>
                                    <span className="text-xs text-slate-400">across {fmtNum(summary.inward_window?.inward_event_count)} events</span>
                                </div>
                            </div>
                            <div className="bg-white rounded-xl border border-red-200 shadow-sm p-4">
                                <p className="text-[10px] font-bold uppercase text-red-700 tracking-wider">Consumption · last {summary.window_days}d</p>
                                <div className="flex items-baseline gap-4 mt-1">
                                    <span className="text-xl font-extrabold text-red-700">{fmtNum(summary.consumption_window?.consumed_units)}</span>
                                    <span className="text-xs text-slate-500">units</span>
                                    <span className="text-sm font-bold text-red-700">{fmtINR(summary.consumption_window?.consumed_value)}</span>
                                    <span className="text-xs text-slate-400">across {fmtNum(summary.consumption_window?.consumption_event_count)} events</span>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        Failed to load summary.
                    </div>
                )}

                {/* CONSUMPTION CHART */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-red-500" /> Consumption Velocity
                        </h2>
                        <div className="flex items-center gap-3">
                            <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
                                {['day', 'week', 'month'].map(g => (
                                    <button key={g} onClick={() => setGroupBy(g)}
                                        className={`px-2.5 py-1 text-[11px] font-bold rounded transition-colors ${groupBy === g ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-gray-50'}`}
                                    >{g[0].toUpperCase() + g.slice(1)}</button>
                                ))}
                            </div>
                            <button
                                onClick={() => setYMetric(yMetric === 'consumed_units' ? 'consumed_value' : 'consumed_units')}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded border border-gray-200 bg-white text-slate-600 hover:bg-gray-50"
                                title="Toggle units / ₹ value"
                            >
                                <ArrowDownUp className="w-3 h-3" />
                                {yMetric === 'consumed_units' ? 'Units' : '₹ Value'}
                            </button>
                        </div>
                    </div>
                    <div className="p-4">
                        {seriesLoading ? (
                            <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
                        ) : series.length === 0 ? (
                            <div className="text-center text-sm text-slate-400 italic py-12">No consumption events in this window.</div>
                        ) : (
                            <div style={{ width: '100%', height: 280 }}>
                                <ResponsiveContainer>
                                    <AreaChart data={series} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                                        <defs>
                                            <linearGradient id="consGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                                                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="bucket_start" tickFormatter={fmtDate} tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }}
                                            tickFormatter={(v) => yMetric === 'consumed_value' ? `₹${Number(v).toLocaleString('en-IN')}` : Number(v).toLocaleString('en-IN')}
                                        />
                                        <RechartsTooltip
                                            labelFormatter={fmtDate}
                                            formatter={(value, name, ctx) => {
                                                if (ctx.dataKey === 'consumed_value') return [fmtINR(value), 'Consumed ₹'];
                                                return [fmtNum(value), 'Consumed units'];
                                            }}
                                            contentStyle={{ fontSize: 12 }}
                                        />
                                        <Area type="monotone" dataKey={yMetric} stroke="#4f46e5" fill="url(#consGrad)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>

                {/* TOP CONSUMED */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-indigo-600" /> Top Consumed
                        </h2>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                                <Filter className="w-3.5 h-3.5 text-slate-400" />
                                <select
                                    value={topCategory}
                                    onChange={e => setTopCategory(e.target.value)}
                                    className="text-xs border border-slate-300 rounded p-1 bg-white"
                                >
                                    <option value="">All categories</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <select
                                value={topLimit}
                                onChange={e => setTopLimit(parseInt(e.target.value, 10))}
                                className="text-xs border border-slate-300 rounded p-1 bg-white"
                            >
                                {[10, 25, 50].map(n => <option key={n} value={n}>Top {n}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        {topLoading ? (
                            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
                        ) : (
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-slate-500 uppercase">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Spare</th>
                                        <th className="px-3 py-2 text-left">Category</th>
                                        <th className="px-3 py-2 text-right">Stock</th>
                                        <th className="px-3 py-2 text-right">Unit Cost</th>
                                        <th className="px-3 py-2 text-right">Events</th>
                                        <th className="px-3 py-2 text-right">Consumed Units</th>
                                        <th className="px-3 py-2 text-right">Consumed Value</th>
                                        <th className="px-3 py-2 w-6"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {topList.length === 0 ? (
                                        <tr><td colSpan="8" className="text-center text-slate-400 italic py-8">No consumption in this window.</td></tr>
                                    ) : topList.map(row => (
                                        <tr key={row.spare_part_id}
                                            className="hover:bg-indigo-50/40 cursor-pointer"
                                            onClick={() => setDrillSpareId(row.spare_part_id)}
                                        >
                                            <td className="px-3 py-2">
                                                <div className="font-semibold text-slate-800">{row.name}</div>
                                                {row.part_number && <div className="text-[10px] font-mono text-slate-400">{row.part_number}</div>}
                                            </td>
                                            <td className="px-3 py-2 text-slate-500">{row.category_name || '—'}</td>
                                            <td className="px-3 py-2 text-right font-mono">{fmtNum(row.current_stock)}</td>
                                            <td className="px-3 py-2 text-right font-mono">{fmtINR(row.unit_cost)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtNum(row.event_count)}</td>
                                            <td className="px-3 py-2 text-right font-mono font-bold text-red-700">{fmtNum(row.consumed_units)}</td>
                                            <td className="px-3 py-2 text-right font-mono font-bold text-slate-700">{fmtINR(row.consumed_value)}</td>
                                            <td className="px-3 py-2 text-right text-slate-300"><ChevronRight className="w-4 h-4 inline" /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* LEDGER */}
                <LedgerSection spares={spares} onSpareClick={setDrillSpareId} />
            </div>

            {/* DRILLDOWN MODAL */}
            {drillSpareId != null && (
                <DrilldownModal spareId={drillSpareId} onClose={() => setDrillSpareId(null)} />
            )}
        </div>
    );
};

export default SparesAnalyticsPage;
