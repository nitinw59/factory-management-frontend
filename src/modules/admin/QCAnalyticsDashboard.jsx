import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
    LineChart, Line,
    ComposedChart,
} from 'recharts';
import { qcApi } from '../../api/qcApi';
import { productionManagerApi } from '../../api/productionManagerApi';
import {
    Loader2, AlertCircle, RefreshCw, Filter,
    ShieldCheck, TrendingUp, TrendingDown, Layers, BarChart2,
} from 'lucide-react';

// ─── constants ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
    SEWING:    '#6366f1',
    CUTTING:   '#f59e0b',
    FABRIC:    '#10b981',
    FINISHING: '#ef4444',
};
const FALLBACK_COLORS = ['#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const dhuLevel = (dhu) => {
    if (dhu == null) return 'neutral';
    if (dhu < 2)  return 'good';
    if (dhu < 5)  return 'warn';
    if (dhu < 10) return 'bad';
    return 'critical';
};
const DHU_STYLES = {
    good:     { bar: '#10b981', text: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    warn:     { bar: '#f59e0b', text: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
    bad:      { bar: '#f97316', text: 'text-orange-600',  bg: 'bg-orange-50 border-orange-200' },
    critical: { bar: '#ef4444', text: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
    neutral:  { bar: '#94a3b8', text: 'text-slate-500',   bg: 'bg-slate-50 border-slate-200' },
};

// ─── small helpers ─────────────────────────────────────────────────────────────

const fmt = (n, dec = 1) => (n == null ? '—' : Number(n).toFixed(dec));
const pct = (n) => (n == null ? '—' : `${fmt(n, 1)}%`);

const KpiCard = ({ label, value, sub, icon: Icon, colorClass = 'text-indigo-600', bgClass = 'bg-indigo-50' }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-4">
        <div className={`p-2.5 rounded-lg ${bgClass}`}>
            <Icon size={20} className={colorClass} />
        </div>
        <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`text-2xl font-extrabold ${colorClass} leading-tight`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
    </div>
);

const SectionCard = ({ title, children, className = '' }) => (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 ${className}`}>
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-4">{title}</h3>
        {children}
    </div>
);

const EmptyChart = ({ msg = 'No data' }) => (
    <div className="flex items-center justify-center h-48 text-slate-400 text-sm italic">{msg}</div>
);

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
            <p className="font-bold text-slate-700 mb-1">{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color }}>
                    {p.name}: <strong>{fmt(p.value)}</strong>
                </p>
            ))}
        </div>
    );
};

// ─── data normalizers (all API values arrive as strings) ─────────────────────

const normSummary = (s) => s && {
    total_inspected: parseInt(s.total_inspected) || 0,
    total_defects:   parseInt(s.total_defects)   || 0,
    dhu:             parseFloat(s.dhu)            ?? null,
    pass_rate:       parseFloat(s.pass_rate)      ?? null,
    rework_rate:     parseFloat(s.rework_rate)    ?? null,
};
const normByLine = (rows) => {
    const parsed = rows.map(l => ({
        ...l,
        defect_count: parseInt(l.defect_count) || 0,
        inspected:    parseInt(l.inspected)    || 0,
        dhu:          l.dhu != null ? parseFloat(l.dhu) : null,
    }));
    const hasDhu = parsed.some(l => l.dhu != null);
    const maxCount = Math.max(...parsed.map(l => l.defect_count), 1);
    return parsed.map(l => ({
        ...l,
        // chartValue: prefer DHU, fall back to defect_count
        chartValue: l.dhu != null ? l.dhu : l.defect_count,
        // color: DHU-based when available, else relative-heat by count
        fill: l.dhu != null
            ? DHU_STYLES[dhuLevel(l.dhu)].bar
            : (() => {
                const ratio = l.defect_count / maxCount;
                if (ratio > 0.7) return DHU_STYLES.critical.bar;
                if (ratio > 0.4) return DHU_STYLES.bad.bar;
                if (ratio > 0.1) return DHU_STYLES.warn.bar;
                return DHU_STYLES.good.bar;
            })(),
        _hasDhu: hasDhu,
    }));
};
const normCategory  = (rows) => rows.map(c => ({ ...c, count: parseInt(c.count) || 0 }));
const normTrend     = (rows) => rows.map(d => ({ ...d, dhu: parseFloat(d.dhu) || 0, defects: parseInt(d.defects) || 0, inspected: parseInt(d.inspected) || 0 }));
const normTopDef    = (rows) => rows.map(d => ({ ...d, count: parseInt(d.count) || 0 }));
const normBatches   = (rows) => rows.map(b => ({
    ...b,
    inspected:  parseInt(b.inspected)    || 0,
    defects:    parseInt(b.defects)      || 0,
    dhu:        parseFloat(b.dhu)        ?? null,
    pass_rate:  parseFloat(b.pass_rate)  ?? null,
}));

// ─── main component ────────────────────────────────────────────────────────────

const QCAnalyticsDashboard = () => {
    const today = new Date().toISOString().split('T')[0];
    const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

    const [filters, setFilters] = useState({ dateFrom: defaultFrom, dateTo: today, lineId: '' });
    const [pendingFilters, setPendingFilters] = useState(filters);

    const [summary,    setSummary]    = useState(null);
    const [byLine,     setByLine]     = useState([]);
    const [byCategory, setByCategory] = useState([]);
    const [trend,      setTrend]      = useState([]);
    const [topDefects, setTopDefects] = useState([]);
    const [batches,    setBatches]    = useState([]);
    const [lineOptions, setLineOptions] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);

    // Load filter options once
    useEffect(() => {
        productionManagerApi.getLineTypes()
            .then(r => setLineOptions(r.data || []))
            .catch(() => {});
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        const params = {
            date_from: filters.dateFrom,
            date_to:   filters.dateTo,
            ...(filters.lineId && { line_id: filters.lineId }),
        };
        try {
            const [sRes, lRes, cRes, tRes, dRes, bRes] = await Promise.allSettled([
                qcApi.getQCSummary(params),
                qcApi.getQCByLine(params),
                qcApi.getQCByCategory(params),
                qcApi.getQCTrend(params),
                qcApi.getQCTopDefects(params),
                qcApi.getQCBatches(params),
            ]);
            if (sRes.status === 'fulfilled') setSummary(normSummary(sRes.value.data));
            if (lRes.status === 'fulfilled') setByLine(normByLine(lRes.value.data || []));
            if (cRes.status === 'fulfilled') setByCategory(normCategory(cRes.value.data || []));
            if (tRes.status === 'fulfilled') setTrend(normTrend(tRes.value.data || []));
            if (dRes.status === 'fulfilled') setTopDefects(normTopDef(dRes.value.data || []));
            if (bRes.status === 'fulfilled') setBatches(normBatches(bRes.value.data || []));
        } catch (e) {
            setError('Failed to load analytics.');
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { load(); }, [load]);

    // Pareto: add cumulative % column
    const paretoData = useMemo(() => {
        const sorted = [...topDefects].sort((a, b) => b.count - a.count).slice(0, 10);
        const total = sorted.reduce((s, d) => s + (d.count || 0), 0);
        let cum = 0;
        return sorted.map(d => {
            cum += d.count || 0;
            return { ...d, cumPct: total > 0 ? Math.round((cum / total) * 100) : 0 };
        });
    }, [topDefects]);

    const applyFilters = () => setFilters(pendingFilters);

    const byLineHasDhu   = byLine.some(l => l._hasDhu);
    const byLineLabel    = byLineHasDhu ? 'DHU' : 'Defect Count';
    const byLineTitle    = byLineHasDhu ? 'DHU by Production Line' : 'Defects by Production Line';

    const summaryDhu = summary?.dhu ?? null;
    const dhuStyle = DHU_STYLES[dhuLevel(summaryDhu)];

    return (
        <div className="p-6 bg-slate-50 min-h-screen font-inter space-y-5">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900">QC Analytics</h1>
                    <p className="text-slate-500 text-sm mt-0.5">DHU · Defect distribution · Line & workstation performance</p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 shadow-sm transition-colors disabled:opacity-60"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {/* ── Filter bar ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end gap-4">
                <Filter size={15} className="text-slate-400 self-center" />
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">From</label>
                    <input
                        type="date" value={pendingFilters.dateFrom}
                        onChange={e => setPendingFilters(p => ({ ...p, dateFrom: e.target.value }))}
                        className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">To</label>
                    <input
                        type="date" value={pendingFilters.dateTo}
                        onChange={e => setPendingFilters(p => ({ ...p, dateTo: e.target.value }))}
                        className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Line Type</label>
                    <select
                        value={pendingFilters.lineId}
                        onChange={e => setPendingFilters(p => ({ ...p, lineId: e.target.value }))}
                        className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                        <option value="">All lines</option>
                        {lineOptions.map(l => (
                            <option key={l.id} value={l.id}>{l.type_name || l.name}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={applyFilters}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition-colors"
                >
                    Apply
                </button>
            </div>

            {/* ── Loading / Error ─────────────────────────────────────────── */}
            {loading && (
                <div className="flex justify-center items-center py-16">
                    <Loader2 className="animate-spin h-10 w-10 text-indigo-500" />
                </div>
            )}
            {!loading && error && (
                <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle size={18} /> {error}
                </div>
            )}

            {!loading && !error && (
                <>
                    {/* ── KPI cards ─────────────────────────────────────────── */}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                        <KpiCard
                            label="Overall DHU"
                            value={summaryDhu != null ? fmt(summaryDhu) : '—'}
                            sub="defects per 100 units"
                            icon={BarChart2}
                            colorClass={dhuStyle.text}
                            bgClass={dhuStyle.bg}
                        />
                        <KpiCard
                            label="Inspected"
                            value={summary?.total_inspected?.toLocaleString() ?? '—'}
                            sub="garments checked"
                            icon={Layers}
                            colorClass="text-indigo-600"
                            bgClass="bg-indigo-50"
                        />
                        <KpiCard
                            label="Total Defects"
                            value={summary?.total_defects?.toLocaleString() ?? '—'}
                            sub="defect instances"
                            icon={AlertCircle}
                            colorClass="text-red-600"
                            bgClass="bg-red-50"
                        />
                        <KpiCard
                            label="Pass Rate"
                            value={pct(summary?.pass_rate)}
                            sub="first-pass yield"
                            icon={ShieldCheck}
                            colorClass="text-emerald-600"
                            bgClass="bg-emerald-50"
                        />
                        <KpiCard
                            label="Rework Rate"
                            value={pct(summary?.rework_rate)}
                            sub="sent for rework"
                            icon={summary?.rework_rate > 5 ? TrendingUp : TrendingDown}
                            colorClass={summary?.rework_rate > 5 ? 'text-orange-600' : 'text-sky-600'}
                            bgClass={summary?.rework_rate > 5 ? 'bg-orange-50' : 'bg-sky-50'}
                        />
                    </div>

                    {/* ── Charts row 1 ──────────────────────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                        {/* DHU / Defects by Line */}
                        <SectionCard title={byLineTitle}>
                            {byLine.length === 0 ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={Math.max(180, byLine.length * 52)}>
                                    <BarChart
                                        layout="vertical"
                                        data={byLine}
                                        margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                        <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                        <YAxis dataKey="line_name" type="category" tick={{ fontSize: 11 }} width={110} tickLine={false} axisLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="chartValue" name={byLineLabel} radius={[0, 4, 4, 0]}>
                                            {byLine.map((entry, i) => (
                                                <Cell key={i} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                            {!byLineHasDhu && byLine.length > 0 && (
                                <p className="text-[10px] text-amber-600 mt-2 italic">
                                    DHU unavailable — no inspected count recorded. Showing defect count per line.
                                </p>
                            )}
                            {/* legend */}
                            <div className="flex flex-wrap gap-3 mt-3">
                                {[['< 2 — Excellent', '#10b981'], ['2–5 — Acceptable', '#f59e0b'], ['5–10 — Warning', '#f97316'], ['> 10 — Critical', '#ef4444']].map(([label, color]) => (
                                    <span key={label} className="flex items-center gap-1 text-[10px] text-slate-500">
                                        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />{label}
                                    </span>
                                ))}
                            </div>
                        </SectionCard>

                        {/* Defects by Category */}
                        <SectionCard title="Defects by Category">
                            {byCategory.length === 0 ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie
                                            data={byCategory}
                                            dataKey="count"
                                            nameKey="category"
                                            cx="50%" cy="50%"
                                            innerRadius={60} outerRadius={100}
                                            paddingAngle={3}
                                        >
                                            {byCategory.map((entry, i) => (
                                                <Cell
                                                    key={i}
                                                    fill={CATEGORY_COLORS[entry.category] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(v, n) => [v, n]} />
                                        <Legend
                                            formatter={(value, entry) => (
                                                <span className="text-xs text-slate-600">
                                                    {value} ({entry.payload?.count ?? 0})
                                                </span>
                                            )}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </SectionCard>
                    </div>

                    {/* ── Charts row 2 ──────────────────────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                        {/* DHU Trend */}
                        <SectionCard title="DHU Trend">
                            {trend.length === 0 ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <LineChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line
                                            type="monotone"
                                            dataKey="dhu"
                                            name="DHU"
                                            stroke="#6366f1"
                                            strokeWidth={2}
                                            dot={{ r: 3, fill: '#6366f1' }}
                                            activeDot={{ r: 5 }}
                                        />
                                        {/* Target line at DHU 5 */}
                                        <Line
                                            type="monotone"
                                            dataKey={() => 5}
                                            name="Target (5)"
                                            stroke="#f59e0b"
                                            strokeWidth={1.5}
                                            strokeDasharray="6 3"
                                            dot={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </SectionCard>

                        {/* Pareto — Top Defect Codes */}
                        <SectionCard title="Top Defects — Pareto">
                            {paretoData.length === 0 ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <ComposedChart data={paretoData} margin={{ top: 5, right: 30, left: 0, bottom: 30 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis
                                            dataKey="code"
                                            tick={{ fontSize: 10 }}
                                            tickLine={false}
                                            axisLine={false}
                                            angle={-35}
                                            textAnchor="end"
                                            interval={0}
                                        />
                                        <YAxis yAxisId="left"  tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar yAxisId="left" dataKey="count" name="Count" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={32} />
                                        <Line yAxisId="right" type="monotone" dataKey="cumPct" name="Cumulative %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            )}
                        </SectionCard>
                    </div>

                    {/* ── Batch table ───────────────────────────────────────── */}
                    <SectionCard title="Batch Quality Summary">
                        {batches.length === 0 ? (
                            <EmptyChart msg="No batch data for selected period" />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-left">
                                            {['Batch', 'Line', 'Date', 'Inspected', 'Defects', 'DHU', 'Pass Rate', 'Status'].map(h => (
                                                <th key={h} className="pb-2 pr-4 text-xs font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {batches.map((b, i) => {
                                            const level = dhuLevel(b.dhu);
                                            const ds = DHU_STYLES[level];
                                            return (
                                                <tr key={b.batch_id ?? i} className="hover:bg-slate-50 transition-colors">
                                                    <td className="py-2 pr-4 font-mono text-xs text-slate-700">{b.batch_code ?? b.batch_id}</td>
                                                    <td className="py-2 pr-4 text-slate-700">{b.line_name ?? '—'}</td>
                                                    <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">{b.date ?? '—'}</td>
                                                    <td className="py-2 pr-4 text-slate-700">{b.inspected?.toLocaleString() ?? '—'}</td>
                                                    <td className="py-2 pr-4 text-slate-700">{b.defects?.toLocaleString() ?? '—'}</td>
                                                    <td className="py-2 pr-4">
                                                        <span className={`font-bold ${ds.text}`}>{fmt(b.dhu)}</span>
                                                    </td>
                                                    <td className="py-2 pr-4 text-slate-700">{pct(b.pass_rate)}</td>
                                                    <td className="py-2">
                                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${ds.bg} ${ds.text}`}>
                                                            {{ good: 'PASS', warn: 'WATCH', bad: 'ALERT', critical: 'CRITICAL', neutral: '—' }[level]}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SectionCard>
                </>
            )}
        </div>
    );
};

export default QCAnalyticsDashboard;
