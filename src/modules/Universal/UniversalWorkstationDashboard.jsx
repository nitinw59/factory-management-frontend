import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LuClock, LuLayers, LuChevronRight, LuDownload, LuLoader, LuCircleCheck, LuX } from 'react-icons/lu';
import { universalApi } from '../../api/universalApi';
import { useSupervisorPinPrompt, withSupervisorPin } from '../../shared/SupervisorPinPrompt';
import PriorityChip from '../../shared/PriorityChip';
import { materialReplacementApi } from '../../api/materialReplacementApi';
import { MaterialReplacementRequestModal, MaterialReplacementStatusModal } from './MaterialReplacementModals';
import MaterialReplacementsPage from '../initialisation_portal/MaterialReplacementsPage';
import {
    Shirt, Layers, ClipboardCheck, Component, Check, X,
    Hammer, Loader2, Menu, ChevronDown, ChevronRight, CheckCircle2,
    Square, CheckSquare, XCircle, ArrowLeft, Package, Send, AlertCircle, Zap,
    LogOut, FileText, ThumbsUp, LayoutGrid, History, ChevronLeft, BarChart2,
    ShieldAlert, ShieldCheck, RefreshCw, Ruler, Lock, RotateCcw, PackageX, AlertTriangle, Flag,
} from 'lucide-react';

// Supervisor overrides (unlock a rejected piece / revert an approval) are
// verified SERVER-side against each line supervisor's own override password
// (set in the Sewing Manager portal) and logged with who authorised them.

const PART_FILTER_LS_KEY = 'ws-part-filter';
const BATCH_FILTER_LS_KEY = 'ws-selected-batch';
const STATS_REFRESH_MS   = 60_000;

