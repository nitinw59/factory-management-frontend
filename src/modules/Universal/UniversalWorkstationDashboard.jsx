import React, { useState, useEffect, useCallback, useRef } from 'react';
import { universalApi } from '../../api/universalApi'; 
import { 
    Shirt, Layers, ClipboardCheck, Component, Check, X, 
    Hammer, Loader2, ChevronDown, ChevronRight, CheckCircle2, 
    Square, CheckSquare, XCircle, ArrowLeft, Package, Send, AlertCircle, Zap
} from 'lucide-react';

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

const checkEntityStatus = (entity) => {
    const pieces = entity.pieces || [];
    const total_cut = pieces.length;
    const total_validated = pieces.filter(p => p.qc_status === 'APPROVED').length;
    const total_rejected = pieces.filter(p => p.qc_status === 'QC_REJECTED').length;
    const total_repaired = pieces.filter(p => p.qc_status === 'REPAIRED').length;
    const pending_alter = pieces.filter(p => p.qc_status === 'NEEDS_REWORK').length;
    const previously_rejected = pieces.filter(p => p.qc_status === 'PREVIOUSLY_REJECTED').length;
    const total_processed = total_validated + total_rejected + total_repaired + previously_rejected;
    const isComplete = (total_processed + pending_alter) >= total_cut && total_cut > 0 && pending_alter === 0;

    return { total_cut, total_processed, pending_alter, isComplete, total_validated, total_rejected, total_repaired, previously_rejected };
};

