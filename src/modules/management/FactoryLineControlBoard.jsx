import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Factory, Users, Clock, AlertTriangle, Monitor,
    CheckCircle2, Loader2, Shirt, ArrowLeft,
    UserCircle, Activity, Layers, LayoutDashboard,
    PackageSearch, TrendingUp, ChevronDown, ChevronUp,
    Calendar, ChevronRight, WifiOff, RefreshCw
} from 'lucide-react';
// Assuming you have a centralized API client configured (e.g., axios instance)
import { warRoomApi } from '../../api/warRoomApi'; 

// ============================================================================
// DATE HELPERS & PRESETS (Unchanged)
// ============================================================================
const toYMD = (d) => d.toISOString().slice(0, 10);

const getPresetRange = (preset) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    switch (preset) {
        case 'TODAY':      return { from: toYMD(today), to: toYMD(today) };
        case 'YESTERDAY': { const y = new Date(today); y.setDate(y.getDate() - 1); return { from: toYMD(y), to: toYMD(y) }; }
        case 'LAST_7':    { const s = new Date(today); s.setDate(s.getDate() - 6); return { from: toYMD(s), to: toYMD(today) }; }
        case 'THIS_WEEK': { const s = new Date(today); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return { from: toYMD(s), to: toYMD(today) }; }
        case 'THIS_MONTH':{ const s = new Date(today.getFullYear(), today.getMonth(), 1); return { from: toYMD(s), to: toYMD(today) }; }
        default:           return { from: toYMD(today), to: toYMD(today) };
    }
};

const DATE_PRESETS = [
    { key: 'TODAY',      label: 'Today' },
    { key: 'YESTERDAY',  label: 'Yesterday' },
    { key: 'LAST_7',     label: 'Last 7 Days' },
    { key: 'THIS_WEEK',  label: 'This Week' },
    { key: 'THIS_MONTH', label: 'This Month' },
    { key: 'CUSTOM',     label: 'Custom' },
];

const formatDisplayRange = (from, to) => {
    const fmt = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return from === to ? fmt(from) : `${fmt(from)} — ${fmt(to)}`;
};