// ── Work Log helpers ──────────────────────────────────────────────────────────
const ACTION_STYLE = {
    APPROVED:     'bg-emerald-100 text-emerald-700',
    NEEDS_REWORK: 'bg-amber-100  text-amber-700',
    QC_REJECTED:  'bg-red-100    text-red-700',
    REPAIRED:     'bg-teal-100   text-teal-700',
};
const ActionBadge = ({ action }) => (
    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide whitespace-nowrap ${ACTION_STYLE[action] ?? 'bg-gray-100 text-gray-600'}`}>
        {action?.replace(/_/g, ' ') ?? '—'}
    </span>
);
const fmtTime = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso; }
};
function mergeWorkData(data) {
    if (!data) return [];
    // NEEDS_REWORK is already captured in defect_logs — skip those scan rows to avoid double entry
    const scans = (data.rows || []).filter(r => r.action !== 'NEEDS_REWORK').map(r => ({ ...r, _type: 'scan' }));
    const defects = (data.defect_logs || []).map(d => ({
        time: d.time, batch_id: d.batch_id, batch_code: d.batch_code,
        part_name: d.part_name, size: d.size, fabric_roll_id: d.fabric_roll_id,
        piece_sequence: d.piece_sequence, action: d.severity,
        defect_code: d.defect_code, defect_description: d.defect_description,
        is_resolved: d.is_resolved, _type: 'defect',
    }));
    return [...scans, ...defects].sort((a, b) => new Date(a.time) - new Date(b.time));
}

const WorkLogModal = ({ workData, loading, onClose, onDateChange, onExport }) => {
    const [mode,       setMode]       = useState('hourly');
    const [openGroups, setOpenGroups] = useState(new Set());
    const [modalDate,  setModalDate]  = useState(
        workData?.date ?? new Date().toISOString().split('T')[0]
    );
    const merged = useMemo(() => mergeWorkData(workData), [workData]);
    const top3Defects = useMemo(() => {
        const freq = {};
        (workData?.defect_logs ?? []).forEach(d => {
            const k = d.defect_code ?? '—';
            if (!freq[k]) freq[k] = { code: d.defect_code, description: d.defect_description, count: 0 };
            freq[k].count += 1;
        });
        return Object.values(freq).sort((a, b) => b.count - a.count).slice(0, 3);
    }, [workData]);
    const grouped = useMemo(() => {
        const groups = {};
        merged.forEach(row => {
            const key = mode === 'hourly'
                ? (() => { const h = new Date(row.time).getHours(); return `${String(h).padStart(2,'0')}:00 – ${String(h+1).padStart(2,'0')}:00`; })()
                : `Roll #${row.fabric_roll_id ?? 'Unknown'}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        });
        return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b));
    }, [merged, mode]);
    const groupedRoll = useMemo(() => {
        if (mode !== 'roll') return [];
        const rolls = {};
        merged.forEach(row => {
            const rKey  = `Roll #${row.fabric_roll_id ?? 'Unknown'}`;
            const ptKey = `${row.part_name ?? 'Unknown'} | Sz ${row.size ?? '—'}`;
            if (!rolls[rKey]) rolls[rKey] = {};
            if (!rolls[rKey][ptKey]) rolls[rKey][ptKey] = [];
            rolls[rKey][ptKey].push(row);
        });
        return Object.entries(rolls).sort(([a],[b]) => a.localeCompare(b))
            .map(([rKey, pts]) => [rKey, Object.entries(pts).sort(([a],[b]) => a.localeCompare(b))]);
    }, [merged, mode]);
    useEffect(() => { setOpenGroups(new Set()); }, [mode, workData]);
    const toggleGroup = (key) => setOpenGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const handleDateChange = (e) => { const d = e.target.value; setModalDate(d); onDateChange(d); };
    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div>
                            <h2 className="text-base font-black text-gray-900">Work Log</h2>
                            <p className="text-xs text-gray-400">{merged.length} entries · {mode === 'roll' ? groupedRoll.length : grouped.length} groups</p>
                        </div>
                        <input type="date" value={modalDate} onChange={handleDateChange}
                            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 bg-gray-50" />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 rounded-lg p-0.5">
                            <button onClick={() => setMode('hourly')} className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition ${mode==='hourly'?'bg-white shadow-sm text-indigo-600':'text-gray-500 hover:text-gray-700'}`}><LuClock size={11}/> Hourly</button>
                            <button onClick={() => setMode('roll')} className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition ${mode==='roll'?'bg-white shadow-sm text-indigo-600':'text-gray-500 hover:text-gray-700'}`}><LuLayers size={11}/> Fabric Roll</button>
                        </div>
                        <button onClick={() => onExport(grouped, mode, modalDate)} disabled={!grouped.length}
                            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition shadow-sm disabled:opacity-40">
                            <LuDownload size={12}/> Export CSV
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition"><LuX size={16} className="text-gray-500"/></button>
                    </div>
                </div>
                {!loading && top3Defects.length > 0 && (
                    <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-amber-700 shrink-0">Top Rework:</span>
                        {top3Defects.map((d, i) => (
                            <div key={d.code} className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-lg px-2 py-0.5 shadow-sm">
                                <span className="text-sm">{['🥇','🥈','🥉'][i]}</span>
                                <span className="text-xs font-black text-gray-700 font-mono">{d.code}</span>
                                {d.description && <span className="text-xs text-gray-500 hidden sm:inline">— {d.description}</span>}
                                <span className="ml-1 text-xs font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">{d.count}×</span>
                            </div>
                        ))}
                    </div>
                )}
                <div className="overflow-auto flex-1 p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                            <LuLoader size={18} className="animate-spin"/><span className="text-sm">Loading…</span>
                        </div>
                    ) : merged.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <LuCircleCheck size={36} className="mb-2 opacity-30"/>
                            <p className="text-sm font-medium">No work logged for this date.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {mode === 'roll' ? (
                                groupedRoll.map(([rollKey, partGroups]) => {
                                    const rollRows = partGroups.flatMap(([, rows]) => rows);
                                    const approved = rollRows.filter(r => r.action==='APPROVED').length;
                                    const rework   = rollRows.filter(r => r.action==='NEEDS_REWORK').length;
                                    const repaired = rollRows.filter(r => r.action==='REPAIRED').length;
                                    const rejected = rollRows.filter(r => r.action==='QC_REJECTED').length;
                                    const isOpen   = openGroups.has(rollKey);
                                    return (
                                        <div key={rollKey} className="border border-gray-200 rounded-xl overflow-hidden">
                                            <button type="button" onClick={() => toggleGroup(rollKey)}
                                                className="w-full bg-gray-50 hover:bg-gray-100 px-4 py-2 flex items-center justify-between transition text-left">
                                                <div className="flex items-center gap-2">
                                                    <LuChevronRight size={14} className={`text-gray-400 transition-transform shrink-0 ${isOpen?'rotate-90':''}`}/>
                                                    <span className="font-black text-gray-700 text-sm">{rollKey}</span>
                                                    <span className="text-[10px] font-bold text-gray-400">{partGroups.length} type{partGroups.length!==1?'s':''}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs font-semibold">
                                                    {approved>0 && <span className="text-emerald-600">{approved} approved</span>}
                                                    {repaired>0 && <span className="text-teal-600">{repaired} repaired</span>}
                                                    {rework>0   && <span className="text-amber-600">{rework} rework</span>}
                                                    {rejected>0 && <span className="text-red-600">{rejected} rejected</span>}
                                                    <span className="text-gray-400 font-normal">{rollRows.length} total</span>
                                                </div>
                                            </button>
                                            {isOpen && (
                                                <div className="p-2 space-y-1.5 bg-white border-t border-gray-100">
                                                    {partGroups.map(([ptKey, ptRows]) => {
                                                        const ptApproved = ptRows.filter(r => r.action==='APPROVED').length;
                                                        const ptRework   = ptRows.filter(r => r.action==='NEEDS_REWORK').length;
                                                        const ptRepaired = ptRows.filter(r => r.action==='REPAIRED').length;
                                                        const ptRejected = ptRows.filter(r => r.action==='QC_REJECTED').length;
                                                        const ptKey2     = `pt::${rollKey}::${ptKey}`;
                                                        const isPtOpen   = openGroups.has(ptKey2);
                                                        return (
                                                            <div key={ptKey} className="border border-gray-200 rounded-lg overflow-hidden">
                                                                <button type="button" onClick={() => toggleGroup(ptKey2)}
                                                                    className="w-full bg-gray-50 hover:bg-gray-100 px-3 py-1.5 flex items-center justify-between transition text-left">
                                                                    <div className="flex items-center gap-2">
                                                                        <LuChevronRight size={12} className={`text-gray-400 transition-transform shrink-0 ${isPtOpen?'rotate-90':''}`}/>
                                                                        <span className="font-black text-gray-700 text-xs capitalize">{ptKey}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-3 text-[11px] font-semibold">
                                                                        {ptApproved>0 && <span className="text-emerald-600">{ptApproved} approved</span>}
                                                                        {ptRepaired>0 && <span className="text-teal-600">{ptRepaired} repaired</span>}
                                                                        {ptRework>0   && <span className="text-amber-600">{ptRework} rework</span>}
                                                                        {ptRejected>0 && <span className="text-red-600">{ptRejected} rejected</span>}
                                                                        <span className="text-gray-400 font-normal">{ptRows.length}</span>
                                                                    </div>
                                                                </button>
                                                                {isPtOpen && (
                                                                    <table className="w-full text-xs border-t border-gray-100">
                                                                        <tbody>
                                                                            {ptRows.map((r, i) => (
                                                                                <tr key={i} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${r._type==='defect'?'bg-amber-50/40':''}`}>
                                                                                    <td className="px-3 py-1.5 font-mono text-gray-400 whitespace-nowrap">{fmtTime(r.time)}</td>
                                                                                    <td className="px-3 py-1.5 font-semibold text-gray-800 whitespace-nowrap">{r.batch_code}</td>
                                                                                    <td className="px-3 py-1.5 text-gray-500 font-mono">#{r.piece_sequence}</td>
                                                                                    <td className="px-3 py-1.5"><ActionBadge action={r.action}/></td>
                                                                                    <td className="px-3 py-1.5">
                                                                                        {r.defect_code && (
                                                                                            <div>
                                                                                                <span className="font-mono text-gray-600">{r.defect_code}</span>
                                                                                                {r.defect_description && <span className="block text-gray-400 text-[10px]">{r.defect_description}</span>}
                                                                                            </div>
                                                                                        )}
                                                                                    </td>
                                                                                    {r._type==='defect' && (
                                                                                        <td className="px-3 py-1.5">
                                                                                            <span className={`font-semibold ${r.is_resolved?'text-emerald-500':'text-amber-500'}`}>
                                                                                                {r.is_resolved ? '✓ Resolved' : '⏳ Pending'}
                                                                                            </span>
                                                                                        </td>
                                                                                    )}
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                grouped.map(([groupKey, groupRows]) => {
                                    const approved = groupRows.filter(r => r.action==='APPROVED').length;
                                    const rework   = groupRows.filter(r => r.action==='NEEDS_REWORK').length;
                                    const repaired = groupRows.filter(r => r.action==='REPAIRED').length;
                                    const rejected = groupRows.filter(r => r.action==='QC_REJECTED').length;
                                    const isOpen   = openGroups.has(groupKey);
                                    return (
                                        <div key={groupKey} className="border border-gray-200 rounded-xl overflow-hidden">
                                            <button type="button" onClick={() => toggleGroup(groupKey)}
                                                className="w-full bg-gray-50 hover:bg-gray-100 px-4 py-2 flex items-center justify-between transition text-left">
                                                <div className="flex items-center gap-2">
                                                    <LuChevronRight size={14} className={`text-gray-400 transition-transform shrink-0 ${isOpen?'rotate-90':''}`}/>
                                                    <span className="font-black text-gray-700 text-sm">{groupKey}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs font-semibold">
                                                    {approved>0 && <span className="text-emerald-600">{approved} approved</span>}
                                                    {repaired>0 && <span className="text-teal-600">{repaired} repaired</span>}
                                                    {rework>0   && <span className="text-amber-600">{rework} rework</span>}
                                                    {rejected>0 && <span className="text-red-600">{rejected} rejected</span>}
                                                    <span className="text-gray-400 font-normal">{groupRows.length} total</span>
                                                </div>
                                            </button>
                                            {isOpen && (
                                                <table className="w-full text-xs border-t border-gray-100">
                                                    <tbody>
                                                        {groupRows.map((r, i) => (
                                                            <tr key={i} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${r._type==='defect'?'bg-amber-50/40':''}`}>
                                                                <td className="px-3 py-1.5 font-mono text-gray-400 whitespace-nowrap">{fmtTime(r.time)}</td>
                                                                <td className="px-3 py-1.5 font-semibold text-gray-800 whitespace-nowrap">{r.batch_code}</td>
                                                                <td className="px-3 py-1.5 text-gray-600 capitalize">{r.part_name}</td>
                                                                <td className="px-3 py-1.5 text-gray-500">Sz {r.size}</td>
                                                                <td className="px-3 py-1.5 text-gray-500 font-mono">Roll #{r.fabric_roll_id??'—'}</td>
                                                                <td className="px-3 py-1.5 text-gray-500 font-mono">#{r.piece_sequence}</td>
                                                                <td className="px-3 py-1.5"><ActionBadge action={r.action}/></td>
                                                                <td className="px-3 py-1.5">
                                                                    {r.defect_code && (
                                                                        <div>
                                                                            <span className="font-mono text-gray-600">{r.defect_code}</span>
                                                                            {r.defect_description && <span className="block text-gray-400 text-[10px]">{r.defect_description}</span>}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                {r._type==='defect' && (
                                                                    <td className="px-3 py-1.5">
                                                                        <span className={`font-semibold ${r.is_resolved?'text-emerald-500':'text-amber-500'}`}>
                                                                            {r.is_resolved ? '✓ Resolved' : '⏳ Pending'}
                                                                        </span>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ApprovedSummaryModal = ({ workData, loading, onClose, onDateChange }) => {
    const [modalDate, setModalDate] = useState(workData?.date ?? new Date().toISOString().split('T')[0]);
    // Part-wise breakdown (the original per-part cards below) is noise by
    // default on a busy line — opt-in via the toggle rather than always shown.
    const [showPartBreakdown, setShowPartBreakdown] = useState(false);
    // Drilldown for the True Production Today card — null, {type:'part', part_name},
    // or {type:'complete'}. Clicking the same pill again collapses it.
    const [drilldown, setDrilldown] = useState(null);

    const groups = useMemo(() => {
        const map = new Map();
        (workData?.rows ?? []).forEach(r => {
            if (r.action !== 'APPROVED') return;
            const key = r.part_name || 'Unknown';
            if (!map.has(key)) map.set(key, { part_name: key, total: 0, sizes: {}, batches: {} });
            const g = map.get(key);
            g.total += 1;
            const sz = r.size || '—';
            g.sizes[sz] = (g.sizes[sz] || 0) + 1;
            const bc = `Batch #${r.batch_id ?? '—'}`;
            g.batches[bc] = (g.batches[bc] || 0) + 1;
        });
        return [...map.values()].sort((a, b) => b.total - a.total);
    }, [workData]);

    const totalApproved = groups.reduce((s, g) => s + g.total, 0);
    const incompleteToday = workData?.incomplete_today ?? [];
    const touchedToday = workData?.touched_today ?? 0;

    const handleDateChange = (e) => { const d = e.target.value; setModalDate(d); onDateChange(d); };
    const togglePartDrilldown = (partName) =>
        setDrilldown(d => (d?.type === 'part' && d.part_name === partName) ? null : { type: 'part', part_name: partName });
    const toggleCompleteDrilldown = () =>
        setDrilldown(d => d?.type === 'complete' ? null : { type: 'complete' });

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div>
                            <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
                                <ThumbsUp size={16} className="text-emerald-500" /> Approved Summary
                            </h2>
                            <p className="text-xs text-gray-400">
                                {totalApproved} piece{totalApproved === 1 ? '' : 's'} approved · {groups.length} part type{groups.length === 1 ? '' : 's'}
                            </p>
                        </div>
                        <input type="date" value={modalDate} onChange={handleDateChange}
                            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-400 bg-gray-50" />
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition">
                        <LuX size={16} className="text-gray-500" />
                    </button>
                </div>

                <div className="overflow-auto flex-1 p-4">
                    {!loading && workData?.primary_part_breakdown?.length > 0 && (
                        <div className="mb-4 p-4 bg-violet-50 border-2 border-violet-200 rounded-xl">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <span className="text-xs font-black uppercase tracking-widest text-violet-700">True Production Today — Complete Garment Sets</span>
                                <span className="text-2xl font-black text-violet-700 tabular-nums shrink-0">{workData.complete_sets_today}</span>
                            </div>
                            <p className="text-xs text-gray-500 mb-2.5 leading-relaxed">
                                A garment isn't finished until <span className="font-bold text-gray-700">every</span> one of its primary parts is approved —
                                not just one. Adding up each part's own count (or taking the smallest) over- or under-counts, because the exact same
                                piece-sequences don't always line up across parts. This is the real figure: piece-sequences where <span className="font-bold text-gray-700">all</span> the
                                primary parts below were approved today.
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {workData.primary_part_breakdown.map((p, i) => {
                                    const isOpen = drilldown?.type === 'part' && drilldown.part_name === p.part_name;
                                    return (
                                        <span key={p.part_name} className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => togglePartDrilldown(p.part_name)}
                                                className={`text-xs font-bold px-2.5 py-1 rounded-full border transition ${
                                                    isOpen ? 'bg-violet-700 border-violet-700 text-white' : 'bg-white border-violet-200 text-gray-700 hover:border-violet-400'
                                                }`}
                                            >
                                                {p.part_name}: <span className={isOpen ? 'text-white font-black' : 'text-violet-700 font-black'}>{p.approved_today}</span> approved
                                            </button>
                                            {i < workData.primary_part_breakdown.length - 1 && <span className="text-violet-300 font-black">∩</span>}
                                        </span>
                                    );
                                })}
                                <span className="text-violet-400 font-black mx-0.5">=</span>
                                <button
                                    onClick={toggleCompleteDrilldown}
                                    className={`text-xs font-black px-2.5 py-1 rounded-full transition ${
                                        drilldown?.type === 'complete' ? 'bg-violet-900 text-white' : 'bg-violet-700 text-white hover:bg-violet-800'
                                    }`}
                                >
                                    {workData.complete_sets_today} complete
                                </button>
                            </div>

                            {drilldown?.type === 'part' && (() => {
                                const g = groups.find(x => x.part_name === drilldown.part_name);
                                if (!g) {
                                    return (
                                        <p className="mt-3 pt-3 border-t border-violet-200 text-xs text-gray-500 italic">
                                            No detail available — {drilldown.part_name} today was approved by another checker on your line, not you, so its
                                            piece-by-piece detail isn't in your own work log.
                                        </p>
                                    );
                                }
                                const sortedSizes   = Object.entries(g.sizes).sort((a, b) => a[0].localeCompare(b[0]));
                                const sortedBatches = Object.entries(g.batches).sort((a, b) => b[1] - a[1]);
                                return (
                                    <div className="mt-3 pt-3 border-t border-violet-200 space-y-2">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">{g.part_name} — {g.total} approved today, by size &amp; batch</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {sortedSizes.map(([sz, n]) => (
                                                <span key={sz} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white border border-violet-100 text-gray-700">
                                                    {sz} <span className="text-violet-700 font-black">×{n}</span>
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {sortedBatches.map(([bc, n]) => (
                                                <span key={bc} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white border border-violet-100 text-gray-700 font-mono">
                                                    {bc} <span className="text-violet-700 font-black">×{n}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {drilldown?.type === 'complete' && (
                                <div className="mt-3 pt-3 border-t border-violet-200 space-y-2">
                                    <p className="text-xs text-gray-600">
                                        <span className="font-black text-gray-800">{touchedToday}</span> piece-sequences had at least one primary part approved today —
                                        <span className="font-black text-emerald-600"> {workData.complete_sets_today} complete</span> (every primary part done) +
                                        <span className="font-black text-amber-600"> {incompleteToday.length}{touchedToday - workData.complete_sets_today > incompleteToday.length ? '+' : ''} incomplete</span> (still missing at least one).
                                    </p>
                                    {incompleteToday.length > 0 && (
                                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                                            {incompleteToday.map(inc => {
                                                const missing = (inc.parts_expected || []).filter(p => !(inc.parts_done || []).includes(p));
                                                return (
                                                    <div key={`${inc.production_batch_id}-${inc.size}-${inc.piece_sequence}`} className="text-xs bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                                                        <span className="font-mono text-gray-600">Batch #{inc.production_batch_id} · Size {inc.size} · #{inc.piece_sequence}</span>
                                                        <span className="text-right">
                                                            <span className="text-emerald-600 font-bold">{(inc.parts_done || []).join(', ')}</span>
                                                            <span className="text-gray-400"> done · </span>
                                                            <span className="text-amber-600 font-bold">{missing.join(', ')}</span>
                                                            <span className="text-gray-400"> missing</span>
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                            <LuLoader size={18} className="animate-spin" /><span className="text-sm">Loading…</span>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={() => setShowPartBreakdown(v => !v)}
                                className="w-full flex items-center justify-between px-3 py-2.5 mb-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition"
                            >
                                <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-gray-600">
                                    {showPartBreakdown ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    Part-wise Approved Breakdown
                                </span>
                                <span className="text-xs font-bold text-gray-400">
                                    {totalApproved} piece{totalApproved === 1 ? '' : 's'} · {groups.length} part type{groups.length === 1 ? '' : 's'}
                                </span>
                            </button>
                            {showPartBreakdown && (
                                groups.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                        <LuCircleCheck size={36} className="mb-2 opacity-30" />
                                        <p className="text-sm font-medium">No approved pieces for this date.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {groups.map(g => {
                                            const sortedSizes   = Object.entries(g.sizes).sort((a, b) => a[0].localeCompare(b[0]));
                                            const sortedBatches = Object.entries(g.batches).sort((a, b) => b[1] - a[1]);
                                            return (
                                                <div key={g.part_name} className="border border-gray-200 rounded-xl overflow-hidden">
                                                    <div className="bg-emerald-50/60 px-4 py-2.5 flex items-center justify-between border-b border-emerald-100">
                                                        <span className="font-black text-gray-700 text-sm capitalize">{g.part_name}</span>
                                                        <span className="text-base font-black tabular-nums text-emerald-600">{g.total} approved</span>
                                                    </div>
                                                    <div className="px-4 py-2.5 space-y-2">
                                                        {sortedSizes.length > 0 && (
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">By Size</p>
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {sortedSizes.map(([sz, n]) => (
                                                                        <span key={sz} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                                                            {sz} <span className="text-emerald-600 font-black">×{n}</span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {sortedBatches.length > 0 && (
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">By Batch</p>
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {sortedBatches.map(([bc, n]) => (
                                                                        <span key={bc} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-mono">
                                                                            {bc} <span className="text-emerald-600 font-black">×{n}</span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// UI & LOGIC HELPERS
// ============================================================================
const Spinner = () => (
    <div className="flex justify-center items-center p-12">
        <Loader2 className="animate-spin h-16 w-16 text-slate-800" />
    </div>
);

const ErrorDisplay = ({ message }) => (
    <div className="p-6 bg-black text-rose-500 border border-rose-500 rounded-xl font-black shadow-lg text-xl flex items-center uppercase tracking-widest">
        <AlertCircle className="w-8 h-8 mr-4"/> {message}
    </div>
);

// A defect's real severity is always shown; is_upstream_defect marks one raised
// on a different line type (e.g. cutting), which that line — not this one — repairs.
const isOwnRework = (p) => p.qc_status === 'NEEDS_REWORK' && !p.is_upstream_defect;
const isUpstreamRework = (p) => p.qc_status === 'NEEDS_REWORK' && !!p.is_upstream_defect;

// BUNDLE stations are gated on the previous PIECE stage (see backend
// assertBundlesClearedUpstream): BLOCKING = pending/rework/missing there,
// REJECTED = rejected there (bundle may proceed, flagged).
const upstreamRejectedLabel = (p) => `${p.part_name || ''} ${p.size || ''} #${p.piece_sequence}`.trim();

const checkEntityStatus = (entity) => {
    const pieces = entity.pieces || [];
    const total_cut = pieces.length;
    const total_validated = pieces.filter(p => p.qc_status === 'APPROVED').length;
    const total_rejected = pieces.filter(p => p.qc_status === 'QC_REJECTED').length;
    const total_repaired = pieces.filter(p => p.qc_status === 'REPAIRED').length;
    const pending_alter = pieces.filter(isOwnRework).length;
    // Rework raised on ANOTHER line (e.g. cutting) — shown as rework, not
    // rejection, but repaired by the line that raised it, so it's not in this
    // station's "Fix Rework" and keeps the entity open until that line clears it.
    const upstream_rework = pieces.filter(isUpstreamRework).length;
    const previously_rejected = pieces.filter(p => p.qc_status === 'PREVIOUSLY_REJECTED').length;
    const total_processed = total_validated + total_rejected + total_repaired + previously_rejected;
    const isComplete = (total_processed + pending_alter) >= total_cut && total_cut > 0 && pending_alter === 0 && upstream_rework === 0;
    // Rejected at an EARLIER stage (defect raised on another line type) — part
    // of total_rejected, but not this checker's doing; highlighted separately.
    const earlier = pieces.filter(p => p.qc_status === 'QC_REJECTED' && p.is_upstream_defect);
    const rejected_earlier = earlier.length;
    const rejected_earlier_lines = [...new Set(earlier.map(p => p.defect_origin_line).filter(Boolean))];
    const rejected_earlier_seqs = earlier.map(p => p.piece_sequence).sort((a, b) => a - b);

    return { total_cut, total_processed, pending_alter, upstream_rework, isComplete, total_validated, total_rejected, total_repaired, previously_rejected, rejected_earlier, rejected_earlier_lines, rejected_earlier_seqs };
};

// "⚑ 2 rejected at PREPRATION · #28, #29" — pieces rejected at an earlier
// stage, shown on roll / part / size rows. Everything is visible text: the
// portal runs on tablets, where hover tooltips never appear.
const MAX_SEQS = 6;
const seqList = (seqs) => `#${seqs.slice(0, MAX_SEQS).join(', #')}${seqs.length > MAX_SEQS ? ` +${seqs.length - MAX_SEQS}` : ''}`;
const RejectedEarlierBadge = ({ status, className = '' }) => {
    if (!status?.rejected_earlier) return null;
    const where = status.rejected_earlier_lines.length ? status.rejected_earlier_lines.join(', ') : 'earlier stage';
    return (
        <span className={`inline-flex flex-wrap items-center gap-x-1 text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-300 rounded-md px-1.5 py-0.5 ${className}`}>
            <Flag className="w-3 h-3" /> {status.rejected_earlier} rejected at {where}
            <span className="normal-case tracking-normal font-bold text-rose-600">· {seqList(status.rejected_earlier_seqs)}</span>
        </span>
    );
};

// Regroups the roll-first hierarchy (roll -> parts_details -> size_details ->
// pieces) into a size-first one (size -> parts_details -> roll_details ->
// pieces). For MODE_2 batches a size's piece_sequence runs continuously
// across every roll in the batch — browsing roll-first fragments that
// continuity into arbitrary-looking, non-1-starting ranges per roll,
// whereas grouping by size first shows the size as the one continuous unit
// it actually is, with roll only as the physical sub-label a checker needs
// to know which roll to pick a piece from.
const groupPiecesBySize = (rolls = []) => {
    const sizeMap = new Map(); // size -> Map(partId -> { part_id, part_name, roll_details: [] })
    rolls.forEach(roll => {
        (roll.parts_details || []).forEach(part => {
            (part.size_details || []).forEach(sizeDetail => {
                if (!sizeMap.has(sizeDetail.size)) sizeMap.set(sizeDetail.size, new Map());
                const partsForSize = sizeMap.get(sizeDetail.size);
                if (!partsForSize.has(part.part_id)) {
                    partsForSize.set(part.part_id, { part_id: part.part_id, part_name: part.part_name, roll_details: [] });
                }
                partsForSize.get(part.part_id).roll_details.push({ roll_id: roll.roll_id, pieces: sizeDetail.pieces });
            });
        });
    });
    return [...sizeMap.entries()]
        .sort(([a], [b]) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || String(a).localeCompare(String(b)))
        .map(([size, partsMap]) => ({ size, parts_details: [...partsMap.values()] }));
};

// Same idea for BUNDLE mode — batch.bundles is already flat, just regroup the
// key order from roll-first to size-first (each bundle already carries its
// own roll_id/bundle_code, so no restructuring of the bundle itself needed).
const groupBundlesBySize = (bundles = []) => {
    const sizeMap = new Map(); // size -> Map(partName -> bundles[])
    bundles.forEach(bundle => {
        const size = bundle.size ?? 'Unknown';
        const partName = bundle.part_name || 'Mixed';
        if (!sizeMap.has(size)) sizeMap.set(size, new Map());
        const partsForSize = sizeMap.get(size);
        if (!partsForSize.has(partName)) partsForSize.set(partName, []);
        partsForSize.get(partName).push(bundle);
    });
    return [...sizeMap.entries()]
        .sort(([a], [b]) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || String(a).localeCompare(String(b)))
        .map(([size, partsMap]) => ({ size, parts: Object.fromEntries(partsMap) }));
};

// High-Contrast Industrial Palette
const getPieceColorClass = (status, isSelected) => {
    if (isSelected) return "bg-indigo-600 border-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.8)] transform scale-105 z-10";
    switch(status) {
        case 'APPROVED': return "bg-slate-800 border-slate-700 text-emerald-500 opacity-60 cursor-not-allowed shadow-[inset_0_0_10px_rgba(16,185,129,0.2)]";
        case 'REPAIRED': return "bg-slate-800 border-slate-700 text-teal-400 opacity-60 cursor-not-allowed";
        case 'QC_REJECTED': return "bg-rose-950 border-rose-900 text-rose-400 opacity-70 shadow-[inset_0_0_10px_rgba(225,29,72,0.3)]";
        case 'PREVIOUSLY_REJECTED': return "bg-slate-200 border-slate-300 text-slate-400 opacity-30 cursor-not-allowed line-through";
        case 'NEEDS_REWORK': return "bg-amber-400 border-amber-500 text-amber-900 shadow-md cursor-not-allowed opacity-80"; 
        case 'FOR_REPLACEMENT': return "bg-violet-100 border-violet-300 text-violet-600 opacity-70 cursor-not-allowed shadow-[inset_0_0_10px_rgba(139,92,246,0.15)]";
        case 'PENDING':
        default: return "bg-white border-slate-300 text-slate-900 hover:border-slate-500 shadow-sm";
    }
};



const StageCompletionHandoff = ({ batchId, lineId, onBatchComplete }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [wipReport, setWipReport] = useState(null);

    const handleHandoff = async () => {
        setIsLoading(true);
        try {
            const response = await universalApi.checkStageCompletion({ batchId, lineId });
            const data = response.data;
            if (data.isComplete) {
                if (onBatchComplete) onBatchComplete();
            } else {
                setWipReport(data);
            }
        } catch (error) {
            setWipReport({ message: error.response?.data?.error || 'System error. Check connection.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <button
                onClick={handleHandoff}
                disabled={isLoading || !lineId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center disabled:opacity-50"
            >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                CHECK STAGE
            </button>

            {wipReport && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4" onClick={() => setWipReport(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 border-4 border-amber-400" onClick={e => e.stopPropagation()}>
                        <div className="bg-amber-400 p-6 flex justify-between items-start">
                            <div className="flex items-center text-black">
                                <AlertCircle className="w-10 h-10 mr-4 shrink-0" />
                                <div>
                                    <h3 className="font-black text-2xl uppercase tracking-widest">NOT READY</h3>
                                    <p className="text-sm font-bold mt-1 text-amber-900">{wipReport.message}</p>
                                </div>
                            </div>
                            <button onClick={() => setWipReport(null)} className="text-black hover:bg-amber-500 p-2 rounded-full"><X className="w-8 h-8" /></button>
                        </div>
                        <div className="p-8 text-center text-slate-600 font-bold bg-slate-100 uppercase tracking-widest">Review batch for unscanned items.</div>
                    </div>
                </div>
            )}
        </>
    );
};
// ============================================================================
// PRIMARY INSPECTION MODAL (Black/Industrial)
// ============================================================================
const UniversalValidationModal = ({ itemInfo, defectCodes, onClose, onValidationSubmit, onRepairSubmit, onRevertToPending, isApproveBlocked, highlightPieceId }) => {
    const pieces = itemInfo.pieces || [];

    // Bundles with any piece not cleared upstream (cutting) — shown as a WARNING
    // only (the floor works ahead of earlier scans); they stay approvable.
    const blockedBundleIds = new Set(pieces.filter(p => p.upstream_status === 'BLOCKING').map(p => p.bundle_id ?? itemInfo.bundle_id));
    const upstreamBlockedCount = pieces.filter(p => p.upstream_status === 'BLOCKING').length;
    const upstreamRejectedPieces = pieces.filter(p => p.upstream_status === 'REJECTED');
    // Pieces whose defect was raised at an EARLIER line (rejected or needing
    // rework there) — listed with line + reason in a visible panel, since the
    // tile tooltips carrying that detail never show on the tablets this runs on.
    const earlierDefectPieces = pieces.filter(p => p.is_upstream_defect && (p.qc_status === 'QC_REJECTED' || p.qc_status === 'NEEDS_REWORK'));
    const upstreamStage = itemInfo.upstream_stage || pieces.find(p => p.upstream_stage)?.upstream_stage || 'previous stage';
    // Previous-stage status is a WARNING only (the floor works ahead of
    // earlier scans) — those pieces stay actionable.
    const actionablePieces = pieces.filter(p => p.qc_status === 'PENDING' || !p.qc_status);
    const reworkPieces = pieces.filter(isOwnRework);
    // Only rework raised at THIS stage locks a bundle (its own QC isn't
    // finished); rework at an earlier stage is shown as a warning.
    const hasActiveReworks = reworkPieces.length > 0;
    const isBundleLocked = itemInfo.isBundle && hasActiveReworks;

    const { allowMultiple } = itemInfo;

    const groupedPieces = pieces.reduce((acc, p) => {
        const group = p._displayGroup || 'Default';
        if (!acc[group]) acc[group] = [];
        acc[group].push(p);
        return acc;
    }, {});
    const groups = Object.entries(groupedPieces);

    const [selectedIds, setSelectedIds] = useState(new Set());
    const [intendedAction, setIntendedAction] = useState(null);
    const [defectSearch, setDefectSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedDefectIds, setSelectedDefectIds] = useState(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pieceRepairDetails, setPieceRepairDetails] = useState({});
    const fetchedPiecesRef = useRef(new Set());
    const highlightRef = useRef(null);

    // Scroll the highlighted tile into view once, when the modal opens with one.
    useEffect(() => {
        if (highlightPieceId) highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchPieceRepairs = async (pieceId) => {
        if (fetchedPiecesRef.current.has(pieceId)) return;
        fetchedPiecesRef.current.add(pieceId);
        setPieceRepairDetails(prev => ({ ...prev, [pieceId]: { loading: true, items: [] } }));
        try {
            const res = await universalApi.getPieceHistory(pieceId);
            const raw = res.data;
            const items = Array.isArray(raw) ? raw : (raw?.items ?? raw?.rework_items ?? raw?.defects ?? []);
            setPieceRepairDetails(prev => ({ ...prev, [pieceId]: { loading: false, items } }));
        } catch {
            fetchedPiecesRef.current.delete(pieceId);
            setPieceRepairDetails(prev => ({ ...prev, [pieceId]: { loading: false, items: [] } }));
        }
    };

    const displayBatch = itemInfo.batchId;
    const displayRoll = itemInfo.rollId ? `ROLL #${itemInfo.rollId}` : '';
    const displayPartSize = `${itemInfo.partName} | SIZE ${itemInfo.size || 'MIXED'}`;

    // True when selected pieces are NEEDS_REWORK — drives action bar switching
    const isRepairMode = selectedIds.size > 0 && pieces.some(p => selectedIds.has(p.id) && isOwnRework(p));

    const togglePiece = (piece) => {
        const isReworkPiece = isOwnRework(piece);
        const isPendingPiece = (piece.qc_status === 'PENDING' || !piece.qc_status) && actionablePieces.some(p => p.id === piece.id);
        if (!isReworkPiece && !isPendingPiece) return;

        // Switching modes: clear existing selection when crossing PENDING ↔ NEEDS_REWORK boundary
        const currentlyRepair = selectedIds.size > 0 && pieces.some(p => selectedIds.has(p.id) && isOwnRework(p));
        if ((isReworkPiece && !currentlyRepair && selectedIds.size > 0) || (isPendingPiece && currentlyRepair)) {
            setSelectedIds(new Set([piece.id]));
            setIntendedAction(null);
            if (isReworkPiece) fetchPieceRepairs(piece.id);
            return;
        }

        const newSet = new Set(selectedIds);
        if (!allowMultiple && isPendingPiece && !newSet.has(piece.id)) newSet.clear();
        const isAdding = !newSet.has(piece.id);
        if (newSet.has(piece.id)) newSet.delete(piece.id); else newSet.add(piece.id);
        setSelectedIds(newSet);
        if (isReworkPiece && isAdding) fetchPieceRepairs(piece.id);
    };

    const toggleSelectAll = () => {
        if (isRepairMode || itemInfo.forceRepairMode) {
            if (selectedIds.size === reworkPieces.length) setSelectedIds(new Set());
            else setSelectedIds(new Set(reworkPieces.map(p => p.id)));
        } else {
            if (selectedIds.size === actionablePieces.length) setSelectedIds(new Set());
            else setSelectedIds(new Set(actionablePieces.map(p => p.id)));
        }
    };

    const handleActionInitiation = (action) => {
        if (selectedIds.size === 0) return;
        if (action === 'APPROVED') submitValidation('APPROVED', []);
        else { setIntendedAction(action); setDefectSearch(''); setSelectedCategory(null); setSelectedDefectIds(new Set()); }
    };

    const handleRepairAction = (status) => {
        if (selectedIds.size === 0) return;
        if (status === 'APPROVED') { submitRepair('APPROVED', []); }
        else { setIntendedAction('REPAIR_FAILED'); setDefectSearch(''); setSelectedCategory(null); setSelectedDefectIds(new Set()); }
    };

    const submitRepair = async (status, defectCodeIds = []) => {
        setIsSubmitting(true);
        try {
            await onRepairSubmit({ pieceIds: Array.from(selectedIds), status, defectCodeIds });
            setSelectedIds(new Set()); setIntendedAction(null); setDefectSearch(''); setSelectedCategory(null); setSelectedDefectIds(new Set());
        } finally {
            setIsSubmitting(false);
        }
    };

    // Supervisor override: a QC_REJECTED piece is a terminal state — only a
    // line supervisor can pass it (back to REPAIRED). Their password goes to
    // the server with the request; a wrong one re-opens the dialog.
    const [pinDialog, askSupervisorPin] = useSupervisorPinPrompt();
    const handleUnlockRejectedPiece = async (piece) => {
        setIsSubmitting(true);
        try {
            await withSupervisorPin(askSupervisorPin, `Unlock rejected piece #${piece.piece_sequence}`,
                (supervisorPin) => onRepairSubmit({ pieceIds: [piece.id], status: 'APPROVED', defectCodeIds: [], supervisorPin }));
        } catch {
            // onRepairSubmit (handleApproveAlterSubmit) already shows an alert on failure
        } finally {
            setIsSubmitting(false);
        }
    };

    // Same supervisor override for the opposite mistake: an APPROVED piece
    // that shouldn't have been. Reverts it to PENDING so it can be re-inspected.
    const handleRevertApprovedPiece = async (piece) => {
        setIsSubmitting(true);
        try {
            await withSupervisorPin(askSupervisorPin, `Revert approved piece #${piece.piece_sequence} to pending`,
                (supervisorPin) => onRevertToPending({ pieceIds: [piece.id], supervisorPin }));
        } catch {
            // onRevertToPending (handleRevertToPending) already shows an alert on failure
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleDefect = (defectId) => {
        setSelectedDefectIds(prev => {
            const n = new Set(prev);
            if (n.has(defectId)) n.delete(defectId); else n.add(defectId);
            return n;
        });
    };

    const handleDefectSubmit = () => {
        if (selectedDefectIds.size === 0) return;
        submitValidation(intendedAction, Array.from(selectedDefectIds));
    };

    const handleRepairDefectSubmit = () => {
        if (selectedDefectIds.size === 0) return;
        submitRepair('QC_REJECTED', Array.from(selectedDefectIds));
    };

    const submitValidation = async (qcStatus, defectCodeIds = []) => {
        const selectedPiecesList = pieces.filter(p => selectedIds.has(p.id));
        let payloads = [];

        // BUNDLE-mode lines (e.g. Preparation) upsert per bundle_id — any view
        // whose selection can span MORE THAN ONE bundle (whole-roll inspect,
        // whole-size inspect — both aggregate across many bundles) must send
        // one payload per bundle, not one payload with a single (often
        // missing) bundleId. A single-bundle inspect already has a real
        // itemInfo.bundle_id and doesn't need grouping.
        const needsPerBundleGrouping = itemInfo.isRollInspect || (itemInfo.isBundle && !itemInfo.bundle_id);

        if (needsPerBundleGrouping) {
            const grouped = selectedPiecesList.reduce((acc, p) => {
                const key = p.bundle_id ? `b_${p.bundle_id}` : `p_${p.part_id}_s_${p.size}`;
                if (!acc[key]) {
                    acc[key] = {
                        batchId: itemInfo.batchId, rollId: itemInfo.rollId, partId: p.part_id || itemInfo.partId,
                        size: p.size || itemInfo.size, pieceIds: [], qcStatus, defectCodeIds, bundleId: p.bundle_id || null
                    };
                }
                acc[key].pieceIds.push(p.id);
                return acc;
            }, {});
            payloads = Object.values(grouped);
        } else {
            payloads = [{
                batchId: itemInfo.batchId, rollId: itemInfo.rollId, partId: itemInfo.partId,
                size: itemInfo.size, pieceIds: Array.from(selectedIds), qcStatus, defectCodeIds, bundleId: itemInfo.bundle_id || null
            }];
        }

        await onValidationSubmit(payloads);
        setSelectedIds(new Set()); setIntendedAction(null); setDefectSearch(''); setSelectedCategory(null); setSelectedDefectIds(new Set());
    };

    const defectsByGroup = defectCodes.reduce((acc, d) => {
        if (!acc[d.category]) acc[d.category] = [];
        acc[d.category].push(d);
        return acc;
    }, {});
    const categories = Object.keys(defectsByGroup);
    const availableDefects = selectedCategory
        ? (defectsByGroup[selectedCategory] || []).filter(d =>
            !defectSearch.trim() ||
            d.code.toLowerCase().includes(defectSearch.trim().toLowerCase()) ||
            d.description.toLowerCase().includes(defectSearch.trim().toLowerCase()))
        : [];
    const selectedPiecesForPicker = pieces.filter(p => selectedIds.has(p.id));
    const pickerIsAmber = intendedAction === 'NEEDS_REWORK';
    const pickerOnConfirm = intendedAction === 'REPAIR_FAILED' ? handleRepairDefectSubmit : handleDefectSubmit;
    const pickerTitle = intendedAction === 'NEEDS_REWORK' ? 'REASON FOR REWORK' : intendedAction === 'QC_REJECTED' ? 'REASON FOR REJECTION' : 'REPAIR FAILURE REASON';
    const pickerLabel = intendedAction === 'NEEDS_REWORK' ? 'REWORK' : intendedAction === 'QC_REJECTED' ? 'REJECT' : 'FAILED';

    return (
        <div className="fixed inset-0 bg-black/95 z-[150] flex flex-col p-0 font-inter">
            {itemInfo.forceRepairMode ? (
                <div className="bg-amber-400 text-black px-5 py-3 flex justify-between items-center shrink-0 border-b-2 border-amber-600">
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tight">VALIDATE REPAIRS</h3>
                        <p className="text-sm text-amber-900 font-bold">{displayBatch} — {displayPartSize}</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-black/10 hover:bg-black hover:text-amber-400 rounded-full transition-all"><X className="w-5 h-5"/></button>
                </div>
            ) : (
                <div className="bg-black text-white px-5 py-3 flex justify-between items-center border-b-2 border-slate-800 shrink-0">
                    <div className="flex flex-wrap items-center gap-4 md:gap-8">
                        <div className="flex flex-col"><span className="text-slate-500 text-xs font-black uppercase tracking-widest">Batch</span><h2 className="text-xl font-black">{displayBatch}</h2></div>
                        <div className="flex flex-col border-l border-slate-700 pl-4"><span className="text-slate-500 text-xs font-black uppercase tracking-widest">Source</span><h2 className="text-xl font-black text-indigo-400">{displayRoll}</h2></div>
                        <div className="flex flex-col border-l border-slate-700 pl-4"><span className="text-slate-500 text-xs font-black uppercase tracking-widest">Component</span><h2 className="text-xl font-black uppercase">{displayPartSize}</h2></div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-slate-900 hover:bg-rose-600 rounded-full transition-all border border-slate-700"><X className="w-5 h-5 text-white"/></button>
                </div>
            )}

            {(intendedAction === 'REPAIR_FAILED' || intendedAction === 'NEEDS_REWORK' || intendedAction === 'QC_REJECTED') ? (
                !selectedCategory ? (
                    /* Step 1 — category selection */
                    <div className="flex-grow flex flex-col bg-slate-900">
                        <div className={`px-6 py-3 border-b shrink-0 ${pickerIsAmber ? 'bg-amber-500 border-amber-600' : 'bg-rose-700 border-rose-800'}`}>
                            <p className={`text-xs font-black uppercase tracking-widest mb-2 ${pickerIsAmber ? 'text-black' : 'text-white'}`}>{pickerTitle} — {selectedPiecesForPicker.length} piece(s)</p>
                            <div className="flex flex-wrap gap-1.5">
                                {selectedPiecesForPicker.map(p => (
                                    <span key={p.id} className={`px-2 py-0.5 rounded-md font-mono font-black text-sm ${pickerIsAmber ? 'bg-amber-600 text-black' : 'bg-rose-900 text-rose-200'}`}>{p.piece_sequence}</span>
                                ))}
                            </div>
                        </div>
                        <div className="flex-grow overflow-y-auto p-6 flex flex-col justify-center">
                            <p className="text-slate-400 text-xs font-black uppercase tracking-widest text-center mb-6">Select a defect category</p>
                            <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto w-full">
                                {categories.map(cat => (
                                    <button key={cat} onClick={() => setSelectedCategory(cat)}
                                        className={`bg-slate-800 border-2 rounded-2xl p-8 font-black text-white text-xl uppercase tracking-widest transition-all active:scale-95 flex flex-col items-center gap-3 ${pickerIsAmber ? 'border-slate-600 hover:border-amber-500 hover:bg-slate-700' : 'border-slate-600 hover:border-rose-500 hover:bg-slate-700'}`}>
                                        <AlertCircle className={`w-10 h-10 ${pickerIsAmber ? 'text-amber-400' : 'text-rose-400'}`} />
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-800 border-t border-slate-700 shrink-0">
                            <button onClick={() => { setIntendedAction(null); setDefectSearch(''); setSelectedCategory(null); setSelectedDefectIds(new Set()); }}
                                className="w-full bg-slate-700 text-slate-300 font-black py-3 rounded-xl uppercase tracking-widest hover:bg-slate-600 transition-colors text-sm">
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Step 2 — scrollable code list */
                    <div className="flex-grow flex flex-col bg-slate-900 min-h-0">
                        <div className={`px-6 py-3 border-b shrink-0 flex items-center gap-3 ${pickerIsAmber ? 'bg-amber-500 border-amber-600' : 'bg-rose-700 border-rose-800'}`}>
                            <button onClick={() => { setSelectedCategory(null); setDefectSearch(''); }}
                                className={`p-2 rounded-lg transition-colors shrink-0 ${pickerIsAmber ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-800 hover:bg-rose-900'}`}>
                                <ArrowLeft className="w-5 h-5 text-white" />
                            </button>
                            <div className="flex-grow min-w-0">
                                <p className={`font-black text-sm uppercase tracking-widest ${pickerIsAmber ? 'text-black' : 'text-white'}`}>{selectedCategory}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {selectedPiecesForPicker.map(p => (
                                        <span key={p.id} className={`px-1.5 py-0 rounded font-mono font-black text-xs ${pickerIsAmber ? 'bg-amber-600 text-black' : 'bg-rose-900 text-rose-200'}`}>{p.piece_sequence}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-3 bg-slate-800 border-b border-slate-700 shrink-0 space-y-3">
                            <input type="text" value={defectSearch} onChange={e => setDefectSearch(e.target.value)}
                                placeholder="Search defect codes…"
                                className="w-full px-4 py-2.5 bg-slate-700 text-white placeholder-slate-400 rounded-xl border border-slate-600 focus:outline-none focus:border-indigo-400 text-sm" />
                            {selectedDefectIds.size > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {Array.from(selectedDefectIds).map(id => {
                                        const d = defectCodes.find(dc => dc.id === id);
                                        return d ? (
                                            <span key={id} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${pickerIsAmber ? 'bg-amber-900 text-amber-200' : 'bg-rose-900 text-rose-200'}`}>
                                                {d.code}
                                                <button onClick={() => toggleDefect(id)} className="ml-0.5 hover:text-white"><X className="w-3 h-3" /></button>
                                            </span>
                                        ) : null;
                                    })}
                                </div>
                            )}
                            <button onClick={pickerOnConfirm} disabled={selectedDefectIds.size === 0}
                                className={`w-full disabled:opacity-30 disabled:bg-slate-600 text-white font-black py-3 rounded-xl uppercase tracking-widest transition-colors active:scale-95 flex items-center justify-center gap-2 text-sm ${pickerIsAmber ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                                <Send className="w-4 h-4" /> CONFIRM {pickerLabel} ({selectedDefectIds.size})
                            </button>
                        </div>
                        <div className="flex-grow min-h-0 overflow-y-auto p-4">
                            <div className="grid grid-cols-3 gap-2">
                                {availableDefects.map(defect => {
                                    const isChosen = selectedDefectIds.has(defect.id);
                                    return (
                                        <button key={defect.id} onClick={() => toggleDefect(defect.id)}
                                            className={`relative p-3 rounded-xl text-left transition-all active:scale-95 border-2 ${isChosen
                                                ? (pickerIsAmber ? 'bg-amber-600 border-amber-400 shadow-lg' : 'bg-rose-700 border-rose-400 shadow-lg')
                                                : 'bg-slate-800 border-slate-600 hover:border-slate-400'}`}>
                                            {isChosen && <Check className="absolute top-2 right-2 w-4 h-4 text-white" strokeWidth={3} />}
                                            <span className={`block text-sm font-bold uppercase tracking-widest mb-1 ${pickerIsAmber ? 'text-amber-300' : 'text-rose-300'}`}>{defect.code}</span>
                                            <span className="text-white text-[17px] font-black leading-snug">{defect.description}</span>
                                        </button>
                                    );
                                })}
                                {availableDefects.length === 0 && (
                                    <p className="col-span-2 text-slate-500 text-center py-8 text-sm font-bold">No matching defect codes.</p>
                                )}
                            </div>
                        </div>
                        <div className="px-6 py-3 bg-slate-800 border-t border-slate-700 shrink-0">
                            <button onClick={() => { setIntendedAction(null); setDefectSearch(''); setSelectedCategory(null); setSelectedDefectIds(new Set()); }}
                                className="w-full bg-slate-700 text-slate-300 font-black py-3 rounded-xl uppercase tracking-widest hover:bg-slate-600 transition-colors text-sm">
                                Cancel
                            </button>
                        </div>
                    </div>
                )
            ) : itemInfo.forceRepairMode ? (
                <>
                    <div className="bg-amber-50 px-5 py-2 border-b border-amber-200 flex justify-between items-center shrink-0">
                        <span className="text-amber-800 font-black text-sm uppercase tracking-widest">
                            <Hammer className="w-4 h-4 inline mr-2 text-amber-600" />{reworkPieces.length} piece(s) awaiting validation
                        </span>
                        {reworkPieces.length > 0 && (
                            <button onClick={toggleSelectAll} className="px-4 py-2 bg-black text-white font-black rounded-xl hover:bg-slate-800 active:scale-95 transition-all flex items-center shadow-lg tracking-widest text-sm">
                                {selectedIds.size === reworkPieces.length ? <Square className="w-4 h-4 mr-2" /> : <CheckSquare className="w-4 h-4 mr-2" />}
                                {selectedIds.size === reworkPieces.length ? 'DESELECT ALL' : 'SELECT ALL'}
                            </button>
                        )}
                    </div>
                    <div className="flex-grow overflow-y-auto bg-slate-100 p-8">
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4">
                            {reworkPieces.map(piece => {
                                const isSelected = selectedIds.has(piece.id);
                                return (
                                    <button key={piece.id} onClick={() => togglePiece(piece)}
                                        className={`relative aspect-square rounded-2xl border-4 font-mono font-black text-3xl flex items-center justify-center transition-all active:scale-95 ${
                                            isSelected
                                                ? 'bg-amber-500 border-amber-600 text-white shadow-[0_0_20px_rgba(245,158,11,0.8)] transform scale-105 z-10'
                                                : 'bg-amber-300 border-amber-400 text-amber-900 hover:bg-amber-400 shadow-md'
                                        }`}>
                                        {piece.piece_sequence}
                                        {isSelected
                                            ? <Check className="absolute top-2 right-2 w-8 h-8 rounded-full p-1 shadow-md bg-amber-700 text-white" strokeWidth={4} />
                                            : <Hammer className="absolute top-2 right-2 w-6 h-6 text-amber-700" />
                                        }
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="bg-white p-4 border-t-4 border-amber-400 shadow-[0_-20px_50px_rgba(0,0,0,0.15)] shrink-0">
                        {selectedIds.size === 1 && (() => {
                            const pid = [...selectedIds][0];
                            const info = pieceRepairDetails[pid];
                            if (!info) return null;
                            if (info.loading) return (
                                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-amber-100">
                                    <Loader2 size={12} className="animate-spin text-amber-600" />
                                    <span className="text-xs font-bold text-amber-700">Loading repair history…</span>
                                </div>
                            );
                            if (!info.items?.length) return null;
                            return (
                                <div className="mb-3 pb-3 border-b border-amber-200">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2">Pending Repairs</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {info.items.map((item, i) => (
                                            <div key={i} className="flex items-center gap-1.5 bg-amber-100 border border-amber-300 rounded-lg px-2.5 py-1">
                                                <span className="font-mono font-black text-amber-800 text-xs">{item.defect_code ?? item.code ?? '—'}</span>
                                                {(item.defect_description ?? item.description) && <span className="text-amber-700 text-xs">{item.defect_description ?? item.description}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                            <div className="bg-amber-50 px-5 py-3 rounded-xl border-2 border-amber-200 text-center min-w-[140px]">
                                <span className="block text-amber-600 text-xs font-black uppercase mb-0.5 tracking-widest">Validating</span>
                                <span className="text-4xl font-black text-amber-700 leading-none">{selectedIds.size}</span>
                            </div>
                            <div className="flex-grow grid grid-cols-2 gap-4 h-[60px]">
                                <button onClick={() => handleRepairAction('QC_REJECTED')} disabled={selectedIds.size === 0}
                                    className="w-full h-full bg-rose-600 text-white rounded-xl font-black text-lg shadow-xl hover:bg-rose-700 active:scale-95 disabled:opacity-30 flex items-center justify-center border-b-4 border-rose-800">
                                    <XCircle className="w-5 h-5 mr-2" /> FAILED
                                </button>
                                <button onClick={() => handleRepairAction('APPROVED')} disabled={selectedIds.size === 0}
                                    className="w-full h-full bg-emerald-600 text-white rounded-xl font-black text-lg shadow-xl hover:bg-emerald-700 active:scale-95 disabled:opacity-30 flex items-center justify-center border-b-4 border-emerald-800">
                                    <CheckCircle2 className="w-5 h-5 mr-2" /> PASSED
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-grow overflow-hidden flex flex-col bg-slate-100">
                    <div className="bg-slate-200 px-5 py-2 border-b border-slate-300 flex justify-between items-center shrink-0">
                        <div className="flex items-center">
                            {isRepairMode ? (
                                <>
                                    <Hammer className="w-4 h-4 mr-2 text-amber-600" />
                                    <span className="font-black text-amber-800 uppercase tracking-widest text-sm">REPAIR VALIDATION</span>
                                </>
                            ) : (
                                <>
                                    <Zap className={`w-4 h-4 mr-2 ${allowMultiple ? 'text-black' : 'text-slate-400'}`} />
                                    <span className="font-black text-black uppercase tracking-widest text-sm">
                                        {allowMultiple ? 'MULTI-SELECT ACTIVE' : 'SINGLE-PLY OVERRIDE'}
                                    </span>
                                </>
                            )}
                        </div>
                        {(isRepairMode ? reworkPieces.length > 0 : allowMultiple && actionablePieces.length > 0) && (
                            <button onClick={toggleSelectAll} className="px-4 py-2 bg-black text-white font-black rounded-xl hover:bg-slate-800 active:scale-95 transition-all flex items-center shadow-lg tracking-widest text-sm">
                                {(isRepairMode ? selectedIds.size === reworkPieces.length : selectedIds.size === actionablePieces.length)
                                    ? <Square className="w-4 h-4 mr-2" /> : <CheckSquare className="w-4 h-4 mr-2" />}
                                {(isRepairMode ? selectedIds.size === reworkPieces.length : selectedIds.size === actionablePieces.length)
                                    ? 'DESELECT ALL' : 'SELECT ALL'}
                            </button>
                        )}
                    </div>

                    <div className="flex-grow p-8 overflow-y-auto">
                        {pinDialog}
                        {(upstreamBlockedCount > 0 || upstreamRejectedPieces.length > 0 || earlierDefectPieces.length > 0) && (
                            <div className="mb-6 space-y-2">
                                {earlierDefectPieces.length > 0 && (
                                    <div className="px-4 py-3 rounded-xl border-2 border-rose-300 bg-rose-50 text-rose-900">
                                        <p className="text-sm font-black uppercase tracking-widest flex items-center gap-2 mb-2">
                                            <Flag className="w-4 h-4" /> From earlier stages ({earlierDefectPieces.length})
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {earlierDefectPieces.map(p => {
                                                const rejected = p.qc_status === 'QC_REJECTED';
                                                return (
                                                    <span key={p.id} className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${rejected ? 'bg-white border-rose-300 text-rose-800' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>
                                                        <span className="font-black font-mono">#{p.piece_sequence}</span>
                                                        {p._displayGroup && p._displayGroup !== 'Default' ? <span className="text-slate-500"> · {p._displayGroup}</span> : null}
                                                        {' · '}<span className="font-black uppercase">{rejected ? 'Rejected' : 'Rework'} @ {p.defect_origin_line || 'earlier stage'}</span>
                                                        {p.defect_reason ? <span> — {p.defect_reason}</span> : null}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {upstreamBlockedCount > 0 && (
                                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-900">
                                        <Lock className="w-5 h-5 shrink-0 mt-0.5" />
                                        <p className="text-sm font-bold">
                                            <span className="font-black uppercase tracking-widest">Warning — not cleared at {upstreamStage}:</span>{' '}
                                            {upstreamBlockedCount} piece(s) {blockedBundleIds.size > 1 ? `in ${blockedBundleIds.size} bundles ` : ''}are still pending or in rework at {upstreamStage}. You can still approve — check them first.
                                        </p>
                                    </div>
                                )}
                                {upstreamRejectedPieces.length > 0 && (
                                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl border-2 border-rose-300 bg-rose-50 text-rose-900">
                                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                                        <p className="text-sm font-bold">
                                            <span className="font-black uppercase tracking-widest">Flagged:</span>{' '}
                                            {upstreamRejectedPieces.length} piece(s) rejected at {upstreamStage} — {upstreamRejectedPieces.slice(0, 8).map(upstreamRejectedLabel).join(', ')}{upstreamRejectedPieces.length > 8 ? ', …' : ''}. These don't count toward this stage's approved pieces.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="space-y-10">
                            {groups.map(([groupName, groupPieces]) => (
                                <div key={groupName}>
                                    {groupName !== 'Default' && <h4 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4 border-b-2 border-slate-300 pb-2">{groupName}</h4>}
                                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4">
                                        {groupPieces.map(piece => {
                                            const isSelected = selectedIds.has(piece.id);
                                            const isRework = isOwnRework(piece);
                                            const isUpRework = isUpstreamRework(piece);
                                            const isUpBlocked = piece.upstream_status === 'BLOCKING';
                                            const isUpRejected = piece.upstream_status === 'REJECTED' || (piece.qc_status === 'QC_REJECTED' && !!piece.is_upstream_defect);
                                            const isRejected = piece.qc_status === 'QC_REJECTED';
                                            const isApproved = piece.qc_status === 'APPROVED';
                                            const isHighlighted = highlightPieceId != null && String(piece.id) === String(highlightPieceId);
                                            const selClass = isRework
                                                ? 'bg-amber-500 border-amber-600 text-white shadow-[0_0_20px_rgba(245,158,11,0.8)] transform scale-105 z-10'
                                                : getPieceColorClass(piece.qc_status, true);
                                            const unselClass = isRework
                                                ? 'bg-amber-300 border-amber-400 text-amber-900 hover:bg-amber-400 shadow-md'
                                                : getPieceColorClass(piece.qc_status, false);
                                            return (
                                                <button key={piece.id}
                                                    ref={isHighlighted ? highlightRef : undefined}
                                                    disabled={isUpRework || (!isRejected && !isApproved && piece.qc_status !== 'PENDING' && piece.qc_status && piece.qc_status !== 'NEEDS_REWORK')}
                                                    onClick={() => isRejected ? handleUnlockRejectedPiece(piece) : isApproved ? handleRevertApprovedPiece(piece) : togglePiece(piece)}
                                                    title={isUpRework ? `Needs rework at ${piece.defect_origin_line || upstreamStage}${piece.defect_reason ? ` — ${piece.defect_reason}` : ''}` : isUpBlocked ? `Not cleared at ${upstreamStage} — warning only` : isUpRejected ? `Rejected at ${piece.defect_origin_line || upstreamStage}${piece.defect_reason ? ` — ${piece.defect_reason}` : ''}` : isRejected ? 'Rejected — click to unlock with supervisor password' : isApproved ? 'Approved — click to revert to pending with supervisor password' : undefined}
                                                    className={`relative aspect-square rounded-2xl border-4 font-mono font-black text-3xl flex items-center justify-center transition-all active:scale-95 ${isRejected ? 'cursor-pointer hover:border-rose-600' : ''} ${isApproved ? 'cursor-pointer hover:border-emerald-500' : ''} ${isSelected ? selClass : unselClass} ${isHighlighted ? 'animate-pulse ring-4 ring-offset-2 ring-blue-500 z-20' : ''}`}>
                                                    {piece.piece_sequence}
                                                    {isSelected && <Check className={`absolute top-2 right-2 w-8 h-8 rounded-full p-1 shadow-md ${isRework ? 'bg-amber-700 text-white' : 'bg-indigo-500 text-white'}`} strokeWidth={4} />}
                                                    {!isSelected && isRework && <Hammer className="absolute top-2 right-2 w-6 h-6 text-amber-700" />}
                                                    {isRejected && <Lock className="absolute top-2 right-2 w-6 h-6 text-rose-400" />}
                                                    {isApproved && <RotateCcw className="absolute top-2 right-2 w-5 h-5 text-emerald-500" />}
                                                    {piece.qc_status === 'FOR_REPLACEMENT' && <PackageX className="absolute top-2 right-2 w-5 h-5 text-violet-400" />}
                                                    {isUpRework && <span className="absolute bottom-1 left-1 right-1 text-[9px] leading-tight font-sans font-black uppercase tracking-wide text-amber-900 bg-amber-200 rounded px-1 truncate">Rework @ {piece.defect_origin_line || upstreamStage}</span>}
                                                    {!isUpRework && isUpBlocked && <span className="absolute bottom-1 left-1 right-1 text-[9px] leading-tight font-sans font-black uppercase tracking-wide text-amber-900 bg-amber-200 rounded px-1 truncate">Not cleared @ {upstreamStage}</span>}
                                                    {isUpRejected && <span className="absolute bottom-1 left-1 right-1 text-[9px] leading-tight font-sans font-black uppercase tracking-wide text-white bg-rose-600 rounded px-1 truncate">Rejected @ {piece.defect_origin_line || upstreamStage}</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white p-4 border-t-4 border-slate-300 shadow-[0_-20px_50px_rgba(0,0,0,0.15)] flex flex-col shrink-0">
                        {isRepairMode ? (
                            <>
                                {selectedIds.size === 1 && (() => {
                                    const pid = [...selectedIds][0];
                                    const info = pieceRepairDetails[pid];
                                    if (!info) return null;
                                    if (info.loading) return (
                                        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-amber-100">
                                            <Loader2 size={12} className="animate-spin text-amber-600" />
                                            <span className="text-xs font-bold text-amber-700">Loading repair history…</span>
                                        </div>
                                    );
                                    if (!info.items?.length) return null;
                                    return (
                                        <div className="mb-3 pb-3 border-b border-amber-200">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2">Pending Repairs</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {info.items.map((item, i) => (
                                                    <div key={i} className="flex items-center gap-1.5 bg-amber-100 border border-amber-300 rounded-lg px-2.5 py-1">
                                                        <span className="font-mono font-black text-amber-800 text-xs">{item.defect_code ?? item.code ?? '—'}</span>
                                                        {(item.defect_description ?? item.description) && <span className="text-amber-700 text-xs">{item.defect_description ?? item.description}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                                    <div className="bg-amber-50 px-5 py-3 rounded-xl border-2 border-amber-200 text-center min-w-[140px]">
                                        <span className="block text-amber-600 text-xs font-black uppercase mb-0.5 tracking-widest">Repairing</span>
                                        <span className="text-4xl font-black text-amber-700 leading-none">{selectedIds.size}</span>
                                    </div>
                                    <div className="flex-grow grid grid-cols-2 gap-4 h-[60px]">
                                        <button onClick={() => handleRepairAction('QC_REJECTED')} disabled={selectedIds.size === 0}
                                            className="w-full h-full bg-rose-600 text-white rounded-xl font-black text-lg shadow-xl hover:bg-rose-700 active:scale-95 disabled:opacity-30 flex items-center justify-center border-b-4 border-rose-800">
                                            <XCircle className="w-5 h-5 mr-2" /> FAILED
                                        </button>
                                        <button onClick={() => handleRepairAction('APPROVED')} disabled={selectedIds.size === 0 || isSubmitting}
                                            className="w-full h-full bg-emerald-600 text-white rounded-xl font-black text-lg shadow-xl hover:bg-emerald-700 active:scale-95 disabled:opacity-30 flex items-center justify-center border-b-4 border-emerald-800">
                                            {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                                            {isSubmitting ? 'SAVING…' : 'PASSED'}
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                                <div className="bg-slate-100 px-5 py-3 rounded-xl border-2 border-slate-300 text-center min-w-[140px]">
                                    <span className="block text-slate-500 text-xs font-black uppercase mb-0.5 tracking-widest">Selected</span>
                                    <span className="text-4xl font-black text-black leading-none">{selectedIds.size}</span>
                                </div>
                                <div className="flex-grow grid grid-cols-3 gap-4 h-[60px]">
                                    <div className="relative h-full">
                                        {isBundleLocked && selectedIds.size > 0 && <div className="absolute -top-8 left-0 w-full text-center pointer-events-none"><span className="bg-amber-400 text-black text-xs font-black uppercase tracking-widest px-3 py-1 rounded-md shadow-lg">Bundle Locked: Active Reworks</span></div>}
                                        {itemInfo.isBundle && !isBundleLocked && selectedIds.size > 0 && selectedIds.size !== actionablePieces.length && <div className="absolute -top-8 left-0 w-full text-center pointer-events-none"><span className="bg-amber-400 text-black text-xs font-black uppercase tracking-widest px-3 py-1 rounded-md shadow-lg">Partial Selection: Reject/Rework Only</span></div>}
                                        {isApproveBlocked && <div className="absolute -top-8 left-0 w-full text-center pointer-events-none"><span className="bg-red-700 text-white text-xs font-black uppercase tracking-widest px-3 py-1 rounded-md shadow-lg">Rework Backlog: Approve Disabled</span></div>}
                                        <button onClick={() => handleActionInitiation('APPROVED')} disabled={selectedIds.size === 0 || isBundleLocked || isApproveBlocked || (itemInfo.isBundle && selectedIds.size !== actionablePieces.length)} title={isApproveBlocked ? 'Rework backlog is over the limit — clear it via Repair or Reject before approving new pieces.' : undefined} className="w-full h-full bg-black text-white rounded-xl font-black text-lg shadow-xl hover:bg-slate-800 active:scale-95 disabled:opacity-20 disabled:bg-slate-400 flex items-center justify-center border-b-4 border-slate-800">
                                            <CheckCircle2 className="w-5 h-5 mr-2" /> APPROVE
                                        </button>
                                    </div>
                                    <button onClick={() => handleActionInitiation('NEEDS_REWORK')} disabled={selectedIds.size === 0} className="w-full h-full bg-amber-400 text-black rounded-xl font-black text-lg shadow-xl hover:bg-amber-500 active:scale-95 disabled:opacity-30 disabled:bg-slate-200 flex items-center justify-center border-b-4 border-amber-600"><Hammer className="w-5 h-5 mr-2" /> REWORK</button>
                                    <button onClick={() => handleActionInitiation('QC_REJECTED')} disabled={selectedIds.size === 0} className="w-full h-full bg-rose-600 text-white rounded-xl font-black text-lg shadow-xl hover:bg-rose-700 active:scale-95 disabled:opacity-30 disabled:bg-slate-200 flex items-center justify-center border-b-4 border-rose-800"><XCircle className="w-5 h-5 mr-2" /> REJECT</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// ROLL-LEVEL HANDOFF BUTTON
// ============================================================================
const RollHandoffButton = ({ batchId, lineId, rollId, onComplete }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult]       = useState(null); // { ok: bool, msg: string }
    const timerRef = useRef(null);

    const handleHandoff = async () => {
        setIsLoading(true);
        setResult(null);
        try {
            const response = await universalApi.checkAndCompleteStages({ batchId, lineId, rollId });
            const data = response.data;
            if (data.isComplete) {
                setResult({ ok: true, msg: data.message || `Roll #${rollId} marked complete.` });
            } else {
                setResult({ ok: false, msg: data.message || 'Pieces still pending on this roll.' });
            }
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setResult(null), 6000);
            if (onComplete) onComplete();
        } catch (error) {
            setResult({ ok: false, msg: error.response?.data?.error || 'System error. Check connection.' });
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setResult(null), 6000);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-end gap-1.5">
            <button
                onClick={handleHandoff}
                disabled={isLoading || !lineId}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-900 text-white text-sm font-black rounded-xl shadow-lg active:scale-95 transition-all flex items-center uppercase tracking-widest disabled:opacity-50 border-b-4 border-slate-900"
            >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                CHECK ROLL
            </button>
            {result && (
                <div className={`text-xs font-bold px-3 py-1.5 rounded-lg animate-in fade-in slide-in-from-top-1 ${result.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                    {result.ok ? '✓' : '⚠'} {result.msg}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// PART ACCORDION (Piece Mode Grouping)
// ============================================================================
const PartAccordion = ({ batch, roll, part, setModalState, allowMultiple, onRequestReplacement }) => {
    const [isOpen, setIsOpen] = useState(false);

    const allPieces = part.size_details.reduce((acc, sz) => {
        return [...acc, ...sz.pieces.map(p => ({ ...p, _displayGroup: `Size ${sz.size}` }))];
    }, []);

    const status = checkEntityStatus({ pieces: allPieces });

    const handleBulkInspect = (e) => {
        e.stopPropagation();
        setModalState({ type: 'validate', isBundle: false, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: roll.roll_id, partId: part.part_id, partName: part.part_name, pieces: allPieces, titleOverride: `Bulk Inspect: ${part.part_name}`, allowMultiple });
    };

    const handleBulkRepair = (e) => {
        e.stopPropagation();
        setModalState({ type: 'validate', forceRepairMode: true, isBundle: false, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: roll.roll_id, partId: part.part_id, partName: part.part_name, pieces: allPieces, titleOverride: `Bulk Fix: ${part.part_name}` });
    };

    return (
        <div className="bg-white border-2 border-slate-200 rounded-2xl mb-4 shadow-sm overflow-hidden transition-all">
            <div className="p-5 flex flex-col md:flex-row md:justify-between md:items-center bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center mb-3 md:mb-0">
                    {isOpen ? <ChevronDown className="w-6 h-6 mr-4 text-slate-500" /> : <ChevronRight className="w-6 h-6 mr-4 text-slate-500" />}
                    <Component className="w-6 h-6 mr-3 text-indigo-500" />
                    <h4 className="font-black text-slate-800 text-xl tracking-tight uppercase">{part.part_name}</h4>
                    <span className="ml-5 text-xs font-bold text-slate-500 bg-slate-200 px-3 py-1.5 rounded-lg uppercase tracking-widest">{status.total_processed} / {status.total_cut} Processed</span>
                    <RejectedEarlierBadge status={status} className="ml-3" />
                </div>
                <div className="flex items-center space-x-3 ml-12 md:ml-0">
                    {status.pending_alter > 0 && (
                        <button onClick={handleBulkRepair} className="px-4 py-2 text-sm bg-amber-100 text-amber-900 border border-amber-200 rounded-xl hover:bg-amber-200 font-black shadow-sm flex items-center active:scale-95"><Hammer className="w-4 h-4 mr-2"/> Fix Rework ({status.pending_alter})</button>
                    )}
                    {!status.isComplete ? (
                        <button onClick={handleBulkInspect} className="px-6 py-2 text-sm bg-slate-800 text-white rounded-xl hover:bg-black font-black shadow-md active:scale-95 flex items-center transition-all">Bulk Inspect <ChevronRight className="w-4 h-4 ml-1" /></button>
                    ) : (
                        <button onClick={handleBulkInspect} className="px-4 py-2 text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-black flex items-center shadow-sm hover:bg-emerald-100 hover:border-emerald-400 active:scale-95 transition-all"><Check className="w-4 h-4 mr-2"/> Validated</button>
                    )}
                </div>
            </div>
            {isOpen && (
                <div className="p-5 bg-white border-t-2 border-slate-100 space-y-4">
                    {part.size_details.map(size => {
                        const sizePieces = size.pieces.map(p => ({ ...p, _displayGroup: `Size ${size.size}` }));
                        return (
                            <ValidationProgressRow
                                key={size.size} label={`Size ${size.size}`} icon={Layers} entity={{ pieces: sizePieces }}
                                onInspect={() => setModalState({ type: 'validate', isBundle: false, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: roll.roll_id, partId: part.part_id, partName: part.part_name, size: size.size, pieces: sizePieces, allowMultiple })}
                                onRepair={() => setModalState({ type: 'validate', forceRepairMode: true, isBundle: false, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: roll.roll_id, partId: part.part_id, partName: part.part_name, size: size.size, pieces: sizePieces })}
                                onRequestReplacement={onRequestReplacement && (() => onRequestReplacement(new Set(sizePieces.map(p => p.id))))}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// Size-first counterpart to PartAccordion — same shape, roll and size
// swapped: rows are labeled "Roll #X" instead of "Size X", since within one
// size section it's the roll that varies, not the size.
const PartAccordionBySize = ({ batch, size, part, setModalState, allowMultiple, onRequestReplacement }) => {
    const [isOpen, setIsOpen] = useState(false);

    const allPieces = part.roll_details.reduce((acc, r) => {
        return [...acc, ...r.pieces.map(p => ({ ...p, _displayGroup: `Roll #${r.roll_id}` }))];
    }, []);

    const status = checkEntityStatus({ pieces: allPieces });

    const handleBulkInspect = (e) => {
        e.stopPropagation();
        setModalState({ type: 'validate', isBundle: false, batchId: batch.batch_id, batchCode: batch.batch_code, size, partId: part.part_id, partName: part.part_name, pieces: allPieces, titleOverride: `Bulk Inspect: ${part.part_name} · Size ${size}`, allowMultiple });
    };

    const handleBulkRepair = (e) => {
        e.stopPropagation();
        setModalState({ type: 'validate', forceRepairMode: true, isBundle: false, batchId: batch.batch_id, batchCode: batch.batch_code, size, partId: part.part_id, partName: part.part_name, pieces: allPieces, titleOverride: `Bulk Fix: ${part.part_name} · Size ${size}` });
    };

    return (
        <div className="bg-white border-2 border-slate-200 rounded-2xl mb-4 shadow-sm overflow-hidden transition-all">
            <div className="p-5 flex flex-col md:flex-row md:justify-between md:items-center bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center mb-3 md:mb-0">
                    {isOpen ? <ChevronDown className="w-6 h-6 mr-4 text-slate-500" /> : <ChevronRight className="w-6 h-6 mr-4 text-slate-500" />}
                    <Component className="w-6 h-6 mr-3 text-indigo-500" />
                    <h4 className="font-black text-slate-800 text-xl tracking-tight uppercase">{part.part_name}</h4>
                    <span className="ml-5 text-xs font-bold text-slate-500 bg-slate-200 px-3 py-1.5 rounded-lg uppercase tracking-widest">{status.total_processed} / {status.total_cut} Processed</span>
                    <RejectedEarlierBadge status={status} className="ml-3" />
                </div>
                <div className="flex items-center space-x-3 ml-12 md:ml-0">
                    {status.pending_alter > 0 && (
                        <button onClick={handleBulkRepair} className="px-4 py-2 text-sm bg-amber-100 text-amber-900 border border-amber-200 rounded-xl hover:bg-amber-200 font-black shadow-sm flex items-center active:scale-95"><Hammer className="w-4 h-4 mr-2"/> Fix Rework ({status.pending_alter})</button>
                    )}
                    {!status.isComplete ? (
                        <button onClick={handleBulkInspect} className="px-6 py-2 text-sm bg-slate-800 text-white rounded-xl hover:bg-black font-black shadow-md active:scale-95 flex items-center transition-all">Bulk Inspect <ChevronRight className="w-4 h-4 ml-1" /></button>
                    ) : (
                        <button onClick={handleBulkInspect} className="px-4 py-2 text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-black flex items-center shadow-sm hover:bg-emerald-100 hover:border-emerald-400 active:scale-95 transition-all"><Check className="w-4 h-4 mr-2"/> Validated</button>
                    )}
                </div>
            </div>
            {isOpen && (
                <div className="p-5 bg-white border-t-2 border-slate-100 space-y-4">
                    {part.roll_details.map(r => {
                        const rollPieces = r.pieces.map(p => ({ ...p, _displayGroup: `Roll #${r.roll_id}` }));
                        return (
                            <ValidationProgressRow
                                key={r.roll_id} label={`Roll #${r.roll_id}`} icon={Layers} entity={{ pieces: rollPieces }}
                                onInspect={() => setModalState({ type: 'validate', isBundle: false, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: r.roll_id, partId: part.part_id, partName: part.part_name, size, pieces: rollPieces, allowMultiple })}
                                onRepair={() => setModalState({ type: 'validate', forceRepairMode: true, isBundle: false, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: r.roll_id, partId: part.part_id, partName: part.part_name, size, pieces: rollPieces })}
                                onRequestReplacement={onRequestReplacement && (() => onRequestReplacement(new Set(rollPieces.map(p => p.id))))}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// DYNAMIC PROGRESS ROWS
// ============================================================================
const ValidationProgressRow = ({ label, subLabel, icon: Icon, entity, onInspect, onRepair, canApproveBundle, onQuickApprove, isApproveBlocked, onRequestReplacement }) => {
    const rowStatus = checkEntityStatus(entity);
    const { total_cut, total_processed, pending_alter, upstream_rework, isComplete, total_validated, total_rejected, total_repaired, rejected_earlier } = rowStatus;
    if (total_cut === 0) return null;
    const upstreamStage = entity.upstream_stage || 'previous stage';
    const upstreamBlocked = entity.upstream_blocked || 0;
    const upstreamRejected = entity.upstream_rejected || [];
    // Keeps the button visible even after every rework piece here has already
    // been sent (pending_alter drops to 0 once they flip to FOR_REPLACEMENT) —
    // otherwise there'd be no way back into this row's "already sent" status.
    const hasReplacementActivity = (entity.pieces || []).some(p => p.qc_status === 'FOR_REPLACEMENT');

    return (
        <div className={`p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between hover:border-indigo-300 transition-colors ${rejected_earlier > 0 ? 'border-l-8 border-l-rose-400' : ''}`}>
            <div className="flex items-center w-full md:w-1/3 mb-3 md:mb-0">
                <div className="p-3 bg-slate-100 text-indigo-600 rounded-xl mr-4"><Icon size={24}/></div>
                <div>
                    <span className="font-black text-slate-800 tracking-tight block text-lg">{label}</span>
                    {subLabel && <span className="text-xs text-indigo-500 font-black uppercase tracking-widest">{subLabel}</span>}
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">{total_processed} / {total_cut} pieces</span>
                    {(upstreamBlocked > 0 || upstream_rework > 0 || upstreamRejected.length > 0 || rejected_earlier > 0) && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {upstreamRejected.length === 0 && <RejectedEarlierBadge status={rowStatus} />}
                            {upstreamBlocked > 0 && (
                                <span title={`${upstreamBlocked} piece(s) pending or in rework at ${upstreamStage} — warning only`} className="inline-flex items-center text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 rounded-md px-1.5 py-0.5">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> Not cleared at {upstreamStage} ({upstreamBlocked})
                                </span>
                            )}
                            {upstream_rework > 0 && (
                                <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 rounded-md px-1.5 py-0.5">
                                    <Hammer className="w-3 h-3 mr-1" /> {upstream_rework} rework upstream
                                </span>
                            )}
                            {upstreamRejected.length > 0 && (
                                <span className="inline-flex flex-wrap items-center gap-x-1 text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-300 rounded-md px-1.5 py-0.5">
                                    <Flag className="w-3 h-3" /> {upstreamRejected.length} rejected at {upstreamStage}
                                    <span className="normal-case tracking-normal font-bold text-rose-600">
                                        · {upstreamRejected.slice(0, MAX_SEQS).map(upstreamRejectedLabel).join(', ')}{upstreamRejected.length > MAX_SEQS ? ` +${upstreamRejected.length - MAX_SEQS}` : ''}
                                    </span>
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="w-full md:w-1/3 h-3 bg-slate-100 rounded-full flex overflow-hidden shadow-inner md:mx-6 mb-4 md:mb-0">
                <div className="bg-emerald-500" style={{ width: `${(total_validated/total_cut)*100}%` }}></div>
                <div className="bg-teal-400" style={{ width: `${(total_repaired/total_cut)*100}%` }}></div>
                <div className="bg-amber-400" style={{ width: `${(pending_alter/total_cut)*100}%` }}></div>
                <div className="bg-rose-500" style={{ width: `${((total_rejected - rejected_earlier)/total_cut)*100}%` }}></div>
                <div className="bg-rose-300" title="Rejected at an earlier stage" style={{ width: `${(rejected_earlier/total_cut)*100}%` }}></div>
            </div>

            <div className="w-full md:w-1/3 flex justify-start md:justify-end items-center space-x-3">
                {pending_alter > 0 && (
                     <button onClick={() => onRepair(entity)} className="px-4 py-2 text-sm bg-amber-100 text-amber-900 border-2 border-amber-200 rounded-xl hover:bg-amber-200 font-black flex items-center shadow-sm active:scale-95 transition-all"><Hammer className="w-4 h-4 mr-2"/> Fix Rework ({pending_alter})</button>
                )}
                {(pending_alter > 0 || hasReplacementActivity) && onRequestReplacement && (
                     <button onClick={() => onRequestReplacement(entity)} className="px-4 py-2 text-sm bg-violet-100 text-violet-800 border-2 border-violet-200 rounded-xl hover:bg-violet-200 font-black flex items-center shadow-sm active:scale-95 transition-all"><PackageX className="w-4 h-4 mr-2"/> Replacement</button>
                )}
                {!isComplete ? (
                    <>
                        <button onClick={() => onInspect(entity)} className="px-6 py-2 text-sm bg-white text-slate-800 border-2 border-slate-300 rounded-xl hover:border-indigo-500 hover:text-indigo-700 font-black shadow-sm active:scale-95 flex items-center transition-all">INSPECT</button>
                        {canApproveBundle && (
                            <button onClick={() => onQuickApprove(entity)} disabled={isApproveBlocked || pending_alter > 0} title={isApproveBlocked ? 'Rework backlog is over the limit — clear it via Repair or Reject before approving new pieces.' : pending_alter > 0 ? 'Fix or reject the rework pieces first' : undefined} className="px-4 py-2 text-sm bg-emerald-100 text-emerald-800 border-2 border-emerald-200 rounded-xl hover:bg-emerald-200 font-black shadow-sm active:scale-95 flex items-center transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100">
                                <CheckCircle2 className="w-4 h-4 mr-2" /> QUICK APPROVE
                            </button>
                        )}
                    </>
                ) : (
                    <button onClick={() => onInspect(entity)} className="px-5 py-2 text-sm text-emerald-600 bg-emerald-50 border-2 border-emerald-200 rounded-xl font-black flex items-center w-max hover:bg-emerald-100 hover:border-emerald-400 active:scale-95 transition-all"><Check className="w-4 h-4 mr-2"/> DONE</button>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// BATCH HISTORY PANEL
// ============================================================================
const SEVERITY_STYLE = {
    NEEDS_REWORK: 'bg-amber-100 text-amber-700',
    QC_REJECTED:  'bg-red-100 text-red-700',
};

const fmtDate = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return iso; }
};

const BatchHistoryPanel = ({ onClose }) => {
    const [page, setPage]           = useState(1);
    const [listData, setListData]   = useState(null);   // { batches, total_pages, total }
    const [listError, setListError] = useState(null);
    const [listLoading, setListLoading] = useState(false);

    const [detail, setDetail]           = useState(null);   // full detail response
    const [detailError, setDetailError] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [openRolls, setOpenRolls] = useState(new Set());

    // ── fetch list ────────────────────────────────────────────────────────────
    const fetchList = useCallback(async (p) => {
        setListLoading(true);
        setListError(null);
        try {
            const res = await universalApi.getBatchHistory(p, 20);
            setListData(res.data);
        } catch (err) {
            setListError(err.response?.data?.error || err.message || 'Failed to load history.');
        } finally {
            setListLoading(false);
        }
    }, []);

    useEffect(() => { fetchList(page); }, [fetchList, page]);

    // ── fetch detail ──────────────────────────────────────────────────────────
    const openDetail = async (batchId) => {
        setDetail(null);
        setDetailError(null);
        setDetailLoading(true);
        setOpenRolls(new Set());
        try {
            const res = await universalApi.getBatchHistoryDetail(batchId);
            setDetail(res.data);
        } catch (err) {
            const status = err.response?.status;
            if (status === 404) setDetailError('Batch not found or not completed on this line.');
            else setDetailError(err.response?.data?.error || err.message || 'Failed to load batch detail.');
        } finally {
            setDetailLoading(false);
        }
    };

    const toggleRoll = (rollId) => setOpenRolls(prev => {
        const n = new Set(prev); n.has(rollId) ? n.delete(rollId) : n.add(rollId); return n;
    });

    const isDetailView = detail || detailLoading || detailError;

    return (
        <div className="fixed inset-0 z-[300] flex justify-end" onClick={onClose}>
            <div
                className="relative bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl border-l border-slate-200 animate-in slide-in-from-right-8 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* ── Panel header ── */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2">
                        {isDetailView && (
                            <button onClick={() => { setDetail(null); setDetailError(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 transition mr-1">
                                <ChevronLeft size={16} className="text-slate-500" />
                            </button>
                        )}
                        <History size={16} className="text-indigo-500 shrink-0" />
                        <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                            {isDetailView ? (detail?.batch?.batch_id || 'Batch Detail') : 'Batch History'}
                        </h2>
                        {!isDetailView && listData && (
                            <span className="text-xs font-bold text-slate-400">{listData.total} completed</span>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="flex-1 overflow-y-auto">

                    {/* LIST VIEW */}
                    {!isDetailView && (
                        <>
                            {listLoading && (
                                <div className="flex items-center justify-center py-24 gap-2 text-slate-400">
                                    <Loader2 size={18} className="animate-spin" /><span className="text-sm">Loading…</span>
                                </div>
                            )}
                            {listError && (
                                <div className="m-4 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                                    <ShieldAlert size={16} className="text-rose-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-black text-rose-700">Failed to load history</p>
                                        <p className="text-xs text-rose-600 mt-0.5">{listError}</p>
                                        <button onClick={() => fetchList(page)} className="mt-2 text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1">
                                            <RefreshCw size={11} /> Retry
                                        </button>
                                    </div>
                                </div>
                            )}
                            {!listLoading && !listError && listData && (
                                <div className="divide-y divide-slate-100">
                                    {listData.batches.length === 0 && (
                                        <div className="py-20 text-center text-slate-400 text-sm font-bold">No completed batches found.</div>
                                    )}
                                    {listData.batches.map(b => {
                                        const pct = b.total_pieces > 0 ? Math.round((b.completed_rolls / b.total_rolls) * 100) : 0;
                                        return (
                                            <button key={b.batch_id} onClick={() => openDetail(b.batch_id)}
                                                className="w-full text-left px-5 py-4 hover:bg-slate-50 transition group">
                                                <div className="flex items-start justify-between gap-3 mb-2">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="font-mono font-black text-sm text-indigo-600">{b.batch_id}</span>
                                                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg uppercase">{b.product_sku}</span>
                                                        </div>
                                                        <p className="text-sm font-bold text-slate-700">{b.product_name}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">DONE</span>
                                                        <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-400 transition" />
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4 text-xs text-slate-500 mb-2.5">
                                                    <span>{b.total_pieces.toLocaleString()} pcs</span>
                                                    <span>{b.total_rolls} rolls</span>
                                                    <span>Completed {fmtDate(b.completed_at)}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <span className="text-[10px] font-black text-slate-400">{b.completed_rolls}/{b.total_rolls} rolls</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {/* DETAIL VIEW */}
                    {isDetailView && (
                        <div className="p-5">
                            {detailLoading && (
                                <div className="flex items-center justify-center py-24 gap-2 text-slate-400">
                                    <Loader2 size={18} className="animate-spin" /><span className="text-sm">Loading batch…</span>
                                </div>
                            )}
                            {detailError && (
                                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                                    <ShieldAlert size={16} className="text-rose-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-black text-rose-700">Could not load batch</p>
                                        <p className="text-xs text-rose-600 mt-0.5">{detailError}</p>
                                    </div>
                                </div>
                            )}
                            {detail && (() => {
                                const b = detail.batch;
                                const st = b.processing_stats || {};
                                const dhu = st.total_processed > 0 ? ((st.needs_rework + st.qc_rejected) / st.total_processed * 100).toFixed(1) : '—';
                                return (
                                    <>
                                        {/* Batch header */}
                                        <div className="mb-5 pb-4 border-b border-slate-100">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-mono font-black text-lg text-indigo-600">{b.batch_id}</span>
                                                {b.product_sku && <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">{b.product_sku}</span>}
                                            </div>
                                            <p className="font-bold text-slate-700 text-sm mb-2">{b.product_name}</p>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                                <span>{b.total_pieces?.toLocaleString()} pcs · {b.total_rolls} rolls</span>
                                                <span>Completed {fmtDate(b.completed_at)}</span>
                                            </div>
                                            {b.notes && (
                                                <div className="mt-2 text-xs text-slate-500 italic bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{b.notes}</div>
                                            )}
                                        </div>

                                        {/* Processing stats */}
                                        <div className="mb-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <BarChart2 size={13} className="text-slate-400" />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Processing Stats</span>
                                                <span className="ml-auto text-xs font-black text-rose-600">DHU {dhu}%</span>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                                                {[
                                                    { label: 'Processed',  val: st.total_processed, cls: 'bg-slate-50 text-slate-700' },
                                                    { label: 'Approved',   val: st.approved,         cls: 'bg-emerald-50 text-emerald-700' },
                                                    { label: 'Repaired',   val: st.repaired,         cls: 'bg-teal-50 text-teal-700' },
                                                    { label: 'Rework',     val: st.needs_rework,     cls: 'bg-amber-50 text-amber-700' },
                                                    { label: 'Rejected',   val: st.qc_rejected,      cls: 'bg-rose-50 text-rose-700' },
                                                ].map(({ label, val, cls }) => (
                                                    <div key={label} className={`${cls} rounded-xl px-3 py-2`}>
                                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</p>
                                                        <p className="text-xl font-black">{val?.toLocaleString() ?? '—'}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            {/* Progress bar */}
                                            {st.total_processed > 0 && (
                                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                                                    <div className="bg-emerald-500 h-full" style={{ width: `${(st.approved / st.total_processed) * 100}%` }} />
                                                    <div className="bg-teal-400 h-full"   style={{ width: `${(st.repaired / st.total_processed) * 100}%` }} />
                                                    <div className="bg-amber-400 h-full"  style={{ width: `${(st.needs_rework / st.total_processed) * 100}%` }} />
                                                    <div className="bg-rose-500 h-full"   style={{ width: `${(st.qc_rejected / st.total_processed) * 100}%` }} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Defect summary */}
                                        {b.defect_summary?.length > 0 && (
                                            <div className="mb-5">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <ShieldAlert size={13} className="text-amber-500" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Defect Summary</span>
                                                </div>
                                                <div className="border border-slate-100 rounded-xl overflow-hidden">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="bg-slate-50 border-b border-slate-100">
                                                                <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wider">Code</th>
                                                                <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wider">Description</th>
                                                                <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wider">Severity</th>
                                                                <th className="text-right px-3 py-2 font-black text-slate-500 uppercase tracking-wider">Count</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {b.defect_summary.map((d, i) => (
                                                                <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                                                                    <td className="px-3 py-2 font-mono font-black text-indigo-600">{d.code}</td>
                                                                    <td className="px-3 py-2 text-slate-600">{d.description}</td>
                                                                    <td className="px-3 py-2">
                                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${SEVERITY_STYLE[d.severity] ?? 'bg-slate-100 text-slate-600'}`}>
                                                                            {d.severity?.replace(/_/g,' ')}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-3 py-2 text-right font-black text-slate-700">{d.count}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* Rolls accordion */}
                                        {detail.rolls?.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Layers size={13} className="text-slate-400" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rolls ({detail.rolls.length})</span>
                                                </div>
                                                <div className="space-y-2">
                                                    {detail.rolls.map(roll => {
                                                        const isOpen = openRolls.has(roll.roll_id);
                                                        // Count pieces across parts
                                                        let totalPcs = 0, approvedPcs = 0;
                                                        (roll.parts_details || []).forEach(part => {
                                                            (part.size_details || part.bundles || []).forEach(s => {
                                                                const pcs = s.pieces || [];
                                                                totalPcs += pcs.length;
                                                                approvedPcs += pcs.filter(p => p.qc_status === 'APPROVED' || p.status === 'APPROVED').length;
                                                            });
                                                        });
                                                        return (
                                                            <div key={roll.roll_id} className="border border-slate-200 rounded-xl overflow-hidden">
                                                                <button type="button" onClick={() => toggleRoll(roll.roll_id)}
                                                                    className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition text-left">
                                                                    <div className="flex items-center gap-2">
                                                                        <ChevronRight size={13} className={`text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
                                                                        <Layers size={13} className="text-indigo-400 shrink-0" />
                                                                        <span className="font-black text-sm text-slate-700">Roll #{roll.roll_id}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-3 text-xs">
                                                                        <span className={`font-black px-2 py-0.5 rounded text-[10px] uppercase ${roll.roll_status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                            {roll.roll_status}
                                                                        </span>
                                                                        {totalPcs > 0 && <span className="text-slate-400 font-mono">{approvedPcs}/{totalPcs}</span>}
                                                                        <span className="text-slate-300 text-[10px]">{fmtDate(roll.roll_completed_at)}</span>
                                                                    </div>
                                                                </button>
                                                                {isOpen && roll.parts_details?.length > 0 && (
                                                                    <div className="px-4 py-3 space-y-2 bg-white border-t border-slate-100">
                                                                        {roll.parts_details.map((part, pi) => (
                                                                            <div key={pi} className="text-xs">
                                                                                <div className="font-black text-slate-600 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                                                                    <Component size={11} className="text-indigo-400" />
                                                                                    {part.part_name || `Part ${pi + 1}`}
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-1.5 pl-4">
                                                                                    {(part.size_details || part.bundles || []).map((s, si) => {
                                                                                        const pcs = s.pieces || [];
                                                                                        const appr = pcs.filter(p => p.qc_status === 'APPROVED' || p.status === 'APPROVED').length;
                                                                                        return (
                                                                                            <span key={si} className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-600">
                                                                                                Sz {s.size}
                                                                                                <span className="text-emerald-600 font-black">{appr}/{pcs.length}</span>
                                                                                            </span>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>

                {/* ── Pagination (list view only) ── */}
                {!isDetailView && listData && listData.total_pages > 1 && (
                    <div className="shrink-0 px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-white">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1 || listLoading}
                            className="flex items-center gap-1 text-xs font-black text-slate-600 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
                        >
                            <ChevronLeft size={14} /> Prev
                        </button>
                        <span className="text-xs font-bold text-slate-400">
                            Page {page} of {listData.total_pages} · {listData.total} batches
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(listData.total_pages, p + 1))}
                            disabled={page >= listData.total_pages || listLoading}
                            className="flex items-center gap-1 text-xs font-black text-slate-600 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
                        >
                            Next <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// MAIN PAGE DASHBOARD
// ============================================================================
const UniversalWorkstationDashboard = () => {
    const [batches, setBatches] = useState([]);
    const [defectCodes, setDefectCodes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false); 
    const [error, setError] = useState(null);
    const [modalState, setModalState] = useState(null);
    const [headerInfo, setHeaderInfo] = useState({});
    // Persisted across refresh — reconciled back to 'ALL' below once the
    // stored batch is no longer in the live `batches` list (i.e. no longer
    // active on this checker's line), so a stale selection never sticks.
    const [selectedBatchId, setSelectedBatchId] = useState(() => {
        try { return localStorage.getItem(BATCH_FILTER_LS_KEY) || 'ALL'; }
        catch { return 'ALL'; }
    });
    const [openBatchId,    setOpenBatchId]    = useState(null);
    const [openBundleParts, setOpenBundleParts] = useState(new Set());
    const toggleBundlePart = (key) => setOpenBundleParts(prev => {
        const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next;
    });
    // Grouping per batch — defaults to "by size" for MODE_2 (piece_sequence
    // runs continuously across rolls there, so size is the natural unit) and
    // "by roll" for MODE_1, but a checker can flip either one manually.
    // { [batchId]: 'roll' | 'size' } — only set once a batch's default is overridden.
    const [viewModeOverrides, setViewModeOverrides] = useState({});
    const getViewMode = (batch) => viewModeOverrides[batch.batch_id]
        ?? (batch.piece_sequencing_mode === 'MODE_2' ? 'size' : 'roll');
    const toggleViewMode = (batch) => setViewModeOverrides(prev => ({
        ...prev, [batch.batch_id]: getViewMode(batch) === 'roll' ? 'size' : 'roll',
    }));
    const [showNav,     setShowNav]     = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [stats,                setStats]                = useState(null);
    const [todayApprovedPieces, setTodayApprovedPieces] = useState(null);
    const [showModal,         setShowModal]         = useState(false);
    const [showApprovedModal, setShowApprovedModal] = useState(false);
    const [showReplacementRequestModal, setShowReplacementRequestModal] = useState(false);
    const [showReplacementStatusModal, setShowReplacementStatusModal] = useState(false);
    // null = whole-queue (opened from the "Pending Rework" tile/toolbar button);
    // a Set of piece ids = opened from one size/roll row's own "Replacement"
    // button, scoping the modal to just that row's rework pieces.
    const [replacementScopePieceIds, setReplacementScopePieceIds] = useState(null);
    // Set when a card in the "Already Sent For This Row" list is clicked —
    // UniversalValidationModal blinks the matching tile so it's easy to find
    // among everything else in that size/roll group.
    const [highlightPieceId, setHighlightPieceId] = useState(null);
    const [workData,          setWorkData]          = useState(null);
    const [loadingWork,       setLoadingWork]       = useState(false);
    const [apiError,    setApiError]    = useState(null);
    const apiErrTimer = useRef(null);
    const popApiError = (msg) => {
        setApiError(msg);
        clearTimeout(apiErrTimer.current);
        apiErrTimer.current = setTimeout(() => setApiError(null), 6000);
    };
    const [selectedParts, setSelectedParts] = useState(() => {
        try {
            const stored = localStorage.getItem(PART_FILTER_LS_KEY);
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch { return new Set(); }
    });
    const [showPartFilter, setShowPartFilter] = useState(false);
    const partFilterRef = useRef(null);

    const allowMultiple = headerInfo.can_approve_multiple_piece || false;
    const allowBundle = headerInfo.can_approve_whole_bundle || false;
    const allowRoll = headerInfo.can_approve_whole_roll || false;
    // Stage 1 of the PRODUCT's cycle (product_cycle_flow.sequence_no = 1 —
    // e.g. "cutting", universally, regardless of product) — a checker whose
    // own line is of that type is also allowed to accept/fulfill/cancel
    // material replacement requests (see materialReplacementRoutes.js's
    // requireFulfillmentAccess, which enforces this same condition
    // server-side regardless of what this button shows). NOT the checker's
    // position within their own line's workstation sequence.
    const isStage1Checker = headerInfo.is_stage_1 === true;
    const [showFulfillmentModal, setShowFulfillmentModal] = useState(false);

    const fetchQueue = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await universalApi.getWorkstationData();
            if (res.data.error) throw new Error(res.data.error);
            const newBatches = res.data.batches || [];
            setBatches(newBatches);
            setHeaderInfo(res.data.workstationInfo || {});
            setOpenBatchId(prev => prev ?? (newBatches[0]?.batch_id ?? null));
            return newBatches; // 🚨 BUG FIX: Return fresh data to update the modal
        } catch (err) { setError(err.message || "Failed to load workstation data."); return []; } 
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => {
        fetchQueue();
        universalApi.getDefectCodes().then(res => setDefectCodes(res.data)).catch(console.error);
    }, [fetchQueue]);

    // ── Part filter helpers ───────────────────────────────────────────────────
    const uniquePartNames = useMemo(() => {
        const names = new Set();
        batches.forEach(batch => {
            (batch.bundles || []).forEach(b => { if (b.part_name) names.add(b.part_name.trim().toLowerCase()); });
            (batch.rolls || []).forEach(r => {
                (r.parts_details || []).forEach(p => { if (p.part_name) names.add(p.part_name.trim().toLowerCase()); });
            });
        });
        const result = [...names].sort();
        return result;
    }, [batches]);

    // Every piece currently sitting in this checker's own PENDING REWORK
    // queue (unresolved NEEDS_REWORK), flattened with batch/roll/part/size
    // context — feeds the "Pending Rework" tile's click-through and the
    // material-replacement request picker (the actual list). This is the
    // SAME set "Pending Rework" already counts (see getCheckerStats'
    // pending_rework), just materialized client-side with full context
    // instead of a bare number. PIECE-mode only (batch.rolls) — BUNDLE-mode
    // batches approve/reject as a whole bundle, and fulfilling a replacement
    // clears the WHOLE bundle's tracking row, which would wrongly reset
    // other pieces in that bundle too; not offered there for that reason.
    const pendingReworkPieces = useMemo(() => {
        const out = [];
        batches.forEach(batch => {
            (batch.rolls || []).forEach(roll => {
                (roll.parts_details || []).forEach(part => {
                    (part.size_details || []).forEach(sizeGroup => {
                        (sizeGroup.pieces || []).forEach(piece => {
                            if (isOwnRework(piece)) {
                                out.push({
                                    id: piece.id,
                                    piece_sequence: piece.piece_sequence,
                                    batch_id: batch.batch_id,
                                    batch_code: batch.batch_code,
                                    roll_id: roll.roll_id,
                                    part_name: part.part_name,
                                    size: sizeGroup.size,
                                    defect_reason: piece.defect_reason,
                                });
                            }
                        });
                    });
                });
            });
        });
        return out;
    }, [batches]);

    // Opened from a size/roll row's own "Replacement" button — scopes the
    // modal to that row's own pieces (every id in the row, not just its
    // current NEEDS_REWORK ones — a piece already sent for replacement is
    // FOR_REPLACEMENT by the time this is clicked again, and a fulfilled one
    // has already reverted to a fresh PENDING piece, so scoping to the row's
    // full piece set is what lets the "already sent" history keep finding it)
    // instead of the whole queue. Called with no Set (the "Pending Rework"
    // tile/toolbar entry point bypasses this handler entirely) means unscoped.
    const openReplacementRequest = (pieceIds) => {
        setReplacementScopePieceIds(pieceIds instanceof Set ? pieceIds : null);
        setShowReplacementRequestModal(true);
    };

    // Clicked from a card in the "Already Sent For This Row" list — locates
    // that piece in the live queue and opens the normal Inspect view for its
    // whole size group (not the repair-only view), with the tile blinking so
    // it's easy to spot among the rest of the group.
    const openValidationForPiece = (pieceId) => {
        for (const batch of batches) {
            for (const roll of batch.rolls || []) {
                for (const part of roll.parts_details || []) {
                    for (const sizeGroup of part.size_details || []) {
                        const found = (sizeGroup.pieces || []).some(p => String(p.id) === String(pieceId));
                        if (!found) continue;
                        const sizePieces = sizeGroup.pieces.map(p => ({ ...p, _displayGroup: `Size ${sizeGroup.size}` }));
                        setModalState({ type: 'validate', isBundle: false, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: roll.roll_id, partId: part.part_id, partName: part.part_name, size: sizeGroup.size, pieces: sizePieces, allowMultiple });
                        setHighlightPieceId(pieceId);
                        setShowReplacementRequestModal(false);
                        setReplacementScopePieceIds(null);
                        return;
                    }
                }
            }
        }
        popApiError('Could not find that piece in the current queue — it may have already moved on.');
    };
    const replacementModalPieces = replacementScopePieceIds
        ? pendingReworkPieces.filter(p => replacementScopePieceIds.has(p.id))
        : pendingReworkPieces;

    useEffect(() => {
        try { localStorage.setItem(PART_FILTER_LS_KEY, JSON.stringify([...selectedParts])); }
        catch {}
    }, [selectedParts]);

    useEffect(() => {
        try { localStorage.setItem(BATCH_FILTER_LS_KEY, selectedBatchId); }
        catch {}
    }, [selectedBatchId]);

    // Drops back to 'ALL' the moment the selected batch falls out of the live
    // queue (fulfilled/moved off this line) — a refresh restores the pick
    // from localStorage, but it should never survive past the batch itself.
    useEffect(() => {
        if (selectedBatchId === 'ALL' || batches.length === 0) return;
        const stillActive = batches.some(b => String(b.batch_id) === String(selectedBatchId));
        if (!stillActive) setSelectedBatchId('ALL');
    }, [batches, selectedBatchId]);

    useEffect(() => {
        const handler = (e) => {
            if (partFilterRef.current && !partFilterRef.current.contains(e.target))
                setShowPartFilter(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const togglePart = (name) => setSelectedParts(prev => {
        const next = new Set(prev);
        next.has(name) ? next.delete(name) : next.add(name);
        return next;
    });

    const isPartVisible = (partName) => selectedParts.size === 0 || selectedParts.has((partName || '').trim().toLowerCase());

    // ── Auth / navigation ─────────────────────────────────────────────────────
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const handleLogout = () => { logout(); navigate('/login'); };

    // ── Checker stats (auto-refresh) ──────────────────────────────────────────
    const loadStats = useCallback(async () => {
        try {
            // Same date the approved tile always used (was sent to today-work).
            const today = new Date().toISOString().split('T')[0];
            const res = await universalApi.getCheckerStats(today);
            setStats(res.data);
            // today_approved_pieces = the work log's APPROVED row count, so the
            // whole log no longer has to be downloaded to count it. Older
            // backend without the field → count from the work log as before.
            if (res.data && 'today_approved_pieces' in res.data) {
                setTodayApprovedPieces(res.data.today_approved_pieces);
            } else {
                universalApi.getTodayWork(today)
                    .then(w => setTodayApprovedPieces((w.data?.rows ?? []).filter(r => r.action === 'APPROVED').length))
                    .catch(() => { /* silent — stats fallback still shows */ });
            }
            return res.data; // callers that need the FRESH value right away (not next render's stale-closure `stats`) use this
        // eslint-disable-next-line react-hooks/exhaustive-deps
        } catch (err) {
            popApiError(err.response?.data?.error || err.message || 'Failed to load stats');
            return null;
        }
    }, []);

    // Full-screen, un-missable interrupt once this checker's own pending-rework
    // backlog (same count as the "Pending Rework" tile) reaches the configured
    // warning threshold — re-checked after every APPROVED/NEEDS_REWORK/
    // REPAIRED/QC_REJECTED submission (not the passive 60s background poll,
    // and not revert-to-pending — none of those are a "submit" event) so it
    // resurfaces on the checker's own next action for as long as the backlog
    // stays at/above the threshold, rather than showing once and being
    // forgotten. Both thresholds are set by production_manager (see
    // ProductionSettingsPage.jsx); defaults here match the backend's own
    // fallback so the dashboard behaves the same before the fetch resolves.
    const [reworkWarningThreshold, setReworkWarningThreshold] = useState(10);
    const [reworkBlockThreshold, setReworkBlockThreshold] = useState(20);
    useEffect(() => {
        universalApi.getReworkThresholds()
            .then(res => {
                setReworkWarningThreshold(res.data.warning_threshold);
                setReworkBlockThreshold(res.data.block_threshold);
            })
            .catch(() => { /* keep defaults — server-side enforcement is authoritative regardless */ });
    }, []);
    // Plain APPROVE is hard-blocked past this — server enforces it independently
    // (logPieceCheck), this just mirrors it in the UI so the button itself
    // disables instead of the checker discovering it via a failed submit.
    const isApproveBlocked = (stats?.pending_rework ?? 0) > reworkBlockThreshold;
    const [showReworkWarning, setShowReworkWarning] = useState(false);
    const checkReworkBacklog = (freshStats) => {
        if ((freshStats?.pending_rework ?? 0) >= reworkWarningThreshold) setShowReworkWarning(true);
    };
    useEffect(() => {
        loadStats(); // also refreshes the today-approved pieces tile
        const iv = setInterval(loadStats, STATS_REFRESH_MS);
        return () => clearInterval(iv);
    }, [loadStats]);

    // ── Work log fetch ────────────────────────────────────────────────────────
    const fetchWork = useCallback(async (date) => {
        setLoadingWork(true);
        try { const res = await universalApi.getTodayWork(date); setWorkData(res.data); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
        catch (err) { setWorkData(null); popApiError(err.response?.data?.error || err.message || 'Failed to load work log'); }
        finally { setLoadingWork(false); }
    }, []);
    const handleOpenModal = () => {
        setShowModal(true);
        if (workData === null) fetchWork(new Date().toISOString().split('T')[0]);
    };
    const handleOpenApprovedModal = () => {
        setShowApprovedModal(true);
        if (workData === null) fetchWork(new Date().toISOString().split('T')[0]);
    };
    const handleModalDateChange = (date) => { setWorkData(null); fetchWork(date); };

    // ── CSV export (summary per group) ───────────────────────────────────────
    const downloadCSV = (grouped, mode, date) => {
        if (!grouped?.length) return;
        const modeLabel = mode === 'hourly' ? 'hour' : 'fabric_roll';
        const header = `sr_no,${modeLabel},total,approved,repaired,needs_rework,qc_rejected`;
        const lines  = grouped.map(([groupKey, rows], i) => [
            i + 1, `"${groupKey}"`, rows.length,
            rows.filter(r => r.action === 'APPROVED').length,
            rows.filter(r => r.action === 'REPAIRED').length,
            rows.filter(r => r.action === 'NEEDS_REWORK').length,
            rows.filter(r => r.action === 'QC_REJECTED').length,
        ].join(','));
        const csv = [header, ...lines].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `work-log-${mode}-${date ?? new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // 🚨 BUG FIX: Updates modal state instantly after API response
    const refreshLiveModalPieces = (newBatches) => {
        setModalState(prevState => {
            if (!prevState) return null;
            let freshPieces = [];
            const batch = newBatches.find(b => b.batch_id === prevState.batchId);
            if (batch) {
                if (prevState.isBundle && prevState.bundle_id) {
                    freshPieces = batch.bundles?.find(b => b.bundle_id === prevState.bundle_id)?.pieces || [];
                } else if (prevState.isRollInspect) {
                    if (batch.bundles) freshPieces = batch.bundles.filter(b => b.roll_id === prevState.rollId).flatMap(b => b.pieces.map(p => ({...p, _displayGroup: `${b.part_name} | Size ${b.size}`})));
                    else if (batch.rolls) freshPieces = batch.rolls.find(r => r.roll_id === prevState.rollId)?.parts_details.flatMap(pt => pt.size_details.flatMap(sz => sz.pieces.map(p => ({...p, part_id: pt.part_id, size: sz.size, _displayGroup: `${pt.part_name} | Size ${sz.size}`})))) || [];
                } else if (prevState.size != null && prevState.rollId == null) {
                    // Size-first views (Mode 2) — scoped to one size across
                    // every roll, optionally narrowed to one part when
                    // partId is set (a per-roll row within a size still sets
                    // rollId and is handled by the fallback below instead).
                    if (batch.bundles) {
                        freshPieces = batch.bundles
                            .filter(b => b.size === prevState.size && (prevState.partId ? b.part_id === prevState.partId : true))
                            .flatMap(b => b.pieces.map(p => ({ ...p, bundle_id: b.bundle_id, part_id: b.part_id, size: b.size, _displayGroup: `${b.part_name || 'Mixed'} | Roll #${b.roll_id}` })));
                    } else if (batch.rolls) {
                        freshPieces = batch.rolls.flatMap(r =>
                            r.parts_details
                                .filter(pt => prevState.partId ? pt.part_id === prevState.partId : true)
                                .flatMap(pt => pt.size_details
                                    .filter(sz => sz.size === prevState.size)
                                    .flatMap(sz => sz.pieces.map(p => ({ ...p, part_id: pt.part_id, size: sz.size, _displayGroup: `${pt.part_name} | Roll #${r.roll_id}` })))
                                )
                        );
                    }
                } else {
                    const partDetails = batch.rolls?.find(r => r.roll_id === prevState.rollId)?.parts_details?.find(p => p.part_id === prevState.partId);
                    const sizeDetails = partDetails?.size_details?.filter(sz => prevState.size ? sz.size === prevState.size : true) || [];
                    freshPieces = sizeDetails.flatMap(sz => sz.pieces.map(p => ({ ...p, _displayGroup: `${prevState.partName} | Size ${sz.size}` })));
                }
            }
            return { ...prevState, pieces: freshPieces };
        });
    };

    const handleValidationSubmit = async (validationData) => {
        setIsProcessing(true); // 🚨 Global Full-Screen Lock ON
        try {
            if (Array.isArray(validationData)) {
                await Promise.all(validationData.map(data => universalApi.logPieceCheck(data)));
            } else {
                await universalApi.logPieceCheck(validationData);
            }
            const newBatches = await fetchQueue();
            refreshLiveModalPieces(newBatches); // Push fresh DB state to modal grid
            checkReworkBacklog(await loadStats()); // today_rework/pending_rework live in `stats`, not the today-approved count above — loadStats also refreshes the today-approved count
        } catch (err) {
            alert(err.response?.data?.error || `Error: ${err.message}`);
            throw err;
        } finally {
            setIsProcessing(false); // 🚨 Global Full-Screen Lock OFF
        }
    };

    const isPinError = (err) => ['SUPERVISOR_PIN_REQUIRED', 'SUPERVISOR_PIN_INVALID'].includes(err.response?.data?.code);

    const handleApproveAlterSubmit = async ({ pieceIds, status, defectCodeIds, supervisorPin }) => {
        setIsProcessing(true); // 🚨 Global Full-Screen Lock ON
        try {
            await universalApi.approveAlteredPieces({ batchId: modalState.batchId, pieceIds, status, defectCodeIds, supervisorPin });
            const newBatches = await fetchQueue();
            refreshLiveModalPieces(newBatches); // Push fresh DB state to modal grid
            checkReworkBacklog(await loadStats()); // today_rework/pending_rework live in `stats`, not the today-approved count above — loadStats also refreshes the today-approved count
        } catch (err) {
            if (!isPinError(err)) alert(err.response?.data?.error || `Error: ${err.message}`);
            throw err;
        } finally {
            setIsProcessing(false); // 🚨 Global Full-Screen Lock OFF
        }
    };

    const handleRevertToPending = async ({ pieceIds, supervisorPin }) => {
        setIsProcessing(true); // 🚨 Global Full-Screen Lock ON
        try {
            await universalApi.revertPieceToPending({ batchId: modalState.batchId, bundleId: modalState.bundle_id, pieceIds, supervisorPin });
            const newBatches = await fetchQueue();
            refreshLiveModalPieces(newBatches); // Push fresh DB state to modal grid
            loadStats();
        } catch (err) {
            if (!isPinError(err)) alert(err.response?.data?.error || `Error: ${err.message}`);
            throw err;
        } finally {
            setIsProcessing(false); // 🚨 Global Full-Screen Lock OFF
        }
    };

    const handleSubmitReplacementRequest = async (pieceIds, notes) => {
        await materialReplacementApi.createRequests({ pieceIds, notes });
        await fetchQueue(); // flagged pieces need to disappear from the normal queue immediately
        setShowReplacementRequestModal(false);
    };

    const handleQuickBulkApprove = async (entity, batchId, rollId) => {
        if (!window.confirm("Approve all pending pieces in this bundle automatically?")) return;
        setIsProcessing(true);
        try {
            const actionableIds = entity.pieces.filter(p => p.qc_status === 'PENDING' || !p.qc_status).map(p => p.id);
            if(actionableIds.length === 0) return;

            await universalApi.logPieceCheck({
                batchId: batchId, rollId: rollId, partId: entity.part_id, size: entity.size,
                pieceIds: actionableIds, qcStatus: 'APPROVED', defectCodeId: null, bundleId: entity.bundle_id
            });
            await fetchQueue();
            checkReworkBacklog(await loadStats()); // today_rework/pending_rework live in `stats`, not the today-approved count above — loadStats also refreshes the today-approved count
        } catch (err) { alert(err.response?.data?.error || `Error: ${err.message}`); }
        finally { setIsProcessing(false); }
    };

    if (isLoading && !isProcessing) return <Spinner />;
    if (error) return <div className="p-8"><ErrorDisplay message={error} /></div>;

    const filteredBatches = selectedBatchId === 'ALL' ? batches : batches.filter(b => String(b.batch_id) === String(selectedBatchId));

    const groupedBatches = filteredBatches.reduce((acc, batch) => {
        const lineName = batch.line_name || headerInfo.line_name || 'Unassigned Line';
        if (!acc[lineName]) acc[lineName] = [];
        acc[lineName].push(batch);
        return acc;
    }, {});

    return (
        <div className="flex flex-col h-screen font-inter text-slate-800">

            {/* 🚨 GLOBAL FULL-SCREEN LOCK */}
            {isProcessing && (
                <div className="fixed inset-0 w-screen h-screen bg-black/90 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center">
                    <Loader2 className="w-20 h-20 text-white animate-spin mb-8" />
                    <h2 className="text-white text-4xl font-black tracking-widest uppercase">Syncing Database...</h2>
                </div>
            )}

            {/* ── STICKY HEADER ── */}
            <header className="bg-white shadow-sm sticky top-0 z-20 border-b border-gray-100 shrink-0">

                {/* Row 1: mode/nav controls + user/logout */}
                <div className="px-4 py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowNav(n => !n)}
                            title={showNav ? 'Hide menu' : 'Show menu'}
                            className="w-8 h-8 rounded-full border-2 border-slate-300 bg-white hover:bg-slate-50 flex items-center justify-center shadow-sm transition shrink-0"
                        >
                            {showNav ? <X className="w-4 h-4 text-slate-600" /> : <Menu className="w-4 h-4 text-slate-600" />}
                        </button>
                        <span className="text-xs font-black uppercase tracking-widest bg-slate-900 text-white px-3 py-1.5 rounded-lg">
                            {headerInfo.processing_mode || '…'}
                        </span>
                        {allowMultiple && (
                            <span className="text-xs font-bold bg-amber-400 text-black px-2.5 py-1.5 rounded-lg flex items-center uppercase tracking-widest">
                                <Zap size={11} className="mr-1" /> Multi
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Batch filter — Row 1 */}
                        {batches.length > 1 && (
                            <select
                                value={selectedBatchId}
                                onChange={e => setSelectedBatchId(e.target.value)}
                                className="bg-slate-900 text-white font-black text-xs px-3 py-1.5 rounded-xl border border-slate-700 hover:border-indigo-500 focus:outline-none cursor-pointer uppercase tracking-widest"
                            >
                                <option value="ALL">ALL BATCHES</option>
                                {batches.map(b => (
                                    <option key={b.batch_id} value={String(b.batch_id)}>BATCH #{b.batch_id}</option>
                                ))}
                            </select>
                        )}
                        {headerInfo.workstation_name && (
                            <span className="text-sm font-black text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">{headerInfo.workstation_name}</span>
                        )}
                        {headerInfo.line_name && (
                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">{headerInfo.line_name}</span>
                        )}
                        <div className="hidden sm:flex flex-col items-end leading-tight">
                            <span className="text-xs font-medium text-slate-600">{user?.name}</span>
                            {user?.email && <span className="text-[10px] text-slate-400">{user.email}</span>}
                        </div>
                        <button
                            onClick={() => setShowHistory(true)}
                            className="flex items-center text-xs font-semibold text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-2.5 py-1.5 rounded-lg transition bg-white shadow-sm"
                        >
                            <History className="w-3.5 h-3.5 mr-1" /> History
                        </button>
                        <button onClick={handleLogout} className="flex items-center text-xs font-semibold text-slate-600 hover:text-red-600 transition">
                            <LogOut className="w-3.5 h-3.5 mr-1" /> Logout
                        </button>
                    </div>
                </div>

                {/* Row 2: summary bar */}
                <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setShowReplacementRequestModal(true)}
                            disabled={pendingReworkPieces.length === 0}
                            className="flex items-center gap-1.5 hover:bg-amber-50 rounded px-1.5 py-0.5 transition disabled:opacity-50 disabled:hover:bg-transparent"
                            title={pendingReworkPieces.length === 0 ? 'Nothing pending rework right now' : 'Click to flag some of these for material replacement instead'}
                        >
                            <Hammer size={13} className="text-amber-500 shrink-0" />
                            <span className="text-xs text-gray-500">Pending Rework</span>
                            <span className={`text-sm font-black tabular-nums ${stats == null ? 'text-gray-400' : stats.pending_rework > 0 ? 'text-amber-500' : 'text-emerald-600'}`}>
                                {stats == null ? '—' : (stats.pending_rework ?? 0)}
                            </span>
                        </button>
                        <span className="text-gray-200 hidden sm:inline">│</span>
                        <div className="flex items-center gap-1.5">
                            <Hammer size={13} className="text-indigo-400 shrink-0" />
                            <span className="text-xs text-gray-500">Today's Rework</span>
                            <span className="text-sm font-black tabular-nums text-indigo-600">{stats == null ? '—' : (stats.today_rework ?? 0)}</span>
                        </div>
                        <span className="text-gray-200 hidden sm:inline">│</span>
                        <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={13} className="text-teal-500 shrink-0" />
                            <span className="text-xs text-gray-500">Today's Resolved</span>
                            <span className="text-sm font-black tabular-nums text-teal-600">{stats == null ? '—' : (stats.today_resolved ?? 0)}</span>
                        </div>
                        <span className="text-gray-200 hidden sm:inline">│</span>
                        {stats != null ? (
                            // Raw "approved" is a confusing indirect number for ANY multi-part
                            // line, not just BUNDLE mode — a checker here typically only
                            // approves SOME of a garment's primary parts (piece count runs
                            // ahead of real production), and for BUNDLE mode it's literally a
                            // bundle count, not a piece count. complete_sets_today is the one
                            // figure that's always correct across PIECE/BUNDLE/SERIALIZED — see
                            // getCheckerStats' complete_sets_today comment. Full calculation is
                            // in the same modal.
                            <button
                                type="button"
                                onClick={handleOpenApprovedModal}
                                disabled={loadingWork && !showApprovedModal}
                                className="flex items-center gap-1.5 hover:bg-violet-50 rounded px-1.5 py-0.5 transition disabled:opacity-50"
                                title="Complete garment sets today — every primary part approved. Click for the full calculation."
                            >
                                <ThumbsUp size={13} className="text-violet-500 shrink-0" />
                                <span className="text-xs text-gray-500">Sets Completed</span>
                                <span className="text-sm font-black tabular-nums text-violet-600">
                                    {stats.complete_sets_today ?? 0}
                                </span>
                                {loadingWork && !showApprovedModal && <Loader2 size={11} className="animate-spin text-violet-500" />}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleOpenApprovedModal}
                                disabled={loadingWork && !showApprovedModal}
                                className="flex items-center gap-1.5 hover:bg-emerald-50 rounded px-1.5 py-0.5 transition disabled:opacity-50"
                                title="View approved-piece breakdown"
                            >
                                <ThumbsUp size={13} className="text-emerald-500 shrink-0" />
                                <span className="text-xs text-gray-500">Today's Approved</span>
                                <span className="text-sm font-black tabular-nums text-emerald-600">
                                    {todayApprovedPieces != null ? todayApprovedPieces : '—'}
                                </span>
                                {loadingWork && !showApprovedModal && <Loader2 size={11} className="animate-spin text-emerald-500" />}
                            </button>
                        )}
                        <span className="text-gray-200 hidden sm:inline">│</span>
                        <div className="flex items-center gap-1.5">
                            <LuClock size={13} className="text-sky-500 shrink-0" />
                            <span className="text-xs text-gray-500">Checked This Hour</span>
                            <span className="text-sm font-black tabular-nums text-sky-600">{stats == null ? '—' : (stats.checked_this_hour ?? 0)}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowReplacementStatusModal(true)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-violet-600 border border-gray-200 hover:border-violet-300 px-3 py-1.5 rounded-lg transition bg-white shadow-sm"
                        >
                            <PackageX size={12} /> For Replacement
                        </button>
                        {isStage1Checker && (
                            <button
                                onClick={() => setShowFulfillmentModal(true)}
                                title="Stage-1 only — accept, fulfill, or cancel material replacement requests across every line"
                                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 border border-violet-700 px-3 py-1.5 rounded-lg transition shadow-sm"
                            >
                                <PackageX size={12} /> Fulfill Replacements
                            </button>
                        )}
                        <button
                            onClick={handleOpenModal}
                            disabled={loadingWork && !showModal}
                            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition disabled:opacity-50 bg-white shadow-sm"
                        >
                            {loadingWork && !showModal ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                            Today's Work
                        </button>
                    </div>
                </div>

                {/* Row 3: collapsible nav + batch filter */}
                {showNav && (
                    <nav className="border-t border-gray-100 px-4 py-2 flex flex-wrap items-center gap-4">
                        <NavLink to="/universal-checker/dashboard"
                            onClick={() => setShowNav(false)}
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                            <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> My Queue
                        </NavLink>
                        {/* Part filter — Row 3 */}
                        {uniquePartNames.length > 0 && (
                            <div className="relative ml-auto" ref={partFilterRef}>
                                <button
                                    onClick={() => setShowPartFilter(v => !v)}
                                    className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition ${selectedParts.size > 0 ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}
                                >
                                    <Component className="w-3 h-3" />
                                    {selectedParts.size === 0 ? 'All Parts' : `${selectedParts.size} Part${selectedParts.size > 1 ? 's' : ''}`}
                                    <ChevronDown className="w-3 h-3" />
                                </button>
                                {showPartFilter && (
                                    <div className="absolute right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-slate-200 min-w-[200px] py-1.5">
                                        <div className="px-3 py-1.5 flex justify-between items-center border-b border-slate-100 mb-1">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Filter Parts</span>
                                            {selectedParts.size > 0 && <button onClick={() => setSelectedParts(new Set())} className="text-xs text-rose-500 font-bold hover:text-rose-700">Clear</button>}
                                        </div>
                                        {uniquePartNames.map(name => (
                                            <label key={name} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                                                <input type="checkbox" checked={selectedParts.has(name)} onChange={() => togglePart(name)} className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer" />
                                                <span className="text-xs font-bold text-slate-700 capitalize">{name}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </nav>
                )}
            </header>

            {/* ── SCROLLABLE CONTENT ── */}
            <div className="flex-1 overflow-y-auto bg-slate-200 p-4">
                <div className="max-w-[1400px] mx-auto space-y-8">
                    {Object.keys(groupedBatches).length === 0 && (
                        <div className="text-center py-24 bg-white rounded-[3rem] border-4 border-dashed border-slate-300 shadow-sm">
                            <p className="text-slate-400 font-black text-2xl uppercase tracking-widest">No active batches assigned.</p>
                        </div>
                    )}
                    {Object.entries(groupedBatches).map(([lineName, lineBatches]) => (
                        <div key={lineName} className="space-y-4">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-300 px-3 py-1.5 rounded-lg">{lineName}</span>
                                <span className="text-xs font-bold text-slate-400">{lineBatches.length} batch{lineBatches.length !== 1 ? 'es' : ''}</span>
                            </div>
                            <div className="space-y-8">
                            {lineBatches.map(batch => {
                                const isBundleMode = headerInfo.processing_mode === 'BUNDLE';
                                return (
                                    <div key={batch.batch_id} className="bg-white rounded-[2rem] shadow-xl border-2 border-slate-300 overflow-hidden">
                                        <div
                                            className="bg-black px-5 py-3 flex flex-row justify-between items-center gap-4 cursor-pointer select-none"
                                            onClick={() => setOpenBatchId(prev => prev === batch.batch_id ? null : batch.batch_id)}
                                        >
                                            <div className="flex items-center gap-3 flex-wrap">
                                                {openBatchId === batch.batch_id ? <ChevronDown className="w-5 h-5 text-slate-500 shrink-0" /> : <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" />}
                                                <Shirt className="w-5 h-5 text-indigo-400 shrink-0" />
                                                <h2 className="text-lg font-black text-white tracking-tight uppercase">
                                                    BATCH #{batch.batch_id}
                                                </h2>
                                                {batch.priority && <PriorityChip priority={batch.priority} size="xs" />}
                                                {(batch.cut_rolls != null || batch.total_rolls != null) && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-white bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">
                                                            {batch.cut_rolls ?? '—'} / {batch.total_rolls ?? '—'} CUT
                                                        </span>
                                                        {batch.cut_rolls != null && batch.total_rolls != null && (
                                                            <span className={`text-xs font-black px-2 py-1 rounded-lg uppercase tracking-widest ${batch.cut_rolls >= batch.total_rolls ? 'bg-emerald-500 text-black' : 'bg-amber-400 text-black'}`}>
                                                                {batch.cut_rolls >= batch.total_rolls ? 'All Cut' : `${batch.total_rolls - batch.cut_rolls} Left`}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div onClick={e => e.stopPropagation()} className="flex items-center gap-2">
                                                {batch.piece_sequencing_mode === 'MODE_2' && (
                                                    <button
                                                        onClick={() => toggleViewMode(batch)}
                                                        title={getViewMode(batch) === 'size'
                                                            ? 'Mode 2: piece numbering runs continuously across rolls per size — switch to grouping by roll instead'
                                                            : 'Switch back to grouping by size (recommended for Mode 2)'}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg border-2 border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                                                    >
                                                        {getViewMode(batch) === 'size' ? <Ruler className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
                                                        By {getViewMode(batch) === 'size' ? 'Size' : 'Roll'}
                                                    </button>
                                                )}
                                                <StageCompletionHandoff batchId={batch.batch_id} lineId={headerInfo.line_id} onBatchComplete={() => fetchQueue()} />
                                            </div>
                                        </div>

                                        {openBatchId === batch.batch_id && (() => {
                                            const viewMode = getViewMode(batch);
                                            return (
                                            <div className="p-6 md:p-10 bg-slate-100">
                                                {isBundleMode && viewMode === 'size' && batch.bundles && batch.bundles.length > 0 ? (
                                                    groupBundlesBySize(batch.bundles).map(sizeGroup => {
                                                        const allSizePieces = Object.values(sizeGroup.parts).flatMap(bundles =>
                                                            bundles.flatMap(b => b.pieces.map(p => ({ ...p, bundle_id: b.bundle_id, part_id: b.part_id, size: b.size, _displayGroup: `${b.part_name || 'Mixed'} | Roll #${b.roll_id}` })))
                                                        );
                                                        const sizeStatus = checkEntityStatus({ pieces: allSizePieces });
                                                        return (
                                                            <div key={sizeGroup.size} className="mb-3 last:mb-0 border-l-[6px] border-violet-500 bg-white rounded-r-xl p-3 md:p-4 shadow-sm border-y border-r border-slate-200">
                                                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 pb-2 border-b-2 border-slate-200 gap-3">
                                                                    <h3 className="font-black text-black flex items-center text-base uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg w-max border border-slate-300">
                                                                        <Ruler className="w-4 h-4 mr-2 text-violet-600" /> SIZE {sizeGroup.size}
                                                                    </h3>
                                                                    <RejectedEarlierBadge status={sizeStatus} />
                                                                    {allowRoll && !sizeStatus.isComplete && (
                                                                        <button onClick={() => setModalState({ type: 'validate', isBundle: true, isRollInspect: false, batchId: batch.batch_id, batchCode: batch.batch_code, size: sizeGroup.size, partName: 'ALL PARTS', pieces: allSizePieces, titleOverride: `Bulk Inspect: Size ${sizeGroup.size}`, allowMultiple })} className="px-4 py-2 bg-black hover:bg-slate-800 text-white text-sm font-black rounded-lg shadow-xl active:scale-95 transition-all flex items-center uppercase tracking-widest">
                                                                            <CheckCircle2 className="w-4 h-4 mr-2 text-amber-400" /> INSPECT WHOLE SIZE
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                {Object.entries(sizeGroup.parts).filter(([partName]) => isPartVisible(partName)).map(([partName, bundles]) => {
                                                                    const partKey = `size-${sizeGroup.size}::${partName}`;
                                                                    const isPartOpen = openBundleParts.has(partKey);
                                                                    const allPartPieces = bundles.flatMap(b => b.pieces);
                                                                    const ps = checkEntityStatus({ pieces: allPartPieces });
                                                                    return (
                                                                        <div key={partName} className="mb-2 last:mb-0 border border-slate-200 rounded-xl overflow-hidden">
                                                                            <button type="button" onClick={() => toggleBundlePart(partKey)}
                                                                                className="w-full bg-slate-50 hover:bg-slate-100 px-3 py-2 flex items-center justify-between transition text-left">
                                                                                <div className="flex items-center gap-2">
                                                                                    <ChevronRight size={14} className={`text-slate-400 transition-transform shrink-0 ${isPartOpen ? 'rotate-90' : ''}`} />
                                                                                    <Component className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                                                                    <span className="font-black text-slate-800 text-xs uppercase tracking-tight">{partName}</span>
                                                                                    <span className="text-[10px] text-slate-400 font-semibold">{bundles.length} bundle{bundles.length !== 1 ? 's' : ''}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-2 text-xs font-semibold">
                                                                                    {ps.total_validated > 0 && <span className="text-emerald-600">{ps.total_validated} approved</span>}
                                                                                    {ps.total_repaired > 0 && <span className="text-teal-600">{ps.total_repaired} repaired</span>}
                                                                                    {ps.pending_alter  > 0 && <span className="text-amber-600">{ps.pending_alter} rework</span>}
                                                                                    {ps.total_rejected > 0 && <span className="text-red-600">{ps.total_rejected} rejected{ps.rejected_earlier > 0 ? ` (${ps.rejected_earlier} earlier)` : ''}</span>}
                                                                                    <span className="text-slate-400 font-normal">{ps.total_processed}/{ps.total_cut}</span>
                                                                                    {ps.isComplete && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                                                                                </div>
                                                                            </button>
                                                                            {isPartOpen && (
                                                                                <div className="p-2 space-y-1 bg-white border-t border-slate-100">
                                                                                    {bundles.map(bundle => (
                                                                                        <ValidationProgressRow key={bundle.bundle_id} label={`Roll #${bundle.roll_id}`} subLabel={`Bundle ${bundle.bundle_code}`} icon={Layers} entity={bundle}
                                                                                            canApproveBundle={allowBundle}
                                                                                            isApproveBlocked={isApproveBlocked}
                                                                                            onQuickApprove={(entity) => handleQuickBulkApprove(entity, batch.batch_id, bundle.roll_id)}
                                                                                            onInspect={() => setModalState({ type: 'validate', isBundle: true, batchId: batch.batch_id, batchCode: batch.batch_code, allowMultiple, ...bundle, pieces: bundle.pieces.map(p => ({ ...p, _displayGroup: `${partName} | Roll #${bundle.roll_id}` })) })}
                                                                                            onRepair={() => setModalState({ type: 'validate', forceRepairMode: true, isBundle: true, batchId: batch.batch_id, batchCode: batch.batch_code, ...bundle })}
                                                                                        />
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    })
                                                ) : null}

                                                {isBundleMode && viewMode === 'roll' && batch.bundles && batch.bundles.length > 0 ? (() => {
                                                    const groupedBundles = batch.bundles.reduce((acc, bundle) => {
                                                        const rId = bundle.roll_id || 'Unknown';
                                                        const pName = bundle.part_name || 'Mixed';
                                                        if (!acc[rId]) acc[rId] = {};
                                                        if (!acc[rId][pName]) acc[rId][pName] = [];
                                                        acc[rId][pName].push(bundle);
                                                        return acc;
                                                    }, {});
                                                    return Object.entries(groupedBundles).map(([rollId, parts]) => {
                                                        const allRollPieces = Object.entries(parts).flatMap(([partName, bundles]) =>
                                                            bundles.flatMap(b => b.pieces.map(p => ({ ...p, bundle_id: b.bundle_id, part_id: b.part_id, size: b.size, _displayGroup: `${partName} | Size ${b.size}` })))
                                                        );
                                                        const rollStatus = checkEntityStatus({ pieces: allRollPieces });
                                                        return (
                                                            <div key={rollId} className="mb-3 last:mb-0 border-l-[6px] border-indigo-500 bg-white rounded-r-xl p-3 md:p-4 shadow-sm border-y border-r border-slate-200">
                                                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 pb-2 border-b-2 border-slate-200 gap-3">
                                                                    <h3 className="font-black text-black flex items-center text-base uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg w-max border border-slate-300">
                                                                        <Layers className="w-4 h-4 mr-2 text-indigo-600" /> ROLL #{rollId}
                                                                    </h3>
                                                                    <RejectedEarlierBadge status={rollStatus} />
                                                                    <div className="flex items-center gap-2">
                                                                        {allowRoll && !rollStatus.isComplete && (
                                                                            <button onClick={() => setModalState({ type: 'validate', isBundle: true, isRollInspect: true, batchId: batch.batch_id, batchCode: batch.batch_code, rollId, partName: 'ALL PARTS', pieces: allRollPieces, titleOverride: `Bulk Inspect: Roll #${rollId}`, allowMultiple })} className="px-4 py-2 bg-black hover:bg-slate-800 text-white text-sm font-black rounded-lg shadow-xl active:scale-95 transition-all flex items-center uppercase tracking-widest">
                                                                                <CheckCircle2 className="w-4 h-4 mr-2 text-amber-400" /> INSPECT WHOLE ROLL
                                                                            </button>
                                                                        )}
                                                                        <RollHandoffButton batchId={batch.batch_id} lineId={headerInfo.line_id} rollId={rollId} onComplete={() => fetchQueue()} />
                                                                    </div>
                                                                </div>
                                                                {Object.entries(parts).filter(([partName]) => isPartVisible(partName)).map(([partName, bundles]) => {
                                                                    const partKey   = `${rollId}::${partName}`;
                                                                    const isPartOpen = openBundleParts.has(partKey);
                                                                    const allPartPieces = bundles.flatMap(b => b.pieces);
                                                                    const ps = checkEntityStatus({ pieces: allPartPieces });
                                                                    return (
                                                                        <div key={partName} className="mb-2 last:mb-0 border border-slate-200 rounded-xl overflow-hidden">
                                                                            <button type="button" onClick={() => toggleBundlePart(partKey)}
                                                                                className="w-full bg-slate-50 hover:bg-slate-100 px-3 py-2 flex items-center justify-between transition text-left">
                                                                                <div className="flex items-center gap-2">
                                                                                    <ChevronRight size={14} className={`text-slate-400 transition-transform shrink-0 ${isPartOpen ? 'rotate-90' : ''}`} />
                                                                                    <Component className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                                                                    <span className="font-black text-slate-800 text-xs uppercase tracking-tight">{partName}</span>
                                                                                    <span className="text-[10px] text-slate-400 font-semibold">{bundles.length} bundle{bundles.length !== 1 ? 's' : ''}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-2 text-xs font-semibold">
                                                                                    {ps.total_validated > 0 && <span className="text-emerald-600">{ps.total_validated} approved</span>}
                                                                                    {ps.total_repaired > 0 && <span className="text-teal-600">{ps.total_repaired} repaired</span>}
                                                                                    {ps.pending_alter  > 0 && <span className="text-amber-600">{ps.pending_alter} rework</span>}
                                                                                    {ps.total_rejected > 0 && <span className="text-red-600">{ps.total_rejected} rejected{ps.rejected_earlier > 0 ? ` (${ps.rejected_earlier} earlier)` : ''}</span>}
                                                                                    <span className="text-slate-400 font-normal">{ps.total_processed}/{ps.total_cut}</span>
                                                                                    {ps.isComplete && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                                                                                </div>
                                                                            </button>
                                                                            {isPartOpen && (
                                                                                <div className="p-2 space-y-1 bg-white border-t border-slate-100">
                                                                                    {bundles.map(bundle => (
                                                                                        <ValidationProgressRow key={bundle.bundle_id} label={`Size ${bundle.size}`} subLabel={`Bundle ${bundle.bundle_code}`} icon={Package} entity={bundle}
                                                                                            canApproveBundle={allowBundle}
                                                                                            isApproveBlocked={isApproveBlocked}
                                                                                            onQuickApprove={(entity) => handleQuickBulkApprove(entity, batch.batch_id, rollId)}
                                                                                            onInspect={() => setModalState({ type: 'validate', isBundle: true, batchId: batch.batch_id, batchCode: batch.batch_code, allowMultiple, ...bundle, pieces: bundle.pieces.map(p => ({ ...p, _displayGroup: `${partName} | Size ${bundle.size}` })) })}
                                                                                            onRepair={() => setModalState({ type: 'validate', forceRepairMode: true, isBundle: true, batchId: batch.batch_id, batchCode: batch.batch_code, ...bundle })}
                                                                                        />
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    });
                                                })() : null}

                                                {!isBundleMode && viewMode === 'size' && batch.rolls && batch.rolls.length > 0 ? (
                                                    groupPiecesBySize(batch.rolls).map(sizeGroup => {
                                                        const allSizePieces = sizeGroup.parts_details.flatMap(pt => pt.roll_details.flatMap(r => r.pieces.map(p => ({ ...p, part_id: pt.part_id, _displayGroup: `${pt.part_name} | Roll #${r.roll_id}` }))));
                                                        const sizeStatus = checkEntityStatus({ pieces: allSizePieces });
                                                        return (
                                                            <div key={sizeGroup.size} className="mb-3 last:mb-0 border-l-[6px] border-violet-500 bg-white rounded-r-xl p-3 md:p-4 shadow-sm border-y border-r border-slate-200">
                                                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 pb-2 border-b-2 border-slate-200 gap-3">
                                                                    <h3 className="font-black text-black flex items-center text-base uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg w-max border border-slate-300">
                                                                        <Ruler className="w-4 h-4 mr-2 text-violet-600" /> SIZE {sizeGroup.size}
                                                                    </h3>
                                                                    <RejectedEarlierBadge status={sizeStatus} />
                                                                    {allowRoll && !sizeStatus.isComplete && (
                                                                        <button onClick={() => {
                                                                            setModalState({ type: 'validate', isBundle: false, isRollInspect: false, batchId: batch.batch_id, batchCode: batch.batch_code, size: sizeGroup.size, partName: 'ALL PARTS', pieces: allSizePieces, titleOverride: `Bulk Inspect: Size ${sizeGroup.size}`, allowMultiple });
                                                                        }} className="px-4 py-2 bg-black hover:bg-slate-800 text-white text-sm font-black rounded-lg shadow-xl active:scale-95 transition-all flex items-center uppercase tracking-widest">
                                                                            <CheckCircle2 className="w-4 h-4 mr-2 text-amber-400" /> INSPECT WHOLE SIZE
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                {sizeGroup.parts_details.filter(p => isPartVisible(p.part_name)).map(part => (
                                                                    <PartAccordionBySize key={part.part_id} batch={batch} size={sizeGroup.size} part={part} setModalState={setModalState} allowMultiple={allowMultiple} onRequestReplacement={openReplacementRequest} />
                                                                ))}
                                                            </div>
                                                        );
                                                    })
                                                ) : null}

                                                {!isBundleMode && viewMode === 'roll' && batch.rolls && batch.rolls.length > 0 ? (
                                                    batch.rolls.map(roll => (
                                                        <div key={roll.roll_id} className="mb-3 last:mb-0 border-l-[6px] border-indigo-500 bg-white rounded-r-xl p-3 md:p-4 shadow-sm border-y border-r border-slate-200">
                                                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 pb-2 border-b-2 border-slate-200 gap-3">
                                                                <h3 className="font-black text-black flex items-center text-base uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg w-max border border-slate-300">
                                                                    <Layers className="w-4 h-4 mr-2 text-indigo-600" /> ROLL #{roll.roll_id}
                                                                </h3>
                                                                <RejectedEarlierBadge status={checkEntityStatus({ pieces: roll.parts_details.flatMap(pt => pt.size_details.flatMap(sz => sz.pieces)) })} />
                                                                <div className="flex items-center gap-2">
                                                                    {allowRoll && (
                                                                        <button onClick={() => {
                                                                            const allRollPieces = roll.parts_details.flatMap(pt => pt.size_details.flatMap(sz => sz.pieces.map(p => ({ ...p, part_id: pt.part_id, size: sz.size, _displayGroup: `${pt.part_name} | Size ${sz.size}` }))));
                                                                            setModalState({ type: 'validate', isBundle: false, isRollInspect: true, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: roll.roll_id, partName: 'ALL PARTS', pieces: allRollPieces, titleOverride: `Bulk Inspect: Roll #${roll.roll_id}`, allowMultiple });
                                                                        }} className="px-4 py-2 bg-black hover:bg-slate-800 text-white text-sm font-black rounded-lg shadow-xl active:scale-95 transition-all flex items-center uppercase tracking-widest">
                                                                            <CheckCircle2 className="w-4 h-4 mr-2 text-amber-400" /> INSPECT WHOLE ROLL
                                                                        </button>
                                                                    )}
                                                                    <RollHandoffButton batchId={batch.batch_id} lineId={headerInfo.line_id} rollId={roll.roll_id} onComplete={() => fetchQueue()} />
                                                                </div>
                                                            </div>
                                                            {roll.parts_details.filter(p => isPartVisible(p.part_name)).map(part => (
                                                                <PartAccordion key={part.part_id} batch={batch} roll={roll} part={part} setModalState={setModalState} allowMultiple={allowMultiple} onRequestReplacement={openReplacementRequest} />
                                                            ))}
                                                        </div>
                                                    ))
                                                ) : null}
                                            </div>
                                            );
                                        })()}
                                    </div>
                                );
                            })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── MODALS ── */}
            {showModal && (
                <WorkLogModal
                    workData={workData}
                    loading={loadingWork}
                    onClose={() => setShowModal(false)}
                    onDateChange={handleModalDateChange}
                    onExport={downloadCSV}
                />
            )}
            {showApprovedModal && (
                <ApprovedSummaryModal
                    workData={workData}
                    loading={loadingWork}
                    onClose={() => setShowApprovedModal(false)}
                    onDateChange={handleModalDateChange}
                />
            )}
            {modalState && modalState.type === 'validate' && <UniversalValidationModal itemInfo={modalState} defectCodes={defectCodes} onClose={() => { setModalState(null); setHighlightPieceId(null); }} onValidationSubmit={handleValidationSubmit} onRepairSubmit={handleApproveAlterSubmit} onRevertToPending={handleRevertToPending} isApproveBlocked={isApproveBlocked} highlightPieceId={highlightPieceId} />}
            {showReplacementRequestModal && (
                <MaterialReplacementRequestModal
                    pieces={replacementModalPieces}
                    onClose={() => { setShowReplacementRequestModal(false); setReplacementScopePieceIds(null); }}
                    onSubmit={handleSubmitReplacementRequest}
                    fetchRequests={materialReplacementApi.getMyLineRequests}
                    scopePieceIds={replacementScopePieceIds}
                    onOpenPiece={openValidationForPiece}
                />
            )}
            {showReplacementStatusModal && (
                <MaterialReplacementStatusModal
                    fetchRequests={materialReplacementApi.getMyLineRequests}
                    onClose={() => setShowReplacementStatusModal(false)}
                />
            )}
            {showFulfillmentModal && (
                <div className="fixed inset-0 bg-gray-100 z-[150] flex flex-col">
                    <div className="bg-slate-900 text-white px-5 py-3 flex justify-between items-center shrink-0">
                        <span className="font-black uppercase tracking-widest text-sm flex items-center gap-2">
                            <PackageX className="w-4 h-4" /> Material Replacements — Fulfillment
                        </span>
                        <button onClick={() => setShowFulfillmentModal(false)} className="p-1.5 hover:bg-slate-800 rounded-full transition">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex-grow overflow-y-auto">
                        <MaterialReplacementsPage />
                    </div>
                </div>
            )}
            {showHistory && <BatchHistoryPanel onClose={() => setShowHistory(false)} />}

            {/* Full-screen rework-backlog interrupt — z-[400], above every other
                modal in this file (all z-[150]), so it still surfaces even when
                the submit that triggered it happened from inside one. */}
            {showReworkWarning && (
                <div className="fixed inset-0 bg-red-700 z-[400] flex flex-col items-center justify-center p-8 text-center">
                    <ShieldAlert className="w-24 h-24 text-white mb-6 animate-pulse" strokeWidth={1.5} />
                    <h2 className="text-4xl font-black text-white uppercase tracking-widest mb-3">
                        {isApproveBlocked ? 'Approve Disabled — Backlog Too High' : 'Rework Backlog Too High'}
                    </h2>
                    <p className="text-red-100 text-lg font-bold max-w-md mb-8">
                        {isApproveBlocked
                            ? `${stats?.pending_rework ?? 0} pieces are sitting in Pending Rework on your line — over the limit of ${reworkBlockThreshold}. New pieces can no longer be approved; only Repair or Reject on existing rework until the backlog drops.`
                            : `${stats?.pending_rework ?? 0} pieces are sitting in Pending Rework on your line — clear the backlog down before continuing.`}
                    </p>
                    <button
                        onClick={() => setShowReworkWarning(false)}
                        className="bg-white text-red-700 font-black uppercase tracking-widest text-lg px-10 py-4 rounded-2xl shadow-2xl hover:bg-red-50 active:scale-95 transition"
                    >
                        Continue
                    </button>
                </div>
            )}
        </div>
    );
};

export default UniversalWorkstationDashboard;