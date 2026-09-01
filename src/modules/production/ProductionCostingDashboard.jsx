import React, { useState, useEffect, useCallback } from 'react';
import {
    Calendar, Download, TrendingUp, Users, Package, DollarSign,
    Loader2, AlertCircle, ChevronDown, ChevronRight, X, Calculator,
    CalendarDays, Zap, ArrowUpRight, ArrowDownRight, BarChart3,
} from 'lucide-react';
import { costingApi } from '../../api/costingApi';

const formatMoney = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

// YYYY-MM-01 / YYYY-MM-<last day> for a given "YYYY-MM" month string.
// Caps the end at today when the month is the current one — there's no
// attendance/production data beyond today to summarize.
const monthBounds = (monthStr) => {
    const [y, m] = monthStr.split('-').map(Number);
    const first = `${monthStr}-01`;
    const lastOfMonth = new Date(y, m, 0); // day 0 of next month = last day of this month
    const todayStr = new Date().toISOString().split('T')[0];
    const lastStr = lastOfMonth.toISOString().split('T')[0];
    return { from: first, to: lastStr > todayStr ? todayStr : lastStr };
};

// ─── MONTHLY SUMMARY MODAL ──────────────────────────────────────────────────
// Reuses GET /costing/daily (the same endpoint the day-by-day matrix already
// calls) for the whole month and aggregates client-side — guarantees the
// monthly totals always match what the daily rows already show, with no
// second costing formula to keep in sync on the backend.
const MonthlySummaryModal = ({ initialMonth, onClose, onOpenDay }) => {
    const [month, setMonth] = useState(initialMonth);
    const [days, setDays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    useEffect(() => {
        setLoading(true);
        setErr(null);
        const { from, to } = monthBounds(month);
        costingApi.getCostingReportRange({ params: { fromDate: from, toDate: to } })
            .then(res => setDays(res.data || []))
            .catch(() => setErr('Failed to load monthly costing data.'))
            .finally(() => setLoading(false));
    }, [month]);

    // ── Aggregation ──
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const totalCost     = sorted.reduce((s, d) => s + (d.kpis.totalCost || 0), 0);
    const directCost     = sorted.reduce((s, d) => s + (d.kpis.directCost || 0), 0);
    const overheadCost   = sorted.reduce((s, d) => s + (d.kpis.overheadCost || 0), 0);
    const totalPieces    = sorted.reduce((s, d) => s + (d.kpis.totalPieces || 0), 0);
    const totalRegular   = sorted.reduce((s, d) => s + (d.departments || []).reduce((ds, dep) => ds + (parseFloat(dep.regular_cost) || 0), 0), 0);
    const totalOt        = sorted.reduce((s, d) => s + (d.departments || []).reduce((ds, dep) => ds + (parseFloat(dep.ot_cost) || 0), 0), 0);
    const workingDays    = sorted.length;
    const avgStrength    = workingDays > 0 ? sorted.reduce((s, d) => s + (d.kpis.totalStrength || 0), 0) / workingDays : 0;
    const costPerPiece   = totalPieces > 0 ? totalCost / totalPieces : 0;
    const otPct          = totalCost > 0 ? (totalOt / totalCost) * 100 : 0;
    const directPct      = totalCost > 0 ? (directCost / totalCost) * 100 : 0;
    const overheadPct    = totalCost > 0 ? (overheadCost / totalCost) * 100 : 0;

    // Best/worst cost-per-piece day — only among days that actually produced pieces.
    const producingDays = sorted.filter(d => (d.kpis.totalPieces || 0) > 0);
    const bestDay  = producingDays.length ? producingDays.reduce((a, b) => (parseFloat(a.kpis.costPerPiece) <= parseFloat(b.kpis.costPerPiece) ? a : b)) : null;
    const worstDay = producingDays.length ? producingDays.reduce((a, b) => (parseFloat(a.kpis.costPerPiece) >= parseFloat(b.kpis.costPerPiece) ? a : b)) : null;
    const maxDayCost = sorted.reduce((m, d) => Math.max(m, d.kpis.totalCost || 0), 0);

    // Department roll-up — strength is averaged (per-day headcount), not
    // summed (a raw sum across the month would read as "780 people", not a
    // meaningful strength figure); every other figure is a straight monthly total.
    const deptMap = {};
    sorted.forEach(d => {
        (d.departments || []).forEach(dep => {
            const key = dep.department_name;
            if (!deptMap[key]) {
                deptMap[key] = {
                    department_name: dep.department_name, is_overhead: dep.is_overhead,
                    strengthSum: 0, dayCount: 0, production_qty: 0,
                    regular_cost: 0, ot_cost: 0, total_cost: 0,
                };
            }
            const row = deptMap[key];
            row.strengthSum += parseInt(dep.strength) || 0;
            row.dayCount += 1;
            row.production_qty += parseFloat(dep.production_qty) || 0;
            row.regular_cost += parseFloat(dep.regular_cost) || 0;
            row.ot_cost += parseFloat(dep.ot_cost) || 0;
            row.total_cost += parseFloat(dep.total_cost) || 0;
        });
    });
    const deptRows = Object.values(deptMap).map(r => ({ ...r, avgStrength: r.dayCount > 0 ? r.strengthSum / r.dayCount : 0 }));
    const directDepts   = deptRows.filter(d => !d.is_overhead).sort((a, b) => b.total_cost - a.total_cost);
    const overheadDepts = deptRows.filter(d => d.is_overhead).sort((a, b) => b.total_cost - a.total_cost);

    const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    const DeptRollupTable = ({ depts, label, isDirect }) => (
        <div className="mb-4">
            <div className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-t-xl ${isDirect ? 'bg-indigo-600 text-white' : 'bg-slate-500 text-white'}`}>
                {label}
            </div>
            <table className="w-full text-left bg-white border border-slate-200 rounded-b-xl overflow-hidden shadow-sm">
                <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-500">
                    <tr>
                        <th className="px-4 py-2.5">Department</th>
                        <th className="px-4 py-2.5 text-center">Avg Strength</th>
                        <th className="px-4 py-2.5 text-center">Production (mo.)</th>
                        <th className="px-4 py-2.5 text-right">Regular Cost</th>
                        <th className="px-4 py-2.5 text-right">OT Cost</th>
                        <th className="px-4 py-2.5 text-right">Total</th>
                        {isDirect && <th className="px-4 py-2.5 text-right bg-indigo-50 text-indigo-600">Cost / Piece</th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {depts.map((dept, idx) => {
                        const cpp = dept.production_qty > 0 ? (dept.total_cost / dept.production_qty).toFixed(2) : null;
                        return (
                            <tr key={idx} className="hover:bg-slate-50 text-sm">
                                <td className="px-4 py-3 font-bold text-slate-700">{dept.department_name}</td>
                                <td className="px-4 py-3 text-center font-bold text-blue-600">{dept.avgStrength.toFixed(1)}</td>
                                <td className="px-4 py-3 text-center font-medium text-indigo-600">{dept.production_qty > 0 ? Math.round(dept.production_qty) : '-'}</td>
                                <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatMoney(dept.regular_cost)}</td>
                                <td className="px-4 py-3 text-right font-medium text-amber-600">{dept.ot_cost > 0 ? formatMoney(dept.ot_cost) : '-'}</td>
                                <td className="px-4 py-3 text-right font-bold text-slate-800">{formatMoney(dept.total_cost)}</td>
                                {isDirect && (
                                    <td className="px-4 py-3 text-right bg-indigo-50/40">
                                        {cpp ? <span className="font-black text-indigo-700">₹{cpp}</span> : <span className="text-slate-300 font-bold">—</span>}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <CalendarDays className="text-indigo-600" size={22} /> Monthly Costing Summary
                        </h2>
                        <p className="text-sm font-medium text-slate-500 mt-0.5">{monthLabel}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            type="month"
                            value={month}
                            max={new Date().toISOString().slice(0, 7)}
                            onChange={e => e.target.value && setMonth(e.target.value)}
                            className="px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full">
                            <X size={22} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {loading ? (
                        <div className="flex justify-center items-center h-64"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>
                    ) : err ? (
                        <div className="flex items-center gap-2 text-rose-600 font-bold py-8 justify-center"><AlertCircle size={16} /> {err}</div>
                    ) : sorted.length === 0 ? (
                        <div className="p-12 text-center text-slate-400 font-bold">No costing data found for {monthLabel}.</div>
                    ) : (
                        <>
                            {/* Top-line KPI cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-slate-800 text-white rounded-2xl p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-1">Total Cost</p>
                                    <p className="text-2xl font-black">{formatMoney(totalCost)}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">{workingDays} working day{workingDays !== 1 ? 's' : ''} covered</p>
                                </div>
                                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1">Cost / Piece</p>
                                    <p className="text-2xl font-black text-indigo-700">₹{costPerPiece.toFixed(2)}</p>
                                    <p className="text-[10px] text-indigo-400 mt-1">{Math.round(totalPieces).toLocaleString()} pcs produced</p>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1 flex items-center gap-1"><Zap size={10} /> OT Cost</p>
                                    <p className="text-2xl font-black text-amber-700">{formatMoney(totalOt)}</p>
                                    <p className="text-[10px] text-amber-500 mt-1">{otPct.toFixed(1)}% of total cost</p>
                                </div>
                                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1 flex items-center gap-1"><Users size={10} /> Avg Strength</p>
                                    <p className="text-2xl font-black text-blue-700">{avgStrength.toFixed(1)}</p>
                                    <p className="text-[10px] text-blue-400 mt-1">people / working day</p>
                                </div>
                            </div>

                            {/* Direct vs Overhead split */}
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="px-4 py-2 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest">Cost Split — {monthLabel}</div>
                                <div className="p-4 flex flex-col md:flex-row gap-4 items-center">
                                    <div className="flex-1 w-full">
                                        <div className="flex text-[10px] font-black uppercase justify-between mb-1">
                                            <span className="text-indigo-600">Direct {directPct.toFixed(1)}%</span>
                                            <span className="text-slate-500">Admin {overheadPct.toFixed(1)}%</span>
                                        </div>
                                        <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden flex">
                                            <div className="bg-indigo-500 h-full" style={{ width: `${directPct}%` }} />
                                            <div className="bg-slate-400 h-full" style={{ width: `${overheadPct}%` }} />
                                        </div>
                                    </div>
                                    <div className="flex gap-3 shrink-0">
                                        <div className="flex flex-col items-center bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3 min-w-[130px]">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-1">Direct Cost</span>
                                            <span className="text-xl font-black text-indigo-700">{formatMoney(directCost)}</span>
                                        </div>
                                        <div className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 min-w-[130px]">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Admin Cost</span>
                                            <span className="text-xl font-black text-slate-700">{formatMoney(overheadCost)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="px-4 pb-3 text-[10px] text-slate-400">
                                    Regular wages: <strong className="text-slate-600">{formatMoney(totalRegular)}</strong> · OT: <strong className="text-slate-600">{formatMoney(totalOt)}</strong>
                                </div>
                            </div>

                            {/* Day-by-day trend + best/worst */}
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="px-4 py-2 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                    <BarChart3 size={12} /> Daily Cost Trend
                                </div>
                                <div className="p-4">
                                    <div className="flex items-end gap-1 h-24">
                                        {sorted.map(d => {
                                            const h = maxDayCost > 0 ? Math.max(4, (d.kpis.totalCost / maxDayCost) * 100) : 4;
                                            const isBest  = bestDay  && d.date === bestDay.date;
                                            const isWorst = worstDay && d.date === worstDay.date;
                                            return (
                                                <button
                                                    key={d.date}
                                                    onClick={() => onOpenDay && onOpenDay(d.date)}
                                                    title={`${d.date} — ${formatMoney(d.kpis.totalCost)} · ₹${d.kpis.costPerPiece}/pc`}
                                                    className={`flex-1 rounded-t transition-colors ${isBest ? 'bg-emerald-500' : isWorst ? 'bg-rose-500' : 'bg-indigo-400 hover:bg-indigo-500'}`}
                                                    style={{ height: `${h}%` }}
                                                />
                                            );
                                        })}
                                    </div>
                                    <div className="flex justify-between text-[9px] text-slate-400 font-bold mt-1.5">
                                        <span>{sorted[0]?.date}</span>
                                        <span>{sorted[sorted.length - 1]?.date}</span>
                                    </div>
                                </div>
                                {(bestDay || worstDay) && (
                                    <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100">
                                        {bestDay && (
                                            <button onClick={() => onOpenDay && onOpenDay(bestDay.date)} className="p-3 text-left hover:bg-emerald-50/50 transition-colors">
                                                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1"><ArrowDownRight size={10} /> Best Cost/Piece Day</p>
                                                <p className="text-sm font-black text-emerald-700 mt-0.5">{bestDay.date} — ₹{bestDay.kpis.costPerPiece}/pc</p>
                                            </button>
                                        )}
                                        {worstDay && (
                                            <button onClick={() => onOpenDay && onOpenDay(worstDay.date)} className="p-3 text-left hover:bg-rose-50/50 transition-colors">
                                                <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1"><ArrowUpRight size={10} /> Worst Cost/Piece Day</p>
                                                <p className="text-sm font-black text-rose-700 mt-0.5">{worstDay.date} — ₹{worstDay.kpis.costPerPiece}/pc</p>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Department roll-up */}
                            <div>
                                {directDepts.length > 0 && <DeptRollupTable depts={directDepts} label="Direct Cost Departments" isDirect={true} />}
                                {overheadDepts.length > 0 && <DeptRollupTable depts={overheadDepts} label="Admin / Overhead Departments" isDirect={false} />}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function ProductionCostingDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [fromDate, setFromDate] = useState(lastWeek);
    const [toDate, setToDate] = useState(today);
    
    const [reports, setReports] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedDays, setExpandedDays] = useState({});
    
    // Modal State
    const [drilldown, setDrilldown] = useState({ isOpen: false, date: '', dept: '', data: [], loading: false, type: '' });
    const [monthlySummaryOpen, setMonthlySummaryOpen] = useState(false);

    const fetchReports = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await costingApi.getCostingReportRange({ params: { fromDate, toDate } });
            setReports(res.data);
            if (res.data.length > 0) setExpandedDays({ [res.data[0].date]: true });
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [fromDate, toDate]);

    useEffect(() => { fetchReports(); }, [fetchReports]);

    const toggleDay = (date) => setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }));

    // Jump the main matrix to a specific day (used by the monthly summary's
    // trend strip / best-worst callouts). Narrows the range to that single
    // day rather than trying to preserve whatever range was showing — simpler
    // than reconciling with fetchReports' own "auto-expand the first/only
    // row" behavior, and it's obvious to the user why the table just changed.
    const jumpToDay = (date) => {
        setMonthlySummaryOpen(false);
        setFromDate(date);
        setToDate(date);
    };

    const openDrilldown = async (date, dept, type) => {
        setDrilldown({ isOpen: true, date, dept, type, data: [], loading: true });
        try {
            let res;
            if (type === 'PRODUCTION') {
                res = await costingApi.getProductionDrilldown({ params: { date, department: dept } });
            } else {
                res = await costingApi.getCostingDrilldown({ params: { date, department: dept } });
            }
            setDrilldown(prev => ({ ...prev, data: res.data, loading: false }));
        } catch (err) {
            alert("Failed to load drilldown details.");
            setDrilldown(prev => ({ ...prev, isOpen: false }));
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto bg-slate-50 min-h-screen font-inter">
            
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 flex items-center">
                        <TrendingUp className="mr-3 text-indigo-600" size={28}/> Daily Costing Matrix
                    </h1>
                    <p className="text-slate-500 mt-1 font-medium">View day-by-day profitability and drill down into wages or production.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row w-full xl:w-auto gap-3">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <input
                                type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                                className="w-full pl-3 pr-2 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 outline-none"
                            />
                        </div>
                        <span className="text-slate-400 font-bold text-sm">TO</span>
                        <div className="relative flex-1">
                            <input
                                type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                                className="w-full pl-3 pr-2 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 outline-none"
                            />
                        </div>
                    </div>
                    <button
                        onClick={() => setMonthlySummaryOpen(true)}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shrink-0"
                    >
                        <CalendarDays size={16} /> Monthly Summary
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {isLoading ? (
                    <div className="flex justify-center items-center h-64"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>
                ) : reports.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 font-bold">No data found for this date range.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-800 text-white text-xs uppercase tracking-wider font-black">
                                    <th className="p-4 w-10"></th>
                                    <th className="p-4">Date</th>
                                    <th className="p-4 text-center">Total Strength</th>
                                    <th className="p-4 text-center">Total Prod (Pcs)</th>
                                    <th className="p-4 text-right text-emerald-200">Regular Cost</th>
                                    <th className="p-4 text-right text-amber-200">OT Cost</th>
                                    <th className="p-4 text-right">Total Cost</th>
                                    <th className="p-4 text-right text-indigo-200">Cost / Piece</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reports.map((dayReport) => {
                                    const dayRegular = (dayReport.departments || []).reduce((s, d) => s + (parseFloat(d.regular_cost) || 0), 0);
                                    const dayOt      = (dayReport.departments || []).reduce((s, d) => s + (parseFloat(d.ot_cost) || 0), 0);
                                    return (
                                    <React.Fragment key={dayReport.date}>
                                        <tr onClick={() => toggleDay(dayReport.date)} className={`cursor-pointer transition-colors ${expandedDays[dayReport.date] ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}>
                                            <td className="p-4 text-slate-400">{expandedDays[dayReport.date] ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}</td>
                                            <td className="p-4 font-black text-slate-800 text-base">{dayReport.date}</td>
                                            <td className="p-4 text-center font-bold text-slate-600"><Users size={14} className="inline mr-1"/>{dayReport.kpis.totalStrength}</td>
                                            <td className="p-4 text-center font-bold text-blue-600"><Package size={14} className="inline mr-1"/>{dayReport.kpis.totalPieces}</td>
                                            <td className="p-4 text-right font-bold text-emerald-700">{formatMoney(dayRegular)}</td>
                                            <td className="p-4 text-right font-bold text-amber-700">{dayOt > 0 ? formatMoney(dayOt) : '-'}</td>
                                            <td className="p-4 text-right font-black text-slate-800">{formatMoney(dayReport.kpis.totalCost)}</td>
                                            <td className="p-4 text-right font-black text-indigo-600 text-lg bg-indigo-50/50">₹{dayReport.kpis.costPerPiece}</td>
                                        </tr>

                                        {expandedDays[dayReport.date] && (
                                            <tr>
                                                <td colSpan="8" className="p-0 bg-slate-50 border-b-2 border-indigo-100">
                                                    <div className="p-4 md:pl-16 md:pr-4">
                                                        {(() => {
                                                            const directDepts = dayReport.departments.filter(d => !d.is_overhead);
                                                            const overheadDepts = dayReport.departments.filter(d => d.is_overhead);
                                                            const directTotal = directDepts.reduce((s, d) => s + (parseFloat(d.total_cost) || 0), 0);
                                                            const overheadTotal = overheadDepts.reduce((s, d) => s + (parseFloat(d.total_cost) || 0), 0);
                                                            const grandTotal = directTotal + overheadTotal;
                                                            const directPct = grandTotal > 0 ? ((directTotal / grandTotal) * 100).toFixed(1) : 0;
                                                            const overheadPct = grandTotal > 0 ? ((overheadTotal / grandTotal) * 100).toFixed(1) : 0;

                                                            const DeptTable = ({ depts, label, isDirect }) => (
                                                                <div className="mb-4">
                                                                    <div className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-t-xl ${isDirect ? 'bg-indigo-600 text-white' : 'bg-slate-500 text-white'}`}>
                                                                        {label}
                                                                    </div>
                                                                    <table className="w-full text-left bg-white border border-slate-200 rounded-b-xl overflow-hidden shadow-sm">
                                                                        <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-500">
                                                                            <tr>
                                                                                <th className="px-4 py-2.5">Department</th>
                                                                                <th className="px-4 py-2.5 text-center">Strength</th>
                                                                                <th className="px-4 py-2.5 text-center">Production</th>
                                                                                <th className="px-4 py-2.5 text-right">Regular Cost</th>
                                                                                <th className="px-4 py-2.5 text-right">OT Cost</th>
                                                                                <th className="px-4 py-2.5 text-right">Total</th>
                                                                                {isDirect && <th className="px-4 py-2.5 text-right bg-indigo-50 text-indigo-600">Cost / Piece</th>}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-100">
                                                                            {depts.map((dept, idx) => {
                                                                                const cpp = dept.production_qty > 0 ? (parseFloat(dept.total_cost) / parseFloat(dept.production_qty)).toFixed(2) : null;
                                                                                return (
                                                                                    <tr key={idx} className="hover:bg-slate-50 text-sm">
                                                                                        <td className="px-4 py-3 font-bold text-slate-700">{dept.department_name}</td>
                                                                                        <td onClick={() => openDrilldown(dayReport.date, dept.department_name, 'STRENGTH')} className="px-4 py-3 text-center font-bold text-blue-600 cursor-pointer hover:bg-blue-50 hover:underline">
                                                                                            {dept.strength}
                                                                                        </td>
                                                                                        <td onClick={() => dept.production_qty > 0 && openDrilldown(dayReport.date, dept.department_name, 'PRODUCTION')} className={`px-4 py-3 text-center font-medium ${dept.production_qty > 0 ? 'text-indigo-600 cursor-pointer hover:bg-indigo-50 hover:underline' : 'text-slate-400'}`}>
                                                                                            {dept.production_qty > 0 ? dept.production_qty : '-'}
                                                                                        </td>
                                                                                        <td onClick={() => openDrilldown(dayReport.date, dept.department_name, 'COST')} className="px-4 py-3 text-right font-medium text-emerald-600 cursor-pointer hover:bg-emerald-50 hover:underline">
                                                                                            {formatMoney(dept.regular_cost)}
                                                                                        </td>
                                                                                        <td className="px-4 py-3 text-right font-medium text-amber-600">{dept.ot_cost > 0 ? formatMoney(dept.ot_cost) : '-'}</td>
                                                                                        <td className="px-4 py-3 text-right font-bold text-slate-800">{formatMoney(dept.total_cost)}</td>
                                                                                        {isDirect && (
                                                                                            <td className="px-4 py-3 text-right bg-indigo-50/40">
                                                                                                {cpp ? <span className="font-black text-indigo-700">₹{cpp}</span> : <span className="text-slate-300 font-bold">—</span>}
                                                                                            </td>
                                                                                        )}
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            );

                                                            return (
                                                                <>
                                                                    {directDepts.length > 0 && <DeptTable depts={directDepts} label="Direct Cost Departments" isDirect={true} />}
                                                                    {overheadDepts.length > 0 && <DeptTable depts={overheadDepts} label="Admin / Overhead Departments" isDirect={false} />}

                                                                    {/* Cost Split Summary */}
                                                                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                                        <div className="px-4 py-2 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest">Cost Split Summary</div>
                                                                        <div className="p-4 flex flex-col md:flex-row gap-4 items-center">
                                                                            <div className="flex-1 w-full">
                                                                                <div className="flex text-[10px] font-black uppercase justify-between mb-1">
                                                                                    <span className="text-indigo-600">Direct {directPct}%</span>
                                                                                    <span className="text-slate-500">Admin {overheadPct}%</span>
                                                                                </div>
                                                                                <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden flex">
                                                                                    <div className="bg-indigo-500 h-full transition-all" style={{ width: `${directPct}%` }} />
                                                                                    <div className="bg-slate-400 h-full transition-all" style={{ width: `${overheadPct}%` }} />
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex gap-3 shrink-0">
                                                                                <div className="flex flex-col items-center bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3 min-w-[130px]">
                                                                                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-1">Direct Cost</span>
                                                                                    <span className="text-xl font-black text-indigo-700">{formatMoney(directTotal)}</span>
                                                                                    <span className="text-xs font-bold text-indigo-400 mt-0.5">{directPct}% of total</span>
                                                                                </div>
                                                                                <div className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 min-w-[130px]">
                                                                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Admin Cost</span>
                                                                                    <span className="text-xl font-black text-slate-700">{formatMoney(overheadTotal)}</span>
                                                                                    <span className="text-xs font-bold text-slate-400 mt-0.5">{overheadPct}% of total</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* --- DRILLDOWN MODAL --- */}
            {drilldown.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <div>
                                <h2 className="text-xl font-black text-slate-800 flex items-center">
                                    {drilldown.type === 'PRODUCTION' && <Package className="mr-2 text-indigo-600"/>}
                                    {drilldown.type === 'STRENGTH' && <Users className="mr-2 text-blue-600"/>}
                                    {drilldown.type === 'COST' && <Calculator className="mr-2 text-emerald-600"/>}
                                    {drilldown.dept} Breakdown
                                </h2>
                                <p className="text-sm font-medium text-slate-500 mt-1">{drilldown.date}</p>
                            </div>
                            <button onClick={() => setDrilldown({ ...drilldown, isOpen: false })} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-auto p-0">
                            {drilldown.loading ? (
                                <div className="flex justify-center items-center h-48"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
                            ) : drilldown.type === 'PRODUCTION' ? (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-100 sticky top-0 shadow-sm text-xs uppercase font-bold text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3">Hour Block</th>
                                            <th className="px-4 py-3">Product Name</th>
                                            <th className="px-4 py-3">Batch Code</th>
                                            <th className="px-4 py-3 text-right bg-indigo-50 text-indigo-700">Pieces Produced</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {drilldown.data.map((row, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 font-bold text-slate-700">{row.hour}</td>
                                                <td className="px-4 py-3 font-medium text-slate-600">{row.product}</td>
                                                <td className="px-4 py-3 text-slate-500 font-mono">{row.batch}</td>
                                                <td className="px-4 py-3 text-right font-black text-indigo-600 bg-indigo-50/20">{row.pieces}</td>
                                            </tr>
                                        ))}
                                        {drilldown.data.length === 0 && (
                                            <tr><td colSpan="4" className="p-8 text-center text-slate-400 font-medium">No production logs found for this day.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            ) : (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-100 sticky top-0 shadow-sm text-xs uppercase font-bold text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3">Employee</th>
                                            <th className="px-4 py-3">Base Salary</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Times</th>
                                            <th className="px-4 py-3 text-right bg-emerald-50 text-emerald-700">Reg. Wage Calc</th>
                                            <th className="px-4 py-3 text-right bg-amber-50 text-amber-700">OT Calc</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {drilldown.data.map((emp, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-slate-800">{emp.employee_name}</div>
                                                    <div className="text-xs text-slate-400">{emp.designation || 'Operator'}</div>
                                                </td>
                                                <td className="px-4 py-3 font-mono">₹{parseFloat(emp.base_salary).toLocaleString()}/mo</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded text-[10px] font-black tracking-wider ${emp.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        {emp.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs font-mono font-bold text-slate-500">
                                                    <span className="text-emerald-600">{emp.punch_in || '--:--'}</span> <br/> 
                                                    {/* SHOW MISSING CLEANLY INSTEAD OF BLANK */}
                                                    <span className="text-rose-600">{emp.punch_out || 'MISSING'}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right bg-emerald-50/30">
                                                    <div className="font-bold text-emerald-700">{formatMoney(emp.regular_cost)}</div>
                                                    <div className="text-[10px] text-emerald-500 mt-0.5 font-bold">
                                                        {emp.status === 'HALF_DAY' ? `(Base / ${emp.month_working_days * 2})` : `(Base / ${emp.month_working_days})`}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right bg-amber-50/30">
                                                    <div className="font-bold text-amber-700">{emp.ot_cost > 0 ? formatMoney(emp.ot_cost) : '-'}</div>
                                                    {emp.ot_cost > 0 && (
                                                        <div className="text-[10px] text-amber-500 mt-0.5 font-bold">
                                                            {parseFloat(emp.overtime_hours).toFixed(1)} hrs × 1.5x
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {monthlySummaryOpen && (
                <MonthlySummaryModal
                    initialMonth={new Date().toISOString().slice(0, 7)}
                    onClose={() => setMonthlySummaryOpen(false)}
                    onOpenDay={jumpToDay}
                />
            )}
        </div>
    );
}