// High-Contrast Industrial Palette
const getPieceColorClass = (status, isSelected) => {
    if (isSelected) return "bg-indigo-600 border-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.8)] transform scale-105 z-10";
    switch(status) {
        case 'APPROVED': return "bg-slate-800 border-slate-700 text-emerald-500 opacity-60 cursor-not-allowed shadow-[inset_0_0_10px_rgba(16,185,129,0.2)]";
        case 'REPAIRED': return "bg-slate-800 border-slate-700 text-teal-400 opacity-60 cursor-not-allowed";
        case 'QC_REJECTED': return "bg-rose-950 border-rose-900 text-rose-400 opacity-60 cursor-not-allowed shadow-[inset_0_0_10px_rgba(225,29,72,0.3)]";
        case 'PREVIOUSLY_REJECTED': return "bg-slate-200 border-slate-300 text-slate-400 opacity-30 cursor-not-allowed line-through";
        case 'NEEDS_REWORK': return "bg-amber-400 border-amber-500 text-amber-900 shadow-md cursor-not-allowed opacity-80"; 
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
            const response = await universalApi.checkCompletion({ batchId, lineId });
            const data = response.data;
            if (data.isComplete) {
                alert(`SUCCESS: ${data.message}`);
                if (onBatchComplete) onBatchComplete();
            } else {
                setWipReport(data);
            }
        } catch (error) {
            alert(error.response?.data?.error || 'SYSTEM ERROR: Check connection.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* <button onClick={handleHandoff} disabled={isLoading || !lineId} className="bg-black hover:bg-slate-800 text-white px-6 py-4 rounded-xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center disabled:opacity-50">
                {isLoading ? <Loader2 className="w-6 h-6 animate-spin mr-3" /> : <Send className="w-6 h-6 mr-3" />} HAND OFF
            </button> */}

            {wipReport && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4" onClick={() => setWipReport(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 border-4 border-amber-400" onClick={e => e.stopPropagation()}>
                        <div className="bg-amber-400 p-6 flex justify-between items-start">
                            <div className="flex items-center text-black">
                                <AlertCircle className="w-10 h-10 mr-4 shrink-0" />
                                <div>
                                    <h3 className="font-black text-2xl uppercase tracking-widest">HANDOFF REJECTED</h3>
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
const UniversalValidationModal = ({ itemInfo, defectCodes, onClose, onValidationSubmit }) => {
    const pieces = itemInfo.pieces || []; 
    
    // ACTIONABLE PIECES: Strictly PENDING. Ignores Rework items completely.
    const actionablePieces = pieces.filter(p => p.qc_status === 'PENDING' || !p.qc_status);
    
    // BUNDLE CHECK: Is the bundle blocked from approval due to active reworks?
    const hasActiveReworks = pieces.some(p => p.qc_status === 'NEEDS_REWORK');
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
    const [selectedCategory, setSelectedCategory] = useState(null);

    const displayBatch = itemInfo.batchCode || itemInfo.batchId;
    const displayRoll = itemInfo.rollId ? `ROLL #${itemInfo.rollId}` : '';
    const displayPartSize = `${itemInfo.partName} | SIZE ${itemInfo.size || 'MIXED'}`;

    const togglePiece = (piece) => {
        if (piece.qc_status !== 'PENDING' && piece.qc_status) return; // Prevent clicking completed/rework pieces

        const newSet = new Set(selectedIds);
        if (!allowMultiple && !newSet.has(piece.id)) newSet.clear(); 
        if (newSet.has(piece.id)) newSet.delete(piece.id); else newSet.add(piece.id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === actionablePieces.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(actionablePieces.map(p => p.id))); // ONLY selects actionable pieces!
    };

    const handleActionInitiation = (action) => {
        if (selectedIds.size === 0) return;
        if (action === 'APPROVED') submitValidation('APPROVED', null);
        else { setIntendedAction(action); setSelectedCategory(null); }
    };

    const submitValidation = async (qcStatus, defectCodeId) => {
        const selectedPiecesList = pieces.filter(p => selectedIds.has(p.id));
        let payloads = [];

        // Bundle Grouping Logic to prevent backend crashes on massive rolls
        if (itemInfo.isRollInspect) {
            const grouped = selectedPiecesList.reduce((acc, p) => {
                const key = p.bundle_id ? `b_${p.bundle_id}` : `p_${p.part_id}_s_${p.size}`;
                if (!acc[key]) {
                    acc[key] = {
                        batchId: itemInfo.batchId, rollId: itemInfo.rollId, partId: p.part_id || itemInfo.partId,
                        size: p.size || itemInfo.size, pieceIds: [], qcStatus, defectCodeId: defectCodeId || null, bundleId: p.bundle_id || null
                    };
                }
                acc[key].pieceIds.push(p.id);
                return acc;
            }, {});
            payloads = Object.values(grouped);
        } else {
            payloads = [{
                batchId: itemInfo.batchId, rollId: itemInfo.rollId, partId: itemInfo.partId, 
                size: itemInfo.size, pieceIds: Array.from(selectedIds), qcStatus, defectCodeId: defectCodeId || null, bundleId: itemInfo.bundle_id || null
            }];
        }

        // Trigger Full Screen Lock via Parent
        await onValidationSubmit(payloads);
        
        // After success, clear selections
        setSelectedIds(new Set()); setIntendedAction(null); setSelectedCategory(null);
    };

    const categories = Array.from(new Set(defectCodes.map(d => d.category)));
    const availableDefects = defectCodes.filter(d => d.category === selectedCategory);

    return (
        <div className="fixed inset-0 bg-black/95 z-[150] flex flex-col p-0 font-inter">
            <div className="bg-black text-white p-6 flex justify-between items-center border-b-4 border-slate-800 shrink-0">
                <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-16">
                    <div className="flex flex-col"><span className="text-slate-500 text-sm font-black uppercase tracking-widest">Batch</span><h2 className="text-4xl font-black">{displayBatch}</h2></div>
                    <div className="flex flex-col border-l-0 md:border-l-2 border-slate-800 md:pl-12"><span className="text-slate-500 text-sm font-black uppercase tracking-widest">Source</span><h2 className="text-4xl font-black text-indigo-400">{displayRoll}</h2></div>
                    <div className="flex flex-col border-l-0 md:border-l-2 border-slate-800 md:pl-12"><span className="text-slate-500 text-sm font-black uppercase tracking-widest">Component</span><h2 className="text-4xl font-black uppercase">{displayPartSize}</h2></div>
                </div>
                <button onClick={onClose} className="p-4 bg-slate-900 hover:bg-rose-600 rounded-full transition-all border border-slate-700"><X className="w-8 h-8 text-white"/></button>
            </div>

            <div className="flex-grow overflow-hidden flex flex-col bg-slate-100">
                <div className="bg-slate-200 px-8 py-5 border-b-2 border-slate-300 flex justify-between items-center shrink-0 shadow-inner">
                    <div className="flex items-center">
                        <Zap className={`w-6 h-6 mr-3 ${allowMultiple ? 'text-black' : 'text-slate-400'}`} />
                        <span className="font-black text-black uppercase tracking-widest text-lg">
                            {allowMultiple ? 'MULTI-SELECT ACTIVE' : 'SINGLE-PLY OVERRIDE'}
                        </span>
                    </div>
                    {allowMultiple && actionablePieces.length > 0 && (
                        <button onClick={toggleSelectAll} className="px-8 py-3 bg-black text-white font-black rounded-xl hover:bg-slate-800 active:scale-95 transition-all flex items-center shadow-lg tracking-widest">
                            {selectedIds.size === actionablePieces.length ? <Square className="w-5 h-5 mr-3" /> : <CheckSquare className="w-5 h-5 mr-3" />}
                            {selectedIds.size === actionablePieces.length ? 'DESELECT ALL PENDING' : 'SELECT ALL PENDING'}
                        </button>
                    )}
                </div>

                <div className="flex-grow p-8 overflow-y-auto">
                    <div className="space-y-10">
                        {groups.map(([groupName, groupPieces]) => (
                            <div key={groupName}>
                                {groupName !== 'Default' && <h4 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4 border-b-2 border-slate-300 pb-2">{groupName}</h4>}
                                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4">
                                    {groupPieces.map(piece => {
                                        const isSelected = selectedIds.has(piece.id);
                                        return (
                                            <button key={piece.id} disabled={piece.qc_status === 'NEEDS_REWORK'} onClick={() => togglePiece(piece)} className={`relative aspect-square rounded-2xl border-4 font-mono font-black text-3xl flex items-center justify-center transition-all active:scale-95 ${getPieceColorClass(piece.qc_status, isSelected)}`}>
                                                {piece.piece_sequence}
                                                {isSelected && <Check className="absolute top-2 right-2 w-8 h-8 text-white bg-indigo-500 rounded-full p-1 shadow-md" strokeWidth={4} />}
                                                {piece.qc_status === 'NEEDS_REWORK' && <Hammer className="absolute top-2 right-2 w-6 h-6 text-amber-900" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-4 border-t-4 border-slate-300 shadow-[0_-20px_50px_rgba(0,0,0,0.15)] flex flex-col shrink-0">
                    {!intendedAction ? (
                        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                            <div className="bg-slate-100 px-5 py-3 rounded-xl border-2 border-slate-300 text-center min-w-[140px]">
                                <span className="block text-slate-500 text-xs font-black uppercase mb-0.5 tracking-widest">Selected</span>
                                <span className="text-4xl font-black text-black leading-none">{selectedIds.size}</span>
                            </div>

                            <div className="flex-grow grid grid-cols-3 gap-4 h-[60px]">
                                <div className="relative h-full">
                                    {/* RULE: Lock bundle approval if active reworks OR partial selection */}
                                    {isBundleLocked && selectedIds.size > 0 && <div className="absolute -top-8 left-0 w-full text-center pointer-events-none"><span className="bg-amber-400 text-black text-xs font-black uppercase tracking-widest px-3 py-1 rounded-md shadow-lg">Bundle Locked: Active Reworks</span></div>}
                                    {itemInfo.isBundle && !isBundleLocked && selectedIds.size > 0 && selectedIds.size !== actionablePieces.length && <div className="absolute -top-8 left-0 w-full text-center pointer-events-none"><span className="bg-amber-400 text-black text-xs font-black uppercase tracking-widest px-3 py-1 rounded-md shadow-lg">Partial Selection: Reject/Rework Only</span></div>}

                                    <button onClick={() => handleActionInitiation('APPROVED')} disabled={selectedIds.size === 0 || isBundleLocked || (itemInfo.isBundle && selectedIds.size !== actionablePieces.length)} className="w-full h-full bg-black text-white rounded-xl font-black text-lg shadow-xl hover:bg-slate-800 active:scale-95 disabled:opacity-20 disabled:bg-slate-400 flex items-center justify-center border-b-4 border-slate-800">
                                        <CheckCircle2 className="w-5 h-5 mr-2" /> APPROVE
                                    </button>
                                </div>

                                <button onClick={() => handleActionInitiation('NEEDS_REWORK')} disabled={selectedIds.size === 0} className="w-full h-full bg-amber-400 text-black rounded-xl font-black text-lg shadow-xl hover:bg-amber-500 active:scale-95 disabled:opacity-30 disabled:bg-slate-200 flex items-center justify-center border-b-4 border-amber-600"><Hammer className="w-5 h-5 mr-2" /> REWORK</button>
                                <button onClick={() => handleActionInitiation('QC_REJECTED')} disabled={selectedIds.size === 0} className="w-full h-full bg-rose-600 text-white rounded-xl font-black text-lg shadow-xl hover:bg-rose-700 active:scale-95 disabled:opacity-30 disabled:bg-slate-200 flex items-center justify-center border-b-4 border-rose-800"><XCircle className="w-5 h-5 mr-2" /> REJECT</button>
                            </div>
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex justify-between items-center mb-6">
                                <h4 className="text-3xl font-black flex items-center uppercase tracking-tight text-black">
                                    <AlertCircle className={`w-10 h-10 mr-4 ${intendedAction === 'NEEDS_REWORK' ? 'text-amber-500' : 'text-rose-600'}`} /> Reason for {intendedAction.replace('_', ' ')}?
                                </h4>
                                <button onClick={() => {setIntendedAction(null); setSelectedCategory(null);}} className="bg-slate-200 px-8 py-4 rounded-xl font-black text-slate-700 uppercase tracking-widest active:scale-95">Cancel</button>
                            </div>
                            {!selectedCategory ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-56 overflow-y-auto">
                                    {Array.from(new Set(defectCodes.map(d => d.category))).map(cat => (
                                        <button key={cat} onClick={() => setSelectedCategory(cat)} className="bg-white border-4 border-slate-200 p-6 rounded-2xl font-black text-2xl hover:border-black hover:text-black transition-all text-slate-600 uppercase tracking-wide">{cat}</button>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-56 overflow-y-auto">
                                    {availableDefects.map(defect => (
                                        <button key={defect.id} onClick={() => submitValidation(intendedAction, defect.id)} className="bg-black text-white p-6 rounded-2xl text-left shadow-xl hover:bg-indigo-600 active:scale-95 transition-all border-b-4 border-slate-800">
                                            <span className="block text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">{defect.code}</span>
                                            <span className="text-2xl font-black leading-tight">{defect.description}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// REPAIR VALIDATION MODAL (Double-Reject Enabled)
// ============================================================================
const ApproveAlteredModal = ({ itemInfo, defectCodes, onClose, onSave }) => {
    // 🚨 BUG FIX: Capture initial target IDs so pieces don't disappear when they change to 'APPROVED' or 'REJECTED'
    const [targetIds] = useState(() => new Set(itemInfo.pieces.filter(p => p.qc_status === 'NEEDS_REWORK').map(p => p.id)));
    const reworkPieces = itemInfo.pieces.filter(p => targetIds.has(p.id));

    const groupedPieces = reworkPieces.reduce((acc, p) => {
        const group = p._displayGroup || 'Default';
        if (!acc[group]) acc[group] = [];
        acc[group].push(p);
        return acc;
    }, {});
    const groups = Object.entries(groupedPieces);

    const [selectedIds, setSelectedIds] = useState(new Set());
    const [intendedAction, setIntendedAction] = useState(null); 
    const [selectedCategory, setSelectedCategory] = useState(null);

    const togglePiece = (id) => {
        if (intendedAction) return;
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (intendedAction) return;
        // Only select pieces that are STILL in NEEDS_REWORK
        const actionableReworks = reworkPieces.filter(p => p.qc_status === 'NEEDS_REWORK');
        if (selectedIds.size === actionableReworks.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(actionableReworks.map(p => p.id)));
    };

    const executeAction = async (status, defectCodeId = null) => {
        await onSave({ pieceIds: Array.from(selectedIds), status, defectCodeId }); 
        setSelectedIds(new Set()); setIntendedAction(null); setSelectedCategory(null);
    };

    const categories = Array.from(new Set(defectCodes.map(d => d.category)));
    const availableDefects = defectCodes.filter(d => d.category === selectedCategory);

    return (
        <div className="fixed inset-0 bg-black/95 z-[150] flex flex-col p-0 font-inter">
            <div className="bg-amber-400 text-black p-6 flex justify-between items-center shrink-0 border-b-4 border-amber-600">
                <div>
                    <h3 className="text-4xl font-black uppercase tracking-tight">{itemInfo.titleOverride || `VALIDATE REPAIRS`}</h3>
                    <p className="text-lg text-amber-900 mt-1 font-bold">Select pieces returning from alteration line.</p>
                </div>
                <button onClick={onClose} className="p-4 bg-black/10 hover:bg-black hover:text-amber-400 rounded-full transition-all"><X className="w-8 h-8"/></button>
            </div>
            
            <div className="flex-grow overflow-y-auto bg-slate-100 p-8">
                <div className="flex justify-between items-center mb-8 pb-4 border-b-2 border-slate-300">
                    <label className="text-xl font-black text-slate-800 uppercase tracking-widest">Active Rework Tickets</label>
                    <button onClick={toggleSelectAll} className="flex items-center text-sm font-black text-white hover:bg-slate-800 transition-colors bg-black px-6 py-3 rounded-xl shadow-lg uppercase tracking-widest">
                        {selectedIds.size === reworkPieces.filter(p => p.qc_status === 'NEEDS_REWORK').length && reworkPieces.length > 0 ? <CheckSquare className="w-5 h-5 mr-3" /> : <Square className="w-5 h-5 mr-3" />}
                        {selectedIds.size === reworkPieces.filter(p => p.qc_status === 'NEEDS_REWORK').length ? 'DESELECT ALL' : 'SELECT ALL'}
                    </button>
                </div>
                <div className="space-y-10">
                    {groups.map(([groupName, groupPieces]) => (
                        <div key={groupName}>
                            {groupName !== 'Default' && <h4 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">{groupName}</h4>}
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
                                {groupPieces.map((piece) => {
                                    const isSelected = selectedIds.has(piece.id);
                                    return (
                                        <button key={piece.id} disabled={intendedAction !== null || piece.qc_status !== 'NEEDS_REWORK'} onClick={() => togglePiece(piece.id)} className={`relative aspect-square rounded-2xl border-4 font-mono font-black text-3xl flex items-center justify-center transition-all duration-200 select-none ${isSelected ? "bg-amber-400 border-amber-600 text-black shadow-xl transform scale-110 z-10" : getPieceColorClass(piece.qc_status, false)}`}>
                                            {!isSelected && piece.qc_status === 'NEEDS_REWORK' && <Hammer size={24} className="absolute text-amber-200 opacity-50" />}
                                            <span className="relative z-10">{piece.piece_sequence}</span>
                                            {isSelected && <Check className="absolute -top-3 -right-3 w-8 h-8 bg-black text-white rounded-full shadow-lg p-1.5" strokeWidth={4} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="px-8 py-8 border-t-4 border-slate-300 bg-white shrink-0">
                 {!intendedAction ? (
                    <div className="flex justify-between items-center gap-8">
                        <span className="text-lg font-black text-slate-500 uppercase tracking-widest bg-slate-100 px-6 py-4 rounded-2xl border-2 border-slate-200">
                            Validating: <strong className="text-amber-500 text-4xl ml-3 align-middle">{selectedIds.size}</strong>
                        </span>
                        <div className="flex space-x-6 flex-grow justify-end h-20">
                            <button onClick={onClose} className="px-8 bg-slate-200 text-slate-700 font-black rounded-2xl hover:bg-slate-300 transition-colors uppercase tracking-widest">Cancel</button>
                            
                            {/* FLOW FIX: The operator can now FAIL a piece that comes back from Rework */}
                            <button onClick={() => setIntendedAction('QC_REJECTED')} disabled={selectedIds.size === 0} className="px-8 bg-rose-600 text-white font-black rounded-2xl shadow-xl hover:bg-rose-700 disabled:opacity-30 disabled:bg-slate-300 flex items-center text-2xl uppercase tracking-wider border-b-4 border-rose-800">
                                <XCircle className="w-6 h-6 mr-3" /> FAILED
                            </button>
                            <button onClick={() => executeAction('APPROVED')} disabled={selectedIds.size === 0} className="px-10 bg-black text-amber-400 font-black rounded-2xl shadow-xl hover:bg-slate-800 disabled:opacity-30 disabled:bg-slate-300 flex items-center text-2xl uppercase tracking-wider border-b-4 border-slate-800">
                                <CheckCircle2 className="w-8 h-8 mr-3" /> PASSED
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex justify-between items-center mb-6">
                            <h4 className="text-3xl font-black flex items-center uppercase tracking-tight text-black">
                                <AlertCircle className={`w-10 h-10 mr-4 text-rose-600`} /> Reason Repair Failed?
                            </h4>
                            <button onClick={() => {setIntendedAction(null); setSelectedCategory(null);}} className="bg-slate-200 px-8 py-4 rounded-xl font-black text-slate-700 uppercase tracking-widest active:scale-95">Cancel</button>
                        </div>
                        {!selectedCategory ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-48 overflow-y-auto">
                                {categories.map(cat => (
                                    <button key={cat} onClick={() => setSelectedCategory(cat)} className="bg-white border-4 border-slate-200 p-6 rounded-2xl font-black text-2xl hover:border-black hover:text-black transition-all text-slate-600 uppercase tracking-wide">{cat}</button>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-48 overflow-y-auto">
                                {availableDefects.map(defect => (
                                    <button key={defect.id} onClick={() => executeAction('QC_REJECTED', defect.id)} className="bg-rose-600 text-white p-6 rounded-2xl text-left shadow-xl hover:bg-rose-700 active:scale-95 transition-all border-b-4 border-rose-800">
                                        <span className="block text-sm font-bold text-rose-200 uppercase tracking-widest mb-2">{defect.code}</span>
                                        <span className="text-2xl font-black leading-tight">{defect.description}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// ROLL-LEVEL HANDOFF BUTTON
// ============================================================================
const RollHandoffButton = ({ batchId, lineId, rollId, onComplete }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleHandoff = async () => {
        setIsLoading(true);
        try {
            const response = await universalApi.checkCompletion({ batchId, lineId, rollId });
            const data = response.data;
            if (data.isComplete) {
                alert(`ROLL #${rollId} COMPLETE: ${data.message}`);
                if (onComplete) onComplete();
            } else {
                alert(`NOT READY: ${data.message || 'Pieces still pending on this roll.'}`);
            }
        } catch (error) {
            alert(error.response?.data?.error || 'SYSTEM ERROR: Check connection.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleHandoff}
            disabled={isLoading || !lineId}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-900 text-white text-sm font-black rounded-xl shadow-lg active:scale-95 transition-all flex items-center uppercase tracking-widest disabled:opacity-50 border-b-4 border-slate-900"
        >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            COMPLETE ROLL
        </button>
    );
};

// ============================================================================
// PART ACCORDION (Piece Mode Grouping)
// ============================================================================
const PartAccordion = ({ batch, roll, part, setModalState, allowMultiple }) => {
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
        setModalState({ type: 'alter', isBundle: false, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: roll.roll_id, partId: part.part_id, partName: part.part_name, pieces: allPieces, titleOverride: `Bulk Fix: ${part.part_name}` });
    };

    return (
        <div className="bg-white border-2 border-slate-200 rounded-2xl mb-4 shadow-sm overflow-hidden transition-all">
            <div className="p-5 flex flex-col md:flex-row md:justify-between md:items-center bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center mb-3 md:mb-0">
                    {isOpen ? <ChevronDown className="w-6 h-6 mr-4 text-slate-500" /> : <ChevronRight className="w-6 h-6 mr-4 text-slate-500" />}
                    <Component className="w-6 h-6 mr-3 text-indigo-500" />
                    <h4 className="font-black text-slate-800 text-xl tracking-tight uppercase">{part.part_name}</h4>
                    <span className="ml-5 text-xs font-bold text-slate-500 bg-slate-200 px-3 py-1.5 rounded-lg uppercase tracking-widest">{status.total_processed} / {status.total_cut} Processed</span>
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
                                onRepair={() => setModalState({ type: 'alter', isBundle: false, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: roll.roll_id, partId: part.part_id, partName: part.part_name, size: size.size, pieces: sizePieces })}
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
const ValidationProgressRow = ({ label, subLabel, icon: Icon, entity, onInspect, onRepair, canApproveBundle, onQuickApprove }) => {
    const { total_cut, total_processed, pending_alter, isComplete, total_validated, total_rejected, total_repaired } = checkEntityStatus(entity);
    if (total_cut === 0) return null;

    return (
        <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between hover:border-indigo-300 transition-colors">
            <div className="flex items-center w-full md:w-1/3 mb-3 md:mb-0">
                <div className="p-3 bg-slate-100 text-indigo-600 rounded-xl mr-4"><Icon size={24}/></div>
                <div>
                    <span className="font-black text-slate-800 tracking-tight block text-lg">{label}</span>
                    {subLabel && <span className="text-xs text-indigo-500 font-black uppercase tracking-widest">{subLabel}</span>}
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">{total_processed} / {total_cut} pieces</span>
                </div>
            </div>

            <div className="w-full md:w-1/3 h-3 bg-slate-100 rounded-full flex overflow-hidden shadow-inner md:mx-6 mb-4 md:mb-0">
                <div className="bg-emerald-500" style={{ width: `${(total_validated/total_cut)*100}%` }}></div>
                <div className="bg-teal-400" style={{ width: `${(total_repaired/total_cut)*100}%` }}></div>
                <div className="bg-amber-400" style={{ width: `${(pending_alter/total_cut)*100}%` }}></div>
                <div className="bg-rose-500" style={{ width: `${(total_rejected/total_cut)*100}%` }}></div>
            </div>

            <div className="w-full md:w-1/3 flex justify-start md:justify-end items-center space-x-3">
                {pending_alter > 0 && (
                     <button onClick={() => onRepair(entity)} className="px-4 py-2 text-sm bg-amber-100 text-amber-900 border-2 border-amber-200 rounded-xl hover:bg-amber-200 font-black flex items-center shadow-sm active:scale-95 transition-all"><Hammer className="w-4 h-4 mr-2"/> Fix Rework ({pending_alter})</button>
                )}
                {!isComplete ? (
                    <>
                        <button onClick={() => onInspect(entity)} className="px-6 py-2 text-sm bg-white text-slate-800 border-2 border-slate-300 rounded-xl hover:border-indigo-500 hover:text-indigo-700 font-black shadow-sm active:scale-95 flex items-center transition-all">INSPECT</button>
                        {canApproveBundle && (
                            <button onClick={() => onQuickApprove(entity)} className="px-4 py-2 text-sm bg-emerald-100 text-emerald-800 border-2 border-emerald-200 rounded-xl hover:bg-emerald-200 font-black shadow-sm active:scale-95 flex items-center transition-all">
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
    const [selectedBatchId, setSelectedBatchId] = useState('ALL');
    const [openBatchId, setOpenBatchId] = useState(null);

    const allowMultiple = headerInfo.can_approve_multiple_piece || false;
    const allowBundle = headerInfo.can_approve_whole_bundle || false;
    const allowRoll = headerInfo.can_approve_whole_roll || false;

    const fetchQueue = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await universalApi.getWorkstationData();
            console.log("Fetched workstation data:", res.data); // Debug log to verify API response
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
        } catch (err) { 
            alert(err.response?.data?.error || `Error: ${err.message}`); 
            throw err; 
        } finally {
            setIsProcessing(false); // 🚨 Global Full-Screen Lock OFF
        }
    };

    const handleApproveAlterSubmit = async ({ pieceIds, status, defectCodeId }) => {
        setIsProcessing(true); // 🚨 Global Full-Screen Lock ON
        try {
            await universalApi.approveAlteredPieces({ batchId: modalState.batchId, pieceIds, status, defectCodeId });
            const newBatches = await fetchQueue();
            refreshLiveModalPieces(newBatches); // Push fresh DB state to modal grid
        } catch (err) { 
            alert(err.response?.data?.error || `Error: ${err.message}`); 
            throw err; 
        } finally {
            setIsProcessing(false); // 🚨 Global Full-Screen Lock OFF
        }
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
        } catch (err) { alert(err.response?.data?.error || `Error: ${err.message}`); } 
        finally { setIsProcessing(false); }
    };

    if (isLoading && !isProcessing) return <Spinner />;
    if (error) return <div className="p-8"><ErrorDisplay message={error} /></div>;

    const filteredBatches = selectedBatchId === 'ALL' ? batches : batches.filter(b => String(b.batch_id) === String(selectedBatchId));

    const groupedBatches = filteredBatches.reduce((acc, batch) => {
        const lineName = headerInfo.line_name || 'Unassigned Line';
        if (!acc[lineName]) acc[lineName] = [];
        acc[lineName].push(batch);
        return acc;
    }, {});

    return (
        <div className="p-4 sm:p-10 bg-slate-200 min-h-screen font-inter text-slate-800 relative">
            
            {/* 🚨 THE GLOBAL FULL-SCREEN LOCK: z-[9999] physically blocks the whole window */}
            {isProcessing && (
                <div className="fixed inset-0 w-screen h-screen bg-black/90 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center">
                    <Loader2 className="w-20 h-20 text-white animate-spin mb-8" />
                    <h2 className="text-white text-4xl font-black tracking-widest uppercase shadow-sm">Syncing Database...</h2>
                </div>
            )}

            <div className="max-w-[1400px] mx-auto">
                <header className="mb-12 bg-white p-8 rounded-[2rem] shadow-sm border-b-4 border-slate-300 flex flex-col md:flex-row md:justify-between md:items-center gap-6">
                    <div>
                        <h1 className="text-4xl font-black text-slate-900 flex items-center tracking-tight">
                            <ClipboardCheck className="w-12 h-12 mr-5 text-indigo-600"/>
                            {headerInfo.line_name || 'Workstation Terminal'}
                        </h1>
                        <div className="flex items-center gap-4 mt-5">
                            <span className="text-sm font-black uppercase tracking-widest bg-slate-900 text-white px-5 py-2.5 rounded-xl shadow-md">MODE: {headerInfo.processing_mode}</span>
                            {allowMultiple && <span className="text-sm font-bold bg-amber-400 text-black px-4 py-2.5 rounded-xl flex items-center shadow-sm uppercase tracking-widest"><Zap size={16} className="mr-2"/> Multi-Select ON</span>}
                        </div>
                    </div>
                    {batches.length > 1 && (
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Filter Batch</span>
                            <select
                                value={selectedBatchId}
                                onChange={e => setSelectedBatchId(e.target.value)}
                                className="bg-slate-900 text-white font-black text-sm px-5 py-3 rounded-xl shadow-md border-2 border-slate-700 hover:border-indigo-500 focus:outline-none focus:border-indigo-500 cursor-pointer uppercase tracking-widest"
                            >
                                <option value="ALL">ALL BATCHES</option>
                                {batches.map(b => (
                                    <option key={b.batch_id} value={String(b.batch_id)}>BATCH #{b.batch_id} ({b.batch_code})</option>
                                ))}
                            </select>
                        </div>
                    )}
                </header>

                <div className="space-y-12">
                    {Object.keys(groupedBatches).length === 0 && (
                        <div className="text-center py-24 bg-white rounded-[3rem] border-4 border-dashed border-slate-300 shadow-sm">
                            <p className="text-slate-400 font-black text-2xl uppercase tracking-widest">No active batches assigned.</p>
                        </div>
                    )}

                    {Object.entries(groupedBatches).map(([lineName, lineBatches]) => (
                        <div key={lineName} className="space-y-8">
                            {lineBatches.map(batch => {
                                const isBundleMode = headerInfo.processing_mode === 'BUNDLE';
                                
                                return (
                                    <div key={batch.batch_id} className="bg-white rounded-[2rem] shadow-xl border-2 border-slate-300 overflow-hidden">
                                        <div
                                            className="bg-black p-8 flex flex-col md:flex-row md:justify-between md:items-center gap-6 cursor-pointer select-none"
                                            onClick={() => setOpenBatchId(prev => prev === batch.batch_id ? null : batch.batch_id)}
                                        >
                                            <div className="flex flex-col gap-3">
                                                <h2 className="text-4xl font-black text-white flex items-center tracking-tight uppercase">
                                                    {openBatchId === batch.batch_id
                                                        ? <ChevronDown className="w-8 h-8 mr-4 text-slate-500" />
                                                        : <ChevronRight className="w-8 h-8 mr-4 text-slate-500" />}
                                                    <Shirt className="w-10 h-10 mr-5 text-indigo-400" /> BATCH #{batch.batch_id} <span className="ml-5 text-2xl font-bold text-slate-500 font-mono tracking-widest">({batch.batch_code})</span>
                                                </h2>
                                                {(batch.cut_rolls != null || batch.total_rolls != null) && (
                                                    <div className="flex items-center gap-3 ml-1">
                                                        <span className="text-xs font-black uppercase tracking-widest text-slate-500">Rolls</span>
                                                        <span className="text-sm font-black text-white bg-slate-800 px-4 py-1.5 rounded-lg border border-slate-700">
                                                            {batch.cut_rolls ?? '—'} <span className="text-slate-500">/ {batch.total_rolls ?? '—'} CUT</span>
                                                        </span>
                                                        {batch.cut_rolls != null && batch.total_rolls != null && (
                                                            <span className={`text-xs font-black px-3 py-1.5 rounded-lg uppercase tracking-widest ${batch.cut_rolls >= batch.total_rolls ? 'bg-emerald-500 text-black' : 'bg-amber-400 text-black'}`}>
                                                                {batch.cut_rolls >= batch.total_rolls ? 'All Cut' : `${batch.total_rolls - batch.cut_rolls} Remaining`}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div onClick={e => e.stopPropagation()}>
                                                <StageCompletionHandoff batchId={batch.batch_id} lineId={headerInfo.line_id} onBatchComplete={() => fetchQueue()} />
                                            </div>
                                        </div>

                                        {openBatchId === batch.batch_id && <div className="p-6 md:p-10 bg-slate-100">
                                            {isBundleMode && batch.bundles && batch.bundles.length > 0 ? (() => {
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
                                                        bundles.flatMap(b => b.pieces.map(p => ({ 
                                                            ...p, 
                                                            bundle_id: b.bundle_id, part_id: b.part_id, size: b.size, 
                                                            _displayGroup: `${partName} | Size ${b.size}` 
                                                        })))
                                                    );
                                                    const rollStatus = checkEntityStatus({ pieces: allRollPieces });

                                                    return (
                                                        <div key={rollId} className="mb-12 last:mb-0 border-l-[8px] border-indigo-500 bg-white rounded-r-[2rem] p-8 md:p-10 shadow-sm border-y-2 border-r-2 border-slate-200">
                                                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 pb-6 border-b-4 border-slate-200 gap-6">
                                                                <h3 className="font-black text-black flex items-center text-3xl uppercase tracking-widest bg-slate-100 px-8 py-4 rounded-2xl w-max border-2 border-slate-300">
                                                                    <Layers className="w-10 h-10 mr-5 text-indigo-600"/> ROLL #{rollId}
                                                                </h3>
                                                                <div className="flex items-center gap-4">
                                                                    {allowRoll && !rollStatus.isComplete && (
                                                                        <button onClick={() => setModalState({ type: 'validate', isBundle: true, isRollInspect: true, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: rollId, partName: 'ALL PARTS', pieces: allRollPieces, titleOverride: `Bulk Inspect: Roll #${rollId}`, allowMultiple })} className="px-10 py-5 bg-black hover:bg-slate-800 text-white text-xl font-black rounded-2xl shadow-xl active:scale-95 transition-all flex items-center uppercase tracking-widest">
                                                                            <CheckCircle2 className="w-8 h-8 mr-4 text-amber-400"/> INSPECT WHOLE ROLL
                                                                        </button>
                                                                    )}
                                                                    <RollHandoffButton batchId={batch.batch_id} lineId={headerInfo.line_id} rollId={rollId} onComplete={() => fetchQueue()} />
                                                                </div>
                                                            </div>
                                                            
                                                            {Object.entries(parts).map(([partName, bundles]) => (
                                                                <div key={partName} className="mb-10 last:mb-0">
                                                                    <h4 className="font-black text-slate-800 text-2xl tracking-tight uppercase mb-6 flex items-center pl-2 border-l-4 border-slate-300 ml-2">
                                                                        <Component className="w-8 h-8 mr-4 text-indigo-500 ml-4" /> {partName}
                                                                    </h4>
                                                                    <div className="space-y-4 pl-4">
                                                                        {bundles.map(bundle => (
                                                                            <ValidationProgressRow key={bundle.bundle_id} label={`Size ${bundle.size}`} subLabel={`Bundle ${bundle.bundle_code}`} icon={Package} entity={bundle}
                                                                                canApproveBundle={allowBundle}
                                                                                onQuickApprove={(entity) => handleQuickBulkApprove(entity, batch.batch_id, rollId)}
                                                                                onInspect={() => setModalState({ type: 'validate', isBundle: true, batchId: batch.batch_id, batchCode: batch.batch_code, allowMultiple, ...bundle, pieces: bundle.pieces.map(p => ({...p, _displayGroup: `${partName} | Size ${bundle.size}`})) })}
                                                                                onRepair={() => setModalState({ type: 'alter', isBundle: true, batchId: batch.batch_id, batchCode: batch.batch_code, ...bundle })}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                });
                                            })() : null}

                                            {!isBundleMode && batch.rolls && batch.rolls.length > 0 ? (
                                                batch.rolls.map(roll => (
                                                    <div key={roll.roll_id} className="mb-12 last:mb-0 border-l-[8px] border-indigo-500 bg-white rounded-r-[2rem] p-8 md:p-10 shadow-sm border-y-2 border-r-2 border-slate-200">
                                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 pb-6 border-b-4 border-slate-200 gap-6">
                                                            <h3 className="font-black text-black flex items-center text-3xl uppercase tracking-widest bg-slate-100 px-8 py-4 rounded-2xl w-max border-2 border-slate-300">
                                                                <Layers className="w-10 h-10 mr-5 text-indigo-600"/> ROLL #{roll.roll_id}
                                                            </h3>
                                                            <div className="flex items-center gap-4">
                                                                {allowRoll && (
                                                                    <button onClick={() => {
                                                                        const allRollPieces = roll.parts_details.flatMap(pt => pt.size_details.flatMap(sz => sz.pieces.map(p => ({ ...p, part_id: pt.part_id, size: sz.size, _displayGroup: `${pt.part_name} | Size ${sz.size}` }))));
                                                                        setModalState({ type: 'validate', isBundle: false, isRollInspect: true, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: roll.roll_id, partName: 'ALL PARTS', pieces: allRollPieces, titleOverride: `Bulk Inspect: Roll #${roll.roll_id}`, allowMultiple });
                                                                    }} className="px-10 py-5 bg-black hover:bg-slate-800 text-white text-xl font-black rounded-2xl shadow-xl active:scale-95 transition-all flex items-center uppercase tracking-widest">
                                                                        <CheckCircle2 className="w-8 h-8 mr-4 text-amber-400"/> INSPECT WHOLE ROLL
                                                                    </button>
                                                                )}
                                                                <RollHandoffButton batchId={batch.batch_id} lineId={headerInfo.line_id} rollId={roll.roll_id} onComplete={() => fetchQueue()} />
                                                            </div>
                                                        </div>
                                                        {roll.parts_details.map(part => (
                                                            <PartAccordion key={part.part_id} batch={batch} roll={roll} part={part} setModalState={setModalState} allowMultiple={allowMultiple} />
                                                        ))}
                                                    </div>
                                                ))
                                            ) : null}
                                        </div>}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {modalState && modalState.type === 'validate' && <UniversalValidationModal itemInfo={modalState} defectCodes={defectCodes} onClose={() => setModalState(null)} onValidationSubmit={handleValidationSubmit} />}
            {modalState && modalState.type === 'alter' && <ApproveAlteredModal itemInfo={modalState} defectCodes={defectCodes} onClose={() => setModalState(null)} onSave={handleApproveAlterSubmit} />}
        </div>
    );
};

export default UniversalWorkstationDashboard;