// ============================================================================
// DATE FILTER BAR
// ============================================================================
const DateFilterBar = ({ dateRange, onChange }) => {
    const { preset, from, to } = dateRange;

    const handlePreset = (key) => {
        if (key === 'CUSTOM') { onChange({ preset: 'CUSTOM', from, to }); return; }
        onChange({ preset: key, ...getPresetRange(key) });
    };

    const handleCustomDate = (field, value) => {
        const next = { ...dateRange, preset: 'CUSTOM', [field]: value };
        if (next.from > next.to) next.to = next.from;
        onChange(next);
    };

    return (
        <div className="mb-6 bg-white rounded-2xl border-2 border-slate-200 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap shadow-sm">
            <div className="flex items-center gap-2 shrink-0">
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Period</span>
            </div>
            <div className="flex flex-wrap gap-2">
                {DATE_PRESETS.map(p => (
                    <button
                        key={p.key}
                        onClick={() => handlePreset(p.key)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border-2 transition-all active:scale-95 ${
                            preset === p.key
                                ? 'bg-black text-white border-black shadow-md'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400'
                        }`}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            {preset === 'CUSTOM' && (
                <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={from} max={to} onChange={e => handleCustomDate('from', e.target.value)} className="px-3 py-1.5 text-xs font-bold border-2 border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-indigo-400 text-slate-700" />
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <input type="date" value={to} min={from} onChange={e => handleCustomDate('to', e.target.value)} className="px-3 py-1.5 text-xs font-bold border-2 border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-indigo-400 text-slate-700" />
                </div>
            )}
            <span className="ml-auto text-xs font-black text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg shrink-0 hidden sm:block">
                {formatDisplayRange(from, to)}
            </span>
        </div>
    );
};

// ============================================================================
// HELPERS
// ============================================================================
const getBatchStatus = (batch) => {
    if (batch.completed >= batch.target && batch.target > 0) return 'COMPLETED';
    if (batch.completed > 0 || (batch.history && batch.history.some(h => h.status === 'IN_PROGRESS'))) return 'IN_PROGRESS';
    return 'PENDING';
};

const STATUS_STYLES = {
    COMPLETED:   { badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', label: 'Completed' },
    IN_PROGRESS: { badge: 'bg-amber-100  text-amber-700',   bar: 'bg-amber-400',   label: 'In Progress' },
    PENDING:     { badge: 'bg-slate-100  text-slate-600',   bar: 'bg-slate-300',   label: 'Pending' },
};

const effColor = (e) => e >= 90 ? 'text-emerald-600' : e >= 75 ? 'text-amber-500' : 'text-rose-600';

// ============================================================================
// DRILL-DOWN: BATCH DETAIL
// ============================================================================
const BatchDetailView = ({ batch, lineName, onBack }) => (
    <div className="animate-in fade-in slide-in-from-right-8 duration-300">
        <button onClick={onBack} className="mb-6 flex items-center text-slate-500 hover:text-black font-black uppercase tracking-widest transition-colors bg-white px-6 py-3 rounded-xl border-2 border-slate-200 shadow-sm active:scale-95">
            <ArrowLeft className="w-5 h-5 mr-3" /> Back to Floor
        </button>
        <div className="bg-white rounded-[2rem] p-10 border-2 border-slate-300 shadow-xl mb-8">
            <div className="flex justify-between items-start mb-10 pb-8 border-b-2 border-slate-100">
                <div>
                    <h2 className="text-4xl font-black text-black flex items-center tracking-tight mb-2">
                        <Shirt className="w-10 h-10 mr-5 text-indigo-600" /> {batch.batchCode}
                    </h2>
                    <span className="text-xl font-bold text-slate-500 flex items-center">
                        <Layers className="w-5 h-5 mr-2" /> {batch.product}
                    </span>
                    {lineName && (
                        <span className="mt-3 inline-block text-sm font-black text-indigo-700 bg-indigo-50 px-4 py-1.5 rounded-full border border-indigo-200 uppercase tracking-wider">
                            {lineName}
                        </span>
                    )}
                </div>
                <div className="text-right">
                    <span className="block text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Target Qty</span>
                    <span className="text-5xl font-black tracking-tighter text-black">{batch.target || 'TBD'}</span>
                </div>
            </div>

            <div className="flex items-center justify-between mb-12 bg-slate-50 p-8 rounded-2xl border-2 border-slate-100">
                <div className="w-full mr-8">
                    <div className="flex justify-between text-sm font-black uppercase tracking-widest text-slate-500 mb-3">
                        <span>Line Progress ({lineName})</span>
                        <span className="text-indigo-600">{batch.target > 0 ? Math.round((batch.completed / batch.target) * 100) : 0}%</span>
                    </div>
                    <div className="h-6 w-full bg-slate-200 rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${batch.target > 0 ? (batch.completed / batch.target) * 100 : 0}%` }} />
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <span className="block text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Completed</span>
                    <span className="text-4xl font-black text-indigo-600">{batch.completed}</span>
                </div>
            </div>

            <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center uppercase tracking-widest">
                <Activity className="w-6 h-6 mr-3 text-indigo-500" /> Routing Timeline
            </h3>
            <div className="space-y-4">
                {batch.history && batch.history.length > 0 ? batch.history.map((stage, idx) => (
                    <div key={idx} className="flex items-center p-6 bg-white border-2 border-slate-200 rounded-2xl hover:border-indigo-300 transition-colors">
                        <div className={`p-3 rounded-xl mr-6 ${stage.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' : stage.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                            {stage.status === 'COMPLETED' ? <CheckCircle2 className="w-6 h-6" /> : stage.status === 'IN_PROGRESS' ? <Loader2 className="w-6 h-6 animate-spin" /> : <Clock className="w-6 h-6" />}
                        </div>
                        <div className="flex-grow">
                            <h4 className="font-black text-xl text-slate-900">{stage.stage}</h4>
                            <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">{stage.time}</span>
                        </div>
                        <div className="text-right">
                            <span className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Pieces Tracked</span>
                            <span className="text-2xl font-black text-slate-800">{stage.pieces}</span>
                        </div>
                    </div>
                )) : (
                    <div className="p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-500 font-bold uppercase tracking-widest">
                        No historical routing data available yet.
                    </div>
                )}
            </div>
        </div>
    </div>
);

// ============================================================================
// DRILL-DOWN: OPERATOR DETAIL (Now with Live Analytics Fetch)
// ============================================================================
const OperatorDetailView = ({ operator, stationName, onBack }) => {
    const [analytics, setAnalytics] = useState([]);
    const [loadingStats, setLoadingStats] = useState(false);

    useEffect(() => {
        if (!operator || !operator.emp_id) return;
        setLoadingStats(true);
        // Fetch real hourly breakdown from backend
        warRoomApi.getOperatorAnalytics(operator.emp_id)
            .then(res => setAnalytics(res.data || []))
            .catch(err => console.error("Failed to load operator stats", err))
            .finally(() => setLoadingStats(false));
    }, [operator]);

    return (
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-300">
            <button onClick={onBack} className="mb-6 flex items-center text-slate-500 hover:text-black font-black uppercase tracking-widest transition-colors bg-white px-6 py-3 rounded-xl border-2 border-slate-200 shadow-sm active:scale-95">
                <ArrowLeft className="w-5 h-5 mr-3" /> Back to Floor
            </button>
            <div className="bg-white rounded-[2rem] p-10 border-2 border-slate-300 shadow-xl mb-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 pb-8 border-b-2 border-slate-100 gap-6">
                    <div className="flex items-center">
                        <div className="w-20 h-20 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-black text-4xl mr-6 shadow-inner">
                            {operator.name.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-4xl font-black text-black tracking-tight">{operator.name}</h2>
                            <span className="text-lg font-bold text-slate-500 flex items-center mt-1">
                                <UserCircle className="w-5 h-5 mr-2" /> {operator.emp_id} | {stationName}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-6 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <div>
                            <span className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Live Efficiency</span>
                            <span className={`text-4xl font-black ${effColor(operator.efficiency)}`}>{operator.efficiency}%</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    {[
                        { icon: <Clock className="w-8 h-8 text-indigo-400" />, label: "Assigned Shift",  value: operator.shift || 'General Shift', color: 'text-slate-800' },
                        { icon: <CheckCircle2 className="w-8 h-8 text-emerald-500" />, label: "Punch In Time", value: operator.punch_in || 'N/A', color: 'text-slate-800' },
                        {
                            icon: <AlertTriangle className={`w-8 h-8 ${operator.attendance === 'PRESENT' ? 'text-emerald-500' : 'text-rose-500'}`} />,
                            label: "Today's Status",
                            value: (operator.attendance || 'UNKNOWN').replace('_', ' '),
                            color: operator.attendance === 'PRESENT' ? 'text-emerald-600' : 'text-rose-600',
                        },
                    ].map(({ icon, label, value, color }) => (
                        <div key={label} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-center gap-4">
                            {icon}
                            <div>
                                <span className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{label}</span>
                                <span className={`text-lg font-black ${color} uppercase tracking-widest`}>{value}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center uppercase tracking-widest">
                    <Activity className="w-6 h-6 mr-3 text-indigo-500" /> Hourly Output Log
                </h3>
                <div className="space-y-4">
                    {loadingStats ? (
                        <div className="p-8 text-center bg-slate-50 rounded-2xl flex items-center justify-center">
                            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin mr-2" /> <span className="text-slate-500 font-bold uppercase tracking-widest">Loading Logs...</span>
                        </div>
                    ) : analytics.length === 0 ? (
                        <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                            <span className="text-slate-400 font-bold uppercase tracking-widest">No activity logged today.</span>
                        </div>
                    ) : (
                        analytics.map((act, idx) => {
                            const dateObj = new Date(act.hour_slot);
                            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                            return (
                                <div key={idx} className="flex justify-between items-center p-6 bg-white border-2 border-slate-200 rounded-2xl hover:border-indigo-300 transition-colors">
                                    <div>
                                        <span className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1 block">Hour Block</span>
                                        <h4 className="font-black text-lg text-slate-900">{timeStr}</h4>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Pieces Processed</span>
                                        <span className="text-2xl font-black text-indigo-600">+{act.pieces_processed}</span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// LINE MODE — WORKSTATION CARD
// ============================================================================
const WorkstationCard = ({ ws, onClick }) => {
    const hasOp     = !!ws.operator;
    const isPresent = hasOp && ws.operator.attendance === 'PRESENT';
    const isHalfDay = hasOp && ws.operator.attendance === 'HALF_DAY';
    const isAbsent  = hasOp && !isPresent && !isHalfDay;

    const borderColor  = !hasOp ? 'border-slate-200' : isPresent ? 'border-emerald-500' : isHalfDay ? 'border-amber-400' : 'border-rose-500';
    const avatarColors = !hasOp ? '' : isPresent ? 'bg-emerald-100 text-emerald-700' : isHalfDay ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';
    const badgeColors  = !hasOp ? '' : isPresent ? 'bg-emerald-500 text-white' : isHalfDay ? 'bg-amber-400 text-black' : 'bg-rose-500 text-white';

    return (
        <div onClick={() => hasOp && onClick(ws.operator, ws.name)} className={`bg-white rounded-2xl p-5 border-2 min-w-[300px] flex-shrink-0 transition-all ${hasOp ? 'cursor-pointer hover:border-indigo-400 hover:shadow-lg active:scale-[0.98]' : 'border-slate-200 opacity-70'}`}>
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-slate-800 text-sm tracking-tight flex items-center truncate max-w-[200px]">
                    <Monitor className="w-4 h-4 mr-2 text-indigo-500 shrink-0" /> {ws.name}
                </h3>
                <span className="bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded shadow-sm">
                    {ws.type || 'Terminal'}
                </span>
            </div>

            {!hasOp ? (
                <div className="flex items-center p-4 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 h-[100px]">
                    <UserCircle className="w-9 h-9 text-slate-300 mr-3" />
                    <div>
                        <span className="block text-sm font-black text-slate-400 uppercase tracking-widest">No Operator</span>
                        <span className="text-xs font-bold text-rose-500 mt-0.5 block">Terminal Unassigned</span>
                    </div>
                </div>
            ) : (
                <div className={`p-4 rounded-xl border-l-8 ${borderColor} shadow-sm flex justify-between items-center h-[100px] bg-white`}>
                    <div className="flex items-center">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl mr-3 shadow-inner shrink-0 ${avatarColors}`}>
                            {ws.operator.name.charAt(0)}
                        </div>
                        <div>
                            <h4 className="font-black text-slate-900 text-base leading-tight mb-0.5 truncate max-w-[120px]">{ws.operator.name}</h4>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1.5">{ws.operator.emp_id}</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${badgeColors}`}>
                                {ws.operator.attendance.replace('_', ' ')}
                            </span>
                        </div>
                    </div>
                    {!isAbsent && (
                        <div className="text-right ml-2 shrink-0">
                            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">OEE</span>
                            <span className={`text-2xl font-black ${effColor(ws.operator.efficiency)}`}>{ws.operator.efficiency || 0}%</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// LINE MODE — LINE CARD
// ============================================================================
const LineCard = ({ line, onBatchClick, onOperatorClick }) => {
    const [expanded, setExpanded] = useState(true);

    const wipWarning   = line.metrics.current_wip > line.wip_limit;
    const dhuWarning   = line.metrics.dhu > 3;
    const presentCount = line.workstations.filter(
        ws => ws.operator && (ws.operator.attendance === 'PRESENT' || ws.operator.attendance === 'HALF_DAY')
    ).length;

    const lineHealth = wipWarning || dhuWarning ? (wipWarning && dhuWarning ? 'CRITICAL' : 'WARN') : 'HEALTHY';

    const healthStyles = {
        HEALTHY:  { bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700', label: 'Healthy' },
        WARN:     { bar: 'bg-amber-400',   badge: 'bg-amber-100  text-amber-700',   label: 'Warning' },
        CRITICAL: { bar: 'bg-rose-500',    badge: 'bg-rose-100   text-rose-700',    label: 'Critical' },
    }[lineHealth];

    return (
        <div className={`bg-white rounded-[2rem] shadow-xl border-2 overflow-hidden transition-all ${wipWarning ? 'border-rose-400' : 'border-slate-300'}`}>
            <div className={`h-1.5 w-full ${healthStyles.bar}`} />
            <div className="bg-slate-100 px-8 py-6 border-b-2 border-slate-200 flex flex-col xl:flex-row justify-between gap-6">
                <div className="flex-1">
                    <div className="flex items-center flex-wrap gap-3 mb-4">
                        <h2 className="text-2xl font-black text-black uppercase tracking-tight">{line.line_name}</h2>
                        <span className={`text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest ${healthStyles.badge}`}>{healthStyles.label}</span>
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                        {line.active_batches.map(batch => {
                            const pct  = batch.target > 0 ? Math.round((batch.completed / batch.target) * 100) : 0;
                            const sc   = STATUS_STYLES[getBatchStatus(batch)];
                            return (
                                <button key={batch.batchCode} onClick={() => onBatchClick(batch, line.line_name)} className="group flex items-center bg-black hover:bg-indigo-700 text-white pl-4 pr-2.5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-md transition-all active:scale-95">
                                    <Shirt className="w-4 h-4 mr-2 text-indigo-400 group-hover:text-white transition-colors" />
                                    {batch.batchCode}
                                    <span className={`ml-3 text-[10px] font-black px-2 py-0.5 rounded-md ${sc.badge}`}>{pct}%</span>
                                </button>
                            );
                        })}
                        {line.active_batches.length === 0 && <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">No Active Batches</span>}
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 shrink-0 items-start">
                    <div className={`p-5 rounded-2xl border-4 flex flex-col justify-center min-w-[155px] ${wipWarning ? 'bg-rose-50 border-rose-500' : 'bg-white border-slate-200'}`}>
                        <span className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${wipWarning ? 'text-rose-600' : 'text-slate-500'}`}>WIP Queue</span>
                        <div className="flex items-baseline gap-1">
                            <span className={`text-4xl font-black ${wipWarning ? 'text-rose-600' : 'text-black'}`}>{line.metrics.current_wip}</span>
                            <span className="text-lg font-bold text-slate-400">/ {line.wip_limit || '∞'}</span>
                        </div>
                        {wipWarning && <span className="text-[10px] font-black text-white bg-rose-600 px-2 py-0.5 rounded mt-1.5 w-max animate-pulse">LIMIT EXCEEDED</span>}
                    </div>

                    <div className={`p-5 rounded-2xl border-2 flex flex-col justify-center min-w-[130px] ${dhuWarning ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-200'}`}>
                        <span className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${dhuWarning ? 'text-amber-600' : 'text-slate-500'}`}>DHU Rate</span>
                        <span className={`text-4xl font-black ${dhuWarning ? 'text-amber-600' : 'text-black'}`}>{line.metrics.dhu}%</span>
                    </div>

                    <div className="p-5 rounded-2xl border-2 border-slate-200 bg-white flex flex-col justify-center min-w-[130px]">
                        <span className="text-[10px] font-black uppercase tracking-widest mb-0.5 text-slate-500">Output Today</span>
                        <span className="text-4xl font-black text-indigo-600">{line.metrics.total_completed}</span>
                    </div>

                    <div className="p-5 rounded-2xl border-2 border-slate-200 bg-white flex flex-col justify-center min-w-[130px]">
                        <span className="text-[10px] font-black uppercase tracking-widest mb-0.5 text-slate-500">Manpower</span>
                        <div className="flex items-center gap-2">
                            <Users className="w-7 h-7 text-slate-300" />
                            <span className="text-4xl font-black text-black">{presentCount}<span className="text-xl text-slate-400">/{line.workstations.length}</span></span>
                        </div>
                    </div>
                </div>
            </div>

            <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between px-8 py-3 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{line.workstations.length} Workstations</span>
                {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {expanded && (
                <div className="p-6 bg-slate-50 overflow-x-auto">
                    <div className="flex gap-4 pb-2">
                        {line.workstations.map(ws => <WorkstationCard key={ws.id} ws={ws} onClick={onOperatorClick} />)}
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// BATCH MODE — BATCH CARD
// ============================================================================
const BatchModeCard = ({ batch, lineName, onClick }) => {
    const status  = getBatchStatus(batch);
    const sc      = STATUS_STYLES[status];
    const pct     = batch.target > 0 ? Math.round((batch.completed / batch.target) * 100) : 0;
    const activeStage = batch.history && batch.history.find(h => h.status === 'IN_PROGRESS') || (batch.history ? batch.history[batch.history.length - 1] : null);

    return (
        <div onClick={onClick} className="bg-white rounded-2xl border-2 border-slate-200 hover:border-indigo-400 hover:shadow-xl transition-all cursor-pointer active:scale-[0.98] overflow-hidden flex flex-col">
            <div className={`h-1 w-full ${sc.bar}`} />
            <div className="p-6 flex-grow flex flex-col">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0"><Shirt className="w-5 h-5 text-indigo-600" /></div>
                        <div>
                            <h3 className="font-black text-slate-900 text-lg leading-tight">{batch.batchCode}</h3>
                            <span className="text-xs font-bold text-slate-500 leading-tight">{batch.product}</span>
                        </div>
                    </div>
                    <span className={`text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-wider shrink-0 ml-2 ${sc.badge}`}>{sc.label}</span>
                </div>

                <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                    <span className="text-xs font-black text-slate-600 uppercase tracking-widest truncate">{lineName}</span>
                </div>

                <div className="mb-auto">
                    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-500 mb-1.5">
                        <span>Progress</span>
                        <span className={status === 'COMPLETED' ? 'text-emerald-600' : 'text-indigo-600'}>{pct}%</span>
                    </div>
                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between mt-1">
                        <span className="text-[10px] font-bold text-slate-400">{batch.completed} pcs done</span>
                        <span className="text-[10px] font-bold text-slate-400">Target: {batch.target || 'TBD'}</span>
                    </div>
                </div>

                {batch.history && batch.history.length > 0 && (
                    <div className="flex items-center gap-1 mt-4 mb-4 overflow-x-auto pb-0.5">
                        {batch.history.map((h, idx) => (
                            <React.Fragment key={idx}>
                                <div title={`${h.stage} — ${h.time}`} className={`w-3 h-3 rounded-full flex-shrink-0 transition-all ${h.status === 'COMPLETED' ? 'bg-emerald-500' : h.status === 'IN_PROGRESS' ? 'bg-amber-400 ring-2 ring-amber-200 animate-pulse' : 'bg-slate-200'}`} />
                                {idx < batch.history.length - 1 && <div className={`flex-1 h-0.5 min-w-[10px] ${h.status === 'COMPLETED' ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                            </React.Fragment>
                        ))}
                    </div>
                )}

                {activeStage && (
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-4">
                        <div className="flex items-center gap-2">
                            {activeStage.status === 'IN_PROGRESS' ? <Loader2 className="w-4 h-4 text-amber-500 animate-spin flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                            <span className="text-xs font-black text-slate-700 uppercase tracking-wider truncate max-w-[120px]">{activeStage.stage}</span>
                        </div>
                        <span className="text-xs font-bold text-slate-400 shrink-0">{activeStage.time}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// ROOT COMPONENT
// ============================================================================
export default function FactoryLineControlBoard() {
    const [data, setData] = useState({ lines: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastRefreshed, setLastRefreshed] = useState(new Date());

    const [boardMode, setBoardMode] = useState('LINE');
    const [drillMode, setDrillMode] = useState('MAIN');
    const [selectedEntity, setSelectedEntity] = useState(null);
    const [contextInfo, setContextInfo] = useState('');
    const [batchFilter, setBatchFilter] = useState('ALL');
    const [dateRange, setDateRange] = useState({ preset: 'TODAY', ...getPresetRange('TODAY') });

    // ─── DATA FETCHING ENGINE ───
    const loadDashboardData = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        setError(null);
        try {
            // Replace with actual configured API client
            const response = await warRoomApi.getFloorStatus(dateRange.from, dateRange.to);
            // MOCKING FOR DEMONSTRATION OF MAPPED STRUCTURE
            // const response = await { data: { lines: [
            //     {
            //         line_id: 1, line_name: "Line 1 — Main Assembly", wip_limit: 5,
            //         metrics: { total_completed: 450, current_wip: 2, dhu: 1.2 },
            //         active_batches: [{ batch_code: "BCH-1092", product: "Men's Polo (Navy)", target: 1200, completed: 450 }],
            //         workstations: [{ id: 101, name: "Station 1A", type: "loader", operator: { name: "Ravi K.", emp_id: "EMP-4012", attendance: "PRESENT", efficiency: 94 } }]
            //     }
            // ]}};

            // ─── DATA NORMALIZATION MAPPING ───
            // We map the backend snake_case to frontend camelCase expectations safely.
            const normalizedLines = (response.data?.lines || []).map(line => ({
                line_id: line.line_id,
                line_name: line.line_name,
                wip_limit: line.wip_limit || 10,
                metrics: line.metrics || { total_completed: 0, current_wip: 0, dhu: 0 },
                active_batches: (line.active_batches || []).map(b => ({
                    batchCode: b.batch_code || 'UNKNOWN',
                    product: b.product || 'Unknown Product',
                    target: parseInt(b.target) || 0,
                    completed: parseInt(b.completed) || 0,
                    // Inject a safe fallback history if backend hasn't implemented it yet
                    history: b.history || [{ stage: "Production Line", time: "Live", pieces: parseInt(b.completed) || 0, status: 'IN_PROGRESS' }]
                })),
                workstations: (line.workstations || []).map(ws => ({
                    id: ws.id,
                    name: ws.name,
                    type: ws.type,
                    operator: ws.operator ? {
                        name: ws.operator.name,
                        emp_id: ws.operator.emp_id,
                        attendance: ws.operator.attendance || 'PRESENT',
                        efficiency: ws.operator.efficiency || 0,
                        shift: ws.operator.shift || 'General',
                        punch_in: ws.operator.punch_in || 'Logged In',
                        activity: ws.operator.activity || []
                    } : null
                }))
            }));

            setData({ lines: normalizedLines });
            setLastRefreshed(new Date());
        } catch (err) {
            console.error("Dashboard Fetch Error:", err);
            setError("Connection to floor sensors lost. Retrying...");
        } finally {
            setLoading(false);
        }
    }, [dateRange]);

    // Initial Load & Auto-Polling (Every 60 seconds)
    useEffect(() => {
        loadDashboardData(false);
        const intervalId = setInterval(() => loadDashboardData(true), 60000);
        return () => clearInterval(intervalId);
    }, [loadDashboardData]);

    const allBatches = useMemo(() => {
        if (!data || !data.lines) return [];
        return data.lines.flatMap(line =>
            line.active_batches.map(batch => ({ ...batch, lineName: line.line_name, line_id: line.line_id }))
        );
    }, [data]);

    const filteredBatches = useMemo(() => {
        if (batchFilter === 'ALL') return allBatches;
        return allBatches.filter(b => getBatchStatus(b) === batchFilter);
    }, [allBatches, batchFilter]);

    const stats = useMemo(() => {
        if (!data || !data.lines) return {};
        const totalOutput  = data.lines.reduce((s, l) => s + (l.metrics?.total_completed || 0), 0);
        const wipAlerts    = data.lines.filter(l => (l.metrics?.current_wip || 0) > (l.wip_limit || 0)).length;
        const allOps       = data.lines.flatMap(l => (l.workstations || []).map(w => w.operator).filter(Boolean));
        const presentOps   = allOps.filter(o => o.attendance === 'PRESENT' || o.attendance === 'HALF_DAY').length;
        return {
            totalBatches: allBatches.length,
            inProgress:   allBatches.filter(b => getBatchStatus(b) === 'IN_PROGRESS').length,
            completed:    allBatches.filter(b => getBatchStatus(b) === 'COMPLETED').length,
            totalOutput, wipAlerts, presentOps, totalOps: allOps.length,
        };
    }, [data, allBatches]);

    const handleBatchClick    = (batch, lineName) => { setSelectedEntity(batch);    setContextInfo(lineName);    setDrillMode('BATCH_DETAIL'); };
    const handleOperatorClick = (operator, name)  => { if (!operator) return;       setSelectedEntity(operator); setContextInfo(name);        setDrillMode('OPERATOR_DETAIL'); };
    const goBack              = ()                 => { setDrillMode('MAIN');        setSelectedEntity(null);     setContextInfo(''); };

    const switchBoardMode = (mode) => { setBoardMode(mode); goBack(); };

    if (loading && data.lines.length === 0) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-200">
            <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
            <h2 className="text-2xl font-black text-slate-500 uppercase tracking-widest">Initializing War Room...</h2>
        </div>
    );

    const BATCH_FILTERS = [
        { key: 'ALL',         label: 'All',         count: allBatches.length },
        { key: 'IN_PROGRESS', label: 'In Progress', count: stats.inProgress },
        { key: 'PENDING',     label: 'Pending',     count: allBatches.filter(b => getBatchStatus(b) === 'PENDING').length },
        { key: 'COMPLETED',   label: 'Completed',   count: stats.completed },
    ];

    return (
        <div className="min-h-screen bg-slate-200 p-4 md:p-10 font-inter relative">
            
            {/* Connection Error Banner */}
            {error && (
                <div className="fixed top-0 left-0 w-full bg-rose-600 text-white p-3 z-50 flex justify-center items-center font-bold text-sm tracking-widest uppercase shadow-lg animate-in slide-in-from-top-4">
                    <WifiOff className="w-4 h-4 mr-2 animate-pulse" /> {error}
                </div>
            )}

            <div className="max-w-[1800px] mx-auto mt-4">

                {/* ─── GLOBAL HEADER ─── */}
                <div className="mb-8 bg-black p-6 md:p-8 rounded-[2rem] shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight flex items-center uppercase">
                            <Factory className="w-9 h-9 mr-4 text-amber-400" /> Line Control Board
                        </h1>
                        <div className="flex items-center mt-2 pl-[52px]">
                            <span className="text-slate-400 font-bold tracking-widest uppercase text-sm">Live Workstation Mapping</span>
                            <span className="mx-3 text-slate-700">•</span>
                            <div className="flex items-center text-xs font-bold tracking-widest text-emerald-400 uppercase bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                                <RefreshCw className={`w-3 h-3 mr-2 ${loading ? 'animate-spin' : ''}`} /> 
                                Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
                        {boardMode === 'LINE' && drillMode === 'MAIN' && (
                            <div className="flex items-center gap-4 bg-slate-900 px-4 py-3 rounded-xl border border-slate-800 shrink-0">
                                {[
                                    { color: 'bg-emerald-500', label: 'Present' },
                                    { color: 'bg-amber-400',   label: 'Half Day' },
                                    { color: 'bg-rose-500',    label: 'Absent' },
                                ].map(({ color, label }) => (
                                    <div key={label} className="flex items-center gap-1.5">
                                        <span className={`w-2.5 h-2.5 ${color} rounded-full`} />
                                        <span className="text-xs font-bold text-white uppercase tracking-widest">{label}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-800 w-full sm:w-auto overflow-x-auto shrink-0">
                            <button onClick={() => switchBoardMode('LINE')} className={`flex flex-1 justify-center items-center gap-2 px-5 py-2.5 rounded-lg font-black text-sm uppercase tracking-widest transition-all whitespace-nowrap ${boardMode === 'LINE' ? 'bg-white text-black shadow-md' : 'text-slate-400 hover:text-white'}`}>
                                <LayoutDashboard className="w-4 h-4" /> Line Mode
                            </button>
                            <button onClick={() => switchBoardMode('BATCH')} className={`flex flex-1 justify-center items-center gap-2 px-5 py-2.5 rounded-lg font-black text-sm uppercase tracking-widest transition-all whitespace-nowrap ${boardMode === 'BATCH' ? 'bg-white text-black shadow-md' : 'text-slate-400 hover:text-white'}`}>
                                <PackageSearch className="w-4 h-4" /> Batch Mode
                            </button>
                        </div>
                    </div>
                </div>

                {drillMode === 'MAIN' && <DateFilterBar dateRange={dateRange} onChange={setDateRange} />}

                {drillMode === 'MAIN' && (
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
                        {[
                            { icon: <Layers className="w-5 h-5" />,    label: 'Total Batches',  value: stats.totalBatches,                     color: 'text-indigo-600' },
                            { icon: <Loader2 className="w-5 h-5 animate-spin" />, label: 'In Progress', value: stats.inProgress,              color: 'text-amber-600' },
                            { icon: <CheckCircle2 className="w-5 h-5" />, label: 'Completed',   value: stats.completed,                        color: 'text-emerald-600' },
                            { icon: <TrendingUp className="w-5 h-5" />, label: 'Total Output',  value: stats.totalOutput,                      color: 'text-indigo-600' },
                            { icon: <AlertTriangle className="w-5 h-5" />, label: 'WIP Alerts', value: stats.wipAlerts,                         color: stats.wipAlerts > 0 ? 'text-rose-600' : 'text-emerald-600' },
                            { icon: <Users className="w-5 h-5" />,      label: 'Present / Total', value: `${stats.presentOps}/${stats.totalOps}`, color: 'text-slate-800' },
                        ].map(({ icon, label, value, color }) => (
                            <div key={label} className="bg-white rounded-2xl p-4 border-2 border-slate-200 flex items-center gap-3">
                                <div className={`${color} opacity-60 shrink-0`}>{icon}</div>
                                <div>
                                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{label}</span>
                                    <span className={`text-xl font-black ${color}`}>{value}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {drillMode === 'BATCH_DETAIL' && <BatchDetailView batch={selectedEntity} lineName={contextInfo} onBack={goBack} />}
                {drillMode === 'OPERATOR_DETAIL' && <OperatorDetailView operator={selectedEntity} stationName={contextInfo} onBack={goBack} />}

                {drillMode === 'MAIN' && boardMode === 'LINE' && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                        {data.lines.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-300">
                                <Factory className="w-14 h-14 text-slate-300 mx-auto mb-4" />
                                <span className="text-slate-400 font-black uppercase tracking-widest">No active lines found for this period</span>
                            </div>
                        ) : (
                            data.lines.map(line => <LineCard key={line.line_id} line={line} onBatchClick={handleBatchClick} onOperatorClick={handleOperatorClick} />)
                        )}
                    </div>
                )}

                {drillMode === 'MAIN' && boardMode === 'BATCH' && (
                    <div className="animate-in fade-in duration-500">
                        <div className="flex flex-wrap gap-2 mb-6">
                            {BATCH_FILTERS.map(f => (
                                <button key={f.key} onClick={() => setBatchFilter(f.key)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm uppercase tracking-widest border-2 transition-all ${batchFilter === f.key ? 'bg-black text-white border-black shadow-lg' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                                    {f.label}
                                    <span className={`text-xs font-black px-2 py-0.5 rounded-full ${batchFilter === f.key ? 'bg-white text-black' : 'bg-slate-100 text-slate-600'}`}>{f.count}</span>
                                </button>
                            ))}
                        </div>
                        {filteredBatches.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-300">
                                <PackageSearch className="w-14 h-14 text-slate-300 mx-auto mb-4" />
                                <span className="text-slate-400 font-black uppercase tracking-widest">No batches match this filter</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {filteredBatches.map(batch => <BatchModeCard key={`${batch.line_id}-${batch.batchCode}`} batch={batch} lineName={batch.lineName} onClick={() => handleBatchClick(batch, batch.lineName)} />)}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}