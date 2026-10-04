import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    QrCode, ShieldCheck, ShieldAlert, Check, X,
    Hammer, AlertCircle, ArrowLeft, Package, CheckCircle2,
    RefreshCw, Maximize, HardDrive, List, Barcode, Clock, Layers,
    ThumbsUp, FileText, Download, ChevronRight, Loader2,
} from 'lucide-react';
import { assemblyApi } from '../../api/assemblyApi';
import { universalApi } from '../../api/universalApi';
import { useSupervisorPinPrompt, withSupervisorPin } from '../../shared/SupervisorPinPrompt';
import PriorityChip from '../../shared/PriorityChip';

// ── Work Log helpers ──────────────────────────────────────────────────────────
const STATS_REFRESH_MS = 60_000;

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
// Horizontal chain of every stage this product's cycle flow defines, from the
// scan response's `stage_progress`. Each stage's `state` is one of:
//   'passed'   — green check. The garment has moved on from here.
//   'current'  — amber, pulsing. Its ACTUAL position right now — a row
//                existing here does NOT mean it's cleared (e.g. still
//                PENDING), only that it has arrived and is awaiting its
//                checkpoint. Hover shows the raw status (PENDING, etc).
//   'upcoming' — grey, not reached yet.
// `is_user_stage` (the scanning operator's own line) is a separate axis from
// `state` — it gets an indigo ring + "(You)" regardless of state, since the
// operator's line and the garment's actual current position can differ
// (that mismatch is exactly why this popup exists).
const STAGE_STATE_STYLE = {
    passed:   { circle: 'bg-emerald-500 border-emerald-500 text-white', label: 'text-emerald-600', line: 'bg-emerald-400' },
    current:  { circle: 'bg-amber-500 border-amber-500 text-white animate-pulse', label: 'text-amber-600', line: 'bg-slate-200' },
    upcoming: { circle: 'bg-white border-slate-200 text-slate-300', label: 'text-slate-300', line: 'bg-slate-200' },
};
const StageProgressStepper = ({ stages }) => {
    if (!stages || stages.length === 0) return null;
    return (
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {stages.map((s, i) => {
                const style = STAGE_STATE_STYLE[s.state] || STAGE_STATE_STYLE.upcoming;
                return (
                <React.Fragment key={s.stage_name}>
                    <div className="flex flex-col items-center shrink-0" title={s.status ? `${s.stage_label} — ${s.status}` : s.stage_label}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 font-black text-[11px] transition-colors ${style.circle} ${s.is_user_stage ? 'ring-4 ring-red-800' : ''}`}>
                            {s.state === 'passed' ? <Check size={14} strokeWidth={4} /> : i + 1}
                        </div>
                        <span className={`mt-1 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${s.is_user_stage ? 'text-red-800' : style.label}`}>
                            {s.stage_label}{s.is_user_stage ? ' (You)' : ''}
                        </span>
                    </div>
                    {i < stages.length - 1 && (
                        <div className={`h-0.5 flex-1 min-w-[16px] ${style.line}`} />
                    )}
                </React.Fragment>
                );
            })}
        </div>
    );
};

const fmtTime = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso; }
};
function mergeWorkData(data) {
    if (!data) return [];
    const scans = (data.rows || []).filter(r => r.action !== 'NEEDS_REWORK').map(r => ({ ...r, _type: 'scan' }));
    const defects = (data.defect_logs || []).map(d => ({
        time: d.time, batch_id: d.batch_id, batch_id: d.batch_id,
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
        const batches = {};
        merged.forEach(row => {
            const bKey  = row.batch_id ?? 'Unknown';
            const rKey  = `Roll #${row.fabric_roll_id ?? 'Unknown'}`;
            const ptKey = `${row.part_name ?? 'Unknown'} | Sz ${row.size ?? '—'}`;
            if (!batches[bKey]) batches[bKey] = {};
            if (!batches[bKey][rKey]) batches[bKey][rKey] = {};
            if (!batches[bKey][rKey][ptKey]) batches[bKey][rKey][ptKey] = [];
            batches[bKey][rKey][ptKey].push(row);
        });
        return Object.entries(batches)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([bKey, rolls]) => [bKey, Object.entries(rolls).sort(([a], [b]) => a.localeCompare(b))
                .map(([rKey, pts]) => [rKey, Object.entries(pts).sort(([a], [b]) => a.localeCompare(b))])
            ]);
    }, [merged, mode]);

    useEffect(() => { setOpenGroups(new Set()); }, [mode, workData]);
    const toggleGroup = (key) => setOpenGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const handleDateChange = (e) => { const d = e.target.value; setModalDate(d); onDateChange(d); };

    return (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div>
                            <h2 className="text-base font-black text-gray-900">Work Log</h2>
                            <p className="text-xs text-gray-400">{merged.length} entries · {grouped.length} groups</p>
                        </div>
                        <input type="date" value={modalDate} onChange={handleDateChange}
                            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 bg-gray-50" />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 rounded-lg p-0.5">
                            <button onClick={() => setMode('hourly')} className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition ${mode==='hourly'?'bg-white shadow-sm text-indigo-600':'text-gray-500 hover:text-gray-700'}`}><Clock size={11}/> Hourly</button>
                            <button onClick={() => setMode('roll')} className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition ${mode==='roll'?'bg-white shadow-sm text-indigo-600':'text-gray-500 hover:text-gray-700'}`}><Layers size={11}/> Fabric Roll</button>
                        </div>
                        <button onClick={() => onExport(grouped, mode, modalDate)} disabled={!grouped.length}
                            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition shadow-sm disabled:opacity-40">
                            <Download size={12}/> Export CSV
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition"><X size={16} className="text-gray-500"/></button>
                    </div>
                </div>
                {/* Top rework reasons */}
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
                {/* Body */}
                <div className="overflow-auto flex-1 p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                            <Loader2 size={18} className="animate-spin"/><span className="text-sm">Loading…</span>
                        </div>
                    ) : merged.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <CheckCircle2 size={36} className="mb-2 opacity-30"/>
                            <p className="text-sm font-medium">No work logged for this date.</p>
                        </div>
                    ) : mode === 'roll' ? (
                        /* ── Roll mode: batch → roll nested accordions ── */
                        <div className="space-y-2">
                            {groupedRoll.map(([batchCode, rolls]) => {
                                const batchRows = rolls.flatMap(([, pts]) => pts.flatMap(([, rows]) => rows));
                                const bApproved = batchRows.filter(r => r.action==='APPROVED').length;
                                const bRework   = batchRows.filter(r => r.action==='NEEDS_REWORK').length;
                                const bRepaired = batchRows.filter(r => r.action==='REPAIRED').length;
                                const bRejected = batchRows.filter(r => r.action==='QC_REJECTED').length;
                                const bKey      = `batch::${batchCode}`;
                                const isBatchOpen = openGroups.has(bKey);
                                return (
                                    <div key={batchCode} className="border border-indigo-200 rounded-xl overflow-hidden">
                                        <button type="button" onClick={() => toggleGroup(bKey)}
                                            className="w-full bg-indigo-50 hover:bg-indigo-100 px-4 py-2 flex items-center justify-between transition text-left">
                                            <div className="flex items-center gap-2">
                                                <ChevronRight size={14} className={`text-indigo-400 transition-transform shrink-0 ${isBatchOpen?'rotate-90':''}`}/>
                                                <span className="font-black text-indigo-700 text-sm font-mono">{batchCode}</span>
                                                <span className="text-[10px] font-bold text-indigo-400">{rolls.length} roll{rolls.length!==1?'s':''}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs font-semibold">
                                                {bApproved>0 && <span className="text-emerald-600">{bApproved} approved</span>}
                                                {bRepaired>0 && <span className="text-teal-600">{bRepaired} repaired</span>}
                                                {bRework>0   && <span className="text-amber-600">{bRework} rework</span>}
                                                {bRejected>0 && <span className="text-red-600">{bRejected} rejected</span>}
                                                <span className="text-gray-400 font-normal">{batchRows.length} total</span>
                                            </div>
                                        </button>
                                        {isBatchOpen && (
                                            <div className="p-2 space-y-1.5 bg-white border-t border-indigo-100">
                                                {rolls.map(([rollKey, partGroups]) => {
                                                    const rollRows  = partGroups.flatMap(([, rows]) => rows);
                                                    const rApproved = rollRows.filter(r => r.action==='APPROVED').length;
                                                    const rRework   = rollRows.filter(r => r.action==='NEEDS_REWORK').length;
                                                    const rRepaired = rollRows.filter(r => r.action==='REPAIRED').length;
                                                    const rRejected = rollRows.filter(r => r.action==='QC_REJECTED').length;
                                                    const rKey      = `roll::${batchCode}::${rollKey}`;
                                                    const isRollOpen = openGroups.has(rKey);
                                                    return (
                                                        <div key={rollKey} className="border border-gray-200 rounded-lg overflow-hidden">
                                                            <button type="button" onClick={() => toggleGroup(rKey)}
                                                                className="w-full bg-gray-50 hover:bg-gray-100 px-3 py-1.5 flex items-center justify-between transition text-left">
                                                                <div className="flex items-center gap-2">
                                                                    <ChevronRight size={12} className={`text-gray-400 transition-transform shrink-0 ${isRollOpen?'rotate-90':''}`}/>
                                                                    <span className="font-black text-gray-700 text-xs">{rollKey}</span>
                                                                    <span className="text-[10px] font-bold text-gray-400">{partGroups.length} type{partGroups.length!==1?'s':''}</span>
                                                                </div>
                                                                <div className="flex items-center gap-3 text-[11px] font-semibold">
                                                                    {rApproved>0 && <span className="text-emerald-600">{rApproved} approved</span>}
                                                                    {rRepaired>0 && <span className="text-teal-600">{rRepaired} repaired</span>}
                                                                    {rRework>0   && <span className="text-amber-600">{rRework} rework</span>}
                                                                    {rRejected>0 && <span className="text-red-600">{rRejected} rejected</span>}
                                                                    <span className="text-gray-400 font-normal">{rollRows.length}</span>
                                                                </div>
                                                            </button>
                                                            {isRollOpen && (
                                                                <div className="p-2 space-y-1 bg-white border-t border-gray-100">
                                                                    {partGroups.map(([ptKey, ptRows]) => {
                                                                        const ptApproved = ptRows.filter(r => r.action==='APPROVED').length;
                                                                        const ptRework   = ptRows.filter(r => r.action==='NEEDS_REWORK').length;
                                                                        const ptRepaired = ptRows.filter(r => r.action==='REPAIRED').length;
                                                                        const ptRejected = ptRows.filter(r => r.action==='QC_REJECTED').length;
                                                                        const ptKey2     = `pt::${rKey}::${ptKey}`;
                                                                        const isPtOpen   = openGroups.has(ptKey2);
                                                                        return (
                                                                            <div key={ptKey} className="border border-gray-100 rounded-md overflow-hidden">
                                                                                <button type="button" onClick={() => toggleGroup(ptKey2)}
                                                                                    className="w-full bg-gray-50 hover:bg-gray-100 px-3 py-1 flex items-center justify-between transition text-left">
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        <ChevronRight size={10} className={`text-gray-400 transition-transform shrink-0 ${isPtOpen?'rotate-90':''}`}/>
                                                                                        <span className="font-black text-gray-700 text-[11px] capitalize">{ptKey}</span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2 text-[10px] font-semibold">
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
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        /* ── Hourly mode: flat accordions ── */
                        <div className="space-y-2">
                            {grouped.map(([groupKey, groupRows]) => {
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
                                                <ChevronRight size={14} className={`text-gray-400 transition-transform shrink-0 ${isOpen?'rotate-90':''}`}/>
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
                                                            <td className="px-3 py-1.5 font-semibold text-gray-800 whitespace-nowrap font-mono">{r.batch_id}</td>
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
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Standard Enterprise Status Enums
const STATUS = {
    APPROVED: 'APPROVED',
    REWORK: 'NEEDS_REWORK',
    REJECT: 'QC_REJECTED',
    REPAIRED: 'REPAIRED',
};

const AssemblyProcessingPortal = () => {
    // --- STATE MANAGEMENT ---
    const [viewMode, setViewMode] = useState('SCANNER'); // NEW: 'SCANNER' or 'BATCH'
    
    // Core Scan State
    const [garment, setGarment] = useState(null);
    const [mismatch, setMismatch] = useState(null);
    const [dnaDefect, setDnaDefect] = useState(null);
    const [approvingPieceId, setApprovingPieceId] = useState(null);
    const [componentInfo, setComponentInfo] = useState(null); // { comp, loading, items }
    const [batchInactive, setBatchInactive] = useState(null);
    const [notAtStage, setNotAtStage] = useState(null); // { error, message, batch_id, batch_code, stage_progress }
    const [defectCodes, setDefectCodes] = useState([]);
    const [showDefectModal, setShowDefectModal] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessingAction, setIsProcessingAction] = useState(false);
    const [error, setError] = useState(null);
    const [lastAction, setLastAction] = useState(null);
    const [defectSearch, setDefectSearch] = useState('');
    const [selectedDefectCategory, setSelectedDefectCategory] = useState(null);
    const [selectedDefectIds, setSelectedDefectIds] = useState(new Set());
    const [reworkHistory, setReworkHistory] = useState(null);
    
    // Batch Mode State
    const [activeBatches, setActiveBatches] = useState([]);
    const [selectedBatch, setSelectedBatch] = useState(null);
    // Batch view shows ONE roll at a time (roll tabs) so the page never grows
    // taller than the screen — see the fixed-height layout below.
    const [activeRollId, setActiveRollId] = useState(null);
    const [batchPieces, setBatchPieces] = useState([]);
    const [workstationInfo, setWorkstationInfo] = useState(null);
    const [recentScans, setRecentScans] = useState([]);

    // Batch Mode — selected piece for in-batch action
    const [selectedPiece, setSelectedPiece] = useState(null);
    const [isPieceLoading, setIsPieceLoading] = useState(false);

    // Hardware Scanner Buffer Refs
    const scanBuffer = useRef('');
    const lastKeyStrokeAt = useRef(0);
    const [scannedTextVisual, setScannedTextVisual] = useState('');

    const [manualInput, setManualInput] = useState('');
    const [showManualBox, setShowManualBox] = useState(false);
    const manualInputRef = useRef(null);

    // Stats + Work Log
    const [stats,       setStats]       = useState(null);
    const [showModal,   setShowModal]   = useState(false);
    const [workData,    setWorkData]    = useState(null);
    const [loadingWork, setLoadingWork] = useState(false);
    const [apiError,    setApiError]    = useState(null);

    const apiErrTimer = useRef(null);
    const popApiError = (msg) => {
        setApiError(msg);
        clearTimeout(apiErrTimer.current);
        apiErrTimer.current = setTimeout(() => setApiError(null), 6000);
    };

    // --- AUDIO FEEDBACK ENGINE ---
    const SPEECH_MESSAGES = {
        already_approved: 'Already approved',
        batch_inactive: 'Batch not loaded on your line. Please ask the loader to load the batch.',
    };
    const playFeedback = (type) => {
        if (SPEECH_MESSAGES[type]) {
            try {
                if (window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                    const utter = new SpeechSynthesisUtterance(SPEECH_MESSAGES[type]);
                    utter.rate = 1;
                    utter.pitch = 1;
                    utter.volume = 1;
                    window.speechSynthesis.speak(utter);
                    return;
                }
            } catch (e) { /* fall through to tone below */ }
        }
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            if (type === 'success') {
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
                osc.start(); osc.stop(audioCtx.currentTime + 0.2);
            } else if (type === 'already_approved' || type === 'batch_inactive') {
                osc.frequency.setValueAtTime(660, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                osc.start(); osc.stop(audioCtx.currentTime + 0.3);
            } else {
                osc.frequency.setValueAtTime(220, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                osc.start(); osc.stop(audioCtx.currentTime + 0.5);
            }
        } catch (e) { console.warn("Audio feedback not supported."); }
    };

    const toggleManualBox = () => {
    setShowManualBox(!showManualBox);
    if (!showManualBox) {
        setTimeout(() => manualInputRef.current?.focus(), 100);
    }
        };

    // --- DATA INITIALIZATION ---
    const loadRequiredData = useCallback(async () => {
        try {
            const [defectsRes, monitorRes] = await Promise.all([
                assemblyApi.getDefectCodes(),
                assemblyApi.getMonitorData()
            ]);

            const defects   = defectsRes.data ?? [];
            const batches   = monitorRes.data.active_batches ?? [];
            const ws        = monitorRes.data.workstation ?? null;
            const scans     = monitorRes.data.recent_scans ?? [];

            setDefectCodes(defects);
            setActiveBatches(batches);
            setWorkstationInfo(ws);
            setRecentScans(scans);
        } catch {
            /* monitor/defect load failures are non-fatal to the portal */
        }
    }, []);

    useEffect(() => { loadRequiredData(); }, [loadRequiredData]);

    const loadStats = useCallback(async () => {
        try {
            const res = await assemblyApi.getCheckerStats();
            setStats(res.data);
        } catch (err) {
            popApiError(err.response?.data?.error || err.message || 'Failed to load stats');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        loadStats();
        const iv = setInterval(loadStats, STATS_REFRESH_MS);
        return () => clearInterval(iv);
    }, [loadStats]);

    const fetchWork = useCallback(async (date) => {
        setLoadingWork(true);
        try {
            const res = await assemblyApi.getTodayWork(date);
            setWorkData(res.data);
        } catch (err) {
            setWorkData(null);
            popApiError(err.response?.data?.error || err.message || 'Failed to load work log');
        } finally {
            setLoadingWork(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const handleOpenModal = () => { setShowModal(true); fetchWork(new Date().toISOString().split('T')[0]); };
    const handleModalDateChange = (date) => { fetchWork(date); };
    const downloadCSV = (grouped, mode, date) => {
        const header = mode === 'hourly'
            ? 'sr_no,hour,total,approved,repaired,needs_rework,qc_rejected'
            : 'sr_no,fabric_roll,total,approved,repaired,needs_rework,qc_rejected';
        const rows = grouped.map(([key, group], i) => {
            const approved     = group.filter(r => r.action === 'APPROVED').length;
            const repaired     = group.filter(r => r.action === 'REPAIRED').length;
            const needs_rework = group.filter(r => r.action === 'NEEDS_REWORK').length;
            const qc_rejected  = group.filter(r => r.action === 'QC_REJECTED').length;
            return [i + 1, `"${key}"`, group.length, approved, repaired, needs_rework, qc_rejected].join(',');
        });
        const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `work-log-${date}.csv` });
        a.click(); URL.revokeObjectURL(a.href);
    };

    // --- NEW: BATCH MODE FETCHING ---
    const handleBatchClick = async (batch) => {
        setActiveRollId(null);
        setIsLoading(true);
        setSelectedBatch(batch);
        try {
            const res = await assemblyApi.getBatchGarments(batch.batch_id);
            setBatchPieces(res.data);
        } catch {
            alert("Failed to load pieces for this batch.");
            setSelectedBatch(null);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePieceClick = async (piece) => {
        setIsPieceLoading(true);
        setError(null);
        setBatchInactive(null);
        setNotAtStage(null);
        setGarment(null);
        setSelectedPiece(piece);
        try {
            const res = await assemblyApi.getGarmentDetails(piece.garment_uid);
            setGarment(res.data);
            playFeedback(res.data?.qc_status === STATUS.APPROVED ? 'already_approved' : 'success');
        } catch (err) {
            const status  = err.response?.status;
            const errData = err.response?.data;
            if (status === 400 && errData?.error === 'DNA Defect') {
                playFeedback('error');
                setDnaDefect(errData);
            } else if (status === 400 && errData?.error === 'Batch Not Active') {
                playFeedback('batch_inactive');
                setBatchInactive(errData);
            } else if (status === 404 && (errData?.error === 'Not Yet At This Stage' || errData?.error === 'Already Passed This Stage')) {
                playFeedback('error');
                setNotAtStage(errData);
            } else {
                playFeedback('error');
                setError(errData?.message || errData?.error || 'Failed to load piece.');
            }
            setSelectedPiece(null);
        } finally {
            setIsPieceLoading(false);
        }
    };

    // --- CORE SCAN PROCESSING ---
    const processScan = async (uid) => {
        if (isLoading || isProcessingAction) {
            return;
        }

        const cleanUid = uid.trim();

        if (viewMode !== 'SCANNER') {
            setViewMode('SCANNER');
        }

        setIsLoading(true);
        setError(null);
        setMismatch(null);
        setDnaDefect(null);
        setBatchInactive(null);
        setNotAtStage(null);
        setGarment(null);
        setScannedTextVisual(cleanUid);

        try {
            const res = await assemblyApi.getGarmentDetails(cleanUid);
            setGarment(res.data);
            playFeedback(res.data?.qc_status === STATUS.APPROVED ? 'already_approved' : 'success');
            setScannedTextVisual('');
        } catch (err) {
            const status  = err.response?.status;
            const errData = err.response?.data;
            if (status === 403 && errData?.error === 'Batch Mismatch') {
                playFeedback('error');
                setMismatch(errData);
            } else if (status === 400 && errData?.error === 'DNA Defect') {
                playFeedback('error');
                setDnaDefect(errData);
            } else if (status === 400 && errData?.error === 'Batch Not Active') {
                playFeedback('batch_inactive');
                setBatchInactive(errData);
            } else if (status === 404 && (errData?.error === 'Not Yet At This Stage' || errData?.error === 'Already Passed This Stage')) {
                playFeedback('error');
                setNotAtStage(errData);
            } else {
                playFeedback('error');
                setError(errData?.message || errData?.error || 'Invalid Scan: Check Barcode Integrity.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleManualSubmit = (e) => {
        e.preventDefault();
        if (manualInput.trim().length > 3) {
            processScan(manualInput.trim());
            setManualInput('');
            setShowManualBox(false);
        }
    };

    // --- HARDWARE SCANNER LOGIC ---
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (isProcessingAction || showManualBox) {
                return;
            }

            const now = Date.now();
            const gap = now - lastKeyStrokeAt.current;

            // QR codes via Retsol D 5015 need 120ms gap threshold (wider than Code 128)
            if (gap > 120 && scanBuffer.current.length > 0) {
                scanBuffer.current = '';
            }

            if (e.key === 'Enter') {
                const buffered = scanBuffer.current;
                if (buffered.length > 3) {
                    processScan(buffered);
                }
                scanBuffer.current = '';
            } else if (e.key.length === 1) {
                scanBuffer.current += e.key;
            }

            lastKeyStrokeAt.current = now;
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [garment, mismatch, isLoading, isProcessingAction, showManualBox, viewMode]);

    // Fetch defect history when a rework garment is loaded so the repair mode UI can show previous faults
    useEffect(() => {
        if (garment?.garment_id && garment?.qc_status === 'NEEDS_REWORK') {
            assemblyApi.getGarmentHistory(garment.garment_id)
                .then(res => setReworkHistory(res.data))
                .catch(() => setReworkHistory(null));
        } else {
            setReworkHistory(null);
        }
    }, [garment?.garment_id, garment?.qc_status]);

    // --- FINAL ACTIONS ---
    // Supervisor overrides on this screen — approving a REJECTED component,
    // changing a REJECTED garment, reverting an APPROVED one. The server asks
    // for a supervisor password (403 SUPERVISOR_PIN_REQUIRED) only when the
    // action is an override; withSupervisorPin prompts and retries.
    const [pinDialog, askSupervisorPin] = useSupervisorPinPrompt();

    const handleAction = async (status, defectCodeIds = []) => {
        if (isProcessingAction) {
            return;
        }
        const detectedAtLineId =
            garment.current_production_line_id ??
            selectedBatch?.line_id ??
            null;

        const defectCodeId = defectCodeIds.length > 0 ? defectCodeIds[0] : null;

        setIsProcessingAction(true);
        try {
            const sent = await withSupervisorPin(askSupervisorPin, `Change REJECTED garment ${garment.garment_uid} to ${status}`,
                (supervisorPin) => assemblyApi.processGarmentStatus({
                    garmentId: garment.garment_id,
                    status,
                    defectCodeId,
                    defectCodeIds,
                    detected_at_line_id: detectedAtLineId,
                    supervisorPin,
                }), '');  // only a REJECTED garment needs a password — the server says when
            if (sent === null) return; // supervisor dialog cancelled

            setLastAction({ uid: garment.garment_uid, status });
            setGarment(null);
            setShowDefectModal(null);
            setSelectedPiece(null);
            setSelectedDefectIds(new Set());
            setSelectedDefectCategory(null);
            setReworkHistory(null);
            playFeedback('success');

            // If in batch mode, refresh the batch pieces so status updates live
            if (viewMode === 'BATCH' && selectedBatch) {
                const res = await assemblyApi.getBatchGarments(selectedBatch.batch_id);
                setBatchPieces(res.data);
            }
            loadRequiredData();
            loadStats(); // today_rework otherwise only refreshes on the 60s interval or a page reload

            setTimeout(() => setLastAction(null), 4000);
        } catch (err) {
            playFeedback('error');
            alert(err.response?.data?.error || 'Transaction failed.');
        } finally {
            setIsProcessingAction(false);
        }
    };

    // QA / supervisor override: approve a garment that its parts block — parts
    // rejected or not cleared at an earlier stage, or an open part defect. The
    // server asks for a supervisor or QA password, closes those parts' open
    // defects, approves the garment and logs who authorised it.
    const handleQaOverrideApprove = async (garmentId, garmentUid) => {
        if (!garmentId || isProcessingAction) return;
        setIsProcessingAction(true);
        try {
            const sent = await withSupervisorPin(askSupervisorPin, `QA override: approve garment ${garmentUid}`,
                (supervisorPin) => assemblyApi.processGarmentStatus({
                    garmentId, status: STATUS.APPROVED, defectCodeId: null, defectCodeIds: [], supervisorPin,
                }), '');
            if (sent === null) return; // dialog cancelled
            setDnaDefect(null);
            setNotAtStage(null);
            setGarment(null);
            setSelectedPiece(null);
            setLastAction({ uid: garmentUid, status: STATUS.APPROVED });
            playFeedback('success');
            if (viewMode === 'BATCH' && selectedBatch) {
                const res = await assemblyApi.getBatchGarments(selectedBatch.batch_id);
                setBatchPieces(res.data);
            }
            loadRequiredData();
            loadStats();
            setTimeout(() => setLastAction(null), 4000);
        } catch (err) {
            playFeedback('error');
            alert(err.response?.data?.error || 'QA override failed.');
        } finally {
            setIsProcessingAction(false);
        }
    };

    // Supervisor override: an APPROVED garment back to PENDING here (e.g.
    // approved by mistake). Refused by the server if the next stage has
    // already checked it.
    const handleRevertGarment = async () => {
        if (!garment || isProcessingAction) return;
        setIsProcessingAction(true);
        try {
            const sent = await withSupervisorPin(askSupervisorPin, `Revert approved garment ${garment.garment_uid} to pending`,
                (supervisorPin) => assemblyApi.revertGarment({ garmentId: garment.garment_id, supervisorPin }));
            if (sent === null) return;
            setLastAction({ uid: garment.garment_uid, status: 'PENDING' });
            setGarment(null);
            setSelectedPiece(null);
            if (viewMode === 'BATCH' && selectedBatch) {
                const res = await assemblyApi.getBatchGarments(selectedBatch.batch_id);
                setBatchPieces(res.data);
            }
            loadRequiredData();
            setTimeout(() => setLastAction(null), 4000);
        } catch (err) {
            alert(err.response?.data?.error || 'Could not revert the garment.');
        } finally {
            setIsProcessingAction(false);
        }
    };

    // Lets the checker clear a DNA-Defect-blocking component directly from this screen,
    // instead of routing the piece back to the Universal Workstation dashboard.
    const handleApproveComponent = async (comp) => {
        if (!comp.cut_piece_log_id || approvingPieceId) {
            return;
        }
        // approve-repair requires batchId — the blocked garment's own batch_id is the
        // correct source (the piece's production batch, not necessarily the assembly
        // line's currently-selected batch); fall back to the selected batch if absent.
        const batchId = dnaDefect?.garment?.batch_id ?? selectedBatch?.batch_id ?? null;
        if (!batchId) {
            alert('Cannot approve — missing batch context for this garment.');
            return;
        }
        setApprovingPieceId(comp.cut_piece_log_id);
        try {
            const sent = await withSupervisorPin(askSupervisorPin, `Approve rejected component ${comp.part_name}`, (supervisorPin) => universalApi.approveAlteredPieces({
                supervisorPin,
                batchId,
                pieceIds: [comp.cut_piece_log_id],
                status: 'APPROVED',
                defectCodeIds: [],
                // cut_piece_log_id values are sewing-stage piece records (PRIMARY_ONLY
                // scope tracks only the primary part) — tells BE which tracking table
                // (sewing_piece_log) to resolve the defect against.
                processingMode: 'PIECE',
                processingScope: 'PRIMARY_ONLY',
            }), '');  // '' = try without a password first; only rejections need one
            if (sent === null) return; // supervisor dialog cancelled
            setDnaDefect(prev => prev ? {
                ...prev,
                garment: {
                    ...prev.garment,
                    components: prev.garment.components.map(c =>
                        c.cut_piece_log_id === comp.cut_piece_log_id ? { ...c, has_active_defect: false } : c
                    ),
                },
            } : prev);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to approve piece.');
        } finally {
            setApprovingPieceId(null);
        }
    };

    // Shows piece history/defect info for a component before the checker commits to
    // approving it — same endpoint/response-shape handling as UniversalWorkstationDashboard.
    const openComponentInfo = async (comp) => {
        if (!comp.cut_piece_log_id) {
            return;
        }
        setComponentInfo({ comp, loading: true, items: [] });
        try {
            const res = await universalApi.getPieceHistory(comp.cut_piece_log_id);
            const raw = res.data;
            const items = Array.isArray(raw) ? raw : (raw?.items ?? raw?.rework_items ?? raw?.defects ?? []);
            setComponentInfo({ comp, loading: false, items });
        } catch {
            setComponentInfo({ comp, loading: false, items: [] });
        }
    };

    return (
        // Fixed screen-height layout (factory tablets): the top bar stays put and
        // each view fills the remaining height; only small inner areas scroll.
        <div className="h-screen overflow-hidden bg-[#F8FAFC] p-3 md:p-4 font-inter select-none flex flex-col">
            {pinDialog}
            {/* Global Loader for Batch Selection only */}
            {isLoading && viewMode === 'BATCH' && !selectedBatch && (
                <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[500] flex items-center justify-center">
                    <RefreshCw className="w-10 h-10 animate-spin text-indigo-600" />
                </div>
            )}

            {/* BATCH NOT LOADED ALERT — batch isn't IN_PROGRESS on this line */}
            {batchInactive && (
                <div className="fixed inset-0 z-[400] bg-rose-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white border-[8px] border-rose-500 rounded-[3rem] p-8 md:p-10 max-w-xl w-full max-h-[92vh] overflow-y-auto text-center shadow-2xl animate-in zoom-in-95">
                        <div className="w-24 h-24 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertCircle className="w-14 h-14 text-rose-600" />
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-rose-600 tracking-tight mb-3">BATCH NOT LOADED</h2>
                        <p className="text-slate-500 font-bold text-lg mb-6">This batch is not active on your line. Ask your line loader to load it.</p>
                        <div className="bg-rose-50 border-2 border-rose-100 rounded-3xl p-6 mb-8 text-left space-y-2.5">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">Batch ID</span>
                                <span className="font-mono font-black text-rose-700 text-lg">{batchInactive.batch_id}</span>
                            </div>
                        </div>
                        <button
                            onClick={() => { setBatchInactive(null); setSelectedPiece(null); }}
                            className="px-14 py-5 bg-rose-600 text-white font-black text-xl rounded-3xl hover:bg-rose-700 active:scale-95 transition-all shadow-xl w-full"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

            {/* NOT AT THIS STAGE — garment_uid is real, just hasn't reached (or already
                passed) the scanning operator's own line yet; shows the full chain of
                stages so it's clear where it actually is instead of a bare "not found" */}
            {notAtStage && (
                <div className="fixed inset-0 z-[400] bg-amber-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white border-[8px] border-amber-400 rounded-[3rem] p-8 md:p-10 max-w-2xl w-full max-h-[92vh] overflow-y-auto text-center shadow-2xl animate-in zoom-in-95">
                        <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Clock className="w-14 h-14 text-amber-600" />
                        </div>
                        <h2 className="text-3xl md:text-4xl font-black text-amber-600 tracking-tight mb-3">
                            {notAtStage.error === 'Already Passed This Stage' ? 'ALREADY PASSED THIS STAGE' : 'NOT AT THIS STAGE YET'}
                        </h2>
                        <p className="text-slate-500 font-bold text-lg mb-6">{notAtStage.message}</p>
                        {/* Waiting for the previous piece stage (e.g. BF SEWING): one chip per
                            part — green = scanned/cleared there, red = still pending. */}
                        {notAtStage.waiting_parts?.length > 0 && (
                            <div className="mb-6">
                                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                    Parts at {notAtStage.waiting_stage_name}
                                </p>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {notAtStage.waiting_parts.map((p, i) => (
                                        <span key={i}
                                            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 font-black text-sm uppercase tracking-wide ${p.cleared
                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                                : 'bg-rose-50 border-rose-300 text-rose-700'}`}>
                                            {p.cleared ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
                                            {p.part_name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {notAtStage.batch_id != null && (
                            <div className="bg-amber-50 border-2 border-amber-100 rounded-3xl p-6 mb-6 text-left">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">Batch ID</span>
                                    <span className="font-mono font-black text-amber-700 text-lg">{notAtStage.batch_id}</span>
                                </div>
                            </div>
                        )}
                        {notAtStage.stage_progress && (
                            <div className="bg-slate-50 border-2 border-slate-100 rounded-3xl p-6 mb-8">
                                <StageProgressStepper stages={notAtStage.stage_progress} />
                            </div>
                        )}
                        {notAtStage.garment_id && notAtStage.error === 'Not Yet At This Stage' && (
                            <button
                                onClick={() => handleQaOverrideApprove(notAtStage.garment_id, notAtStage.garment_uid)}
                                disabled={isProcessingAction}
                                className="px-14 py-4 mb-3 bg-emerald-600 text-white font-black text-lg rounded-3xl hover:bg-emerald-700 active:scale-95 transition-all shadow-xl w-full disabled:opacity-50"
                            >
                                QA OVERRIDE: APPROVE GARMENT
                            </button>
                        )}
                        <button
                            onClick={() => { setNotAtStage(null); setSelectedPiece(null); }}
                            className="px-14 py-5 bg-amber-500 text-white font-black text-xl rounded-3xl hover:bg-amber-600 active:scale-95 transition-all shadow-xl w-full"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

            {/* ALREADY APPROVED ALERT — piece was scanned again after passing QC */}
            {garment && garment.qc_status === STATUS.APPROVED && (
                <div className="fixed inset-0 z-[400] bg-emerald-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white border-[8px] border-emerald-400 rounded-[3rem] p-8 md:p-10 max-w-xl w-full max-h-[92vh] overflow-y-auto text-center shadow-2xl animate-in zoom-in-95">
                        <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <ShieldCheck className="w-14 h-14 text-emerald-500" />
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-emerald-600 tracking-tight mb-3">ALREADY APPROVED</h2>
                        <p className="text-slate-500 font-bold text-lg mb-6">This piece already passed QC. No action needed.</p>
                        <div className="bg-emerald-50 border-2 border-emerald-100 rounded-3xl p-6 mb-8 text-left space-y-2.5">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">UID</span>
                                <span className="font-mono font-black text-slate-900 text-lg">{garment.garment_uid}</span>
                            </div>
                            {garment.batch_id && (
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">Batch</span>
                                    <span className="font-mono font-black text-indigo-600">{garment.batch_id}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">Product</span>
                                <span className="font-black text-slate-700">{garment.product_name}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">Size</span>
                                <span className="font-black text-slate-700">{garment.size}</span>
                            </div>
                            {garment.fabric_roll_id != null && (
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">Roll</span>
                                    <span className="font-mono font-black text-slate-700">#{garment.fabric_roll_id}</span>
                                </div>
                            )}
                            {(garment.fabric_color_number || garment.fabric_color_name) && (
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">Color</span>
                                    <span className="font-black text-slate-700">{[garment.fabric_color_number, garment.fabric_color_name].filter(Boolean).join(' · ')}</span>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => { setGarment(null); setSelectedPiece(null); }}
                            className="px-14 py-5 bg-emerald-600 text-white font-black text-xl rounded-3xl hover:bg-emerald-700 active:scale-95 transition-all shadow-xl w-full"
                        >
                            OK
                        </button>
                        <button
                            onClick={handleRevertGarment}
                            disabled={isProcessingAction}
                            className="mt-3 w-full py-3 text-sm font-black uppercase tracking-widest text-slate-500 border-2 border-slate-200 rounded-2xl hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50"
                        >
                            Revert to pending (supervisor)
                        </button>
                    </div>
                </div>
            )}

            <div className="w-full max-w-7xl mx-auto flex-1 min-h-0 flex flex-col">

                {/* API ERROR BANNER */}
                {apiError && (
                    <div className="mb-2 flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200 shrink-0">
                        <div className="flex items-center gap-2 text-sm font-bold">
                            <ShieldAlert size={16} className="shrink-0" />
                            <span>{apiError}</span>
                        </div>
                        <button onClick={() => setApiError(null)} className="p-1 hover:bg-rose-100 rounded-full transition-colors shrink-0">
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* TOP BAR — station, today's stats, view toggle, last action: one row */}
                <header className="mb-3 shrink-0 flex flex-wrap items-center gap-2 md:gap-3 bg-white px-3 py-2 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-2 mr-1">
                        <div className="p-2 bg-indigo-600 rounded-xl text-white shadow">
                            <HardDrive size={18} />
                        </div>
                        <div className="leading-tight">
                            <h1 className="text-base font-black text-slate-900 tracking-tight">{workstationInfo?.line_name || 'Assembly Station'}</h1>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                <p className="text-slate-500 font-bold uppercase text-[9px] tracking-widest">Live</p>
                            </div>
                        </div>
                    </div>

                    {/* Stats — compact pills */}
                    {[
                        { label: 'Pending Rework', val: stats?.pending_rework, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
                        { label: "Today's Rework", val: stats?.today_rework, cls: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
                        { label: "Today's Approved", val: stats?.today_approved, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                        { label: 'This Hour', val: stats?.checked_this_hour, cls: 'bg-sky-50 border-sky-200 text-sky-700' },
                    ].map(st => (
                        <div key={st.label} className={`flex items-center gap-2 border rounded-xl px-3 py-1.5 ${st.cls}`}>
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-70 leading-tight">{st.label}</span>
                            <span className="text-lg font-black tabular-nums leading-none">{st.val ?? '—'}</span>
                        </div>
                    ))}
                    <button onClick={handleOpenModal}
                        className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                        <FileText size={14} className="text-indigo-500 shrink-0" />
                        <span className="text-xs font-black text-slate-700">Work Log</span>
                    </button>

                    <div className="ml-auto flex items-center gap-2">
                        {lastAction && (
                            <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center font-black text-xs animate-in fade-in slide-in-from-right-4">
                                <CheckCircle2 className="w-4 h-4 mr-1.5" /> {lastAction.uid} {lastAction.status}
                            </div>
                        )}
                        {/* VIEW MODE TOGGLE */}
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                            <button
                                onClick={() => { setViewMode('SCANNER'); setSelectedBatch(null); }}
                                className={`flex items-center px-4 py-2 rounded-lg font-black text-xs transition-all ${
                                    viewMode === 'SCANNER' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                <Barcode size={15} className="mr-1.5" /> SCANNER
                            </button>
                            <button
                                onClick={() => setViewMode('BATCH')}
                                className={`flex items-center px-4 py-2 rounded-lg font-black text-xs transition-all ${
                                    viewMode === 'BATCH' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                <List size={15} className="mr-1.5" /> BATCH LIST
                            </button>
                        </div>
                    </div>
                </header>

                {/* =========================================
                    MODE A: EXISTING SCANNER INTERFACE 
                ========================================= */}
                {viewMode === 'SCANNER' && (
                    <div className="animate-in fade-in zoom-in-95 duration-200 flex-1 min-h-0 flex flex-col">
                        
                        {/* IDLE SCAN STATE WITH SCANNED TEXT VISUAL */}
                        {!garment && !mismatch && !dnaDefect && !batchInactive && !notAtStage && (
                            <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center py-6 px-4 bg-white rounded-[2rem] border-4 border-dashed border-slate-200 shadow-inner overflow-hidden">
                                <div className="relative inline-block mb-4 shrink-0">
                                    <QrCode size={96} className="text-slate-100" />
                                    {isLoading ? (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <RefreshCw size={44} className="text-indigo-400 animate-spin" />
                                        </div>
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <RefreshCw size={44} className="text-indigo-400 animate-spin opacity-20" />
                                        </div>
                                    )}
                                </div>
                                
                                {/* VISUAL TEXT FEEDBACK OF SCAN */}
                                {scannedTextVisual ? (
                                    <div className="mb-4">
                                        <span className="bg-indigo-50 text-indigo-600 font-mono font-black text-2xl px-6 py-3 rounded-2xl border-2 border-indigo-100">
                                            {scannedTextVisual}
                                        </span>
                                    </div>
                                ) : (
                                    <h2 className="text-3xl font-black text-slate-300 tracking-tighter uppercase">Ready for Scan</h2>
                                )}
                                
                                <p className="text-slate-400 font-bold mt-4 uppercase text-xs tracking-[0.2em]">Hardware Wedge Active • QR Code • Retsol D 5015</p>
                                
                                {error && (
                                    <div className="mt-5 max-w-md mx-auto p-4 bg-rose-50 border-2 border-rose-100 rounded-3xl text-rose-700 font-black flex items-center justify-center shadow-sm animate-in shake">
                                        <ShieldAlert className="mr-3 shrink-0" /> {error}
                                    </div>
                                )}

                                {/* Recent scans feed */}
                                {!error && recentScans.length > 0 && (
                                    <div className="mt-5 w-full max-w-2xl mx-auto min-h-0 flex flex-col">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 mb-2 shrink-0">Recent Scans</p>
                                        <div className="space-y-1.5 min-h-0 overflow-y-auto pr-1">
                                            {recentScans.map((s, i) => (
                                                <div key={s.id ?? i} className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl px-4 py-2.5 shadow-sm text-left">
                                                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                                                        s.status === 'APPROVED' ? 'bg-emerald-500' :
                                                        s.status === 'NEEDS_REWORK' ? 'bg-amber-400' :
                                                        s.status === 'QC_REJECTED' ? 'bg-rose-500' : 'bg-slate-300'
                                                    }`} />
                                                    <span className="font-mono font-black text-sm text-slate-700 flex-1">{s.garment_uid}</span>
                                                    <span className="text-[10px] font-bold text-slate-400 font-mono">{s.batch_id}</span>
                                                    <span className="text-[10px] font-bold text-slate-400">{s.size}</span>
                                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg ${
                                                        s.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                                                        s.status === 'NEEDS_REWORK' ? 'bg-amber-50 text-amber-700' :
                                                        s.status === 'QC_REJECTED' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'
                                                    }`}>{s.status?.replace(/_/g, ' ')}</span>
                                                    <span className="text-[10px] text-slate-300 font-mono whitespace-nowrap">{fmtTime(s.updated_at)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* DNA DEFECT BLOCK */}
                        {dnaDefect && (
                            <div className="flex-1 min-h-0 overflow-y-auto bg-white border-[6px] border-rose-400 rounded-[2.5rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 flex flex-col justify-center">
                                <div className="flex flex-col items-center text-center mb-5">
                                    <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-3">
                                        <ShieldAlert className="w-10 h-10 text-rose-500" />
                                    </div>
                                    <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-2">DNA DEFECT</h2>
                                    <p className="text-slate-500 text-lg font-bold max-w-xl">{dnaDefect.message}</p>
                                    {dnaDefect.garment && (
                                        <p className="mt-2 font-mono font-black text-indigo-500 text-lg">{dnaDefect.garment.garment_uid}</p>
                                    )}
                                </div>
                                {dnaDefect.garment?.components?.length > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl w-full mx-auto mb-6">
                                        {dnaDefect.garment.components.map((comp, i) => {
                                            const isApproving = approvingPieceId === comp.cut_piece_log_id;
                                            const clickable = comp.has_active_defect && !!comp.cut_piece_log_id;
                                            // stage_status: this part at the previous piece stage (e.g. BF SEWING).
                                            // SKIPPED = not scanned there by design (product flow setting).
                                            const stageName = dnaDefect.garment.stage_check_name;
                                            const stageBlocked = comp.stage_status && comp.stage_status !== 'CLEARED' && comp.stage_status !== 'SKIPPED';
                                            const isBad = comp.has_active_defect || stageBlocked;
                                            const stageNote = stageBlocked
                                                ? `${comp.stage_status === 'NOT_SCANNED' ? 'Not scanned' : comp.stage_status.replace('_', ' ').toLowerCase()} @ ${stageName}`
                                                : comp.stage_status === 'SKIPPED' ? `Skipped @ ${stageName}` : null;
                                            return (
                                                <div
                                                    key={i}
                                                    onClick={clickable ? () => openComponentInfo(comp) : undefined}
                                                    title={clickable ? 'Click for piece details' : undefined}
                                                    className={`px-4 py-3 rounded-2xl border-2 flex items-center gap-3 ${isBad ? 'bg-rose-50 border-rose-300' : 'bg-emerald-50 border-emerald-200'} ${clickable ? 'cursor-pointer hover:border-rose-400 hover:bg-rose-100 transition-colors' : ''}`}
                                                >
                                                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${isBad ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}>
                                                        {isApproving
                                                            ? <Loader2 size={14} className="animate-spin" />
                                                            : isBad ? <X size={14} strokeWidth={3}/> : <Check size={14} strokeWidth={3}/>}
                                                    </div>
                                                    <span className={`font-bold text-sm ${isBad ? 'text-rose-700' : 'text-emerald-700'}`}>
                                                        {comp.part_name}
                                                        {stageNote && <span className={`block text-[10px] font-black uppercase tracking-wider ${stageBlocked ? 'text-rose-500' : 'text-slate-400'}`}>{stageNote}</span>}
                                                    </span>
                                                    {clickable && !isApproving && (
                                                        <span className="ml-auto text-[9px] font-black uppercase tracking-wider text-rose-500">Details</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                <div className="flex flex-wrap justify-center gap-3">
                                    {dnaDefect.garment?.garment_id && (
                                        <button onClick={() => handleQaOverrideApprove(dnaDefect.garment.garment_id, dnaDefect.garment.garment_uid)} disabled={isProcessingAction}
                                            className="px-8 py-4 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 active:scale-95 transition-all shadow-xl disabled:opacity-50">
                                            QA OVERRIDE: APPROVE GARMENT
                                        </button>
                                    )}
                                    <button onClick={() => setDnaDefect(null)} className="px-12 py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-black active:scale-95 transition-all shadow-xl">
                                        RETURN TO SCANNER
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* COMPONENT INFO MODAL — piece history before committing to approve */}
                        {componentInfo && (
                            <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" onClick={() => setComponentInfo(null)}>
                                <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-start justify-between gap-3 px-7 py-6 border-b border-slate-100">
                                        <div>
                                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Component Details</p>
                                            <h3 className="text-2xl font-black text-slate-900">{componentInfo.comp.part_name}</h3>
                                            <p className="text-xs font-mono font-bold text-slate-400 mt-0.5">Piece #{componentInfo.comp.cut_piece_log_id}</p>
                                        </div>
                                        <button onClick={() => setComponentInfo(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors shrink-0">
                                            <X size={18} />
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto px-7 py-5">
                                        {componentInfo.loading ? (
                                            <div className="flex items-center gap-2 text-slate-400">
                                                <Loader2 size={14} className="animate-spin" />
                                                <span className="text-xs font-bold">Loading piece history…</span>
                                            </div>
                                        ) : componentInfo.items.length === 0 ? (
                                            <p className="text-xs text-slate-400 italic">No defect history found for this piece.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {componentInfo.items.map((item, i) => (
                                                    <div key={i} className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="font-mono font-black text-rose-700 text-xs">{item.defect_code ?? item.code ?? '—'}</span>
                                                            {(item.logged_at ?? item.created_at) && (
                                                                <span className="text-[10px] text-rose-400 font-bold">
                                                                    {new Date(item.logged_at ?? item.created_at).toLocaleDateString()}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {(item.defect_description ?? item.description) && (
                                                            <p className="text-xs text-rose-600 mt-1">{item.defect_description ?? item.description}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-end gap-2 px-7 py-5 border-t border-slate-100">
                                        <button onClick={() => setComponentInfo(null)}
                                            className="text-sm font-bold text-slate-500 hover:text-slate-700 px-4 py-2 rounded-xl hover:bg-slate-100 transition-colors">
                                            Close
                                        </button>
                                        <button
                                            onClick={() => { const comp = componentInfo.comp; setComponentInfo(null); handleApproveComponent(comp); }}
                                            disabled={approvingPieceId === componentInfo.comp.cut_piece_log_id}
                                            className="flex items-center gap-1.5 text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-5 py-2 rounded-xl transition-colors"
                                        >
                                            <ShieldCheck size={14} /> Approve Piece
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* DEPARTMENT MISMATCH WARNING */}
                        {mismatch && (
                            <div className="flex-1 min-h-0 overflow-y-auto bg-white border-[6px] border-amber-400 rounded-[2.5rem] p-8 text-center shadow-2xl animate-in zoom-in-95 flex flex-col items-center justify-center">
                                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertCircle className="w-10 h-10 text-amber-500" />
                                </div>
                                <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-3">WRONG LINE</h2>
                                <p className="text-slate-500 text-lg font-bold mb-8 max-w-xl mx-auto">{mismatch.message}</p>
                                <button onClick={() => setMismatch(null)} className="px-12 py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-black active:scale-95 transition-all shadow-xl">
                                    RETURN TO SCANNER
                                </button>
                            </div>
                        )}

                        {/* GARMENT VERIFICATION VIEW — fits one screen: info + parts on the
                            left, a tall APPROVE with REWORK / REJECT side by side on the right. */}
                        {garment && garment.qc_status !== STATUS.APPROVED && (
                            <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,1fr)_auto] md:grid-cols-3 md:grid-rows-[minmax(0,1fr)] gap-3 animate-in slide-in-from-bottom-10">
                                {/* LEFT: garment info + DNA component map */}
                                <div className="md:col-span-2 min-h-0 bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden flex flex-col">
                                    <div className="bg-slate-900 px-5 py-4 text-white shrink-0">
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className="bg-indigo-600 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest">DNA OK</span>
                                                    <h2 className="text-2xl font-black tracking-tighter truncate">{garment.garment_uid}</h2>
                                                </div>
                                                <p className="text-slate-400 font-bold text-sm truncate">{garment.product_name}</p>
                                                {(garment.fabric_color_number || garment.fabric_color_name || garment.fabric_roll_id != null || garment.fabric_color_id != null) && (
                                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[10px] font-mono">
                                                        {(garment.fabric_color_number || garment.fabric_color_name) && (
                                                            <span className="bg-white/10 px-2 py-0.5 rounded-md text-white font-bold">
                                                                {[garment.fabric_color_number, garment.fabric_color_name].filter(Boolean).join(' · ')}
                                                            </span>
                                                        )}
                                                        {garment.fabric_roll_id != null && (
                                                            <span className="bg-white/5 px-2 py-0.5 rounded-md text-slate-400">Roll #{garment.fabric_roll_id}</span>
                                                        )}
                                                        {garment.fabric_color_id != null && (
                                                            <span className="bg-white/5 px-2 py-0.5 rounded-md text-slate-400">FC {garment.fabric_color_id}</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="bg-white/10 px-4 py-2 rounded-xl text-right shrink-0">
                                                <span className="block text-[9px] font-bold opacity-50">SIZE</span>
                                                <span className="text-2xl font-black leading-none">{garment.size}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {garment.stage_progress && (
                                        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 shrink-0">
                                            <StageProgressStepper stages={garment.stage_progress} />
                                        </div>
                                    )}

                                    {/* A garment already worked here whose parts still aren't cleared
                                        at the previous stage — a note for the checker, not a block. */}
                                    {garment.stage_warning && (
                                        <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-900 shrink-0">
                                            <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                                <AlertCircle size={12} /> Check before approving
                                            </p>
                                            <p className="text-xs font-bold">{garment.stage_warning}</p>
                                        </div>
                                    )}

                                    <div className="p-4 flex-1 min-h-0 overflow-y-auto">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="font-black text-slate-400 text-[10px] uppercase tracking-[0.2em] flex items-center">
                                                <Package className="w-3.5 h-3.5 mr-2" /> Component Integrity Map
                                            </h3>
                                            <span className="text-[10px] font-mono font-bold text-slate-300">ID: {garment.garment_id}</span>
                                        </div>
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                            {garment.components.map((comp, i) => (
                                                <div key={i} className={`px-3 py-2.5 rounded-xl border-2 flex items-center justify-between gap-2 ${comp.has_active_defect ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${comp.has_active_defect ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}>
                                                            {i + 1}
                                                        </div>
                                                        <span className="font-black text-slate-700 text-sm truncate">{comp.part_name}</span>
                                                    </div>
                                                    {comp.has_active_defect ? <X size={16} className="text-rose-500 shrink-0" strokeWidth={4} /> : <Check size={16} className="text-emerald-500 shrink-0" strokeWidth={4} />}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT: COMMAND CONSOLE — button heights follow the screen height (vh),
                                    so APPROVE never pushes REWORK / REJECT off screen. */}
                                <div className="min-h-0 overflow-y-auto flex flex-col gap-2 md:gap-3">
                                    {garment.qc_status === 'NEEDS_REWORK' ? (
                                        /* ── REPAIR VALIDATION MODE ── */
                                        <>
                                            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3 text-center shrink-0">
                                                <div className="flex items-center justify-center gap-2 mb-1.5">
                                                    <Hammer size={16} className="text-amber-600" />
                                                    <span className="text-amber-700 font-black text-xs uppercase tracking-widest">Previously Flagged for Rework</span>
                                                </div>
                                                {reworkHistory && reworkHistory.length > 0 && (
                                                    <div className="flex flex-wrap justify-center gap-1.5">
                                                        {reworkHistory.slice(0, 6).map((h, i) => (
                                                            <span key={i} className="inline-flex items-center bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-200">
                                                                {h.defect_code || h.defect_description || 'Defect'}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleAction(STATUS.REPAIRED)}
                                                disabled={isProcessingAction}
                                                className="shrink-0 h-[clamp(88px,26vh,260px)] bg-teal-600 text-white rounded-[2rem] shadow-xl flex flex-col items-center justify-center p-3 hover:bg-teal-700 transition-all active:scale-95 disabled:grayscale disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <ShieldCheck className="w-[clamp(24px,5vh,44px)] h-[clamp(24px,5vh,44px)] mb-1" />
                                                <span className="text-[length:clamp(1.1rem,3.2vh,1.5rem)] font-black">REPAIRED</span>
                                                <span className="text-[10px] font-bold opacity-60 mt-1 uppercase tracking-widest">Defect Fixed ✓</span>
                                            </button>
                                            <button
                                                onClick={() => setShowDefectModal('REJECT')}
                                                disabled={isProcessingAction}
                                                className="shrink-0 h-[clamp(56px,11vh,110px)] bg-rose-600 text-white rounded-2xl shadow-lg flex items-center justify-center hover:bg-rose-700 transition-all active:scale-95"
                                            >
                                                <X size={22} className="mr-2" />
                                                <span className="text-lg font-black">STILL DEFECTIVE</span>
                                            </button>
                                            <button onClick={() => setGarment(null)} className="shrink-0 py-2 text-slate-400 font-bold hover:text-slate-600 transition-colors uppercase text-xs tracking-widest">
                                                Cancel Scan
                                            </button>
                                        </>
                                    ) : (
                                        /* ── NORMAL QC MODE ── */
                                        <>
                                            {garment.qc_status === 'QC_REJECTED' && (
                                                <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-3 text-center shrink-0">
                                                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                                                        <ShieldAlert size={16} className="text-rose-600" />
                                                        <span className="text-rose-700 font-black text-xs uppercase tracking-widest">Rejected garment</span>
                                                    </div>
                                                    <p className="text-[11px] font-bold text-rose-600">Changing it needs a line supervisor's password — recorded under their name.</p>
                                                </div>
                                            )}
                                            <button
                                                onClick={() => handleAction(STATUS.APPROVED)}
                                                disabled={isProcessingAction || garment.components.some(c => c.has_active_defect)}
                                                className="shrink-0 h-[clamp(96px,30vh,300px)] bg-emerald-600 text-white rounded-[2rem] shadow-xl flex flex-col items-center justify-center p-3 hover:bg-emerald-700 transition-all active:scale-95 disabled:grayscale disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <ShieldCheck className="w-[clamp(22px,4.5vh,44px)] h-[clamp(22px,4.5vh,44px)] mb-1" />
                                                {garment.batch_id && (
                                                    <span className="font-mono font-black text-[length:clamp(1.5rem,6vh,3rem)] opacity-80 leading-none mb-1 tracking-wider">{garment.batch_id}</span>
                                                )}
                                                <span className="text-[length:clamp(1.1rem,3.2vh,1.5rem)] font-black">APPROVE</span>
                                                <span className="text-[10px] font-bold opacity-60 mt-0.5 uppercase tracking-widest">Pass to Quality</span>
                                            </button>
                                            <div className="grid grid-cols-2 gap-3 shrink-0">
                                                <button
                                                    onClick={() => setShowDefectModal('REWORK')}
                                                    disabled={isProcessingAction}
                                                    className="h-[clamp(56px,11vh,110px)] bg-amber-500 text-white rounded-2xl shadow-lg flex items-center justify-center hover:bg-amber-600 transition-all active:scale-95"
                                                >
                                                    <Hammer size={22} className="mr-2" />
                                                    <span className="text-lg font-black">REWORK</span>
                                                </button>
                                                <button
                                                    onClick={() => setShowDefectModal('REJECT')}
                                                    disabled={isProcessingAction}
                                                    className="h-[clamp(56px,11vh,110px)] bg-rose-600 text-white rounded-2xl shadow-lg flex items-center justify-center hover:bg-rose-700 transition-all active:scale-95"
                                                >
                                                    <X size={22} className="mr-2" />
                                                    <span className="text-lg font-black">REJECT</span>
                                                </button>
                                            </div>
                                            <button onClick={() => setGarment(null)} className="shrink-0 py-2 text-slate-400 font-bold hover:text-slate-600 transition-colors uppercase text-xs tracking-widest">
                                                Cancel Scan
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* =========================================
                    MODE B: BATCH & PIECE SELECTION
                ========================================= */}
                {viewMode === 'BATCH' && (
                    <div className="animate-in fade-in duration-200 flex-1 min-h-0 flex flex-col">

                        {!selectedBatch ? (
                            <div className="flex-1 min-h-0 flex flex-col bg-white rounded-[2rem] p-4 md:p-5 shadow-sm border border-slate-200">
                                <h2 className="shrink-0 text-sm font-black text-slate-400 mb-3 uppercase tracking-widest flex items-center">
                                    <List className="mr-2" size={18}/> Select Active Batch
                                </h2>
                                <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start pr-1">
                                    {activeBatches.map(batch => {
                                        const approved = batch.approved_units ?? 0;
                                        const pending  = batch.pending_units ?? 0;
                                        const rework   = batch.rework_units ?? 0;
                                        const rejected = batch.rejected_units ?? 0;
                                        const total    = batch.total_units ?? 0;
                                        const velocity = batch.hourly_velocity ?? null;
                                        return (
                                            <button
                                                key={batch.batch_id}
                                                onClick={() => handleBatchClick(batch)}
                                                className="bg-slate-50 p-4 rounded-2xl text-left border-2 border-slate-100 hover:border-indigo-500 hover:shadow-lg transition-all group"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="inline-block px-2.5 py-0.5 bg-indigo-100 text-indigo-600 font-black text-[10px] uppercase rounded-md">{batch.batch_id}</span>
                                                        {batch.priority && <PriorityChip priority={batch.priority} size="xs" />}
                                                    </div>
                                                    {velocity != null && (
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-sky-100 text-sky-700">{velocity}/hr</span>
                                                    )}
                                                </div>
                                                <h3 className="text-lg font-black text-slate-800 mb-2 truncate group-hover:text-indigo-600 transition-colors">{batch.product_name}</h3>
                                                <div className="flex gap-1.5 flex-wrap mb-2">
                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">{approved} Approved</span>
                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-200 text-slate-600">{pending} Pending</span>
                                                    {rework > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">{rework} Rework</span>}
                                                    {rejected > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-100 text-rose-700">{rejected} Rejected</span>}
                                                </div>
                                                <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 mb-1">
                                                    <span>Completion</span>
                                                    <span className="text-indigo-600">{approved} / {total}</span>
                                                </div>
                                                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
                                                    <div className="bg-emerald-500 h-full" style={{ width: `${total > 0 ? (approved/total)*100 : 0}%` }} />
                                                    <div className="bg-amber-400 h-full" style={{ width: `${total > 0 ? (rework/total)*100 : 0}%` }} />
                                                    <div className="bg-rose-400 h-full" style={{ width: `${total > 0 ? (rejected/total)*100 : 0}%` }} />
                                                </div>
                                            </button>
                                        );
                                    })}
                                    {activeBatches.length === 0 && (
                                        <div className="col-span-full py-12 text-center text-slate-400 font-bold uppercase">
                                            No active batches running on this line.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (() => {
                            // ── Selected batch: header row + roll tabs + ONE roll's tiles ──
                            // Garments not yet available here (parts not cleared at the
                            // previous stage) are counted separately, not as Pending.
                            const isOpen = (p) => p.status !== 'APPROVED' && p.status !== 'QC_REJECTED';
                            // Shown = available here, or held by a part REJECTED earlier
                            // (it will never arrive on its own; QA can open and override it).
                            const isShown = (p) => p.available !== false || +p.rejected_component_count > 0;
                            const availablePieces = batchPieces.filter(isShown);
                            const waitingCount = batchPieces.length - availablePieces.length;
                            const waitingStage = batchPieces.find(p => p.uncleared_stage)?.uncleared_stage || 'previous stage';
                            const approved = availablePieces.filter(p => p.status === 'APPROVED').length;
                            const rejected = availablePieces.filter(p => p.status === 'QC_REJECTED').length;
                            const rework = availablePieces.filter(p => p.status === 'NEEDS_REWORK').length;
                            const pending = availablePieces.filter(p => !p.status || p.status === 'PENDING').length;
                            // Garments whose PIECES were rejected at an earlier stage (open
                            // piece defect) — the garment itself is still pending.
                            const partRejected = batchPieces.filter(p => +p.rejected_component_count > 0 && isOpen(p)).length;

                            const byRoll = batchPieces.reduce((acc, p) => {
                                const key = String(p.fabric_roll_id || 'Unknown');
                                (acc[key] ||= []).push(p);
                                return acc;
                            }, {});
                            const rolls = Object.entries(byRoll)
                                .map(([rollId, rollPieces]) => {
                                    const pieces = rollPieces.filter(isShown);
                                    return {
                                        rollId, rollPieces, pieces,
                                        waiting: rollPieces.length - pieces.length,
                                        pending: pieces.filter(p => !p.status || p.status === 'PENDING').length,
                                        approved: pieces.filter(p => p.status === 'APPROVED').length,
                                        partRejected: pieces.filter(p => +p.rejected_component_count > 0 && isOpen(p)).length,
                                    };
                                })
                                .sort((a, b) => (parseInt(a.rollId, 10) || 0) - (parseInt(b.rollId, 10) || 0));
                            const active = rolls.find(r => r.rollId === String(activeRollId))
                                || rolls.find(r => r.pending > 0) || rolls[0];

                            // By size, then garment number. Size Mode numbers garments per
                            // SIZE, so the same number exists once in every size — tiles are
                            // grouped under size headings and carry the size.
                            const sizeKey = (sz) => { const n = parseFloat(sz); return Number.isFinite(n) ? n : Infinity; };
                            const sortedPieces = active ? [...active.pieces].sort((a, b) =>
                                sizeKey(a.size) - sizeKey(b.size) || String(a.size).localeCompare(String(b.size))
                                || (a.piece_sequence ?? 0) - (b.piece_sequence ?? 0)) : [];
                            const sizeGroups = sortedPieces.reduce((acc, p) => {
                                const last = acc[acc.length - 1];
                                if (last && last.size === p.size) last.pieces.push(p); else acc.push({ size: p.size, pieces: [p] });
                                return acc;
                            }, []);
                            const partRejectedPieces = sortedPieces.filter(p => +p.rejected_component_count > 0 && isOpen(p));
                            // Visible garments that still have something open upstream (e.g.
                            // already worked here before BF finished) — a note, not a block.
                            const unclearedOpen = sortedPieces.filter(p => p.uncleared_parts && isOpen(p));
                            const unclearedStage = active?.rollPieces.find(p => p.uncleared_stage)?.uncleared_stage || 'previous stage';
                            const drawerOpen = !!(garment || isPieceLoading || dnaDefect);

                            return (
                            <div className="flex-1 min-h-0 flex flex-col gap-2 animate-in slide-in-from-right-8">
                                {/* Batch header — one row */}
                                <div className="shrink-0 bg-white rounded-2xl px-3 py-2 shadow-sm border border-slate-200 flex flex-wrap items-center gap-2">
                                    <button onClick={() => { setSelectedBatch(null); setGarment(null); setSelectedPiece(null); setActiveRollId(null); }}
                                        className="flex items-center text-slate-500 hover:text-indigo-600 font-bold text-xs px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                                        <ArrowLeft size={14} className="mr-1" /> Batches
                                    </button>
                                    <span className="font-black text-slate-900 truncate max-w-[40%]">{selectedBatch.product_name}</span>
                                    <span className="text-indigo-600 font-black text-xs uppercase tracking-widest">{selectedBatch.batch_id}</span>
                                    {selectedBatch.priority && <PriorityChip priority={selectedBatch.priority} size="xs" />}
                                    <div className="ml-auto flex gap-1.5 flex-wrap">
                                        {partRejected > 0 && <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-300">{partRejected} with rejected parts</span>}
                                        <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">{approved} Approved</span>
                                        <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">{pending} Pending</span>
                                        {rework > 0 && <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">{rework} Rework</span>}
                                        {rejected > 0 && <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">{rejected} Rejected</span>}
                                        {waitingCount > 0 && <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-slate-50 text-slate-400 border border-dashed border-slate-300">{waitingCount} waiting for {waitingStage}</span>}
                                    </div>
                                </div>

                                {/* Roll tabs — one roll shown at a time */}
                                <div className="shrink-0 flex gap-2 overflow-x-auto pb-1">
                                    {rolls.map(r => {
                                        const on = active && r.rollId === active.rollId;
                                        return (
                                            <button key={r.rollId} onClick={() => setActiveRollId(r.rollId)}
                                                className={`shrink-0 text-left px-3 py-2 rounded-xl border-2 transition-all ${on ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-400'}`}>
                                                <div className="flex items-center gap-1.5">
                                                    <Layers size={13} className={on ? 'text-indigo-200' : 'text-indigo-500'} />
                                                    <span className="font-black text-sm">Roll #{r.rollId}</span>
                                                    {r.partRejected > 0 && <span className={`text-[10px] font-black px-1.5 rounded ${on ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700'}`}>✗{r.partRejected}</span>}
                                                </div>
                                                <div className={`text-[10px] font-bold mt-0.5 ${on ? 'text-indigo-100' : 'text-slate-400'}`}>
                                                    {r.pending} pending · {r.approved}/{r.pieces.length} done{r.waiting > 0 ? ` · ${r.waiting} waiting` : ''}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Active roll: notes + tile grid (the only area that scrolls) */}
                                {active && (
                                    <div className="flex-1 min-h-0 bg-white rounded-2xl p-3 shadow-sm border border-slate-200 flex flex-col">
                                        {(active.waiting > 0 || partRejectedPieces.length > 0 || unclearedOpen.length > 0) && (
                                            <div className="shrink-0 flex items-center gap-1.5 mb-2 flex-wrap">
                                                {active.waiting > 0 && (
                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-dashed border-slate-300">
                                                        {active.waiting} waiting for {unclearedStage}
                                                    </span>
                                                )}
                                                {unclearedOpen.length > 0 && (
                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                                                        ⚠ {unclearedOpen.length} not cleared at {unclearedStage}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        {/* Visible (not hover — tablets) list of which part was rejected where */}
                                        {partRejectedPieces.length > 0 && (
                                            <div className="shrink-0 mb-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                                {partRejectedPieces.map(g => (
                                                    <span key={g.id} className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-rose-300 text-rose-800">
                                                        <span className="font-black font-mono">#{g.piece_sequence}</span>
                                                        <span className="text-slate-500"> · size {g.size}</span>
                                                        {(g.rejected_components || []).map((rc, i) => (
                                                            <span key={i}> · <span className="font-black uppercase">{rc.part_name}</span> rejected{rc.detected_line ? ` @ ${rc.detected_line}` : ''}{rc.defect_desc ? ` — ${rc.defect_desc}` : ''}</span>
                                                        ))}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className={`flex-1 min-h-0 overflow-y-auto pr-1 ${drawerOpen ? 'pb-56' : ''}`}>
                                            {sortedPieces.length === 0 ? (
                                                <p className="py-10 text-center text-sm font-bold text-slate-400">No garments available on this roll yet.</p>
                                            ) : (
                                            <div className="space-y-3">
                                            {sizeGroups.map(group => (
                                            <div key={group.size}>
                                            <p className="text-xs font-black uppercase tracking-widest text-violet-700 mb-1.5">
                                                Size {group.size} <span className="text-slate-400 normal-case tracking-normal">· {group.pieces.length} garment{group.pieces.length !== 1 ? 's' : ''}</span>
                                            </p>
                                            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}>
                                                {group.pieces.map(piece => {
                                                    const st = piece.status;
                                                    const isSelected = selectedPiece?.id === piece.id;
                                                    let cls = "bg-white border-slate-200 text-slate-500 hover:border-indigo-400 hover:shadow-md";
                                                    let icon = <Clock size={12} className="opacity-40" />;
                                                    if (st === 'APPROVED') { cls = "bg-emerald-50 border-emerald-300 text-emerald-600"; icon = <CheckCircle2 size={12} />; }
                                                    else if (st === 'QC_REJECTED') { cls = "bg-rose-50 border-rose-300 text-rose-600 hover:border-rose-500"; icon = <X size={12} />; }
                                                    else if (st === 'NEEDS_REWORK') { cls = "bg-amber-50 border-amber-300 text-amber-700 hover:border-amber-500"; icon = <Hammer size={12} />; }
                                                    // A part of this garment was rejected at an earlier stage —
                                                    // the garment can't pass assembly (DNA block) until replaced.
                                                    const rejectedParts = (isOpen(piece) && +piece.rejected_component_count > 0)
                                                        ? [...new Set((piece.rejected_components || []).map(rc => rc.part_name))] : [];
                                                    if (rejectedParts.length > 0) { cls = "bg-rose-50 border-rose-400 border-dashed text-rose-700 hover:border-rose-600"; icon = <X size={12} />; }
                                                    // Warning only: parts not cleared at the previous stage (still processable).
                                                    const unclearedWarn = rejectedParts.length === 0 && isOpen(piece) && piece.uncleared_parts;
                                                    if (unclearedWarn) cls += " border-amber-400 border-dashed";
                                                    if (isSelected) cls += " ring-2 ring-indigo-500 ring-offset-1";

                                                    const tooltipLines = [
                                                        `UID: ${piece.garment_uid}`,
                                                        `Status: ${st || 'PENDING'}`,
                                                        piece.active_garment_defect_count > 0 ? `Defects: ${piece.active_garment_defect_count}` : null,
                                                        piece.garment_defects?.length > 0 ? piece.garment_defects.map(d => d.description || d.defect_description).join(', ') : null,
                                                    ].filter(Boolean).join('\n');

                                                    const isLoadingThis = isPieceLoading && selectedPiece?.id === piece.id;
                                                    return (
                                                        <button
                                                            key={piece.id}
                                                            title={tooltipLines}
                                                            onClick={() => handlePieceClick(piece)}
                                                            disabled={isPieceLoading}
                                                            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border-2 transition-all active:scale-95 disabled:cursor-wait ${cls}`}
                                                        >
                                                            <span className="font-black text-base leading-none">{piece.piece_sequence}</span>
                                                            <span className="text-[9px] font-black text-slate-400 leading-none mt-0.5 mb-1">S {piece.size}</span>
                                                            {isLoadingThis ? <RefreshCw size={12} className="animate-spin" /> : icon}
                                                            {rejectedParts.length > 0 && (
                                                                <span className="mt-1 text-[9px] font-black uppercase leading-tight text-rose-700 truncate max-w-full">{rejectedParts.join(', ')} ✗</span>
                                                            )}
                                                            {unclearedWarn && (
                                                                <span className="mt-1 text-[9px] font-black uppercase leading-tight text-amber-700 truncate max-w-full">{piece.uncleared_parts} ⚠</span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            </div>
                                            ))}
                                            </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* DNA DEFECT DRAWER — batch mode */}
            {viewMode === 'BATCH' && dnaDefect && (
                <div className="fixed bottom-0 left-0 right-0 z-[200] animate-in slide-in-from-bottom-4 duration-200">
                    <div className="max-w-6xl mx-auto px-4 pb-4">
                        <div className="bg-white rounded-[2rem] shadow-2xl border-2 border-rose-300 overflow-hidden">
                            <div className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center shrink-0">
                                            <ShieldAlert size={20} className="text-rose-500" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">DNA Defect</p>
                                            <p className="font-black text-slate-900 text-sm leading-snug">{dnaDefect.message}</p>
                                            {dnaDefect.garment && <p className="font-mono text-xs text-indigo-400 mt-0.5">{dnaDefect.garment.garment_uid}</p>}
                                        </div>
                                    </div>
                                    <button onClick={() => setDnaDefect(null)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-all ml-4 shrink-0">
                                        <X size={16} className="text-slate-600" />
                                    </button>
                                </div>
                                {dnaDefect.garment?.components?.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {dnaDefect.garment.components.map((comp, i) => (
                                            <div key={i} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${comp.has_active_defect ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                                                {comp.has_active_defect ? <X size={10} strokeWidth={3}/> : <Check size={10} strokeWidth={3}/>}
                                                {comp.part_name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {dnaDefect.garment?.garment_id && (
                                    <div className="flex justify-end mt-3">
                                        <button onClick={() => handleQaOverrideApprove(dnaDefect.garment.garment_id, dnaDefect.garment.garment_uid)} disabled={isProcessingAction}
                                            className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-black rounded-xl hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50">
                                            QA override: approve garment
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* FIXED BOTTOM DRAWER — piece action panel (BATCH mode) */}
            {viewMode === 'BATCH' && (garment || isPieceLoading) && garment?.qc_status !== STATUS.APPROVED && (
                <div className="fixed bottom-0 left-0 right-0 z-[200] animate-in slide-in-from-bottom-4 duration-200">
                    <div className="max-w-6xl mx-auto px-4 pb-4">
                        <div className="bg-white rounded-[2rem] shadow-2xl border-2 border-indigo-200 overflow-hidden">
                            {isPieceLoading && !garment ? (
                                <div className="flex items-center justify-center py-8 gap-3 text-indigo-500">
                                    <RefreshCw size={20} className="animate-spin" />
                                    <span className="font-black text-sm uppercase tracking-widest">Loading piece...</span>
                                </div>
                            ) : garment ? (
                                <div className="p-5 md:p-6">
                                    {/* Header row */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Selected Piece</span>
                                            <h3 className="text-xl font-black text-slate-900 leading-tight">{garment.garment_uid}</h3>
                                            <p className="text-slate-500 font-bold text-xs mt-0.5">
                                                Size {garment.size}
                                                {garment.current_active_location && <span className="ml-2 text-indigo-400">· {garment.current_active_location}</span>}
                                            </p>
                                            {(garment.fabric_color_number || garment.fabric_color_name || garment.fabric_roll_id != null || garment.fabric_color_id != null) && (
                                                <p className="mt-1 text-[10px] font-mono text-slate-400 flex flex-wrap gap-x-2">
                                                    {(garment.fabric_color_number || garment.fabric_color_name) && (
                                                        <span className="text-slate-600 font-bold">{[garment.fabric_color_number, garment.fabric_color_name].filter(Boolean).join(' · ')}</span>
                                                    )}
                                                    {garment.fabric_roll_id != null && <span>· Roll #{garment.fabric_roll_id}</span>}
                                                    {garment.fabric_color_id != null && <span>· FC {garment.fabric_color_id}</span>}
                                                </p>
                                            )}
                                        </div>
                                        <button onClick={() => { setGarment(null); setSelectedPiece(null); }}
                                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all ml-4 shrink-0">
                                            <X size={16} className="text-slate-600" />
                                        </button>
                                    </div>

                                    {/* Stage chain — compact horizontal */}
                                    {garment.stage_progress && (
                                        <div className="mb-4">
                                            <StageProgressStepper stages={garment.stage_progress} />
                                        </div>
                                    )}

                                    {/* Component map — compact horizontal */}
                                    {garment.components?.length > 0 && (
                                        <div className="flex gap-2 flex-wrap mb-4">
                                            {garment.components.map((comp, i) => (
                                                <div key={i} className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${comp.has_active_defect ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                                    {comp.has_active_defect ? <X size={10} strokeWidth={3} /> : <Check size={10} strokeWidth={3} />}
                                                    {comp.part_name}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* QC note */}
                                    {garment.qc_status && garment.qc_status !== 'CLEAN' && (
                                        <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800">
                                            QC: {garment.qc_status}
                                            {garment.garment_defects?.length > 0 && (
                                                <span className="ml-1.5 text-amber-600">· {garment.garment_defects.map(d => d.description || d.defect_description).join(', ')}</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => handleAction(STATUS.APPROVED)}
                                            disabled={isProcessingAction || garment.components?.some(c => c.has_active_defect)}
                                            className="flex-1 bg-emerald-600 text-white rounded-2xl py-3 font-black text-sm flex flex-col items-center justify-center gap-0.5 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                        >
                                            <div className="flex items-center gap-2"><ShieldCheck size={16} /> APPROVE</div>
                                            {selectedBatch?.batch_id && (
                                                <span className="text-[10px] font-black opacity-75 tracking-widest font-mono">{selectedBatch.batch_id}</span>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => setShowDefectModal('REWORK')}
                                            disabled={isProcessingAction}
                                            className="flex-1 bg-amber-500 text-white rounded-2xl py-3.5 font-black text-sm flex items-center justify-center gap-2 hover:bg-amber-600 active:scale-95 disabled:opacity-40 transition-all"
                                        >
                                            <Hammer size={16} /> REWORK
                                        </button>
                                        <button
                                            onClick={() => setShowDefectModal('REJECT')}
                                            disabled={isProcessingAction}
                                            className="flex-1 bg-rose-600 text-white rounded-2xl py-3.5 font-black text-sm flex items-center justify-center gap-2 hover:bg-rose-700 active:scale-95 disabled:opacity-40 transition-all"
                                        >
                                            <X size={16} /> REJECT
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* DEFECT DICTIONARY MODAL */}
            {showDefectModal && (() => {
                const isReworkModal = showDefectModal === 'REWORK';
                const accentBg = isReworkModal ? 'bg-amber-500' : 'bg-rose-600';
                const accentText = isReworkModal ? 'text-amber-600' : 'text-rose-600';
                const targetStatus = STATUS[isReworkModal ? 'REWORK' : 'REJECT'];

                const q = defectSearch.trim().toLowerCase();
                const categories = [...new Set(defectCodes.map(c => c.category).filter(Boolean))].sort();
                const filtered = defectCodes.filter(c =>
                    (!selectedDefectCategory || c.category === selectedDefectCategory) &&
                    (!q || c.code?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q) || c.category?.toLowerCase().includes(q))
                );

                const toggleDefect = (id) => {
                    setSelectedDefectIds(prev => {
                        const next = new Set(prev);
                        next.has(id) ? next.delete(id) : next.add(id);
                        return next;
                    });
                };

                const closeModal = () => {
                    setShowDefectModal(null);
                    setDefectSearch('');
                    setSelectedDefectCategory(null);
                    setSelectedDefectIds(new Set());
                };

                const confirmSelection = () => {
                    if (selectedDefectIds.size === 0) return;
                    handleAction(targetStatus, [...selectedDefectIds]);
                    closeModal();
                };

                return (
                    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[300] flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in">
                        <div className="bg-white w-full max-w-3xl sm:rounded-[2rem] rounded-t-[2rem] overflow-hidden shadow-2xl flex flex-col h-[95dvh] sm:h-[92vh]">
                            {/* Compact header */}
                            <div className={`px-4 py-3 ${accentBg} text-white shrink-0`}>
                                {/* Row 1: label + UID + close */}
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="font-black text-sm uppercase tracking-widest opacity-90">{showDefectModal}</span>
                                    {garment && (
                                        <span className="bg-white/20 rounded-lg px-2 py-0.5 font-mono font-black text-xs tracking-wide">
                                            {garment.garment_uid} · Sz {garment.size}
                                        </span>
                                    )}
                                    <button onClick={closeModal} className="ml-auto p-1.5 bg-white/20 rounded-full hover:bg-white/30 transition-colors"><X size={14} /></button>
                                </div>
                                {/* Row 2: search */}
                                <input
                                    type="text"
                                    value={defectSearch}
                                    onChange={e => setDefectSearch(e.target.value)}
                                    placeholder="Search defect…"
                                    autoFocus
                                    className="w-full bg-white/20 placeholder-white/50 text-white font-bold text-sm px-3 py-2 rounded-xl outline-none border border-white/20 focus:border-white/60 transition-colors"
                                />
                                {/* Row 3: category chips */}
                                {categories.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        <button
                                            onClick={() => setSelectedDefectCategory(null)}
                                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide transition-all border ${!selectedDefectCategory ? 'bg-white text-slate-900 border-white' : 'bg-white/15 text-white border-white/30 hover:bg-white/25'}`}
                                        >All</button>
                                        {categories.map(cat => (
                                            <button
                                                key={cat}
                                                onClick={() => setSelectedDefectCategory(prev => prev === cat ? null : cat)}
                                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide transition-all border ${selectedDefectCategory === cat ? 'bg-white text-slate-900 border-white' : 'bg-white/15 text-white border-white/30 hover:bg-white/25'}`}
                                            >{cat}</button>
                                        ))}
                                    </div>
                                )}
                                {/* Row 4: selected chips (only when something picked) */}
                                {selectedDefectIds.size > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/20">
                                        {[...selectedDefectIds].map(id => {
                                            const c = defectCodes.find(x => x.id === id);
                                            return c ? (
                                                <span key={id} className="inline-flex items-center gap-1 bg-white/25 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                                                    {c.code || c.description}
                                                    <button onClick={() => toggleDefect(id)} className="hover:opacity-70"><X size={10} /></button>
                                                </span>
                                            ) : null;
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Codes grid — takes all remaining space */}
                            <div className="p-3 grid grid-cols-2 md:grid-cols-3 gap-2 overflow-y-auto custom-scrollbar flex-1">
                                {filtered.length === 0 ? (
                                    <div className="col-span-full py-10 text-center text-slate-400 font-bold">No matching defect codes.</div>
                                ) : filtered.map(code => {
                                    const isSelected = selectedDefectIds.has(code.id);
                                    return (
                                        <button
                                            key={code.id}
                                            onClick={() => toggleDefect(code.id)}
                                            className={`p-3 text-left border-2 rounded-2xl transition-all active:scale-95 ${
                                                isSelected
                                                    ? `${isReworkModal ? 'border-amber-400 bg-amber-50' : 'border-rose-400 bg-rose-50'}`
                                                    : 'border-slate-100 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-1.5 mb-1">
                                                {code.code && <span className={`font-mono text-[10px] font-black px-1.5 py-0.5 rounded ${isSelected ? accentText + ' bg-white' : 'text-indigo-500 bg-indigo-50'}`}>{code.code}</span>}
                                                {isSelected && <span className={`ml-auto text-[10px] font-black ${accentText}`}>✓</span>}
                                            </div>
                                            <span className={`font-bold text-sm leading-tight line-clamp-2 ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>{code.description}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Compact confirm footer */}
                            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
                                <button onClick={closeModal} className="px-4 py-2 text-slate-500 font-bold hover:text-slate-700 transition-colors text-sm">
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmSelection}
                                    disabled={selectedDefectIds.size === 0}
                                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-white text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isReworkModal ? 'bg-amber-500 hover:bg-amber-600' : 'bg-rose-600 hover:bg-rose-700'}`}
                                >
                                    Confirm {showDefectModal}
                                    {selectedDefectIds.size > 0 && (
                                        <span className="bg-white/25 text-xs px-2 py-0.5 rounded-full">{selectedDefectIds.size}</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* WORK LOG MODAL */}
            {showModal && (
                <WorkLogModal
                    workData={workData}
                    loading={loadingWork}
                    onClose={() => setShowModal(false)}
                    onDateChange={handleModalDateChange}
                    onExport={downloadCSV}
                />
            )}

            {/* MANUAL OVERRIDE (Preserved, only shows in SCANNER mode) */}
            {viewMode === 'SCANNER' && (
                <div className="fixed bottom-8 left-0 right-0 flex justify-center px-4 pointer-events-none">
                    <div className="pointer-events-auto flex flex-col items-center">
                        {showManualBox && (
                            <div className="mb-4 w-full max-w-md bg-white p-4 rounded-3xl shadow-2xl border-2 border-indigo-100 animate-in slide-in-from-bottom-4">
                                <form onSubmit={handleManualSubmit} className="flex gap-2">
                                    <input 
                                        ref={manualInputRef}
                                        value={manualInput}
                                        onChange={(e) => setManualInput(e.target.value)}
                                        placeholder="Enter Sequence Manually..."
                                        className="flex-1 px-5 py-3 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-lg"
                                    />
                                    <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black hover:bg-indigo-700 transition-all">
                                        LOAD
                                    </button>
                                </form>
                            </div>
                        )}
                        <button 
                            onClick={toggleManualBox}
                            className={`flex items-center px-6 py-3 rounded-full font-black text-xs tracking-widest transition-all shadow-lg border-2 ${
                                showManualBox 
                                ? 'bg-rose-50 border-rose-100 text-rose-600' 
                                : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
                            }`}
                        >
                            {showManualBox ? <><X size={16} className="mr-2" /> CLOSE OVERRIDE</> : <><Maximize size={16} className="mr-2" /> MANUAL ENTRY</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AssemblyProcessingPortal;