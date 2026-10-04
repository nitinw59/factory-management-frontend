import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { lineLoaderApi } from '../../api/lineLoaderApi';
import { Link } from 'react-router-dom';
import Modal from '../../shared/Modal';
import PriorityChip from '../../shared/PriorityChip';
import {
    Loader, CheckCircle2, X,
    Package, FileText, ExternalLink,
    ArrowLeft, Truck,
    AlertTriangle, ArrowRight, Zap,
    History, ChevronDown, ChevronUp, RefreshCw
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
const LineSelectionModal = ({ batchId, cycleFlow, currentLineId, readyRolls = [], onClose, onSave, wipMap, allStages = [] }) => {
    const [step, setStep] = useState('line');
    const [lines, setLines] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedLine, setSelectedLine] = useState(currentLineId ? String(currentLineId) : '');
    const [selectedRollIds, setSelectedRollIds] = useState(() => new Set(readyRolls.map(r => String(r.roll_id))));

    const [isAssemblyScope,   setIsAssemblyScope]   = useState(false);
    const [siblingStages,     setSiblingStages]     = useState([]);
    const [siblingLinesMap,   setSiblingLinesMap]   = useState({});
    const [assemblyOverrides, setAssemblyOverrides] = useState({});

    // Status of each ready roll at the stage it's coming FROM (the previous
    // stage in the cycle) — shown on all three steps.
    const prevStage = useMemo(() => {
        const ordered = [...allStages].sort((a, b) => a.sequence_no - b.sequence_no);
        const idx = ordered.findIndex(st => String(st.id) === String(cycleFlow.id));
        return idx > 0 ? ordered[idx - 1] : null;
    }, [allStages, cycleFlow.id]);
    const [prevQc, setPrevQc] = useState(null);
    const [prevQcLoading, setPrevQcLoading] = useState(false);
    useEffect(() => {
        if (!prevStage || !batchId) return;
        setPrevQcLoading(true);
        lineLoaderApi.getStageRollQc(batchId, prevStage.id)
            .then(res => setPrevQc(res.data))
            .catch(() => setPrevQc(null))
            .finally(() => setPrevQcLoading(false));
    }, [batchId, prevStage]);
    const qcFor = (rollId) => prevQc?.rolls?.[rollId];
    const qcUnit = prevQc?.unit || 'pieces';
    const readyTotals = useMemo(() => {
        if (!prevQc) return null;
        const t = { total: 0, approved: 0, repaired: 0, pending: 0, needs_rework: 0, rework_upstream: 0, rejected: 0 };
        readyRolls.forEach(r => { const q = prevQc.rolls?.[r.roll_id]; if (q) Object.keys(t).forEach(k => { t[k] += q[k]; }); });
        return t;
    }, [prevQc, readyRolls]);

    useEffect(() => {
        const init = async () => {
            try {
                const linesRes = await lineLoaderApi.getLinesByType(cycleFlow.line_type_id);
                setLines(linesRes.data || []);

                const isAssembly = cycleFlow.processing_scope === 'ASSEMBLY';
                setIsAssemblyScope(isAssembly);

                if (isAssembly) {
                    const siblings = allStages.filter(
                        s => s.id !== cycleFlow.id && s.processing_scope === 'ASSEMBLY'
                    );
                    setSiblingStages(siblings);

                    const results = await Promise.all(
                        siblings.map(s => lineLoaderApi.getLinesByType(s.line_type_id)
                            .then(r => ({ cfId: s.id, lines: r.data || [] })))
                    );
                    const linesMap = {};
                    results.forEach(({ cfId, lines: ls }) => { linesMap[cfId] = ls; });
                    setSiblingLinesMap(linesMap);

                    const overrides = {};
                    siblings.forEach(s => { overrides[s.id] = ''; });
                    setAssemblyOverrides(overrides);
                }
            } catch (err) {
                console.error('LineSelectionModal init failed', err);
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, [cycleFlow.line_type_id, cycleFlow.id, cycleFlow.processing_scope, allStages]);

    const selectedLineObj = lines.find(l => String(l.id) === String(selectedLine));
    const selectedLineName = selectedLineObj?.name || '';
    const isSelectedLineJobWork = selectedLineObj?.is_job_work === true;
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
        const payload = {
            batchId,
            cycleFlowId: cycleFlow.id,
            lineId: selectedLine,
            selectedRollIds: selectedRollObjects.map(r => r.roll_id),
        };
        if (isAssemblyScope && siblingStages.length > 0) {
            const overrides = {};
            Object.entries(assemblyOverrides).forEach(([cfId, lineId]) => {
                if (lineId) overrides[cfId] = Number(lineId);
            });
            if (Object.keys(overrides).length > 0) payload.assemblyLineOverrides = overrides;
        }
        await onSave(payload);
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
            {prevStage && readyRolls.length > 0 && (
                <div className="mb-5 border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-500">Status at {prevStage.line_type_name}</span>
                        {readyTotals && <RollQcBadge qc={readyTotals} unit={qcUnit} />}
                    </div>
                    <div className="max-h-[30vh] overflow-y-auto divide-y divide-slate-100">
                        {readyRolls.map(roll => (
                            <div key={roll.roll_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5">
                                <span className="font-black text-sm text-slate-800 w-28 shrink-0">Roll #{roll.roll_id}</span>
                                <RollQcBadge qc={qcFor(roll.roll_id)} unit={qcUnit} loading={prevQcLoading} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Choose Production Line</label>
                <select value={selectedLine} onChange={e => setSelectedLine(e.target.value)}
                    className={`w-full p-3 border-2 rounded-xl bg-white focus:ring-4 outline-none font-bold text-slate-700 transition-all cursor-pointer shadow-sm appearance-none
                        ${isWipBlocked ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-50' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-50'}`}>
                    <option value="">-- Select line --</option>
                    {lines.map(line => {
                        const wip = wipMap[String(line.id)];
                        const label = line.is_job_work ? `${line.name}  [External]` : line.name;
                        return <option key={line.id} value={line.id}>{wip ? `${label}  (WIP: ${wip.currentWip}/${wip.wipLimit})` : label}</option>;
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
                {isSelectedLineJobWork && (
                    <div className="mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-3.5 py-3">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-black text-amber-800 uppercase tracking-widest">External — Job Work Line</p>
                            <p className="text-[11px] text-amber-700 mt-0.5 font-medium">
                                Garments on this line go to an external vendor. The Production Manager must raise a challan after assignment.
                            </p>
                        </div>
                    </div>
                )}
            </div>
            {isAssemblyScope && siblingStages.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
                    <p className="text-xs font-black text-blue-700 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                        <Zap size={12} /> Co-Activate Assembly Stages
                    </p>
                    <p className="text-[11px] text-blue-500 mb-3 font-medium">
                        These stages activate simultaneously. Leave on "Auto" to let the system pick the lowest-WIP line.
                    </p>
                    <div className="space-y-3">
                        {siblingStages.map(sibling => (
                            <div key={sibling.id}>
                                <label className="block text-xs font-bold text-slate-600 mb-1">{sibling.line_type_name}</label>
                                <select
                                    value={assemblyOverrides[sibling.id] ?? ''}
                                    onChange={e => setAssemblyOverrides(prev => ({ ...prev, [sibling.id]: e.target.value }))}
                                    className="w-full p-2.5 border-2 border-slate-300 rounded-xl bg-white text-sm font-bold text-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none appearance-none"
                                >
                                    <option value="">Auto — Lowest WIP</option>
                                    {(siblingLinesMap[sibling.id] || []).map(line => (
                                        <option key={line.id} value={line.id}>{line.name}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
            )}
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
                                    {prevStage && <div className="mt-0.5"><RollQcBadge qc={qcFor(roll.roll_id)} unit={qcUnit} loading={prevQcLoading} /></div>}
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
            {isSelectedLineJobWork ? (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 text-center mb-5">
                    <h4 className="text-amber-900 font-black text-lg mb-1">Confirm Dispatch — External Line</h4>
                    <p className="text-amber-700 font-medium text-sm">Rolls will be assigned to an external job-work line. The Production Manager must raise a challan before garments leave the factory.</p>
                </div>
            ) : (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 text-center mb-5">
                    <h4 className="text-blue-900 font-black text-lg mb-1">Confirm Dispatch</h4>
                    <p className="text-blue-700 font-medium text-sm">These rolls will be activated on the selected line.</p>
                </div>
            )}
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
            {isAssemblyScope && siblingStages.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
                    <p className="text-xs font-black text-blue-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <Zap size={12} /> Co-Activated Stages
                    </p>
                    {siblingStages.map(s => {
                        const overrideLine = (siblingLinesMap[s.id] || []).find(l => String(l.id) === String(assemblyOverrides[s.id]));
                        return (
                            <div key={s.id} className="flex justify-between items-center text-sm py-1 border-b border-blue-100 last:border-0">
                                <span className="font-bold text-slate-700">{s.line_type_name}</span>
                                <span className="text-blue-600 font-black">{overrideLine?.name || 'Auto — Lowest WIP'}</span>
                            </div>
                        );
                    })}
                </div>
            )}
            <div className="mb-5">
                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rolls to Dispatch</h5>
                <div className="max-h-[30vh] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-inner">
                    {selectedRollObjects.map(roll => (
                        <div key={roll.roll_id} className="p-3 text-sm flex justify-between items-center">
                            <div>
                                <span className="font-bold text-slate-800 block">Roll #{roll.roll_id}</span>
                                <span className="text-xs text-slate-500">{roll.fabric_type} · {roll.color_name} · {roll.color_number}</span>
                                {prevStage && <div className="mt-0.5"><RollQcBadge qc={qcFor(roll.roll_id)} unit={qcUnit} loading={prevQcLoading} /></div>}
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
// SIZE SELECTION MODAL — MODE_2's dispatch unit is a SIZE (spanning every
// roll that carries it), not a roll. Mirrors LineSelectionModal's line →
// selection → confirm flow.
// ============================================================================
// readySizes: array of { size, rolls_completed, rolls_expected }
const SizeSelectionModal = ({ batchId, cycleFlow, currentLineId, readySizes = [], onClose, onSave, wipMap }) => {
    const [step, setStep] = useState('line');
    const [lines, setLines] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedLine, setSelectedLine] = useState(currentLineId ? String(currentLineId) : '');
    const [selectedSizes, setSelectedSizes] = useState(() => new Set(readySizes.map(s => String(s.size))));

    useEffect(() => {
        const init = async () => {
            try {
                const linesRes = await lineLoaderApi.getLinesByType(cycleFlow.line_type_id);
                setLines(linesRes.data || []);
            } catch (err) {
                console.error('SizeSelectionModal init failed', err);
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, [cycleFlow.line_type_id]);

    const selectedLineObj = lines.find(l => String(l.id) === String(selectedLine));
    const selectedLineName = selectedLineObj?.name || '';
    const isSelectedLineJobWork = selectedLineObj?.is_job_work === true;
    const lineWip = selectedLine ? wipMap[String(selectedLine)] : null;
    const isAlreadyOnThisLine = String(selectedLine) === String(currentLineId);
    const isWipBlocked = lineWip?.isAtCapacity && !isAlreadyOnThisLine;

    const selectedSizeObjects = readySizes.filter(s => selectedSizes.has(String(s.size)));
    const selectedCount = selectedSizeObjects.length;

    const toggleSize = (size) => setSelectedSizes(prev => {
        const next = new Set(prev);
        if (next.has(String(size))) next.delete(String(size)); else next.add(String(size));
        return next;
    });

    const toggleAll = () => {
        if (selectedSizes.size === readySizes.length) setSelectedSizes(new Set());
        else setSelectedSizes(new Set(readySizes.map(s => String(s.size))));
    };

    const handleFinalConfirm = async () => {
        await onSave({
            batchId,
            cycleFlowId: cycleFlow.id,
            lineId: selectedLine,
            selectedSizes: selectedSizeObjects.map(s => s.size),
        });
    };

    if (isLoading) return <Spinner />;

    // ── Step 1: Line ────────────────────────────────────────────────────────
    if (step === 'line') return (
        <div className="p-2">
            <h3 className="text-base font-black mb-4 text-slate-800 flex items-center gap-2">
                Assign Stage:
                <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm uppercase tracking-wide">{cycleFlow.line_type_name}</span>
                <span className="px-2.5 py-1 bg-violet-100 text-violet-800 rounded-lg text-sm font-black">{readySizes.length} size{readySizes.length !== 1 ? 's' : ''} ready</span>
            </h3>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Choose Production Line</label>
                <select value={selectedLine} onChange={e => setSelectedLine(e.target.value)}
                    className={`w-full p-3 border-2 rounded-xl bg-white focus:ring-4 outline-none font-bold text-slate-700 transition-all cursor-pointer shadow-sm appearance-none
                        ${isWipBlocked ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-50' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-50'}`}>
                    <option value="">-- Select line --</option>
                    {lines.map(line => {
                        const wip = wipMap[String(line.id)];
                        const label = line.is_job_work ? `${line.name}  [External]` : line.name;
                        return <option key={line.id} value={line.id}>{wip ? `${label}  (WIP: ${wip.currentWip}/${wip.wipLimit})` : label}</option>;
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
                {isSelectedLineJobWork && (
                    <div className="mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-3.5 py-3">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-black text-amber-800 uppercase tracking-widest">External — Job Work Line</p>
                            <p className="text-[11px] text-amber-700 mt-0.5 font-medium">
                                Garments on this line go to an external vendor. The Production Manager must raise a challan after assignment.
                            </p>
                        </div>
                    </div>
                )}
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button onClick={onClose} className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm active:scale-95">Cancel</button>
                <button onClick={() => setStep('sizes')} disabled={!selectedLine || isWipBlocked}
                    className="px-6 py-3 bg-slate-800 text-white rounded-xl hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-md font-bold text-sm active:scale-95">
                    Select Sizes →
                </button>
            </div>
        </div>
    );

    // ── Step 2: Size selection ──────────────────────────────────────────────
    if (step === 'sizes') return (
        <div className="p-2">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-black text-slate-800">
                    Select Sizes <span className="text-sm font-bold text-slate-500">→ {selectedLineName}</span>
                </h3>
                <button onClick={toggleAll} className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-3 py-2 rounded-xl active:scale-95">
                    {selectedSizes.size === readySizes.length ? 'Deselect All' : 'Select All'}
                </button>
            </div>
            <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-1">
                {readySizes.length === 0 ? (
                    <div className="bg-slate-50 rounded-xl p-8 border-2 border-dashed border-slate-200 text-center">
                        <p className="text-sm font-bold text-slate-500">No sizes ready for this stage yet — a size becomes ready once it's complete on every roll that carries it.</p>
                    </div>
                ) : readySizes.map(sz => {
                    const isSelected = selectedSizes.has(String(sz.size));
                    return (
                        <div key={sz.size} onClick={() => toggleSize(sz.size)}
                            className={`flex justify-between items-center p-3.5 rounded-xl border-2 cursor-pointer transition-all select-none
                                ${isSelected ? 'bg-violet-50 border-violet-500 ring-2 ring-violet-500/20' : 'bg-white border-slate-200 hover:border-violet-300'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'bg-violet-600 border-violet-600' : 'border-slate-300'}`}>
                                    {isSelected && <CheckCircle2 size={12} className="text-white" />}
                                </div>
                                <span className={`font-black text-sm block ${isSelected ? 'text-violet-900' : 'text-slate-800'}`}>Size {sz.size}</span>
                            </div>
                            {sz.rolls_expected != null && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                                    {sz.rolls_completed}/{sz.rolls_expected} rolls done
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between items-center pt-4 mt-3 border-t border-slate-200">
                <span className="text-sm font-bold text-slate-500">{selectedCount} size{selectedCount !== 1 ? 's' : ''} selected</span>
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
            {isSelectedLineJobWork ? (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 text-center mb-5">
                    <h4 className="text-amber-900 font-black text-lg mb-1">Confirm Dispatch — External Line</h4>
                    <p className="text-amber-700 font-medium text-sm">These sizes will be assigned to an external job-work line. The Production Manager must raise a challan before garments leave the factory.</p>
                </div>
            ) : (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 text-center mb-5">
                    <h4 className="text-blue-900 font-black text-lg mb-1">Confirm Dispatch</h4>
                    <p className="text-blue-700 font-medium text-sm">Each size moves across every roll that carries it, together, onto the selected line.</p>
                </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Target Line</span>
                    <span className="text-base font-black text-slate-800">{selectedLineName}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Payload</span>
                    <span className="text-base font-black text-violet-600">{selectedCount} Size{selectedCount !== 1 ? 's' : ''}</span>
                </div>
            </div>
            <div className="mb-5">
                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Sizes to Dispatch</h5>
                <div className="max-h-[30vh] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-inner">
                    {selectedSizeObjects.map(sz => (
                        <div key={sz.size} className="p-3 text-sm flex justify-between items-center">
                            <span className="font-bold text-slate-800">Size {sz.size}</span>
                            {sz.rolls_expected != null && <span className="text-xs text-slate-500">{sz.rolls_completed}/{sz.rolls_expected} rolls</span>}
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button onClick={() => setStep('sizes')} className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm flex items-center active:scale-95">
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
// BATCH INFO BANNER  (shared by StageDetailModal + ChangeLineModal)
// ============================================================================
const BatchInfoBanner = ({ batch }) => {
    const isMode2 = batch.piece_sequencing_mode === 'MODE_2';

    return (
        <div className="bg-slate-900 rounded-xl px-4 py-2.5 mb-4">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-black text-sm tracking-tight">
                            BATCH #{batch.batch_id}
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                            {batch.batch_code}
                        </span>
                        {batch.priority && <PriorityChip priority={batch.priority} size="xs" />}
                        {isMode2 && (
                            <span className="text-[10px] font-black uppercase tracking-widest bg-violet-900 text-violet-300 px-2 py-0.5 rounded border border-violet-700">
                                Size Mode
                            </span>
                        )}
                    </div>
                    <p className="text-slate-400 text-xs font-medium mt-0.5">{batch.product_name}</p>
                </div>
                {batch.trim_orders?.length > 0 && (
                    <div className="flex gap-1 flex-wrap justify-end">
                        {batch.trim_orders.map(to => (
                            <span key={to.id} className="text-[10px] font-bold bg-purple-900 text-purple-300 px-2 py-0.5 rounded border border-purple-700">
                                TO #{to.id}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// CHANGE LINE MODAL
// ============================================================================
const ChangeLineModal = ({ batch, batchId, cycleFlow, currentLineId, currentLineName, wipMap, onClose, onSave }) => {
    const [lines, setLines]           = useState([]);
    const [isLoading, setIsLoading]   = useState(true);
    const [selectedLine, setSelectedLine] = useState('');
    const [isSaving, setIsSaving]     = useState(false);
    const [error, setError]           = useState('');

    useEffect(() => {
        lineLoaderApi.getLinesByType(cycleFlow.line_type_id)
            .then(res => setLines(res.data || []))
            .catch(() => setError('Failed to load lines.'))
            .finally(() => setIsLoading(false));
    }, [cycleFlow.line_type_id]);

    const selectedLineObj  = lines.find(l => String(l.id) === String(selectedLine));
    const lineWip          = selectedLine ? wipMap[String(selectedLine)] : null;
    const isSameLine       = String(selectedLine) === String(currentLineId);
    const isWipBlocked     = lineWip?.isAtCapacity && !isSameLine;
    const isJobWork        = selectedLineObj?.is_job_work === true;

    const handleConfirm = async () => {
        if (!selectedLine || isSameLine || isWipBlocked) return;
        setIsSaving(true);
        setError('');
        try {
            await onSave(Number(selectedLine));
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to change line.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-2">
            {batch && <BatchInfoBanner batch={batch} />}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-black text-slate-800">Change Production Line</h3>
                {currentLineName && (
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                        Current: {currentLineName}
                    </span>
                )}
            </div>

            {isLoading ? <Spinner /> : (
                <>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Select New Line
                        </label>
                        <select
                            value={selectedLine}
                            onChange={e => setSelectedLine(e.target.value)}
                            className={`w-full p-3 border-2 rounded-xl bg-white focus:ring-4 outline-none font-bold text-slate-700 transition-all cursor-pointer shadow-sm appearance-none
                                ${isWipBlocked ? 'border-rose-400 focus:ring-rose-50' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-50'}`}
                        >
                            <option value="">-- Select line --</option>
                            {lines.map(line => {
                                const wip   = wipMap[String(line.id)];
                                const label = line.is_job_work ? `${line.name}  [External]` : line.name;
                                const isCurrent = String(line.id) === String(currentLineId);
                                return (
                                    <option key={line.id} value={line.id}>
                                        {isCurrent ? `${label}  (current)` : wip ? `${label}  (WIP: ${wip.currentWip}/${wip.wipLimit})` : label}
                                    </option>
                                );
                            })}
                        </select>

                        {selectedLine && lineWip && (
                            <div className={`mt-2 flex items-center text-xs font-bold px-2.5 py-1.5 rounded-md border w-fit
                                ${isWipBlocked ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                {isWipBlocked ? <AlertTriangle size={12} className="mr-1.5" /> : <CheckCircle2 size={12} className="mr-1.5" />}
                                Line Load: {lineWip.currentWip} / {lineWip.wipLimit} batches
                                {isWipBlocked && <span className="ml-2 bg-rose-200 text-rose-800 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest">At Limit</span>}
                            </div>
                        )}

                        {isJobWork && (
                            <div className="mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-3.5 py-3">
                                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-black text-amber-800 uppercase tracking-widest">External — Job Work Line</p>
                                    <p className="text-[11px] text-amber-700 mt-0.5 font-medium">
                                        The Production Manager must raise a new challan after this change.
                                    </p>
                                </div>
                            </div>
                        )}

                        {isSameLine && selectedLine && (
                            <p className="mt-2 text-xs font-bold text-slate-400">This is the current line — select a different one.</p>
                        )}
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 font-medium">
                            All in-progress rolls will move to the new line. WIP counts will be updated automatically.
                        </p>
                    </div>

                    {error && (
                        <div className="mb-4 flex items-center gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                            <AlertTriangle size={13} /> {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                        <button onClick={onClose} className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm active:scale-95">
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={!selectedLine || isSameLine || isWipBlocked || isSaving}
                            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-md font-bold text-sm flex items-center gap-2 active:scale-95"
                        >
                            {isSaving ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            Confirm Change
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

// ============================================================================
// STAGE DETAIL MODAL
// ============================================================================
// A roll's sizes can now clear (and advance) independently of each other —
// size_progress.completed/total tells a supervisor "3 of 5 sizes done here"
// even while the roll as a whole still shows WIP; present < total means some
// sizes haven't even arrived from the previous stage yet (still in transit,
// not just slow).
const SizeProgressBadge = ({ sizeProgress }) => {
    if (!sizeProgress || sizeProgress.total <= 1) return null;
    const { present, completed, total } = sizeProgress;
    const arriving = present < total;
    return (
        <span
            className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full"
            title={arriving
                ? `${completed} of ${total} sizes done — ${total - present} still arriving from the previous stage`
                : `${completed} of ${total} sizes done`}
        >
            {completed}/{total} sizes{arriving ? ' · arriving' : ''}
        </span>
    );
};

// Per-size status pills — the count badge (SizeProgressBadge) says "1/6
// done", this says exactly which size(s): green = COMPLETED here, blue =
// still IN_PROGRESS, gray = any other/unexpected status. Only worth showing
// once a roll actually carries more than one size (MODE_2).
// Colour = status of that size on this line, matching the tabs: solid green
// = done here, yellow = in progress, dashed grey = not started yet.
const SIZE_PILL_STYLE = {
    COMPLETED:   'bg-emerald-500 text-white border-emerald-600',
    IN_PROGRESS: 'bg-yellow-100 text-yellow-900 border-yellow-400',
    PENDING:     'bg-white text-slate-400 border-slate-300 border-dashed',
    // Size of this roll that hasn't been assigned to this line yet (still at
    // an earlier stage) — shown so the row always lists every size.
    NOT_HERE:    'bg-slate-200 text-slate-400 border-slate-300',
};
const SIZE_PILL_FALLBACK = 'bg-slate-100 text-slate-500 border-slate-300';
// allSizes = every size the batch is cut in (batch.all_sizes); sizes this
// roll doesn't have on this line yet show grey, so the row always lists all.
const SizeBreakdownPills = ({ sizes, allSizes = [], className = 'mt-2' }) => {
    const here = new Map((sizes || []).map(sz => [String(sz.size), sz]));
    const order = allSizes.length ? allSizes.map(String) : [...here.keys()];
    here.forEach((_, k) => { if (!order.includes(k)) order.push(k); });
    if (order.length <= 1) return null;
    return (
        <div className={`flex flex-wrap gap-1 ${className}`}>
            {order.map(size => {
                const sz = here.get(size);
                const status = sz ? sz.status : 'NOT_HERE';
                return (
                    <span
                        key={size}
                        title={sz ? `Size ${size}: ${status.replace('_', ' ')}` : `Size ${size}: not on this line yet`}
                        className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${SIZE_PILL_STYLE[status] || SIZE_PILL_FALLBACK}`}
                    >
                        {status === 'COMPLETED' ? '✓ ' : ''}{size}
                    </span>
                );
            })}
        </div>
    );
};

// QC status of one roll at this stage (from getStageRollQc). Plain coloured
// text, no boxes — only the counts that need attention.
const QC_CHIPS = [
    { key: 'pending',         label: 'pending',        longLabel: 'pending',                 text: 'text-slate-500' },
    { key: 'needs_rework',    label: 'rework',         longLabel: 'needs rework',            text: 'text-amber-600' },
    { key: 'rework_upstream', label: 'earlier rework', longLabel: 'rework at earlier stage', text: 'text-orange-600' },
    { key: 'rejected',        label: 'rejected',       longLabel: 'rejected',                text: 'text-rose-600' },
    { key: 'rejected_upstream', label: 'rejected earlier', longLabel: 'rejected at earlier stage', text: 'text-rose-700' },
];

// Sum the attention counts of several roll/size QC entries (section headers).
const sumQc = (entries) => {
    const t = Object.fromEntries(QC_CHIPS.map(c => [c.key, 0]));
    entries.forEach(q => { if (q) QC_CHIPS.forEach(c => { t[c.key] += q[c.key] || 0; }); });
    return t;
};

const QcIssues = ({ counts, className = '', long = false }) => {
    const issues = QC_CHIPS.filter(c => counts[c.key] > 0);
    if (issues.length === 0) return null;
    return (
        <span className={`text-xs font-bold ${className}`}>
            {issues.map((c, i) => (
                <React.Fragment key={c.key}>
                    {i > 0 && <span className="text-slate-300"> · </span>}
                    <span className={c.text}>{counts[c.key]} {long ? c.longLabel : c.label}</span>
                </React.Fragment>
            ))}
        </span>
    );
};

// "72/77 pieces cleared" + only the counts needing attention, or a green
// "all checked" tag — used in the Assign Rolls steps (status of each ready
// roll at the stage it's coming FROM).
const RollQcBadge = ({ qc, unit = 'pieces', loading }) => {
    if (loading) return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400"><Loader size={11} className="animate-spin" /> status…</span>;
    if (!qc) return null;
    const cleared = qc.approved + qc.repaired;
    const hasIssues = QC_CHIPS.some(c => qc[c.key] > 0);
    return (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[11px] font-black text-slate-600 tabular-nums">{cleared}/{qc.total} {unit} cleared</span>
            {hasIssues
                ? <QcIssues counts={qc} long className="text-[11px]" />
                : <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">all checked</span>}
        </span>
    );
};

// One quiet row per roll: roll + colour, a thin cleared bar, and the issue
// text. Part breakdown only on tap. The section heading already says
// WIP / Ready / Forwarded, so no per-row tag.
// The actual problem pieces (or garments) of a roll / size at this stage —
// always visible on the row, in every tab: what, which size and number, why,
// and where it was raised.
const ISSUE_STYLE = {
    rejected:          { label: 'Rejected',          cls: 'bg-rose-50 border-rose-300 text-rose-800' },
    rejected_upstream: { label: 'Rejected earlier',  cls: 'bg-rose-50 border-rose-300 border-dashed text-rose-800' },
    needs_rework:      { label: 'Rework',            cls: 'bg-amber-50 border-amber-300 text-amber-800' },
    rework_upstream:   { label: 'Rework earlier',    cls: 'bg-orange-50 border-orange-300 border-dashed text-orange-800' },
};
const ISSUE_PREVIEW = 8;
const IssueChips = ({ issues, showRoll = false }) => {
    const [all, setAll] = useState(false);
    if (!issues?.length) return null;
    const shown = all ? issues : issues.slice(0, ISSUE_PREVIEW);
    return (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2 pl-6">
            {shown.map((it, i) => {
                const st = ISSUE_STYLE[it.kind] || ISSUE_STYLE.rejected;
                const what = it.uid || [it.part_name, `S ${it.size}`, it.seq != null ? `#${it.seq}` : null].filter(Boolean).join(' · ');
                return (
                    <span key={i} className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${st.cls}`}>
                        <span className="font-black">{st.label}</span>
                        {' · '}{showRoll && it.roll_id ? `Roll #${it.roll_id} · ` : ''}{what}
                        {it.uid && it.part_name ? ` (${it.part_name})` : ''}
                        {it.reason ? ` — ${it.reason}` : ''}
                        {it.line ? ` @ ${it.line}` : ''}
                    </span>
                );
            })}
            {issues.length > ISSUE_PREVIEW && (
                <button type="button" onClick={() => setAll(a => !a)} className="text-[11px] font-black text-slate-500 hover:text-slate-800 underline">
                    {all ? 'show less' : `+${issues.length - ISSUE_PREVIEW} more`}
                </button>
            )}
        </div>
    );
};

const RollRow = ({ roll, allSizes = [], qc, qcUnit, qcLoading, showQc = false }) => {
    const [open, setOpen] = useState(false);
    const cleared = qc ? qc.approved + qc.repaired : 0;
    const pct = qc?.total ? Math.round((cleared / qc.total) * 100) : 0;
    const hasIssues = !!qc && QC_CHIPS.some(c => qc[c.key] > 0);
    const partIssues = (qc?.parts || []).filter(p => QC_CHIPS.some(c => p[c.key] > 0));
    const canExpand = showQc && partIssues.length > 0;
    const edge = showQc && (qc?.rejected > 0 || qc?.rejected_upstream > 0) ? 'border-l-rose-400'
        : showQc && (qc?.needs_rework > 0 || qc?.rework_upstream > 0) ? 'border-l-amber-400'
        : 'border-l-transparent';

    return (
        <div className={`border-b border-slate-100 last:border-0 border-l-4 ${edge}`}>
            <div
                onClick={canExpand ? () => setOpen(o => !o) : undefined}
                className={`flex items-center gap-4 px-3 py-2 ${canExpand ? 'cursor-pointer hover:bg-slate-50' : ''}`}
            >
                <div className="w-44 shrink-0 min-w-0">
                    <span className="font-black text-sm text-slate-800">Roll #{roll.roll_id}</span>
                    <span className="block text-[11px] text-slate-400 truncate">{roll.color_name}{roll.color_number ? ` · ${roll.color_number}` : ''}</span>
                </div>

                {/* Per-size status, left of the cleared bar (fixed width so bars line up) */}
                <div className="w-36 shrink-0">
                    <SizeBreakdownPills sizes={roll.sizes} allSizes={allSizes} className="" />
                </div>

                {showQc && (
                    qcLoading ? (
                        <Loader size={12} className="animate-spin text-slate-300" />
                    ) : qc ? (
                        <>
                            <div className="flex items-center gap-2 w-40 shrink-0">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${hasIssues ? 'bg-blue-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-[11px] font-bold text-slate-500 tabular-nums">{cleared}/{qc.total}</span>
                            </div>
                            {hasIssues
                                ? <QcIssues counts={qc} className="min-w-0 truncate" />
                                : <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />}
                        </>
                    ) : null
                )}

                <span className="ml-auto flex items-center gap-2 shrink-0 text-[11px] text-slate-400 font-bold">
                    <SizeProgressBadge sizeProgress={roll.size_progress} />
                    {roll.primary_pieces_cut > 0 && <span>{roll.primary_pieces_cut} pcs</span>}
                    <span>{roll.meter}m</span>
                    {canExpand && (open ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </span>
            </div>

            {showQc && <IssueChips issues={qc?.issues} />}
            {open && canExpand && (
                <div className="px-3 pb-2 pl-[22rem] flex flex-wrap gap-x-5 gap-y-1">
                    {partIssues.map(p => (
                        <span key={p.part_name} className="text-xs">
                            <span className="font-black text-slate-700">{p.part_name}</span>{' '}
                            <QcIssues counts={p} />
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

// Size Mode (MODE_2) equivalent of RollRow — one quiet row per SIZE on this
// stage: rolls done here, a cleared bar + issue text for the size across all
// its rolls. Tap to see which parts have issues and EVERY roll of the batch
// for this size: green ✓ = done here, yellow = garments/pieces still open
// here, grey = none of it on this stage yet.
//
// Why not just group.rolls: at garment stages a (roll, size) only gets its
// line record once every garment of it is checked (checkAndCompleteAssemblyRoll)
// unless the line loader assigned the whole size — so rolls still being
// worked on had no record and simply didn't show. Their live counts come
// from the stage QC data (qc.rolls), which covers every roll on this stage.
const sizeRollStates = (group, qc, batchRollIds) => {
    const lineStatus = new Map(group.rolls.map(r => [String(r.roll_id), r.status]));
    const ids = new Set([...batchRollIds.map(String), ...lineStatus.keys(), ...Object.keys(qc?.rolls || {})]);
    return [...ids]
        .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
        .map(id => {
            const status = lineStatus.get(id);
            const rq = qc?.rolls?.[id];
            const open = rq ? Math.max(0, rq.total - rq.approved - rq.repaired - rq.rejected) : 0;
            let state;
            if (status === 'COMPLETED' || (rq && rq.total > 0 && open === 0)) state = 'COMPLETED';
            else if (status || (rq && rq.total > 0)) state = 'IN_PROGRESS';
            else state = 'NOT_HERE';
            return { roll_id: id, state, open, rq };
        });
};

const SizeRow = ({ group, qc, qcUnit, qcLoading, showQc = false, batchRollIds = [] }) => {
    const [open, setOpen] = useState(false);
    const rollStates = useMemo(() => sizeRollStates(group, qc, batchRollIds), [group, qc, batchRollIds]);
    const rollsDone = rollStates.filter(r => r.state === 'COMPLETED').length;
    const rollsWaiting = rollStates.filter(r => r.state === 'NOT_HERE').length;
    const cleared = qc ? qc.approved + qc.repaired : 0;
    const pct = qc?.total ? Math.round((cleared / qc.total) * 100) : 0;
    const hasIssues = !!qc && QC_CHIPS.some(c => qc[c.key] > 0);
    const partIssues = (qc?.parts || []).filter(p => QC_CHIPS.some(c => p[c.key] > 0));
    const edge = showQc && (qc?.rejected > 0 || qc?.rejected_upstream > 0) ? 'border-l-rose-400'
        : showQc && (qc?.needs_rework > 0 || qc?.rework_upstream > 0) ? 'border-l-amber-400'
        : 'border-l-transparent';

    return (
        <div className={`border-b border-slate-100 last:border-0 border-l-4 ${edge}`}>
            <div onClick={() => setOpen(o => !o)} className="flex items-center gap-4 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <div className="w-44 shrink-0 min-w-0">
                    <span className="font-black text-sm text-violet-800">Size {group.size}</span>
                    <span className="block text-[11px] text-slate-400">
                        {rollsDone}/{rollStates.length} roll{rollStates.length !== 1 ? 's' : ''} done here
                        {rollsWaiting > 0 && <span className="text-slate-400"> · {rollsWaiting} not here yet</span>}
                    </span>
                </div>

                {showQc && (
                    qcLoading ? (
                        <Loader size={12} className="animate-spin text-slate-300" />
                    ) : qc ? (
                        <>
                            <div className="flex items-center gap-2 w-40 shrink-0">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${hasIssues ? 'bg-blue-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-[11px] font-bold text-slate-500 tabular-nums">{cleared}/{qc.total}</span>
                            </div>
                            {hasIssues
                                ? <QcIssues counts={qc} className="min-w-0 truncate" />
                                : <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />}
                        </>
                    ) : null
                )}

                <span className="ml-auto flex items-center gap-2 shrink-0 text-[11px] text-slate-400 font-bold">
                    {showQc && qc && <span>{qcUnit}</span>}
                    {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
            </div>

            {showQc && <IssueChips issues={qc?.issues} showRoll />}
            {open && (
                <div className="px-3 pb-2 pl-[12.5rem] space-y-1.5">
                    {showQc && partIssues.length > 0 && (
                        <div className="flex flex-wrap gap-x-5 gap-y-1">
                            {partIssues.map(p => (
                                <span key={p.part_name} className="text-xs">
                                    <span className="font-black text-slate-700">{p.part_name}</span>{' '}
                                    <QcIssues counts={p} />
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                        {rollStates.map(r => {
                            // pending is already said by "n open"; list only the problems
                            const issues = r.rq ? QC_CHIPS.filter(c => c.key !== 'pending' && r.rq[c.key] > 0).map(c => `${r.rq[c.key]} ${c.label}`).join(', ') : '';
                            const done = r.state === 'COMPLETED';
                            return (
                                <span key={r.roll_id}
                                    className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${SIZE_PILL_STYLE[r.state] || SIZE_PILL_FALLBACK}`}>
                                    {done ? '✓ ' : ''}#{r.roll_id}
                                    {r.state === 'IN_PROGRESS' && r.open > 0 && <span> · {r.open} open</span>}
                                    {showQc && issues ? <span className="text-rose-700"> · {issues}</span> : null}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const StageDetailModal = ({ batch, stage, prevStage = null, progress, onClose, onRefresh, onAssign, onAssignSizes, onChangeLine, readyRolls, readySizes = [] }) => {
    const isMode2 = batch?.piece_sequencing_mode === 'MODE_2';
    const wipRolls = useMemo(() => progress?.wip_roll_ids ?? [], [progress]);
    const completedRolls = progress?.completed_roll_ids ?? [];
    const dispatchedRolls = progress?.dispatched_roll_ids ?? [];
    const summary = (isMode2 ? progress?.size_summary : progress?.roll_summary) ?? {};
    // Every roll of the batch — Size Mode lists each size's rolls in full.
    const batchRollIds = useMemo(
        () => (batch?.all_roll_ids || []).map(r => String(r?.roll_id ?? r)),
        [batch?.all_roll_ids]
    );

    // Per-roll pending / rework / rejected at this stage — shown on WIP rolls.
    const [rollQc, setRollQc] = useState(null);   // { unit, rolls: { [roll_id]: counts } }
    const [qcLoading, setQcLoading] = useState(false);
    const [qcError, setQcError] = useState('');
    const [qcReloadKey, setQcReloadKey] = useState(0);
    const hasProgress = !!progress;
    useEffect(() => {
        if (!hasProgress || !batch?.batch_id || !stage?.id) return;
        setQcLoading(true);
        setQcError('');
        lineLoaderApi.getStageRollQc(batch.batch_id, stage.id)
            .then(res => setRollQc(res.data))
            .catch(err => setQcError(err.response?.data?.error || 'Could not load piece status.'))
            .finally(() => setQcLoading(false));
    }, [hasProgress, batch?.batch_id, stage?.id, qcReloadKey]);

    // Status of each READY roll at the stage it's coming from (shown in the
    // Ready to Assign list).
    const [readyQc, setReadyQc] = useState(null);
    const [readyQcLoading, setReadyQcLoading] = useState(false);
    const hasReadyRolls = !isMode2 && readyRolls.length > 0 && !!onAssign;
    useEffect(() => {
        if (!hasReadyRolls || !prevStage?.id || !batch?.batch_id) return;
        setReadyQcLoading(true);
        lineLoaderApi.getStageRollQc(batch.batch_id, prevStage.id)
            .then(res => setReadyQc(res.data))
            .catch(() => setReadyQc(null))
            .finally(() => setReadyQcLoading(false));
    }, [hasReadyRolls, prevStage?.id, batch?.batch_id, qcReloadKey]);

    // Refresh: re-pull just this batch (the modal reads live batch data, so it
    // updates in place) and the per-roll QC breakdown.
    const [refreshing, setRefreshing] = useState(false);
    const [refreshError, setRefreshError] = useState('');
    const [lastUpdated, setLastUpdated] = useState(() => new Date());
    const handleRefresh = async () => {
        if (refreshing || !onRefresh) return;
        setRefreshing(true);
        setRefreshError('');
        try {
            await onRefresh();
            setQcReloadKey(k => k + 1);
            setLastUpdated(new Date());
        } catch {
            setRefreshError('Refresh failed — try again.');
        } finally {
            setRefreshing(false);
        }
    };


    // Size Mode: regroup this stage's rolls by SIZE. Each roll carries its
    // per-size status on this line (roll.sizes); a size is READY once it's
    // complete on every roll that carries it (progress.ready_sizes) and
    // FORWARDED once it's reached the next stage (progress.dispatched_sizes).
    const sizeGroups = useMemo(() => {
        if (!isMode2 || !progress) return [];
        const readySet = new Set((progress.ready_sizes || []).map(sz => String(sz.size)));
        const dispatchedSet = new Set((progress.dispatched_sizes || []).map(String));
        const bySize = new Map();
        [...(progress.wip_roll_ids || []), ...(progress.completed_roll_ids || []), ...(progress.dispatched_roll_ids || [])]
            .forEach(roll => (roll.sizes || []).forEach(sz => {
                const key = String(sz.size);
                if (!bySize.has(key)) bySize.set(key, new Map());
                bySize.get(key).set(String(roll.roll_id), { roll_id: roll.roll_id, status: sz.status });
            }));
        return [...bySize.entries()]
            .map(([size, rollMap]) => {
                const rolls = [...rollMap.values()].sort((a, b) => a.roll_id - b.roll_id);
                const state = dispatchedSet.has(size) ? 'FORWARDED' : readySet.has(size) ? 'READY' : 'WIP';
                return { size, rolls, state, rollsTotal: rolls.length, rollsDone: rolls.filter(r => r.status === 'COMPLETED').length };
            })
            .sort((a, b) => (parseInt(a.size, 10) || 0) - (parseInt(b.size, 10) || 0) || a.size.localeCompare(b.size));
    }, [isMode2, progress]);

    // Tabs: In Progress / Ready to Forward / Forwarded. Colour per tab: in
    // progress = yellow, ready to forward = green, forwarded = blue. Until the
    // user picks one, the first tab that HAS rolls/sizes is shown (a finished
    // stage opens on Forwarded, not an empty In Progress).
    const [activeTab, setActiveTab] = useState(null);
    const SECTION_TONE = {
        WIP:       { label: 'In Progress',      on: 'bg-yellow-100 border-yellow-400 text-yellow-900', off: 'text-yellow-800', box: 'border-yellow-300' },
        READY:     { label: 'Ready to Forward', on: 'bg-emerald-100 border-emerald-400 text-emerald-900', off: 'text-emerald-800', box: 'border-emerald-300' },
        FORWARDED: { label: 'Forwarded',        on: 'bg-blue-100 border-blue-400 text-blue-900', off: 'text-blue-800', box: 'border-blue-300' },
    };

    // Every section shows QC — a completed/forwarded roll or size can still
    // carry rejections (or rework) that the line loader needs to see.
    const sections = (isMode2
        ? [
            { key: 'WIP',       sizes: sizeGroups.filter(g => g.state === 'WIP') },
            { key: 'READY',     sizes: sizeGroups.filter(g => g.state === 'READY') },
            { key: 'FORWARDED', sizes: sizeGroups.filter(g => g.state === 'FORWARDED') },
        ]
        : [
            { key: 'WIP',       rolls: wipRolls },
            { key: 'READY',     rolls: completedRolls.filter(r => !dispatchedRolls.find(d => d.roll_id === r.roll_id)) },
            { key: 'FORWARDED', rolls: dispatchedRolls },
        ]
    ).map(s => ({
        count: (s.sizes || s.rolls).length,
        ...s,
        showQc: true,
        totals: rollQc
            ? sumQc(s.sizes ? s.sizes.map(g => rollQc.sizes?.[g.size]) : s.rolls.map(r => rollQc.rolls?.[r.roll_id]))
            : null,
    }));

    return (
        <div className="p-2">
            {/* Header — stage (highlighted) + line + actions, batch details below */}
            <div className="bg-slate-900 rounded-xl px-4 py-3 mb-5">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <h3 className="text-xl font-black uppercase tracking-tight bg-amber-400 text-slate-900 px-3 py-1 rounded-lg">
                            {stage.line_type_name}
                        </h3>
                        {batch && (
                            <span className="text-xl font-black tracking-tight bg-white text-slate-900 px-3 py-1 rounded-lg">
                                BATCH #{batch.batch_id}
                            </span>
                        )}
                        {progress?.line_name && (
                            <span className="text-sm font-black text-white bg-white/10 border border-white/20 px-2.5 py-1 rounded-lg">
                                {progress.line_name}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {refreshError && <span className="text-[11px] font-bold text-rose-300">{refreshError}</span>}
                        {onRefresh && (
                            <button onClick={handleRefresh} disabled={refreshing}
                                title={`Last updated ${lastUpdated.toLocaleTimeString()}`}
                                className="px-3 py-2 bg-white/10 border border-white/20 text-white font-black rounded-xl hover:bg-white/20 active:scale-95 disabled:opacity-60 transition-all flex items-center gap-1.5 text-xs uppercase tracking-widest">
                                <Loader size={13} className={refreshing ? 'animate-spin' : ''} />
                                {refreshing ? 'Refreshing…' : 'Refresh'}
                                <span className="normal-case tracking-normal font-bold text-slate-400 hidden sm:inline">· {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </button>
                        )}
                        {onChangeLine && progress && (
                            <button onClick={onChangeLine}
                                className="px-3 py-2 bg-white/10 border border-white/20 text-white font-black rounded-xl hover:bg-white/20 active:scale-95 transition-all flex items-center gap-1.5 text-xs uppercase tracking-widest">
                                <RefreshCw size={13} /> Change Line
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all">
                            <X size={18} className="text-white" />
                        </button>
                    </div>
                </div>
                {batch && (
                    <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-white/10">
                        <span className="font-mono text-xs font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">{batch.batch_code}</span>
                        {batch.priority && <PriorityChip priority={batch.priority} size="xs" />}
                        {isMode2 && (
                            <span className="text-[10px] font-black uppercase tracking-widest bg-violet-900 text-violet-300 px-2 py-0.5 rounded border border-violet-700">
                                Size Mode
                            </span>
                        )}
                        <span className="text-slate-400 text-xs font-medium">{batch.product_name}</span>
                        {batch.trim_orders?.length > 0 && (
                            <span className="ml-auto flex gap-1 flex-wrap">
                                {batch.trim_orders.map(to => (
                                    <span key={to.id} className="text-[10px] font-bold bg-purple-900 text-purple-300 px-2 py-0.5 rounded border border-purple-700">
                                        TO #{to.id}
                                    </span>
                                ))}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Assign action */}
            {isMode2 ? (
                readySizes.length > 0 && onAssignSizes && (
                    <button onClick={onAssignSizes}
                        className="w-full py-3 mb-5 bg-violet-700 text-white font-black rounded-xl hover:bg-violet-800 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-widest">
                        <Zap size={16} /> Assign {readySizes.length} Size{readySizes.length !== 1 ? 's' : ''} to Line
                    </button>
                )
            ) : (
                hasReadyRolls && (
                    // "Incoming" — not on this line yet, so styled apart from the
                    // WIP (yellow) / Completed (green) / Forwarded (blue) sections.
                    <div className="mb-5 border-2 border-dashed border-indigo-400 rounded-xl overflow-hidden">
                        <div className="bg-indigo-600 px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                            <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 text-white px-2 py-0.5 rounded">
                                Incoming
                            </span>
                            <span className="text-xs font-black uppercase tracking-widest text-white">
                                Ready to Assign ({readyRolls.length})
                            </span>
                            {prevStage && (
                                <span className="text-[11px] font-bold text-indigo-100">
                                    finished at {prevStage.line_type_name} ·{' '}
                                    {readyRolls.reduce((sum, r) => sum + parseFloat(r.meter || 0), 0).toFixed(2)}m
                                </span>
                            )}
                            <button onClick={onAssign}
                                className="ml-auto px-4 py-2 bg-white text-indigo-700 font-black rounded-lg hover:bg-indigo-50 active:scale-95 transition-all flex items-center gap-1.5 text-xs uppercase tracking-widest">
                                <Zap size={14} /> Assign {readyRolls.length} Roll{readyRolls.length !== 1 ? 's' : ''} to Line
                            </button>
                        </div>
                        <div className="divide-y divide-indigo-100 bg-indigo-50/40">
                            {readyRolls.map(roll => (
                                <div key={roll.roll_id} className="flex flex-wrap lg:flex-nowrap items-center gap-x-4 gap-y-1 px-4 py-2">
                                    <div className="w-44 shrink-0 min-w-0">
                                        <span className="font-black text-sm text-slate-800">Roll #{roll.roll_id}</span>
                                        <span className="block text-[11px] text-slate-400 truncate">{roll.fabric_type} · {roll.color_name}{roll.color_number ? ` · ${roll.color_number}` : ''}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <RollQcBadge qc={readyQc?.rolls?.[roll.roll_id]} unit={readyQc?.unit || 'pieces'} loading={readyQcLoading} />
                                    </div>
                                    <span className="ml-auto flex items-center gap-2 shrink-0 text-[11px] text-slate-400 font-bold">
                                        {roll.primary_pieces_cut > 0 && <span>{roll.primary_pieces_cut} pcs</span>}
                                        <span>{roll.meter}m</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            )}

            {/* MODE_2 ready-sizes strip — informational; the Assign button above handles dispatch */}
            {isMode2 && readySizes.length > 0 && (
                <div className="mb-5">
                    <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Sizes Ready to Forward</h5>
                    <div className="flex flex-wrap gap-2">
                        {readySizes.map(sz => (
                            <span key={sz.size} className="text-xs font-black px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200">
                                Size {sz.size} · {sz.rolls_completed}/{sz.rolls_expected} rolls
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Roll / size tabs */}
            {!progress ? (
                <div className="bg-slate-50 rounded-xl p-8 border-2 border-dashed border-slate-200 text-center mb-5">
                    <p className="text-sm font-bold text-slate-500">Stage not yet activated.</p>
                </div>
            ) : (() => {
                const current = sections.find(sec => sec.key === activeTab)
                    || sections.find(sec => sec.count > 0) || sections[0];
                // Rejections / rework anywhere on this stage, per roll (or size),
                // so they're never hidden behind a tab or pale text.
                const ISSUE_KEYS = ['needs_rework', 'rework_upstream', 'rejected', 'rejected_upstream'];
                const issueEntries = Object.entries((isMode2 ? rollQc?.sizes : rollQc?.rolls) || {})
                    .filter(([, q]) => q && ISSUE_KEYS.some(k => q[k] > 0))
                    .sort(([a], [b]) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
                const tone = SECTION_TONE[current.key];
                const unitWord = isMode2 ? 'size' : 'roll';
                return (
                    <div className="mb-5">
                        {issueEntries.length > 0 && (
                            <div className="mb-3 border-2 border-rose-300 bg-rose-50 rounded-xl px-4 py-3">
                                <p className="text-xs font-black uppercase tracking-widest text-rose-700 mb-1.5">
                                    Rejections / rework on this stage
                                </p>
                                <div className="space-y-1">
                                    {issueEntries.map(([key, q]) => {
                                        const parts = (q.parts || []).filter(pt => ISSUE_KEYS.some(k => pt[k] > 0));
                                        return (
                                            <p key={key} className="text-sm">
                                                <span className="font-black text-slate-800">{isMode2 ? `Size ${key}` : `Roll #${key}`}:</span>{' '}
                                                <QcIssues counts={Object.fromEntries(QC_CHIPS.map(c => [c.key, c.key === 'pending' ? 0 : (q[c.key] || 0)]))} long />
                                                {parts.length > 0 && (
                                                    <span className="text-xs font-bold text-slate-500"> ({parts.map(pt => `${pt.part_name} ${ISSUE_KEYS.reduce((n, k) => n + (pt[k] || 0), 0)}`).join(' · ')})</span>
                                                )}
                                            </p>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="flex flex-wrap items-end gap-2 mb-2">
                            {sections.map(sec => {
                                const t = SECTION_TONE[sec.key];
                                const on = sec.key === current.key;
                                return (
                                    <button key={sec.key} type="button" onClick={() => setActiveTab(sec.key)}
                                        className={`text-left px-4 py-2 rounded-xl border-2 transition-all active:scale-95 ${on ? `${t.on} shadow-sm` : `bg-white border-slate-200 ${t.off} hover:border-slate-300`}`}>
                                        <span className="block text-xs font-black uppercase tracking-widest">
                                            {t.label} <span className="tabular-nums">({sec.count})</span>
                                        </span>
                                        {sec.totals && QC_CHIPS.some(c => sec.totals[c.key] > 0) && (
                                            <QcIssues counts={sec.totals} className="block text-[10px] mt-0.5" />
                                        )}
                                    </button>
                                );
                            })}
                            <span className="ml-auto flex flex-wrap items-center gap-2 text-xs font-black text-slate-500">
                                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                    {isMode2 ? 'Rolls:' : 'Sizes:'}
                                    <span className={`px-1.5 py-0.5 rounded border ${SIZE_PILL_STYLE.COMPLETED}`}>✓ done</span>
                                    <span className={`px-1.5 py-0.5 rounded border ${SIZE_PILL_STYLE.IN_PROGRESS}`}>in progress</span>
                                    <span className={`px-1.5 py-0.5 rounded border ${SIZE_PILL_STYLE.PENDING}`}>not started</span>
                                    <span className={`px-1.5 py-0.5 rounded border ${SIZE_PILL_STYLE.NOT_HERE}`}>not on line yet</span>
                                </span>
                                {isMode2 && <span className="px-2 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200">Sizes</span>}
                                Total on line: {summary.total_on_line ?? (isMode2 ? sizeGroups.length : wipRolls.length + completedRolls.length)}
                            </span>
                        </div>
                        {qcError && <p className="text-[11px] font-bold text-rose-600 mb-2">{qcError}</p>}
                        <div className={`bg-white border-2 ${tone.box} rounded-xl overflow-hidden`}>
                            {current.count === 0 ? (
                                <p className="p-6 text-center text-sm font-bold text-slate-400">
                                    No {unitWord}s {current.key === 'WIP' ? 'in progress' : current.key === 'READY' ? 'ready to forward' : 'forwarded yet'}.
                                </p>
                            ) : current.sizes
                                ? current.sizes.map(group => (
                                    <SizeRow key={group.size} group={group} batchRollIds={batchRollIds}
                                        showQc={current.showQc} qc={rollQc?.sizes?.[group.size]} qcUnit={rollQc?.unit || 'pieces'} qcLoading={qcLoading} />
                                ))
                                : current.rolls.map(roll => (
                                    <RollRow key={roll.roll_id} roll={roll} allSizes={batch?.all_sizes || []}
                                        showQc={current.showQc} qc={rollQc?.rolls?.[roll.roll_id]} qcUnit={rollQc?.unit || 'pieces'} qcLoading={qcLoading} />
                                ))}
                        </div>
                    </div>
                );
            })()}

        </div>
    );
};

// ============================================================================
// STAGE NODE
// ============================================================================
const StageNode = ({ stage, progress, totalRolls, readyRolls, totalSizes, readySizes, isMode2, processingMode, wipMap, isFirst, onActivate, onCheckComplete, isCheckingComplete }) => {
    // MODE_1: roll is the unit (all its sizes together). MODE_2: size is the
    // unit (spanning every roll that carries it). Same shape (roll_summary /
    // size_summary), different source — everything below picks one based on
    // the batch's piece_sequencing_mode.
    const summary = isMode2 ? progress?.size_summary : progress?.roll_summary;
    const completedIds   = isMode2 ? [] : (progress?.completed_roll_ids  ?? []);
    const dispatchedIds  = isMode2 ? [] : (progress?.dispatched_roll_ids ?? []);
    const unitsCompleted  = summary?.completed          ?? completedIds.length;
    const unitsDispatched = summary?.dispatched_forward ?? dispatchedIds.length;
    const totalUnits = isMode2 ? totalSizes : totalRolls;
    const readyCount = isMode2 ? readySizes : readyRolls;
    const isComplete = progress?.status === 'COMPLETED';
    const isActive = !isComplete && !!progress;
    const canActivate = isFirst || processingMode === 'SERIALIZED' || readyCount > 0;

    let state;
    if (isComplete) state = 'COMPLETE';
    else if (isActive) state = 'ACTIVE';
    else if (canActivate) state = 'ACTIVATABLE';
    else state = 'LOCKED';

    const pctCompleted = totalUnits > 0 ? (unitsCompleted / totalUnits) * 100 : 0;
    const pctDispatched = totalUnits > 0 ? (unitsDispatched / totalUnits) * 100 : 0;

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
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-black text-xs uppercase tracking-widest truncate">{stage.line_type_name}</span>
                    {processingMode === 'SERIALIZED' && (
                        <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">
                            Serial
                        </span>
                    )}
                    {progress?.is_job_work && (
                        <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">
                            External
                        </span>
                    )}
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${cfg.labelBg} shrink-0`}>{cfg.label}</span>
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
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{isMode2 ? 'Sizes' : 'Rolls'}</span>
                        <span className="text-[10px] font-black text-slate-700">{unitsCompleted}/{totalUnits} done</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden flex">
                        <div className={`h-full ${state === 'COMPLETE' ? 'bg-emerald-500' : 'bg-emerald-400'} transition-all`} style={{ width: `${pctCompleted}%` }} />
                        <div className="h-full bg-blue-300 transition-all" style={{ width: `${pctDispatched}%` }} />
                    </div>
                    {unitsCompleted > 0 && unitsDispatched < unitsCompleted && (
                        <span className="text-[10px] text-amber-600 font-bold mt-0.5 block">{unitsCompleted - unitsDispatched} ready to forward</span>
                    )}
                    {unitsDispatched > 0 && (
                        <span className="text-[10px] text-blue-500 font-bold mt-0.5 block">{unitsDispatched} forwarded</span>
                    )}
                </div>

                {/* Garment WIP — ASSEMBLY-scoped stages only */}
                {progress?.garment_wip && (
                    <div className="mt-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Garments</span>
                        <div className="flex flex-wrap gap-1">
                            {progress.garment_wip.approved > 0 && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{progress.garment_wip.approved} ✓</span>
                            )}
                            {progress.garment_wip.in_progress > 0 && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{progress.garment_wip.in_progress} in prog</span>
                            )}
                            {progress.garment_wip.pending > 0 && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{progress.garment_wip.pending} pending</span>
                            )}
                            {progress.garment_wip.qc_rejected > 0 && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">{progress.garment_wip.qc_rejected} ✗</span>
                            )}
                        </div>
                    </div>
                )}

                {/* CTA hint */}
                {state === 'ACTIVATABLE' && (
                    <div className="flex items-center text-[10px] font-black text-amber-700 mt-1">
                        <Zap size={10} className="mr-1" />
                        {isMode2
                            ? `${readyCount} size${readyCount !== 1 ? 's' : ''} ready — tap to activate`
                            : `${readyCount} roll${readyCount !== 1 ? 's' : ''} ready — tap to activate`}
                    </div>
                )}
                {state === 'ACTIVE' && (
                    <div className="flex items-center text-[10px] font-black text-blue-600 mt-1">
                        <Loader size={10} className="mr-1 animate-spin" /> In progress — tap to add {isMode2 ? 'sizes' : 'rolls'}
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
const StageConnector = ({ readyCount }) => (
    <div className="flex flex-col items-center justify-center shrink-0 gap-1 px-1">
        <ArrowRight size={20} className={readyCount > 0 ? 'text-amber-500' : 'text-slate-300'} />
        {readyCount > 0 && (
            <span className="text-[10px] font-black bg-amber-400 text-black px-2 py-0.5 rounded-full whitespace-nowrap">
                {readyCount} ready
            </span>
        )}
    </div>
);

// ============================================================================
// COMPLETION OUTCOME NODES
// ============================================================================
const CompletionNode = ({ type, summary, loading }) => {
    const isApproved = type === 'approved';
    const count    = isApproved ? (summary?.approved ?? null) : (summary?.qc_rejected ?? null);
    const repaired = isApproved ? (summary?.repaired ?? 0) : 0;
    const total    = summary?.total_garments ?? null;

    const cfg = isApproved
        ? { header: 'bg-emerald-600', ring: 'ring-emerald-400', bg: 'bg-emerald-50', label: 'APPROVED', Icon: CheckCircle2, countColor: 'text-emerald-700' }
        : { header: 'bg-rose-600',    ring: 'ring-rose-400',    bg: 'bg-rose-50',    label: 'REJECTED', Icon: X,            countColor: 'text-rose-700'    };

    return (
        <div className={`flex flex-col rounded-2xl border-2 overflow-hidden ring-2 ${cfg.ring} ${cfg.bg} w-[160px] shrink-0`}>
            <div className={`${cfg.header} text-white px-3 py-1.5 flex items-center justify-between`}>
                <span className="font-black text-[10px] uppercase tracking-widest">{cfg.label}</span>
                <cfg.Icon size={12} />
            </div>
            <div className="p-3 flex flex-col gap-0.5">
                {loading ? (
                    <span className="text-xs font-bold text-slate-400">Loading…</span>
                ) : (
                    <>
                        <span className={`text-3xl font-black ${cfg.countColor}`}>{count ?? '—'}</span>
                        {total != null && (
                            <span className="text-[10px] font-bold text-slate-400">of {total} garments</span>
                        )}
                        {isApproved && repaired > 0 && (
                            <span className="text-[10px] font-bold text-teal-600 mt-1">+{repaired} repaired</span>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// BATCH PIPELINE CARD
// ============================================================================
const BatchPipelineCard = ({ batch, wipMap, onAssign, onAssignSizes, onRefresh, onRefreshBatch }) => {
    const isMode2 = batch?.piece_sequencing_mode === 'MODE_2';
    const [modalData, setModalData] = useState(null);
    const [sizeModalData, setSizeModalData] = useState(null);
    // Only WHICH stage is open — everything shown is derived from the live
    // batch prop at render time, so any dashboard refresh updates the modal.
    const [detailData, setDetailData] = useState(null); // { stageIndex }
    const [changeLineData, setChangeLineData] = useState(null); // { stage, progress }
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

    // MODE_2 equivalent: returns array of SIZE objects { size, rolls_completed,
    // rolls_expected } ready to be dispatched to stage[i] — a size becomes
    // ready once it's complete on every roll that carries it at the previous
    // stage, and stays "ready" (not yet dispatched forward) until acted on.
    const getReadySizes = (stageIndex) => {
        // Stage 0 has no previous stage to wait on — every batch size is
        // immediately eligible, mirroring all_roll_ids for the roll path.
        if (stageIndex === 0) return (batch.all_sizes || []).map(size => ({ size, rolls_completed: null, rolls_expected: null }));
        const prevStage = cycleFlow[stageIndex - 1];
        const prevProgress = progressMap[prevStage.id];
        if (!prevProgress) return [];
        const ready = prevProgress.ready_sizes ?? [];
        const dispatched = prevProgress.dispatched_sizes ?? [];
        const dispatchedSet = new Set(dispatched.map(String));
        return ready.filter(s => !dispatchedSet.has(String(s.size)));
    };

    const handleOpenDetail = (stageIndex) => setDetailData({ stageIndex });

    const handleActivate = (stageIndex) => {
        const cf = cycleFlow[stageIndex];
        const progress = progressMap[cf.id];
        const readyRolls = getReadyRolls(stageIndex);
        setDetailData(null);
        setModalData({ cycleFlow: cf, currentLineId: progress?.line_id ?? null, readyRolls, allStages: cycleFlow });
    };

    const handleActivateSizes = (stageIndex) => {
        const cf = cycleFlow[stageIndex];
        const progress = progressMap[cf.id];
        const readySizes = getReadySizes(stageIndex);
        setDetailData(null);
        setSizeModalData({ cycleFlow: cf, currentLineId: progress?.line_id ?? null, readySizes });
    };

    const handleSave = async (data) => {
        await onAssign(data);
        setModalData(null);
    };

    const handleSaveSizes = async (data) => {
        await onAssignSizes(data);
        setSizeModalData(null);
    };

    const handleOpenChangeLine = (stageIndex) => {
        const cf = cycleFlow[stageIndex];
        const progress = progressMap[cf.id];
        setDetailData(null);
        setChangeLineData({ stage: cf, progress, batch });
    };

    const handleChangeLineSave = async (newLineId) => {
        await lineLoaderApi.changeLine(batch.batch_id, changeLineData.stage.id, newLineId);
        setChangeLineData(null);
        await onRefresh();
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
    const lastProgress = [...(batch.progress || [])].sort((a, b) => b.sequence_no - a.sequence_no)[0];
    const overallCompletedRolls = lastProgress?.roll_summary?.completed ?? lastProgress?.completed_roll_ids?.length ?? 0;
    const overallPct = batch.garment_summary?.completion_pct != null
        ? Math.round(batch.garment_summary.completion_pct)
        : batch.total_rolls > 0 ? Math.round((overallCompletedRolls / batch.total_rolls) * 100) : 0;

    return (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Batch header */}
            <div className="bg-slate-900 px-6 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-xl font-black text-white tracking-tight">BATCH #{batch.batch_id}</h2>
                        <span className="text-sm font-mono font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">{batch.batch_code}</span>
                        {batch.priority && <PriorityChip priority={batch.priority} size="xs" />}
                        {batch.overall_status && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                batch.overall_status === 'COMPLETED'  ? 'bg-emerald-900 text-emerald-400' :
                                batch.overall_status === 'IN_PROGRESS'? 'bg-blue-900 text-blue-400' :
                                                                        'bg-slate-700 text-slate-400'
                            }`}>{batch.overall_status}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-slate-400 font-medium text-sm">{batch.product_name}</p>
                        {batch.current_step_group && (
                            <span className="text-[10px] font-black text-amber-400 bg-amber-900/40 px-2 py-0.5 rounded">
                                ▶ {batch.current_step_group}
                            </span>
                        )}
                    </div>
                    {batch.job_work_challans?.length > 0 && (
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {batch.job_work_challans.map(c => (
                                <span key={c.id} className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                                    c.status === 'RECEIVED' ? 'bg-emerald-900 text-emerald-400 border-emerald-700' :
                                    c.status === 'SENT'     ? 'bg-blue-900 text-blue-400 border-blue-700' :
                                                              'bg-slate-700 text-slate-400 border-slate-600'
                                }`}>{c.challan_number ?? `JWC-${c.id}`} · {c.status}</span>
                            ))}
                        </div>
                    )}
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
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {batch.trim_orders?.length > 0 && batch.trim_orders.map(to => (
                            <Link key={to.id} to={`/line-loader/trim-orders/${to.id}/summary`}
                                className="flex items-center text-xs font-bold bg-purple-900 text-purple-300 px-2 py-1 rounded-lg border border-purple-700 hover:bg-purple-800 transition-colors"
                                onClick={e => e.stopPropagation()}>
                                <FileText size={11} className="mr-1" />#{to.id}<ExternalLink size={9} className="ml-1 opacity-50" />
                            </Link>
                        ))}
                        <Link
                            to={`/line-loader/trim-kits/history?production_batch_id=${batch.batch_id}${batch.batch_code ? `&batch_code=${encodeURIComponent(batch.batch_code)}` : ''}${batch.trim_orders?.length ? `&order_ids=${batch.trim_orders.map(t => t.id).join(',')}` : ''}`}
                            className="flex items-center text-xs font-bold bg-indigo-900 text-indigo-300 px-2 py-1 rounded-lg border border-indigo-700 hover:bg-indigo-800 transition-colors"
                            onClick={e => e.stopPropagation()}
                            title="View past kit pickups + pending trims for this batch"
                        >
                            <History size={11} className="mr-1" /> Kit pickups
                        </Link>
                    </div>
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
                            const readySizes = getReadySizes(i);
                            const readyCount = isMode2 ? readySizes.length : readyRolls.length;
                            return (
                                <React.Fragment key={stage.id}>
                                    {i > 0 && <StageConnector readyCount={readyCount} />}
                                    <StageNode
                                        stage={stage}
                                        progress={progressMap[stage.id] ?? null}
                                        totalRolls={batch.total_rolls || 0}
                                        readyRolls={readyRolls.length}
                                        totalSizes={batch.total_sizes || 0}
                                        readySizes={readySizes.length}
                                        isMode2={isMode2}
                                        processingMode={stage.processing_mode}
                                        wipMap={wipMap}
                                        isFirst={i === 0}
                                        onActivate={() => handleOpenDetail(i)}
                                        onCheckComplete={() => handleCheckComplete(stage.id, progressMap[stage.id]?.line_id)}
                                        isCheckingComplete={checkingStageId === stage.id}
                                    />
                                </React.Fragment>
                            );
                        })}
                        {cycleFlow.length > 0 && (
                            <>
                                <StageConnector readyCount={0} />
                                <div className="flex flex-col gap-2">
                                    <CompletionNode type="approved" summary={batch.garment_summary} loading={false} />
                                    <CompletionNode type="rejected" summary={batch.garment_summary} loading={false} />
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Awaiting job work return banner */}
            {batch.overall_status === 'COMPLETED' && batch.job_work_challans?.some(c => c.status !== 'RECEIVED') && (
                <div className="mx-6 mb-5 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <Truck size={16} className="text-amber-600 shrink-0" />
                    <div>
                        <p className="text-xs font-black text-amber-800 uppercase tracking-widest">Awaiting Job Work Return</p>
                        <p className="text-[11px] text-amber-600 mt-0.5">
                            Production complete. Waiting for external vendor to return garments.
                        </p>
                    </div>
                    <div className="ml-auto flex gap-1.5">
                        {batch.job_work_challans.filter(c => c.status !== 'RECEIVED').map(c => (
                            <span key={c.id} className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                                c.status === 'SENT' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>{c.challan_number ?? `JWC-${c.id}`} · {c.status}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Stage detail panel */}
            {detailData && cycleFlow[detailData.stageIndex] && (() => {
                const i = detailData.stageIndex;
                const stage = cycleFlow[i];
                const progress = progressMap[stage.id] ?? null;
                const readyRolls = getReadyRolls(i);
                const readySizes = getReadySizes(i);
                return (
                    <Modal title="" fullScreen hideCloseButton onClose={() => setDetailData(null)}>
                        <StageDetailModal
                            batch={batch}
                            stage={stage}
                            progress={progress}
                            readyRolls={readyRolls}
                            readySizes={readySizes}
                            onClose={() => setDetailData(null)}
                            prevStage={i > 0 ? cycleFlow[i - 1] : null}
                            onRefresh={() => onRefreshBatch(batch.batch_id)}
                            onAssign={readyRolls.length > 0 && i !== 0 ? () => handleActivate(i) : null}
                            onAssignSizes={readySizes.length > 0 && i !== 0 ? () => handleActivateSizes(i) : null}
                            onChangeLine={progress ? () => handleOpenChangeLine(i) : null}
                        />
                    </Modal>
                );
            })()}

            {/* Line assignment modal — MODE_1: rolls */}
            {modalData && (
                <Modal title="" fullScreen onClose={() => setModalData(null)}>
                    <LineSelectionModal
                        batchId={batch.batch_id}
                        cycleFlow={modalData.cycleFlow}
                        currentLineId={modalData.currentLineId}
                        readyRolls={modalData.readyRolls}
                        wipMap={wipMap}
                        onClose={() => setModalData(null)}
                        onSave={handleSave}
                        allStages={modalData.allStages}
                    />
                </Modal>
            )}

            {/* Line assignment modal — MODE_2: sizes (across all rolls) */}
            {sizeModalData && (
                <Modal title="" fullScreen onClose={() => setSizeModalData(null)}>
                    <SizeSelectionModal
                        batchId={batch.batch_id}
                        cycleFlow={sizeModalData.cycleFlow}
                        currentLineId={sizeModalData.currentLineId}
                        readySizes={sizeModalData.readySizes}
                        wipMap={wipMap}
                        onClose={() => setSizeModalData(null)}
                        onSave={handleSaveSizes}
                    />
                </Modal>
            )}

            {/* Change line modal */}
            {changeLineData && (
                <Modal title="" fullScreen onClose={() => setChangeLineData(null)}>
                    <ChangeLineModal
                        batch={changeLineData.batch}
                        batchId={batch.batch_id}
                        cycleFlow={changeLineData.stage}
                        currentLineId={changeLineData.progress?.line_id}
                        currentLineName={changeLineData.progress?.line_name}
                        wipMap={wipMap}
                        onClose={() => setChangeLineData(null)}
                        onSave={handleChangeLineSave}
                    />
                </Modal>
            )}
        </div>
    );
};

// ============================================================================
// HISTORY PANEL
// ============================================================================
const CompletedBatchCard = ({ batch }) => {
    const [expanded, setExpanded] = useState(false);
    const so = batch.sales_order || {};
    const q  = batch.quantities  || {};

    return (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            {/* Header row */}
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-start justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-slate-800 text-sm">BATCH #{batch.batch_id}</span>
                        {batch.is_dispatch_closed && (
                            <span className="flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-700 border-emerald-200">
                                <CheckCircle2 size={8} /> Dispatched
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {batch.product?.name}
                        {so.customer && <span className="text-slate-400"> · {so.customer}</span>}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                        {so.order_number}{so.buyer_po_number && ` · BPO: ${so.buyer_po_number}`}
                        {batch.purchase_order?.po_code && ` · ${batch.purchase_order.po_code}`}
                    </p>
                </div>
                <div className="flex items-center gap-3 ml-3 shrink-0">
                    {/* Quantity chips */}
                    <div className="hidden sm:flex gap-1.5 text-right">
                        <div className="text-center bg-slate-100 rounded-lg px-2 py-1">
                            <p className="font-black text-slate-800 text-xs leading-none">{q.total_cut ?? '—'}</p>
                            <p className="text-[8px] font-bold uppercase text-slate-400">cut</p>
                        </div>
                        <div className="text-center bg-blue-50 rounded-lg px-2 py-1">
                            <p className="font-black text-slate-800 text-xs leading-none">{q.total_dispatched ?? '—'}</p>
                            <p className="text-[8px] font-bold uppercase text-slate-400">dispatched</p>
                        </div>
                        <div className="text-center bg-indigo-50 rounded-lg px-2 py-1">
                            <p className="font-black text-slate-800 text-xs leading-none">{q.receipt_count ?? '—'}</p>
                            <p className="text-[8px] font-bold uppercase text-slate-400">receipts</p>
                        </div>
                    </div>
                    {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
            </button>

            {/* Expanded detail */}
            {expanded && (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
                    {/* Mobile quantities */}
                    <div className="flex gap-2 sm:hidden">
                        {[
                            { label: 'Cut',        value: q.total_cut,        bg: 'bg-slate-100'  },
                            { label: 'Dispatched', value: q.total_dispatched, bg: 'bg-blue-50'    },
                            { label: 'Receipts',   value: q.receipt_count,    bg: 'bg-indigo-50'  },
                        ].map(({ label, value, bg }) => (
                            <div key={label} className={`${bg} rounded-lg px-2.5 py-1.5 text-center flex-1`}>
                                <p className="font-black text-slate-800 text-sm">{value ?? '—'}</p>
                                <p className="text-[8px] font-bold uppercase text-slate-400">{label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Size breakdown */}
                    {batch.size_breakdown && Object.keys(batch.size_breakdown).length > 0 && (
                        <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Size Breakdown</p>
                            <div className="flex flex-wrap gap-1.5">
                                {Object.entries(batch.size_breakdown).map(([size, qty]) => (
                                    <div key={size} className="flex flex-col items-center bg-indigo-50 border border-indigo-100 rounded-lg overflow-hidden min-w-[2.5rem]">
                                        <span className="w-full text-center bg-indigo-100 text-indigo-800 text-[8px] font-bold py-0.5">{size}</span>
                                        <span className="text-indigo-900 font-black text-xs py-1">{qty}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Cycle stages pipeline */}
                    {batch.cycle_stages?.length > 0 && (
                        <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Production Pipeline</p>
                            <div className="flex items-center gap-1 flex-wrap">
                                {batch.cycle_stages.map((stage, i) => (
                                    <React.Fragment key={i}>
                                        <div
                                            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold bg-emerald-500 text-white"
                                            title={stage.line_name || ''}
                                        >
                                            <CheckCircle2 size={9} />
                                            {stage.line_type}
                                        </div>
                                        {i < batch.cycle_stages.length - 1 && (
                                            <ArrowRight size={10} className="text-slate-300" />
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                            <div className="mt-2 space-y-1">
                                {batch.cycle_stages.map((stage, i) => (
                                    <div key={i} className="flex items-center justify-between text-[10px] bg-slate-50 rounded-lg px-2.5 py-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-slate-400 font-bold">#{stage.sequence_no}</span>
                                            <span className="font-semibold text-slate-700">{stage.line_type}</span>
                                            {stage.line_name && <span className="text-slate-400">({stage.line_name})</span>}
                                        </div>
                                        {stage.completed_at && (
                                            <span className="text-slate-400">{new Date(stage.completed_at).toLocaleDateString()}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Created at */}
                    {batch.created_at && (
                        <p className="text-[9px] text-slate-400">Created: {new Date(batch.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    )}
                </div>
            )}
        </div>
    );
};

const HistoryPanel = ({ onClose }) => {
    const [batches, setBatches]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState(null);
    const [search, setSearch]     = useState('');

    useEffect(() => {
        lineLoaderApi.getCompletedBatches()
            .then(res => setBatches(res.data?.data || res.data || []))
            .catch(() => setError('Failed to load history.'))
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        if (!search.trim()) return batches;
        const lower = search.toLowerCase();
        return batches.filter(b =>
            String(b.batch_id ?? '').toLowerCase().includes(lower) ||
            (b.batch_code                      || '').toLowerCase().includes(lower) ||
            (b.product?.name                   || '').toLowerCase().includes(lower) ||
            (b.sales_order?.order_number       || '').toLowerCase().includes(lower) ||
            (b.sales_order?.customer           || '').toLowerCase().includes(lower) ||
            (b.purchase_order?.po_code         || '').toLowerCase().includes(lower)
        );
    }, [batches, search]);

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

            {/* Drawer */}
            <div className="relative flex flex-col bg-white w-full max-w-xl h-full shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
                    <div className="flex items-center gap-2">
                        <History size={18} className="text-indigo-600" />
                        <h2 className="font-black text-slate-800 text-base">Batch History</h2>
                        {!loading && (
                            <span className="text-[10px] font-black bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                                {filtered.length}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-200 transition-colors">
                        <X size={18} className="text-slate-500" />
                    </button>
                </div>

                {/* Search */}
                <div className="px-5 py-3 border-b border-slate-100 shrink-0">
                    <input
                        type="text"
                        placeholder="Search batch, SO, customer…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                    />
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                    {loading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader className="animate-spin h-7 w-7 text-indigo-500" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm font-medium">
                            <AlertTriangle size={15} /> {error}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center py-16 gap-3 text-slate-400">
                            <Package size={36} />
                            <p className="font-bold">{search ? 'No matches.' : 'No completed batches yet.'}</p>
                        </div>
                    ) : (
                        filtered.map(batch => (
                            <CompletedBatchCard key={batch.batch_id} batch={batch} />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// MAIN PAGE
// ============================================================================
// The dashboard endpoint returns every non-fully-completed batch — 138 of
// them at last count, ~1.6MB of nested per-stage roll/size data. Rendering
// all of that up front was the actual remaining slowness after the backend
// query itself got fixed (983-row correlated-subquery scan -> indexed temp
// tables, ~3.4s -> ~1.1s). This loads PAGE_SIZE at a time and fetches more as
// the bottom sentinel scrolls into view, same "auto-expand on scroll" pattern
// used on the merchandiser planning page.
const PAGE_SIZE = 25;

const LineLoaderDashboardPage = () => {
    const [allBatches, setAllBatches] = useState([]);
    const [wipMap, setWipMap] = useState({}); // { lineId: { currentWip, wipLimit, isAtCapacity } }
    const [isLoading, setIsLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState(null);
    const [showHistory, setShowHistory] = useState(false);

    // Mirrors allBatches.length without needing it in fetchData's/loadMore's
    // own dependency arrays (both would otherwise have to be recreated, and
    // re-subscribe the IntersectionObserver below, on every fetch).
    const loadedCountRef = useRef(0);
    useEffect(() => { loadedCountRef.current = allBatches.length; }, [allBatches]);

    // Initial load AND "Refresh"/post-mutation resync — refetches from the
    // top, but for as many batches as were already loaded (not just one
    // page), so a batch loaded via scroll doesn't disappear from view just
    // because its line assignment changed.
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const limit = Math.max(loadedCountRef.current, PAGE_SIZE);
            const [dashRes, wipRes] = await Promise.all([
                lineLoaderApi.getDashboardData({ limit, offset: 0 }),
                lineLoaderApi.getAllActiveLineWip().catch(() => ({ data: {} })) // non-fatal
            ]);

            setAllBatches(dashRes.data || []);
            setHasMore(dashRes.headers?.['x-has-more'] === 'true');
            // wipRes.data expected: { [lineId]: { currentWip, wipLimit, isAtCapacity } }
            setWipMap(wipRes.data || {});
        } catch (err) {
            console.error("Failed to fetch dashboard data", err);
            setError("Could not load data. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Re-pull ONE batch (?batch_id=) and swap it into the list in place — the
    // Stage Detail modal's Refresh. No full-page spinner, no other batches
    // touched; line WIP is re-read too since it drives the assign/change-line
    // capacity checks. Throws so the modal can show the failure.
    const refreshBatch = useCallback(async (batchId) => {
        const [batchRes, wipRes] = await Promise.all([
            lineLoaderApi.getDashboardData({ batch_id: batchId }),
            lineLoaderApi.getAllActiveLineWip().catch(() => null),
        ]);
        const fresh = (batchRes.data || [])[0];
        if (fresh) {
            setAllBatches(prev => prev.map(b => (String(b.batch_id) === String(batchId) ? fresh : b)));
        }
        if (wipRes) setWipMap(wipRes.data || {});
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const res = await lineLoaderApi.getDashboardData({ limit: PAGE_SIZE, offset: loadedCountRef.current });
            setAllBatches(prev => [...prev, ...(res.data || [])]);
            setHasMore(res.headers?.['x-has-more'] === 'true');
        } catch (err) {
            console.error('Failed to load more batches', err);
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, hasMore]);

    // Fires loadMore a bit before the sentinel actually reaches the bottom of
    // the viewport (rootMargin) for a smoother "keeps filling in" feel, and
    // keeps re-observing (unlike a one-shot reveal) since scrolling can cross
    // many pages in one session.
    const sentinelRef = useRef(null);
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') return undefined;
        const observer = new IntersectionObserver(
            (entries) => { if (entries.some(e => e.isIntersecting)) loadMore(); },
            { rootMargin: '400px 0px 0px 0px', threshold: 0 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [loadMore]);

    const handleAssign = async (data) => {
        try {
            await lineLoaderApi.assignLineAndLogRolls(data);
            await fetchData();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to assign line. Please try again.');
        }
    };

    const handleAssignSizes = async (data) => {
        try {
            await lineLoaderApi.assignLineAndLogSizes(data);
            await fetchData();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to assign size. Please try again.');
        }
    };

    return (
        <div className="p-6 md:p-8 bg-slate-100 min-h-screen font-inter text-slate-800">
            <header className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Line Loader</h1>
                    <p className="text-slate-500 mt-1 font-medium text-sm">Track each batch through its production pipeline and assign lines per stage.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowHistory(true)} className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-4 py-2.5 rounded-xl hover:bg-indigo-100 shadow-sm active:scale-95 transition-all">
                        <History size={14} /> History
                    </button>
                    <button onClick={fetchData} className="flex items-center gap-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 px-4 py-2.5 rounded-xl hover:bg-slate-50 shadow-sm active:scale-95 transition-all">
                        <Loader size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>
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
                        <BatchPipelineCard key={batch.batch_id} batch={batch} wipMap={wipMap} onAssign={handleAssign} onAssignSizes={handleAssignSizes} onRefresh={fetchData} onRefreshBatch={refreshBatch} />
                    ))}
                    {hasMore && (
                        <div ref={sentinelRef} className="flex justify-center py-6">
                            {loadingMore && <Loader size={20} className="animate-spin text-slate-400" />}
                        </div>
                    )}
                </div>
            )}
            {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}
        </div>
    );
};

export default LineLoaderDashboardPage;
