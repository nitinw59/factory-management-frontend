import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { lineLoaderApi } from '../../api/lineLoaderApi';
import { Link } from 'react-router-dom';
import Modal from '../../shared/Modal';
import {
    Loader, CheckCircle2, X,
    Package, FileText, ExternalLink,
    ArrowLeft, Layers,
    AlertTriangle, ArrowRight, Zap
} from 'lucide-react';

// ============================================================================
// UTILITIES
// ============================================================================
const Spinner = () => (
    <div className="flex justify-center items-center p-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
    </div>
);

// ============================================================================
// LINE SELECTION MODAL
// ============================================================================
// readyRolls: array of roll objects { roll_id, meter, fabric_type, color_name, ... }
const LineSelectionModal = ({ batchId, cycleFlow, currentLineId, readyRolls = [], onClose, onSave, wipMap }) => {
    const [step, setStep] = useState('line');
    const [lines, setLines] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedLine, setSelectedLine] = useState(currentLineId ? String(currentLineId) : '');
    const [selectedRollIds, setSelectedRollIds] = useState(() => new Set(readyRolls.map(r => String(r.roll_id))));

    useEffect(() => {
        lineLoaderApi.getLinesByType(cycleFlow.line_type_id)
            .then(res => setLines(res.data || []))
            .catch(err => console.error("Failed to fetch lines", err))
            .finally(() => setIsLoading(false));
    }, [cycleFlow.line_type_id]);

    const selectedLineName = lines.find(l => String(l.id) === String(selectedLine))?.name || '';
    const lineWip = selectedLine ? wipMap[String(selectedLine)] : null;
    const isAlreadyOnThisLine = String(selectedLine) === String(currentLineId);
    const isWipBlocked = lineWip?.isAtCapacity && !isAlreadyOnThisLine;

    const selectedRollObjects = readyRolls.filter(r => selectedRollIds.has(String(r.roll_id)));
    const selectedCount = selectedRollObjects.length;
    const selectedMeters = selectedRollObjects.reduce((sum, r) => sum + parseFloat(r.meter || 0), 0).toFixed(2);

    const toggleRoll = (rollId) => setSelectedRollIds(prev => {
        const next = new Set(prev);
        if (next.has(String(rollId))) next.delete(String(rollId)); else next.add(String(rollId));
        return next;
    });

    const toggleAll = () => {
        if (selectedRollIds.size === readyRolls.length) setSelectedRollIds(new Set());
        else setSelectedRollIds(new Set(readyRolls.map(r => String(r.roll_id))));
    };

    const handleFinalConfirm = async () => {
        await onSave({ batchId, cycleFlowId: cycleFlow.id, lineId: selectedLine, selectedRollIds: selectedRollObjects.map(r => r.roll_id) });
    };

    if (isLoading) return <Spinner />;

    // ── Step 1: Line ────────────────────────────────────────────────────────
    if (step === 'line') return (
        <div className="p-2">
            <h3 className="text-base font-black mb-4 text-slate-800 flex items-center gap-2">
                Assign Stage:
                <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm uppercase tracking-wide">{cycleFlow.line_type_name}</span>
                <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-sm font-black">{readyRolls.length} rolls ready</span>
            </h3>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Choose Production Line</label>
                <select value={selectedLine} onChange={e => setSelectedLine(e.target.value)}
                    className={`w-full p-3 border-2 rounded-xl bg-white focus:ring-4 outline-none font-bold text-slate-700 transition-all cursor-pointer shadow-sm appearance-none
                        ${isWipBlocked ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-50' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-50'}`}>
                    <option value="">-- Select line --</option>
                    {lines.map(line => {
                        const wip = wipMap[String(line.id)];
                        return <option key={line.id} value={line.id}>{wip ? `${line.name}  (WIP: ${wip.currentWip}/${wip.wipLimit})` : line.name}</option>;
                    })}
                </select>
                {selectedLine && lineWip && (
                    <div className={`mt-2 flex items-center text-xs font-bold px-2.5 py-1.5 rounded-md border w-fit ${isWipBlocked ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {isWipBlocked ? <AlertTriangle size={12} className="mr-1.5" /> : <CheckCircle2 size={12} className="mr-1.5" />}
                        Line Load: {lineWip.currentWip} / {lineWip.wipLimit} batches
                        {isWipBlocked && <span className="ml-2 bg-rose-200 text-rose-800 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest">At Limit</span>}
                        {lineWip.isAtCapacity && isAlreadyOnThisLine && <span className="ml-2 bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest">Existing — Bypassed</span>}
                    </div>
                )}
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button onClick={onClose} className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm active:scale-95">Cancel</button>
                <button onClick={() => setStep('rolls')} disabled={!selectedLine || isWipBlocked}
                    className="px-6 py-3 bg-slate-800 text-white rounded-xl hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-md font-bold text-sm active:scale-95">
                    Select Rolls →
                </button>
            </div>
        </div>
    );

    // ── Step 2: Roll selection ──────────────────────────────────────────────
    if (step === 'rolls') return (
        <div className="p-2">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-black text-slate-800">
                    Select Rolls <span className="text-sm font-bold text-slate-500">→ {selectedLineName}</span>
                </h3>
                <button onClick={toggleAll} className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-3 py-2 rounded-xl active:scale-95">
                    {selectedRollIds.size === readyRolls.length ? 'Deselect All' : 'Select All'}
                </button>
            </div>
            <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-1">
                {readyRolls.length === 0 ? (
                    <div className="bg-slate-50 rounded-xl p-8 border-2 border-dashed border-slate-200 text-center">
                        <p className="text-sm font-bold text-slate-500">No rolls ready for this stage.</p>
                    </div>
                ) : readyRolls.map(roll => {
                    const isSelected = selectedRollIds.has(String(roll.roll_id));
                    return (
                        <div key={roll.roll_id} onClick={() => toggleRoll(roll.roll_id)}
                            className={`flex justify-between items-center p-3.5 rounded-xl border-2 cursor-pointer transition-all select-none
                                ${isSelected ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20' : 'bg-white border-slate-200 hover:border-blue-300'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                                    {isSelected && <CheckCircle2 size={12} className="text-white" />}
                                </div>
                                <div>
                                    <span className={`font-black text-sm block ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>Roll #{roll.roll_id}</span>
                                    <span className="text-xs text-slate-500">{roll.fabric_type} · {roll.color_name} · {roll.color_number}</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${isSelected ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{roll.meter}m</span>
                                {roll.primary_pieces_cut > 0 && <span className="text-[10px] text-slate-400 font-bold">{roll.primary_pieces_cut} pcs</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between items-center pt-4 mt-3 border-t border-slate-200">
                <span className="text-sm font-bold text-slate-500">{selectedCount} selected · <span className="font-black text-slate-800">{selectedMeters}m</span></span>
                <div className="flex gap-3">
                    <button onClick={() => setStep('line')} className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm flex items-center active:scale-95">
                        <ArrowLeft size={14} className="mr-1.5" /> Back
                    </button>
                    <button onClick={() => setStep('confirm')} disabled={selectedCount === 0}
                        className="px-6 py-3 bg-slate-800 text-white rounded-xl hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-md font-bold text-sm active:scale-95">
                        Review →
                    </button>
                </div>
            </div>
        </div>
    );

    // ── Step 3: Confirm ─────────────────────────────────────────────────────
    return (
        <div className="p-2">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 text-center mb-5">
                <h4 className="text-blue-900 font-black text-lg mb-1">Confirm Dispatch</h4>
                <p className="text-blue-700 font-medium text-sm">These rolls will be activated on the selected line.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Target Line</span>
                    <span className="text-base font-black text-slate-800">{selectedLineName}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Payload</span>
                    <span className="text-base font-black text-blue-600">{selectedCount} Rolls <span className="text-sm font-bold text-slate-500">({selectedMeters}m)</span></span>
                </div>
            </div>
            <div className="mb-5">
                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rolls to Dispatch</h5>
                <div className="max-h-[30vh] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-inner">
                    {selectedRollObjects.map(roll => (
                        <div key={roll.roll_id} className="p-3 text-sm flex justify-between items-center">
                            <div>
                                <span className="font-bold text-slate-800 block">Roll #{roll.roll_id}</span>
                                <span className="text-xs text-slate-500">{roll.fabric_type} · {roll.color_name} · {roll.color_number}</span>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className="font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md">{roll.meter}m</span>
                                {roll.primary_pieces_cut > 0 && <span className="text-[10px] text-slate-400">{roll.primary_pieces_cut} pcs</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button onClick={() => setStep('rolls')} className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm flex items-center active:scale-95">
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <button onClick={handleFinalConfirm} className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-md font-bold text-sm flex items-center active:scale-95">
                    <CheckCircle2 size={18} className="mr-2" /> Confirm & Dispatch
                </button>
            </div>
        </div>
    );
};

// ============================================================================
// STAGE DETAIL MODAL
// ============================================================================
const RollRow = ({ roll, badge, badgeClass }) => (
    <div className="flex justify-between items-center p-3 text-sm border-b border-slate-100 last:border-0">
        <div>
            <span className="font-bold text-slate-800 block">Roll #{roll.roll_id}</span>
            <span className="text-xs text-slate-500">{roll.fabric_type} · {roll.color_name} · {roll.color_number}</span>
        </div>
        <div className="flex items-center gap-2">
            {roll.primary_pieces_cut > 0 && <span className="text-[10px] text-slate-400 font-bold">{roll.primary_pieces_cut} pcs</span>}
            <span className="font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md text-xs">{roll.meter}m</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${badgeClass}`}>{badge}</span>
        </div>
    </div>
);

const StageDetailModal = ({ stage, progress, onClose, onAssign, readyRolls }) => {
    const wipRolls = progress?.wip_roll_ids ?? [];
    const completedRolls = progress?.completed_roll_ids ?? [];
    const dispatchedRolls = progress?.dispatched_roll_ids ?? [];
    const summary = progress?.roll_summary ?? {};

    const sections = [
        { label: 'In Progress (WIP)', rolls: wipRolls, badge: 'WIP', badgeClass: 'bg-blue-100 text-blue-700' },
        { label: 'Completed — Ready to Forward', rolls: completedRolls.filter(r => !dispatchedRolls.find(d => d.roll_id === r.roll_id)), badge: 'READY', badgeClass: 'bg-amber-100 text-amber-700' },
        { label: 'Forwarded to Next Stage', rolls: dispatchedRolls, badge: 'FORWARDED', badgeClass: 'bg-emerald-100 text-emerald-700' },
    ].filter(s => s.rolls.length > 0);

    return (
        <div className="p-2">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{stage.line_type_name}</h3>
                    {progress?.line_name && <p className="text-sm font-bold text-slate-500 mt-0.5">{progress.line_name}</p>}
                </div>
                <button onClick={onClose} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all">
                    <X size={18} className="text-slate-600" />
                </button>
            </div>

            {/* Summary chips */}
            {progress && (
                <div className="flex flex-wrap gap-2 mb-5">
                    <span className="text-xs font-black px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">WIP: {summary.wip ?? wipRolls.length}</span>
                    <span className="text-xs font-black px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">Completed: {summary.completed ?? completedRolls.length}</span>
                    <span className="text-xs font-black px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">Forwarded: {summary.dispatched_forward ?? dispatchedRolls.length}</span>
                    <span className="text-xs font-black px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">Total on Line: {summary.total_on_line ?? wipRolls.length + completedRolls.length}</span>
                </div>
            )}

            {/* Roll sections */}
            {!progress ? (
                <div className="bg-slate-50 rounded-xl p-8 border-2 border-dashed border-slate-200 text-center mb-5">
                    <p className="text-sm font-bold text-slate-500">Stage not yet activated.</p>
                </div>
            ) : sections.length === 0 ? (
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 text-center mb-5">
                    <p className="text-sm font-bold text-slate-500">No rolls on this stage yet.</p>
                </div>
            ) : (
                <div className="space-y-4 mb-5 max-h-[45vh] overflow-y-auto pr-1">
                    {sections.map(({ label, rolls, badge, badgeClass }) => (
                        <div key={label} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                                <span className="text-xs font-black uppercase tracking-widest text-slate-500">{label} ({rolls.length})</span>
                            </div>
                            {rolls.map(roll => <RollRow key={roll.roll_id} roll={roll} badge={badge} badgeClass={badgeClass} />)}
                        </div>
                    ))}
                </div>
            )}

            {/* Assign button if rolls are ready */}
            {readyRolls.length > 0 && onAssign && (
                <div className="pt-4 border-t border-slate-200">
                    <button onClick={onAssign}
                        className="w-full py-3 bg-slate-900 text-white font-black rounded-xl hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-widest">
                        <Zap size={16} /> Assign {readyRolls.length} Roll{readyRolls.length !== 1 ? 's' : ''} to Line
                    </button>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// STAGE NODE
// ============================================================================
const StageNode = ({ stage, progress, totalRolls, readyRolls, wipMap, isFirst, onActivate, onCheckComplete, isCheckingComplete }) => {
    // completed_roll_ids: finished at this stage, ready to move forward
    // dispatched_roll_ids: finished here AND already assigned to next stage
    const completedIds = progress?.completed_roll_ids ?? [];
    const dispatchedIds = progress?.dispatched_roll_ids ?? [];
    const rollsCompleted = completedIds.length;
    const rollsDispatched = dispatchedIds.length;
    const isComplete = progress?.status === 'COMPLETED';
    const isActive = !isComplete && !!progress;
    const canActivate = isFirst ? true : readyRolls > 0;

    let state;
    if (isComplete) state = 'COMPLETE';
    else if (isActive) state = 'ACTIVE';
    else if (canActivate) state = 'ACTIVATABLE';
    else state = 'LOCKED';

    const pctCompleted = totalRolls > 0 ? (rollsCompleted / totalRolls) * 100 : 0;
    const pctDispatched = totalRolls > 0 ? (rollsDispatched / totalRolls) * 100 : 0;

    const lineWip = progress?.line_id ? wipMap[String(progress.line_id)] : null;

    const stateConfig = {
        COMPLETE:    { ring: 'ring-emerald-400',  bg: 'bg-emerald-50',  header: 'bg-emerald-600', headerText: 'text-white',    label: 'COMPLETE',    labelBg: 'bg-emerald-100 text-emerald-800' },
        ACTIVE:      { ring: 'ring-blue-400',     bg: 'bg-blue-50',     header: 'bg-blue-600',    headerText: 'text-white',    label: 'ACTIVE',      labelBg: 'bg-blue-100 text-blue-800' },
        ACTIVATABLE: { ring: 'ring-amber-400',    bg: 'bg-amber-50',    header: 'bg-slate-800',   headerText: 'text-white',    label: 'READY',       labelBg: 'bg-amber-100 text-amber-800' },
        LOCKED:      { ring: 'ring-slate-200',    bg: 'bg-slate-50',    header: 'bg-slate-300',   headerText: 'text-slate-500', label: 'WAITING',    labelBg: 'bg-slate-100 text-slate-500' },
    };
    const cfg = stateConfig[state];

    const handleClick = () => {
        if (state === 'LOCKED') return;
        onActivate();
    };

    return (
        <div
            onClick={handleClick}
            className={`relative flex flex-col rounded-2xl border-2 overflow-hidden transition-all ring-2 ${cfg.ring} ${cfg.bg} min-w-[180px] w-[200px] shrink-0
                ${state !== 'LOCKED' ? 'cursor-pointer hover:scale-[1.02] hover:shadow-lg active:scale-100' : 'cursor-default opacity-60'}
                ${state === 'ACTIVATABLE' ? 'animate-pulse-border' : ''}`}
        >
            {/* Header */}
            <div className={`${cfg.header} ${cfg.headerText} px-3 py-2 flex justify-between items-center`}>
                <span className="font-black text-xs uppercase tracking-widest truncate">{stage.line_type_name}</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${cfg.labelBg}`}>{cfg.label}</span>
            </div>

            {/* Body */}
            <div className="p-3 flex flex-col gap-2 flex-1">
                {/* Line name */}
                {progress?.line_name ? (
                    <span className="text-sm font-black text-slate-800 truncate">{progress.line_name}</span>
                ) : (
                    <span className="text-sm font-bold text-slate-400 italic">No line assigned</span>
                )}

                {/* WIP badge */}
                {lineWip && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border w-fit
                        ${lineWip.isAtCapacity ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        WIP {lineWip.currentWip}/{lineWip.wipLimit}
                        {lineWip.isAtCapacity && <span className="ml-1">⚠</span>}
                    </span>
                )}

                {/* Progress bar: green=completed, blue=dispatched-forward, grey=remaining */}
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Rolls</span>
                        <span className="text-[10px] font-black text-slate-700">{rollsCompleted}/{totalRolls} done</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden flex">
                        <div className={`h-full ${state === 'COMPLETE' ? 'bg-emerald-500' : 'bg-emerald-400'} transition-all`} style={{ width: `${pctCompleted}%` }} />
                        <div className="h-full bg-blue-300 transition-all" style={{ width: `${pctDispatched}%` }} />
                    </div>
                    {rollsCompleted > 0 && rollsDispatched < rollsCompleted && (
                        <span className="text-[10px] text-amber-600 font-bold mt-0.5 block">{rollsCompleted - rollsDispatched} ready to forward</span>
                    )}
                    {rollsDispatched > 0 && (
                        <span className="text-[10px] text-blue-500 font-bold mt-0.5 block">{rollsDispatched} forwarded</span>
                    )}
                </div>

                {/* CTA hint */}
                {state === 'ACTIVATABLE' && (
                    <div className="flex items-center text-[10px] font-black text-amber-700 mt-1">
                        <Zap size={10} className="mr-1" /> {readyRolls} roll{readyRolls !== 1 ? 's' : ''} ready — tap to activate
                    </div>
                )}
                {state === 'ACTIVE' && (
                    <div className="flex items-center text-[10px] font-black text-blue-600 mt-1">
                        <Loader size={10} className="mr-1 animate-spin" /> In progress — tap to add rolls
                    </div>
                )}

                {/* Check & Complete button — only on ACTIVE stages */}
                {state === 'ACTIVE' && onCheckComplete && (
                    <button
                        onClick={e => { e.stopPropagation(); onCheckComplete(); }}
                        disabled={isCheckingComplete}
                        className="mt-1 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg border-2 border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isCheckingComplete
                            ? <><Loader size={10} className="animate-spin" /> Checking...</>
                            : <><CheckCircle2 size={10} /> Check &amp; Complete</>
                        }
                    </button>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// CONNECTOR BETWEEN STAGES
// ============================================================================
const StageConnector = ({ readyRolls }) => (
    <div className="flex flex-col items-center justify-center shrink-0 gap-1 px-1">
        <ArrowRight size={20} className={readyRolls > 0 ? 'text-amber-500' : 'text-slate-300'} />
        {readyRolls > 0 && (
            <span className="text-[10px] font-black bg-amber-400 text-black px-2 py-0.5 rounded-full whitespace-nowrap">
                {readyRolls} ready
            </span>
        )}
    </div>
);

// ============================================================================
// BATCH PIPELINE CARD
// ============================================================================
const BatchPipelineCard = ({ batch, wipMap, onAssign, onRefresh }) => {
    const [modalData, setModalData] = useState(null);
    const [detailData, setDetailData] = useState(null); // { stage, progress, readyRolls }
    const [checkingStageId, setCheckingStageId] = useState(null);

    const cycleFlow = batch.cycle_flow || [];
    const progressMap = useMemo(() => {
        const map = {};
        (batch.progress || []).forEach(p => { map[p.product_cycle_flow_id] = p; });
        return map;
    }, [batch.progress]);

    // Returns array of roll OBJECTS ready to be dispatched to stage[i]
    // all_roll_ids and completed/dispatched_roll_ids are now full roll objects
    const getReadyRolls = (stageIndex) => {
        if (stageIndex === 0) return batch.all_roll_ids || [];
        const prevStage = cycleFlow[stageIndex - 1];
        const prevProgress = progressMap[prevStage.id];
        if (!prevProgress) return [];
        const completed = prevProgress.completed_roll_ids ?? [];
        const dispatched = prevProgress.dispatched_roll_ids ?? [];
        const dispatchedSet = new Set(dispatched.map(r => String(r.roll_id)));
        return completed.filter(r => !dispatchedSet.has(String(r.roll_id)));
    };

    const handleOpenDetail = (stageIndex) => {
        const cf = cycleFlow[stageIndex];
        const progress = progressMap[cf.id] ?? null;
        const readyRolls = getReadyRolls(stageIndex);
        setDetailData({ stage: cf, progress, readyRolls });
    };

    const handleActivate = (stageIndex) => {
        const cf = cycleFlow[stageIndex];
        const progress = progressMap[cf.id];
        const readyRolls = getReadyRolls(stageIndex);
        setDetailData(null);
        setModalData({ cycleFlow: cf, currentLineId: progress?.line_id ?? null, readyRolls });
    };

    const handleSave = async (data) => {
        await onAssign(data);
        setModalData(null);
    };

    const handleCheckComplete = async (stageId, productionLineId) => {
        setCheckingStageId(stageId);
        try {
            await lineLoaderApi.checkAndCompleteStage(batch.batch_id, productionLineId);
            await onRefresh();
        } catch (err) {
            alert(err.response?.data?.error || `Failed to check stage completion.`);
        } finally {
            setCheckingStageId(null);
        }
    };

    const completedStages = (batch.progress || []).filter(p => p.status === 'COMPLETED').length;
    const totalStages = batch.total_steps || cycleFlow.length || 1;
    // Use last active stage's completed roll count as the overall roll progress signal
    const lastProgress = [...(batch.progress || [])].sort((a, b) => b.sequence_no - a.sequence_no)[0];
    const overallCompletedRolls = lastProgress?.completed_roll_ids?.length ?? 0;
    const overallPct = batch.total_rolls > 0 ? Math.round((overallCompletedRolls / batch.total_rolls) * 100) : 0;

    return (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Batch header */}
            <div className="bg-slate-900 px-6 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-black text-white tracking-tight">BATCH #{batch.batch_id}</h2>
                        <span className="text-sm font-mono font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">{batch.batch_code}</span>
                    </div>
                    <p className="text-slate-400 font-medium text-sm mt-0.5">{batch.product_name}</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-500">Overall</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <div className="w-28 h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${overallPct}%` }} />
                            </div>
                            <span className="text-white font-black text-sm">{overallCompletedRolls}/{batch.total_rolls} rolls · {completedStages}/{totalStages} stages</span>
                        </div>
                    </div>
                    {batch.trim_orders?.length > 0 && (
                        <div className="flex gap-1.5">
                            {batch.trim_orders.map(to => (
                                <Link key={to.id} to={`/line-loader/trim-orders/${to.id}/summary`}
                                    className="flex items-center text-xs font-bold bg-purple-900 text-purple-300 px-2 py-1 rounded-lg border border-purple-700 hover:bg-purple-800 transition-colors"
                                    onClick={e => e.stopPropagation()}>
                                    <FileText size={11} className="mr-1" />#{to.id}<ExternalLink size={9} className="ml-1 opacity-50" />
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Pipeline */}
            <div className="p-6 overflow-x-auto">
                {cycleFlow.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-400 py-4">
                        <AlertTriangle size={16} className="text-amber-500" /> No production cycle configured for this batch.
                    </div>
                ) : (
                    <div className="flex items-center gap-0 min-w-max">
                        {cycleFlow.map((stage, i) => {
                            const readyRolls = getReadyRolls(i);
                            return (
                                <React.Fragment key={stage.id}>
                                    {i > 0 && <StageConnector readyRolls={readyRolls.length} />}
                                    <StageNode
                                        stage={stage}
                                        progress={progressMap[stage.id] ?? null}
                                        totalRolls={batch.total_rolls || 0}
                                        readyRolls={readyRolls.length}
                                        wipMap={wipMap}
                                        isFirst={i === 0}
                                        onActivate={() => handleOpenDetail(i)}
                                        onCheckComplete={() => handleCheckComplete(stage.id, progressMap[stage.id]?.line_id)}
                                        isCheckingComplete={checkingStageId === stage.id}
                                    />
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Stage detail panel */}
            {detailData && (
                <Modal title="" onClose={() => setDetailData(null)}>
                    <StageDetailModal
                        stage={detailData.stage}
                        progress={detailData.progress}
                        readyRolls={detailData.readyRolls}
                        onClose={() => setDetailData(null)}
                        onAssign={detailData.readyRolls.length > 0 ? () => handleActivate(cycleFlow.findIndex(cf => cf.id === detailData.stage.id)) : null}
                    />
                </Modal>
            )}

            {/* Line assignment modal */}
            {modalData && (
                <Modal title="" onClose={() => setModalData(null)}>
                    <LineSelectionModal
                        batchId={batch.batch_id}
                        cycleFlow={modalData.cycleFlow}
                        currentLineId={modalData.currentLineId}
                        readyRolls={modalData.readyRolls}
                        wipMap={wipMap}
                        onClose={() => setModalData(null)}
                        onSave={handleSave}
                    />
                </Modal>
            )}
        </div>
    );
};

// ============================================================================
// MAIN PAGE
// ============================================================================
const LineLoaderDashboardPage = () => {
    const [allBatches, setAllBatches] = useState([]);
    const [wipMap, setWipMap] = useState({}); // { lineId: { currentWip, wipLimit, isAtCapacity } }
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [dashRes, wipRes] = await Promise.all([
                lineLoaderApi.getDashboardData(),
                lineLoaderApi.getAllActiveLineWip().catch(() => ({ data: {} })) // non-fatal
            ]);

            console.log("Dashboard data:", dashRes.data);
            setAllBatches(dashRes.data || []);
            // wipRes.data expected: { [lineId]: { currentWip, wipLimit, isAtCapacity } }
            setWipMap(wipRes.data || {});
        } catch (err) {
            console.error("Failed to fetch dashboard data", err);
            setError("Could not load data. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleAssign = async (data) => {
        try {
            await lineLoaderApi.assignLineAndLogRolls(data);
            await fetchData();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to assign line. Please try again.');
        }
    };

    return (
        <div className="p-6 md:p-8 bg-slate-100 min-h-screen font-inter text-slate-800">
            <header className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Line Loader</h1>
                    <p className="text-slate-500 mt-1 font-medium text-sm">Track each batch through its production pipeline and assign lines per stage.</p>
                </div>
                <button onClick={fetchData} className="flex items-center gap-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 px-4 py-2.5 rounded-xl hover:bg-slate-50 shadow-sm active:scale-95 transition-all">
                    <Loader size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
                </button>
            </header>

            {isLoading ? <Spinner /> : error ? (
                <div className="p-4 bg-rose-50 text-rose-700 font-bold rounded-xl border border-rose-200 flex items-center gap-3">
                    <AlertTriangle size={18} /> {error}
                </div>
            ) : allBatches.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                    <Package className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                    <h3 className="text-lg font-black text-slate-700">No Active Batches</h3>
                    <p className="mt-1 text-sm font-medium text-slate-400">No batches are currently awaiting line assignment.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {allBatches.map(batch => (
                        <BatchPipelineCard key={batch.batch_id} batch={batch} wipMap={wipMap} onAssign={handleAssign} onRefresh={fetchData} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default LineLoaderDashboardPage;
