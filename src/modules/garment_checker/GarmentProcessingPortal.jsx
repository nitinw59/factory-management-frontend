import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    QrCode, ShieldCheck, ShieldAlert, Check, X,
    Hammer, AlertCircle, ArrowLeft, Package, CheckCircle2,
    RefreshCw, Maximize, HardDrive, List, Barcode, Clock, Layers,
    ThumbsUp, FileText, Download, ChevronRight, Loader2,
} from 'lucide-react';
import { assemblyApi } from '../../api/assemblyApi';

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
const fmtTime = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso; }
};
function mergeWorkData(data) {
    if (!data) return [];
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
        const batches = {};
        merged.forEach(row => {
            const bKey = row.batch_id ?? 'Unknown';
            const rKey = `Roll #${row.fabric_roll_id ?? 'Unknown'}`;
            if (!batches[bKey]) batches[bKey] = {};
            if (!batches[bKey][rKey]) batches[bKey][rKey] = [];
            batches[bKey][rKey].push(row);
        });
        return Object.entries(batches)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([bKey, rolls]) => [bKey, Object.entries(rolls).sort(([a], [b]) => a.localeCompare(b))]);
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
                                const batchRows = rolls.flatMap(([, rows]) => rows);
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
                                                {rolls.map(([rollKey, rollRows]) => {
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
                                                                <table className="w-full text-xs border-t border-gray-100">
                                                                    <tbody>
                                                                        {rollRows.map((r, i) => (
                                                                            <tr key={i} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${r._type==='defect'?'bg-amber-50/40':''}`}>
                                                                                <td className="px-3 py-1.5 font-mono text-gray-400 whitespace-nowrap">{fmtTime(r.time)}</td>
                                                                                <td className="px-3 py-1.5 text-gray-600 capitalize">{r.part_name}</td>
                                                                                <td className="px-3 py-1.5 text-gray-500">Sz {r.size}</td>
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
                                                            <td className="px-3 py-1.5 font-semibold text-gray-800 whitespace-nowrap">{r.batch_id}</td>
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
    REJECT: 'QC_REJECTED'
};

const AssemblyProcessingPortal = () => {
    // --- STATE MANAGEMENT ---
    const [viewMode, setViewMode] = useState('SCANNER'); // NEW: 'SCANNER' or 'BATCH'
    
    // Core Scan State
    const [garment, setGarment] = useState(null);
    const [mismatch, setMismatch] = useState(null);
    const [dnaDefect, setDnaDefect] = useState(null);
    const [defectCodes, setDefectCodes] = useState([]);
    const [showDefectModal, setShowDefectModal] = useState(null); 
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessingAction, setIsProcessingAction] = useState(false);
    const [error, setError] = useState(null);
    const [lastAction, setLastAction] = useState(null);
    const [defectSearch, setDefectSearch] = useState('');
    
    // Batch Mode State
    const [activeBatches, setActiveBatches] = useState([]);
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [batchPieces, setBatchPieces] = useState([]);

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
    const playFeedback = (type) => {
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
            setDefectCodes(defectsRes.data);
            setActiveBatches(monitorRes.data.activeBatches || []);

            console.log("Defedsddct Codes:", defectsRes.data);
            console.log("Monitocvs Data:", monitorRes.data);
        } catch (e) {
            console.error("Failed to load portal data.", e);
        }
    }, []);

    useEffect(() => { loadRequiredData(); }, [loadRequiredData]);

    const loadStats = useCallback(async () => {
        try { const res = await assemblyApi.getCheckerStats(); setStats(res.data); }
        catch (err) { popApiError(err.response?.data?.error || err.message || 'Failed to load stats'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        loadStats();
        const iv = setInterval(loadStats, STATS_REFRESH_MS);
        return () => clearInterval(iv);
    }, [loadStats]);

    const fetchWork = useCallback(async (date) => {
        setLoadingWork(true);
        try { const res = await assemblyApi.getTodayWork(date); setWorkData(res.data); }
        catch (err) { setWorkData(null); popApiError(err.response?.data?.error || err.message || 'Failed to load work log'); }
        finally { setLoadingWork(false); }
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
        setIsLoading(true);
        setSelectedBatch(batch);
        try {
            const res = await assemblyApi.getBatchGarments(batch.batch_id);
            setBatchPieces(res.data);
        } catch (e) {
            alert("Failed to load pieces for this batch.");
            setSelectedBatch(null);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePieceClick = async (piece) => {
        setIsPieceLoading(true);
        setError(null);
        setGarment(null);
        setSelectedPiece(piece);
        try {
            const res = await assemblyApi.getGarmentDetails(piece.garment_uid);
            setGarment(res.data);
            playFeedback('success');
        } catch (err) {
            playFeedback('error');
            const status = err.response?.status;
            const errData = err.response?.data;
            if (status === 400 && errData?.error === "DNA Defect") {
                setDnaDefect(errData);
            } else {
                setError(errData?.message || errData?.error || "Failed to load piece.");
            }
            setSelectedPiece(null);
        } finally {
            setIsPieceLoading(false);
        }
    };

    // --- CORE SCAN PROCESSING ---
    const processScan = async (uid) => {
        if (isLoading || isProcessingAction) return;

        const cleanUid = uid.trim();

        if (viewMode !== 'SCANNER') setViewMode('SCANNER');

        setIsLoading(true);
        setError(null);
        setMismatch(null);
        setDnaDefect(null);
        setGarment(null);
        setScannedTextVisual(cleanUid);

        try {
            const res = await assemblyApi.getGarmentDetails(cleanUid);
            setGarment(res.data);
            playFeedback('success');
            setScannedTextVisual('');
        } catch (err) {
            const status = err.response?.status;
            const errData = err.response?.data;
            playFeedback('error');
            if (status === 403 && errData?.error === "Batch Mismatch") {
                setMismatch(errData);
            } else if (status === 400 && errData?.error === "DNA Defect") {
                setDnaDefect(errData);
            } else {
                setError(errData?.message || errData?.error || "Invalid Scan: Check Barcode Integrity.");
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
            if (isProcessingAction || showManualBox) return;

            const now = Date.now();
            const gap = now - lastKeyStrokeAt.current;

            // QR codes via Retsol D 5015 need 120ms gap threshold (wider than Code 128)
            if (gap > 120 && scanBuffer.current.length > 0) {
                scanBuffer.current = '';
            }

            if (e.key === 'Enter') {
                if (scanBuffer.current.length > 3) {
                    processScan(scanBuffer.current);
                }
                scanBuffer.current = '';
            } else if (e.key.length === 1) {
                scanBuffer.current += e.key;
            }

            lastKeyStrokeAt.current = now;
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [garment, mismatch, isLoading, isProcessingAction, showManualBox, viewMode]);

    // --- FINAL ACTIONS ---
    const handleAction = async (status, defectCodeId = null) => {
        if (isProcessingAction) return;
        setIsProcessingAction(true);
        try {
            const detectedAtLineId =
                garment.current_production_line_id ??
                selectedBatch?.line_id ??
                null;

            await assemblyApi.processGarmentStatus({
                garmentId: garment.garment_id,
                status,
                defectCodeId,
                detected_at_line_id: detectedAtLineId
            });
            setLastAction({ uid: garment.garment_uid, status });
            setGarment(null);
            setShowDefectModal(null);
            setSelectedPiece(null);
            playFeedback('success');

            // If in batch mode, refresh the batch pieces so status updates live
            if (viewMode === 'BATCH' && selectedBatch) {
                const res = await assemblyApi.getBatchGarments(selectedBatch.batch_id);
                setBatchPieces(res.data);
            }
            loadRequiredData();

            setTimeout(() => setLastAction(null), 4000);
        } catch (err) {
            playFeedback('error');
            alert(err.response?.data?.error || "Transaction failed.");
        } finally {
            setIsProcessingAction(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-10 font-inter select-none">
            {/* Global Loader for Batch Selection only */}
            {isLoading && viewMode === 'BATCH' && !selectedBatch && (
                <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[500] flex items-center justify-center">
                    <RefreshCw className="w-10 h-10 animate-spin text-indigo-600" />
                </div>
            )}

            <div className="max-w-6xl mx-auto">
                
                {/* API ERROR BANNER */}
                {apiError && (
                    <div className="mb-4 flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2.5 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-2 text-sm font-bold">
                            <ShieldAlert size={16} className="shrink-0" />
                            <span>{apiError}</span>
                        </div>
                        <button onClick={() => setApiError(null)} className="p-1 hover:bg-rose-100 rounded-full transition-colors shrink-0">
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* STATS BAR */}
                <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-0.5">Pending Rework</p>
                        <p className="text-2xl font-black text-amber-700">{stats?.pending_rework ?? '—'}</p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-0.5">Today's Rework</p>
                        <p className="text-2xl font-black text-indigo-700">{stats?.today_rework ?? '—'}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-0.5">Today's Approved</p>
                        <p className="text-2xl font-black text-emerald-700">{stats?.today_approved ?? '—'}</p>
                    </div>
                    <button onClick={handleOpenModal}
                        className="bg-white border border-slate-200 rounded-2xl px-4 py-3 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left flex items-center gap-3">
                        <FileText size={20} className="text-indigo-500 shrink-0" />
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Work Log</p>
                            <p className="text-sm font-black text-slate-700">Today's Work</p>
                        </div>
                    </button>
                </div>

                {/* STATION HEADER WITH NEW TOGGLE */}
                <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg">
                            <HardDrive size={28} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Assembly Station</h1>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Live Validations</p>
                            </div>
                        </div>
                    </div>

                    {/* NEW: VIEW MODE TOGGLE */}
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                        <button 
                            onClick={() => { setViewMode('SCANNER'); setSelectedBatch(null); }}
                            className={`flex items-center px-6 py-3 rounded-xl font-black text-sm transition-all ${
                                viewMode === 'SCANNER' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            <Barcode size={18} className="mr-2" /> SCANNER
                        </button>
                        <button 
                            onClick={() => setViewMode('BATCH')}
                            className={`flex items-center px-6 py-3 rounded-xl font-black text-sm transition-all ${
                                viewMode === 'BATCH' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            <List size={18} className="mr-2" /> BATCH LIST
                        </button>
                    </div>

                    <div className="flex gap-3">
                        {lastAction && (
                            <div className="bg-emerald-50 text-emerald-700 px-6 py-3 rounded-2xl border-2 border-emerald-100 flex items-center font-black text-sm animate-in fade-in slide-in-from-right-4">
                                <CheckCircle2 className="w-5 h-5 mr-3" /> {lastAction.uid} {lastAction.status}
                            </div>
                        )}
                    </div>
                </header>

                {/* =========================================
                    MODE A: EXISTING SCANNER INTERFACE 
                ========================================= */}
                {viewMode === 'SCANNER' && (
                    <div className="animate-in fade-in zoom-in-95 duration-200">
                        
                        {/* IDLE SCAN STATE WITH SCANNED TEXT VISUAL */}
                        {!garment && !mismatch && !dnaDefect && (
                            <div className="text-center py-32 bg-white rounded-[3rem] border-4 border-dashed border-slate-200 shadow-inner">
                                <div className="relative inline-block mb-8">
                                    <QrCode size={140} className="text-slate-100" />
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
                                    <h2 className="text-4xl font-black text-slate-300 tracking-tighter uppercase">Ready for Scan</h2>
                                )}
                                
                                <p className="text-slate-400 font-bold mt-4 uppercase text-xs tracking-[0.2em]">Hardware Wedge Active • QR Code • Retsol D 5015</p>
                                
                                {error && (
                                    <div className="mt-12 max-w-md mx-auto p-5 bg-rose-50 border-2 border-rose-100 rounded-3xl text-rose-700 font-black flex items-center justify-center shadow-sm animate-in shake">
                                        <ShieldAlert className="mr-3 shrink-0" /> {error}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* DNA DEFECT BLOCK */}
                        {dnaDefect && (
                            <div className="bg-white border-[8px] border-rose-400 rounded-[4rem] p-12 shadow-2xl animate-in zoom-in-95">
                                <div className="flex flex-col items-center text-center mb-8">
                                    <div className="w-24 h-24 bg-rose-100 rounded-full flex items-center justify-center mb-6">
                                        <ShieldAlert className="w-14 h-14 text-rose-500" />
                                    </div>
                                    <h2 className="text-5xl font-black text-slate-900 tracking-tight mb-3">DNA DEFECT</h2>
                                    <p className="text-slate-500 text-xl font-bold max-w-xl">{dnaDefect.message}</p>
                                    {dnaDefect.garment && (
                                        <p className="mt-2 font-mono font-black text-indigo-500 text-lg">{dnaDefect.garment.garment_uid}</p>
                                    )}
                                </div>
                                {dnaDefect.garment?.components?.length > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-xl mx-auto mb-10">
                                        {dnaDefect.garment.components.map((comp, i) => (
                                            <div key={i} className={`px-4 py-3 rounded-2xl border-2 flex items-center gap-3 ${comp.has_active_defect ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-100'}`}>
                                                <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${comp.has_active_defect ? 'bg-rose-500 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
                                                    {comp.has_active_defect ? <X size={14} strokeWidth={3}/> : <Check size={14} strokeWidth={3}/>}
                                                </div>
                                                <span className={`font-bold text-sm ${comp.has_active_defect ? 'text-rose-700' : 'text-slate-600'}`}>{comp.part_name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="flex justify-center">
                                    <button onClick={() => setDnaDefect(null)} className="px-14 py-6 bg-slate-900 text-white font-black rounded-3xl hover:bg-black active:scale-95 transition-all shadow-xl">
                                        RETURN TO SCANNER
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* DEPARTMENT MISMATCH WARNING */}
                        {mismatch && (
                            <div className="bg-white border-[8px] border-amber-400 rounded-[4rem] p-16 text-center shadow-2xl animate-in zoom-in-95">
                                <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-8">
                                    <AlertCircle className="w-14 h-14 text-amber-500" />
                                </div>
                                <h2 className="text-5xl font-black text-slate-900 tracking-tight mb-4">WRONG LINE</h2>
                                <p className="text-slate-500 text-xl font-bold mb-12 max-w-xl mx-auto">{mismatch.message}</p>
                                <button onClick={() => setMismatch(null)} className="px-14 py-6 bg-slate-900 text-white font-black rounded-3xl hover:bg-black active:scale-95 transition-all shadow-xl">
                                    RETURN TO SCANNER
                                </button>
                            </div>
                        )}

                        {/* GARMENT VERIFICATION VIEW */}
                        {garment && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-10">
                                {/* LEFT: DNA COMPONENT MAP */}
                                <div className="lg:col-span-2 bg-white rounded-[3.5rem] shadow-xl border border-slate-200 overflow-hidden">
                                    <div className="bg-slate-900 p-10 text-white">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="bg-indigo-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">DNA OK</span>
                                                    <h2 className="text-4xl font-black tracking-tighter">{garment.garment_uid}</h2>
                                                </div>
                                                <p className="text-slate-400 font-bold text-lg">{garment.product_name}</p>
                                            </div>
                                            <div className="bg-white/10 px-6 py-3 rounded-2xl text-right">
                                                <span className="block text-[10px] font-bold opacity-50 mb-1">SIZE</span>
                                                <span className="text-3xl font-black">{garment.size}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-10">
                                        <div className="flex items-center justify-between mb-8">
                                            <h3 className="font-black text-slate-400 text-xs uppercase tracking-[0.2em] flex items-center">
                                                <Package className="w-4 h-4 mr-3" /> Component Integrity Map
                                            </h3>
                                            <span className="text-[10px] font-mono font-bold text-slate-300">ID: {garment.garment_id}</span>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {garment.components.map((comp, i) => (
                                                <div key={i} className={`p-6 rounded-[2rem] border-2 flex items-center justify-between transition-all ${comp.has_active_defect ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-sm ${comp.has_active_defect ? 'bg-rose-500 text-white' : 'bg-white text-slate-900'}`}>
                                                            {i + 1}
                                                        </div>
                                                        <span className="font-black text-slate-700 text-sm">{comp.part_name}</span>
                                                    </div>
                                                    {comp.has_active_defect ? <X className="text-rose-500" strokeWidth={4} /> : <Check className="text-emerald-500" strokeWidth={4} />}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT: COMMAND CONSOLE */}
                                <div className="flex flex-col gap-6">
                                    <button 
                                        onClick={() => handleAction(STATUS.APPROVED)}
                                        disabled={isProcessingAction || garment.components.some(c => c.has_active_defect)}
                                        className="flex-1 bg-emerald-600 text-white rounded-[3rem] shadow-2xl shadow-emerald-200/50 flex flex-col items-center justify-center p-10 hover:bg-emerald-700 transition-all active:scale-95 disabled:grayscale disabled:opacity-50 disabled:cursor-not-allowed group"
                                    >
                                        <ShieldCheck size={70} className="mb-4 group-hover:scale-110 transition-transform" />
                                        {garment.batch_id && (
                                            <span className="font-mono font-black text-8xl opacity-80 mb-1 tracking-wider">{garment.batch_id}</span>
                                        )}
                                        <span className="text-3xl font-black">APPROVE</span>
                                        <span className="text-[11px] font-bold opacity-60 mt-2 uppercase tracking-widest">Pass to Quality</span>
                                    </button>

                                    <div className="grid grid-cols-1 gap-4">
                                        <button 
                                            onClick={() => setShowDefectModal('REWORK')}
                                            disabled={isProcessingAction}
                                            className="bg-amber-500 text-white rounded-[2.5rem] shadow-xl shadow-amber-200/50 flex items-center justify-center p-8 hover:bg-amber-600 transition-all active:scale-95 group"
                                        >
                                            <Hammer size={32} className="mr-4 group-hover:rotate-12 transition-transform" />
                                            <span className="text-xl font-black">REWORK</span>
                                        </button>

                                        <button 
                                            onClick={() => setShowDefectModal('REJECT')}
                                            disabled={isProcessingAction}
                                            className="bg-rose-600 text-white rounded-[2.5rem] shadow-xl shadow-rose-200/50 flex items-center justify-center p-8 hover:bg-rose-700 transition-all active:scale-95 group"
                                        >
                                            <X size={32} className="mr-4 group-hover:scale-90 transition-transform" />
                                            <span className="text-xl font-black">REJECT</span>
                                        </button>
                                    </div>
                                    
                                    <button onClick={() => setGarment(null)} className="py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors uppercase text-xs tracking-widest">
                                        Cancel Scan
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* =========================================
                    MODE B: BATCH & PIECE SELECTION
                ========================================= */}
                {viewMode === 'BATCH' && (
                    <div className="animate-in fade-in duration-200 space-y-6">

                        {!selectedBatch ? (
                            <div className="w-full bg-white rounded-[3rem] p-8 md:p-12 shadow-sm border border-slate-200">
                                <h2 className="text-xl font-black text-slate-400 mb-8 uppercase tracking-widest flex items-center">
                                    <List className="mr-3" size={24}/> Select Active Batch
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {activeBatches.map(batch => {
                                        const approved = batch.approved_units ?? batch.completed_units ?? 0;
                                        const pending = (batch.total_units ?? 0) - (batch.completed_units ?? 0);
                                        const rejected = batch.rejected_units ?? batch.qc_rejected_units ?? 0;
                                        const total = batch.total_units ?? 0;
                                        return (
                                            <button
                                                key={batch.batch_id}
                                                onClick={() => handleBatchClick(batch)}
                                                className="bg-slate-50 p-8 rounded-[2rem] text-left border-2 border-slate-100 hover:border-indigo-500 hover:shadow-lg transition-all group"
                                            >
                                                <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-600 font-black text-[10px] uppercase rounded-lg mb-4">
                                                    {batch.batch_code}
                                                </span>
                                                <h3 className="text-2xl font-black text-slate-800 mb-5 group-hover:text-indigo-600 transition-colors">{batch.product_name}</h3>

                                                {/* Summary chips */}
                                                <div className="flex gap-2 flex-wrap mb-4">
                                                    <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700">{approved} Approved</span>
                                                    <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-slate-200 text-slate-600">{pending} Pending</span>
                                                    {rejected > 0 && <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700">{rejected} Rejected</span>}
                                                </div>

                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                                                        <span>Completion</span>
                                                        <span className="text-indigo-600">{batch.completed_units} / {total}</span>
                                                    </div>
                                                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
                                                        <div className="bg-emerald-500 h-full" style={{ width: `${total > 0 ? (approved/total)*100 : 0}%` }} />
                                                        <div className="bg-rose-400 h-full" style={{ width: `${total > 0 ? (rejected/total)*100 : 0}%` }} />
                                                    </div>
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
                        ) : (
                            <div className={`animate-in slide-in-from-right-8 space-y-6 ${garment ? 'pb-64' : ''}`}>
                                {/* Batch header */}
                                <div className="w-full bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-200">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <button onClick={() => { setSelectedBatch(null); setGarment(null); setSelectedPiece(null); }}
                                                className="flex items-center text-slate-400 hover:text-indigo-600 font-bold text-sm mb-3 transition-colors">
                                                <ArrowLeft size={16} className="mr-2" /> Back to Batches
                                            </button>
                                            <h2 className="text-2xl font-black text-slate-900">{selectedBatch.product_name}</h2>
                                            <p className="text-indigo-600 font-black text-sm uppercase tracking-widest mt-0.5">{selectedBatch.batch_code}</p>
                                        </div>
                                        {/* Summary */}
                                        {(() => {
                                            const approved = batchPieces.filter(p => p.status === 'APPROVED').length;
                                            const rejected = batchPieces.filter(p => p.status === 'QC_REJECTED').length;
                                            const rework = batchPieces.filter(p => p.status === 'NEEDS_REWORK').length;
                                            const pending = batchPieces.filter(p => !p.status || p.status === 'PENDING').length;
                                            return (
                                                <div className="flex gap-3 flex-wrap">
                                                    <span className="text-xs font-black px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">{approved} Approved</span>
                                                    <span className="text-xs font-black px-4 py-2 rounded-xl bg-slate-100 text-slate-600 border border-slate-200">{pending} Pending</span>
                                                    {rework > 0 && <span className="text-xs font-black px-4 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">{rework} Rework</span>}
                                                    {rejected > 0 && <span className="text-xs font-black px-4 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">{rejected} Rejected</span>}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Pieces grouped by roll */}
                                {(() => {
                                    const byRoll = batchPieces.reduce((acc, p) => {
                                        const key = p.fabric_roll_id || 'Unknown';
                                        if (!acc[key]) acc[key] = [];
                                        acc[key].push(p);
                                        return acc;
                                    }, {});
                                    return Object.entries(byRoll).map(([rollId, pieces]) => {
                                        const sortedPieces = [...pieces].sort((a, b) => (a.piece_sequence ?? 0) - (b.piece_sequence ?? 0));
                                        return (
                                        <div key={rollId} className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-200">
                                            <div className="flex items-center gap-3 mb-5">
                                                <Layers size={18} className="text-indigo-500" />
                                                <span className="font-black text-slate-700 uppercase tracking-widest text-sm">Roll #{rollId}</span>
                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{pieces.length} pcs</span>
                                            </div>
                                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
                                                {sortedPieces.map(piece => {
                                                    const st = piece.status;
                                                    const isSelected = selectedPiece?.id === piece.id;
                                                    let cls = "bg-white border-slate-200 text-slate-500 hover:border-indigo-400 hover:shadow-md";
                                                    let icon = <Clock size={12} className="opacity-40" />;
                                                    if (st === 'APPROVED') { cls = "bg-emerald-50 border-emerald-300 text-emerald-600"; icon = <CheckCircle2 size={12} />; }
                                                    else if (st === 'QC_REJECTED') { cls = "bg-rose-50 border-rose-300 text-rose-600 hover:border-rose-500"; icon = <X size={12} />; }
                                                    else if (st === 'NEEDS_REWORK') { cls = "bg-amber-50 border-amber-300 text-amber-700 hover:border-amber-500"; icon = <Hammer size={12} />; }
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
                                                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all active:scale-95 disabled:cursor-wait ${cls}`}
                                                        >
                                                            <span className="font-black text-base leading-none mb-1">{piece.piece_sequence}</span>
                                                            {isLoadingThis ? <RefreshCw size={12} className="animate-spin" /> : icon}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        );
                                    });
                                })()}

                            </div>
                        )}
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
                                            <div key={i} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${comp.has_active_defect ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                                {comp.has_active_defect ? <X size={10} strokeWidth={3}/> : <Check size={10} strokeWidth={3}/>}
                                                {comp.part_name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* FIXED BOTTOM DRAWER — piece action panel (BATCH mode) */}
            {viewMode === 'BATCH' && (garment || isPieceLoading) && (
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
                                        </div>
                                        <button onClick={() => { setGarment(null); setSelectedPiece(null); }}
                                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all ml-4 shrink-0">
                                            <X size={16} className="text-slate-600" />
                                        </button>
                                    </div>

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
                                            {selectedBatch?.batch_code && (
                                                <span className="text-[10px] font-black opacity-75 tracking-widest font-mono">{selectedBatch.batch_code}</span>
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
                const q = defectSearch.trim().toLowerCase();
                const filtered = defectCodes.filter(c =>
                    !q ||
                    c.code?.toLowerCase().includes(q) ||
                    c.description?.toLowerCase().includes(q) ||
                    c.category?.toLowerCase().includes(q)
                );
                return (
                    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[300] flex items-center justify-center p-6 animate-in fade-in">
                        <div className="bg-white w-full max-w-3xl rounded-[4rem] overflow-hidden shadow-2xl border border-white/20">
                            {/* Header */}
                            <div className={`px-10 pt-10 pb-6 ${showDefectModal === 'REWORK' ? 'bg-amber-500' : 'bg-rose-600'} text-white`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h2 className="text-3xl font-black tracking-tighter">SELECT REASON</h2>
                                        <p className="text-[10px] font-bold uppercase opacity-60 tracking-widest mt-1">Classification: {showDefectModal}</p>
                                    </div>
                                    <button onClick={() => { setShowDefectModal(null); setDefectSearch(''); }} className="p-3 bg-white/20 rounded-full hover:bg-white/30 transition-colors"><X /></button>
                                </div>
                                {/* Garment UID */}
                                {garment && (
                                    <div className="bg-white/15 rounded-2xl px-4 py-2 mb-4 inline-flex items-center gap-2">
                                        <Barcode size={14} className="opacity-70" />
                                        <span className="font-mono font-black text-sm tracking-wide">{garment.garment_uid}</span>
                                        <span className="opacity-60 text-xs font-bold">· Sz {garment.size}</span>
                                    </div>
                                )}
                                {/* Search */}
                                <input
                                    type="text"
                                    value={defectSearch}
                                    onChange={e => setDefectSearch(e.target.value)}
                                    placeholder="Search by code or description…"
                                    autoFocus
                                    className="w-full bg-white/20 placeholder-white/50 text-white font-bold text-sm px-4 py-2.5 rounded-2xl outline-none border border-white/20 focus:border-white/60 transition-colors"
                                />
                            </div>
                            {/* Codes grid */}
                            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto custom-scrollbar">
                                {filtered.length === 0 ? (
                                    <div className="col-span-full py-10 text-center text-slate-400 font-bold">No matching defect codes.</div>
                                ) : filtered.map(code => (
                                    <button
                                        key={code.id}
                                        onClick={() => { handleAction(STATUS[showDefectModal === 'REWORK' ? 'REWORK' : 'REJECT'], code.id); setDefectSearch(''); }}
                                        className="p-6 text-left border-2 border-slate-50 bg-slate-50/30 rounded-3xl hover:border-indigo-500 hover:bg-indigo-50 transition-all group active:scale-95"
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            {code.code && <span className="font-mono text-xs font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-lg">{code.code}</span>}
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{code.category}</span>
                                        </div>
                                        <span className="font-bold text-slate-800 text-base leading-tight group-hover:text-indigo-900">{code.description}</span>
                                    </button>
                                ))}
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