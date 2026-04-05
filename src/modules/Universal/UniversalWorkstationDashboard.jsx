import React, { useState, useEffect, useCallback, useRef } from 'react';
import { universalApi } from '../../api/universalApi'; 
import { 
    Shirt, Layers, ClipboardCheck, Component, Check, X, 
    Hammer, Loader2, ChevronDown, ChevronRight, CheckCircle2, 
    Square, CheckSquare, XCircle, ArrowLeft, Package, Send, AlertCircle
} from 'lucide-react';

// ============================================================================
// UI & LOGIC HELPERS
// ============================================================================
const Spinner = () => (
    <div className="flex justify-center items-center p-8">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
    </div>
);

const ErrorDisplay = ({ message }) => (
    <div className="p-4 bg-red-100 text-red-700 rounded-lg font-medium shadow-sm">{message}</div>
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

const getPieceColorClass = (status, isSelected) => {
    if (isSelected) return "bg-indigo-600 border-indigo-600 text-white shadow-lg transform scale-110 z-10";
    switch(status) {
        case 'APPROVED': return "bg-green-50 border-green-200 text-green-600 opacity-50 cursor-not-allowed";
        case 'REPAIRED': return "bg-teal-50 border-teal-200 text-teal-600 opacity-50 cursor-not-allowed";
        case 'QC_REJECTED': return "bg-red-50 border-red-200 text-red-600 opacity-50 cursor-not-allowed";
        case 'PREVIOUSLY_REJECTED': return "bg-slate-200 border-slate-300 text-slate-400 opacity-60 cursor-not-allowed line-through diagonal-stripes";
        case 'NEEDS_REWORK': return "bg-amber-100 border-amber-300 text-amber-700 cursor-pointer hover:border-amber-500 shadow-sm";
        case 'PENDING':
        default: return "bg-white border-slate-300 text-slate-700 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer shadow-sm";
    }
};

// ============================================================================
// STAGE COMPLETION HANDOFF WIDGET
// ============================================================================
const StageCompletionHandoff = ({ batchId, lineId, onBatchComplete }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [wipReport, setWipReport] = useState(null);

    const handleHandoff = async () => {
        setIsLoading(true);
        try {
            const response = await universalApi.checkCompletion({ batchId, lineId });
            const data = response.data;

            if (data.isComplete) {
                alert(`Success: ${data.message}`);
                if (onBatchComplete) onBatchComplete();
            } else {
                setWipReport(data);
            }
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to check completion status.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <button 
                onClick={handleHandoff}
                disabled={isLoading || !lineId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm active:scale-95 transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Hand Off Batch
            </button>

            {wipReport && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setWipReport(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="bg-amber-50 p-6 border-b border-amber-100 flex justify-between items-start">
                            <div className="flex items-center text-amber-900">
                                <AlertCircle className="w-8 h-8 mr-4 text-amber-600 shrink-0" />
                                <div>
                                    <h3 className="font-black text-xl tracking-tight">Cannot Complete Stage</h3>
                                    <p className="text-sm font-medium mt-1 text-amber-700">{wipReport.message}</p>
                                </div>
                            </div>
                            <button onClick={() => setWipReport(null)} className="text-amber-700 hover:bg-amber-200 p-2 rounded-full transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {wipReport.details && wipReport.details.length > 0 ? (
                            <div className="p-0 max-h-[50vh] overflow-y-auto bg-slate-50">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 border-b border-slate-200 shadow-sm z-10">
                                        <tr>
                                            <th className="px-6 py-4 uppercase tracking-wider text-xs">Bundle / Location</th>
                                            <th className="px-6 py-4 uppercase tracking-wider text-xs">Part</th>
                                            <th className="px-6 py-4 uppercase tracking-wider text-xs">Current Status</th>
                                            <th className="px-6 py-4 uppercase tracking-wider text-xs text-right">Missing Qty</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {wipReport.details.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 font-mono font-bold text-slate-800">{row.bundle_code}</td>
                                                <td className="px-6 py-4 font-bold text-slate-600">{row.part_name}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider
                                                        ${row.current_bundle_status === 'NEEDS_REWORK' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}
                                                    `}>
                                                        {row.current_bundle_status === 'PENDING' ? 'Unscanned' : row.current_bundle_status.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-black text-rose-600 text-base">{row.missing_piece_count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-8 text-center text-slate-500 font-medium">
                                Please review the batch for any outstanding errors or unscanned items.
                            </div>
                        )}

                        <div className="p-5 bg-white border-t border-slate-200 flex justify-end">
                            <button onClick={() => setWipReport(null)} className="px-8 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 active:scale-95 transition-all shadow-sm">
                                Resume Scanning
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// ============================================================================
// UNIVERSAL MODALS (Validation & Repair)
// ============================================================================
const UniversalValidationModal = ({ itemInfo, defectCodes, onClose, onValidationSubmit }) => {
    const pieces = itemInfo.pieces || []; 
    // We only want pieces that aren't finalized yet
    const actionablePieces = pieces.filter(p => 
        p.qc_status !== 'APPROVED' && 
        p.qc_status !== 'REPAIRED' && 
        p.qc_status !== 'QC_REJECTED' &&
        p.qc_status !== 'PREVIOUSLY_REJECTED'
    );

    const [selectedIds, setSelectedIds] = useState(new Set());
    const [submittingAction, setSubmittingAction] = useState(null); 
    const [intendedAction, setIntendedAction] = useState(null); 
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [localPieces, setLocalPieces] = useState(pieces); // Local state for instant UI update

    // --- BIG HEADER DATA ---
    const displayBatch = itemInfo.batchCode || itemInfo.batchId;
    const displayRoll = itemInfo.rollId ? `ROLL #${itemInfo.rollId}` : '';
    const displayPartSize = `${itemInfo.partName} | SIZE ${itemInfo.size || 'N/A'}`;

    const togglePiece = (id) => {
        if (submittingAction) return;
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedIds(newSet);
    };

    const submitValidation = async (qcStatus, defectCodeId) => {
        if (submittingAction || selectedIds.size === 0) return;
        
        setSubmittingAction(qcStatus);
        
        try {
            await onValidationSubmit({ 
                batchId: itemInfo.batchId, 
                rollId: itemInfo.rollId, 
                partId: itemInfo.partId, 
                size: itemInfo.size, 
                pieceIds: Array.from(selectedIds), 
                qcStatus, 
                defectCodeId: defectCodeId || null,
                bundleId: itemInfo.bundle_id 
            });

            // --- PERSISTENT MODAL LOGIC ---
            // 1. Update local UI state to show these pieces as "Processed"
            const updated = localPieces.map(p => 
                selectedIds.has(p.id) ? { ...p, qc_status: qcStatus } : p
            );
            setLocalPieces(updated);
            
            // 2. Reset Selection and Navigation
            setSelectedIds(new Set());
            setIntendedAction(null);
            setSelectedCategory(null);
            setSubmittingAction(null);

        } catch (err) {
            console.error("Backend rejected the submission.");
            setSelectedIds(new Set());
            setIntendedAction(null);
            setSelectedCategory(null);
        }finally {
        // 4. Unlock the UI whether it succeeded or failed
        setSubmittingAction(null);
    }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[150] flex flex-col p-0">
            
            {/* 1. INDUSTRIAL CONTEXT STRIP (MASSIVE INFO) */}
            <div className="bg-black text-white p-6 shadow-2xl flex justify-between items-center border-b border-white/10">
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-12">
                    <div className="flex flex-col">
                        <span className="text-amber-400 text-xs font-black uppercase tracking-[0.2em]">Batch Code</span>
                        <h2 className="text-4xl font-black">{displayBatch}</h2>
                    </div>
                    <div className="flex flex-col border-l-0 md:border-l border-white/20 md:pl-12">
                        <span className="text-indigo-400 text-xs font-black uppercase tracking-[0.2em]">Material Source</span>
                        <h2 className="text-4xl font-black">{displayRoll}</h2>
                    </div>
                    <div className="flex flex-col border-l-0 md:border-l border-white/20 md:pl-12">
                        <span className="text-emerald-400 text-xs font-black uppercase tracking-[0.2em]">Component & Fit</span>
                        <h2 className="text-4xl font-black uppercase">{displayPartSize}</h2>
                    </div>
                </div>
                <button onClick={onClose} className="p-4 bg-white/10 hover:bg-rose-600 rounded-full transition-all">
                    <X className="w-10 h-10 text-white"/>
                </button>
            </div>

            {/* 2. SYNCING OVERLAY (Disables Screen) */}
            {submittingAction && (
                <div className="absolute inset-0 z-[200] bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center">
                    <Loader2 className="w-20 h-20 text-white animate-spin mb-4" />
                    <span className="text-white text-2xl font-black tracking-widest uppercase">Recording {submittingAction}...</span>
                </div>
            )}

            <div className="flex-grow overflow-hidden flex flex-col bg-slate-200">
                <div className="flex-grow p-8 overflow-y-auto">
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-4">
                        {localPieces.map(piece => {
                            const isSelected = selectedIds.has(piece.id);
                            return (
                                <button
                                    key={piece.id} 
                                    disabled={submittingAction !== null} 
                                    onClick={() => togglePiece(piece.id)}
                                    className={`aspect-square rounded-2xl border-4 font-mono font-black text-2xl flex items-center justify-center transition-all shadow-md active:scale-90 ${getPieceColorClass(piece.qc_status, isSelected)}`}
                                >
                                    {piece.piece_sequence}
                                    {isSelected && <Check className="absolute top-2 right-2 w-6 h-6 text-white" strokeWidth={4} />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 3. FIXED COMMAND CENTER (BOTTOM ACTION BAR) */}
                <div className="bg-white p-8 border-t-4 border-slate-300 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] flex flex-col gap-6">
                    {!intendedAction ? (
                        <div className="flex items-center justify-between gap-8">
                            <div className="bg-slate-100 p-6 rounded-3xl border-2 border-slate-200 min-w-[200px] text-center">
                                <span className="block text-slate-400 text-xs font-black uppercase mb-1">Selected Plys</span>
                                <span className="text-6xl font-black text-indigo-600">{selectedIds.size}</span>
                            </div>

                            <div className="flex-grow grid grid-cols-3 gap-6 h-32">
                                <button 
                                    onClick={() => submitValidation('APPROVED')} 
                                    disabled={selectedIds.size === 0} 
                                    className="bg-emerald-600 text-white rounded-[2rem] font-black text-3xl shadow-xl hover:bg-emerald-700 active:scale-95 disabled:opacity-30 flex items-center justify-center"
                                >
                                    <CheckCircle2 className="w-10 h-10 mr-4" /> APPROVE
                                </button>
                                <button 
                                    onClick={() => setIntendedAction('NEEDS_REWORK')} 
                                    disabled={selectedIds.size === 0} 
                                    className="bg-amber-500 text-white rounded-[2rem] font-black text-3xl shadow-xl hover:bg-amber-600 active:scale-95 disabled:opacity-30 flex items-center justify-center"
                                >
                                    <Hammer className="w-10 h-10 mr-4" /> REWORK
                                </button>
                                <button 
                                    onClick={() => setIntendedAction('QC_REJECTED')} 
                                    disabled={selectedIds.size === 0} 
                                    className="bg-rose-600 text-white rounded-[2rem] font-black text-3xl shadow-xl hover:bg-rose-700 active:scale-95 disabled:opacity-30 flex items-center justify-center"
                                >
                                    <XCircle className="w-10 h-10 mr-4" /> REJECT
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="animate-in slide-in-from-bottom-4">
                            <div className="flex justify-between items-center mb-6">
                                <h4 className="text-2xl font-black flex items-center uppercase tracking-tight">
                                    <AlertCircle className={`w-8 h-8 mr-3 ${intendedAction === 'NEEDS_REWORK' ? 'text-amber-500' : 'text-rose-600'}`} />
                                    Reason for {intendedAction.replace('_', ' ')}?
                                </h4>
                                <button onClick={() => {setIntendedAction(null); setSelectedCategory(null);}} className="bg-slate-200 px-6 py-3 rounded-xl font-bold text-slate-600">Cancel</button>
                            </div>
                            
                            {!selectedCategory ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-48 overflow-y-auto">
                                    {Array.from(new Set(defectCodes.map(d => d.category))).map(cat => (
                                        <button key={cat} onClick={() => setSelectedCategory(cat)} className="bg-slate-50 border-2 border-slate-200 p-6 rounded-2xl font-black text-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all">
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-48 overflow-y-auto">
                                    {defectCodes.filter(d => d.category === selectedCategory).map(defect => (
                                        <button key={defect.id} onClick={() => submitValidation(intendedAction, defect.id)} className="bg-indigo-600 text-white p-6 rounded-2xl text-left shadow-lg hover:bg-indigo-700 transition-all">
                                            <span className="block text-xs font-bold opacity-60 uppercase mb-1">{defect.code}</span>
                                            <span className="text-xl font-black leading-tight">{defect.description}</span>
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

const ApproveAlteredModal = ({ itemInfo, onClose, onSave }) => {
    const pieces = itemInfo.pieces || [];
    const reworkPieces = pieces.filter(p => p.qc_status === 'NEEDS_REWORK');

    const groupedPieces = reworkPieces.reduce((acc, p) => {
        const group = p._displayGroup || 'Default';
        if (!acc[group]) acc[group] = [];
        acc[group].push(p);
        return acc;
    }, {});
    const groups = Object.entries(groupedPieces);

    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submitLock = useRef(false);

    const togglePiece = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === reworkPieces.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(reworkPieces.map(p => p.id)));
    };

    const handleSave = async () => {
        if (submitLock.current || isSubmitting) return;
        if (selectedIds.size === 0) { alert("Select pieces to approve as repaired."); return; }
        submitLock.current = true;
        setIsSubmitting(true);
        try { await onSave(Array.from(selectedIds)); } 
        catch (err) { submitLock.current = false; setIsSubmitting(false); }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/70 z-[110] flex justify-center items-center p-4 backdrop-blur-sm" onClick={!isSubmitting ? onClose : undefined}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                 <div className="px-6 py-4 border-b bg-amber-50 border-amber-100 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-amber-900 tracking-tight">
                            {itemInfo.titleOverride || `Validate Repairs: ${itemInfo.isBundle ? itemInfo.bundle_code : itemInfo.partName}`}
                        </h3>
                        <p className="text-sm text-amber-700 mt-1 font-medium">Select specific pieces returning from alteration.</p>
                    </div>
                    <button onClick={onClose} disabled={isSubmitting} className="p-2 hover:bg-amber-200 rounded-full transition-colors"><X className="w-6 h-6 text-amber-600"/></button>
                </div>

                <div className="p-6 overflow-y-auto flex-grow bg-slate-50">
                    <div className="flex justify-between items-center mb-4">
                        <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Pieces Currently in Rework</label>
                        <button onClick={toggleSelectAll} className="flex items-center text-sm font-semibold text-amber-800 hover:text-amber-900 transition-colors bg-amber-200 px-3 py-2 rounded-lg shadow-sm">
                            {selectedIds.size === reworkPieces.length && reworkPieces.length > 0 ? <CheckSquare className="w-4 h-4 mr-2" /> : <Square className="w-4 h-4 mr-2" />}
                            {selectedIds.size === reworkPieces.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>

                    <div className="space-y-6">
                        {groups.map(([groupName, groupPieces]) => (
                            <div key={groupName}>
                                {groupName !== 'Default' && (
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-1">{groupName}</h4>
                                )}
                                <div className="grid grid-cols-6 sm:grid-cols-8 gap-3">
                                    {groupPieces.map((piece) => {
                                        const isSelected = selectedIds.has(piece.id);
                                        const bgClass = isSelected ? "bg-amber-500 border-amber-600 text-white shadow-lg transform scale-110 z-10" : "bg-white border-amber-300 text-amber-600 hover:border-amber-500 shadow-sm";
                                        return (
                                            <button
                                                key={piece.id} disabled={isSubmitting} onClick={() => togglePiece(piece.id)}
                                                className={`relative aspect-square rounded-xl border-2 font-mono font-black text-lg flex items-center justify-center transition-all duration-200 select-none ${bgClass}`}
                                            >
                                                {!isSelected && <Hammer size={18} className="absolute text-amber-300 opacity-30" />}
                                                <span className="relative z-10">{piece.piece_sequence}</span>
                                                {isSelected && <Check className="absolute -top-2 -right-2 w-6 h-6 bg-white text-green-600 rounded-full shadow-md p-1" strokeWidth={3} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="px-6 py-5 border-t bg-white flex justify-between items-center shrink-0">
                    <span className="text-sm font-bold text-slate-500">Fixing: <strong className="text-amber-600 text-3xl ml-1">{selectedIds.size}</strong></span>
                    <div className="flex space-x-4">
                        <button onClick={onClose} disabled={isSubmitting} className="px-6 py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl hover:bg-slate-200 disabled:opacity-50 transition-colors">Cancel</button>
                        <button onClick={handleSave} disabled={isSubmitting || selectedIds.size === 0} className={`px-8 py-4 bg-amber-500 text-white font-bold rounded-2xl shadow-md flex items-center text-lg ${isSubmitting || selectedIds.size === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-amber-600 active:scale-95'}`}>
                            {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mr-2"/> : <CheckCircle2 className="w-6 h-6 mr-2" />} Confirm Fixes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// PART ACCORDION (Hierarchical Bulk Component)
// ============================================================================
const PartAccordion = ({ batch, roll, part, setModalState }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Aggregate all pieces across sizes, injecting a display group tag
    const allPieces = part.size_details.reduce((acc, sz) => {
        const piecesWithSize = sz.pieces.map(p => ({ ...p, _displayGroup: `Size ${sz.size}` }));
        return [...acc, ...piecesWithSize];
    }, []);

    const status = checkEntityStatus({ pieces: allPieces });

    const handleBulkInspect = (e) => {
        e.stopPropagation();
        setModalState({
            type: 'validate',
            isBundle: false,
            batchId: batch.batch_id,
            batchCode: batch.batch_code,
            rollId: roll.roll_id,
            partId: part.part_id,
            partName: part.part_name,
            pieces: allPieces,
            titleOverride: `Bulk Inspect: ${part.part_name}`
        });
    };

    const handleBulkRepair = (e) => {
        e.stopPropagation();
        setModalState({
            type: 'alter',
            isBundle: false,
            batchId: batch.batch_id,
            batchCode: batch.batch_code,
            rollId: roll.roll_id,
            partId: part.part_id,
            partName: part.part_name,
            pieces: allPieces,
            titleOverride: `Bulk Fix: ${part.part_name}`
        });
    };

    return (
        <div className="bg-white border border-slate-200 rounded-xl mb-4 shadow-sm overflow-hidden transition-all">
            <div 
                className="p-4 flex flex-col md:flex-row md:justify-between md:items-center bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center mb-3 md:mb-0">
                    {isOpen ? <ChevronDown className="w-5 h-5 mr-3 text-slate-500" /> : <ChevronRight className="w-5 h-5 mr-3 text-slate-500" />}
                    <Component className="w-5 h-5 mr-2 text-indigo-500" />
                    <h4 className="font-black text-slate-800 text-lg tracking-tight uppercase">{part.part_name}</h4>
                    <span className="ml-4 text-xs font-bold text-slate-500 bg-slate-200 px-2.5 py-1 rounded-lg">
                        {status.total_processed} / {status.total_cut} Processed
                    </span>
                </div>

                <div className="flex items-center space-x-3 ml-10 md:ml-0">
                    {status.pending_alter > 0 && (
                        <button onClick={handleBulkRepair} className="px-3 py-1.5 text-xs bg-amber-100 text-amber-800 border border-amber-200 rounded-md hover:bg-amber-200 font-semibold flex items-center shadow-sm">
                            <Hammer className="w-3 h-3 mr-1.5"/> Bulk Fix ({status.pending_alter})
                        </button>
                    )}
                    {!status.isComplete && (
                        <button onClick={handleBulkInspect} className="px-4 py-1.5 text-sm bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-200 font-bold shadow-sm active:scale-95 flex items-center">
                            Bulk Inspect <ChevronRight className="w-4 h-4 ml-1" />
                        </button>
                    )}
                    {status.isComplete && (
                        <span className="px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-md font-bold flex items-center shadow-sm">
                            <Check className="w-3 h-3 mr-1"/> Validated
                        </span>
                    )}
                </div>
            </div>

            {isOpen && (
                <div className="p-4 bg-white border-t border-slate-100 space-y-3">
                    {part.size_details.map(size => {
                        const sizePieces = size.pieces.map(p => ({ ...p, _displayGroup: `Size ${size.size}` }));
                        return (
                            <ValidationProgressRow 
                                key={size.size} 
                                label={`Size ${size.size}`} 
                                icon={Layers} 
                                entity={{ pieces: sizePieces }}
                                onInspect={() => setModalState({ type: 'validate', isBundle: false, batchId: batch.batch_id, batchCode: batch.batch_code, rollId: roll.roll_id, partId: part.part_id, partName: part.part_name, size: size.size, pieces: sizePieces })}
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
const ValidationProgressRow = ({ label, icon: Icon, entity, onInspect, onRepair }) => {
    const { total_cut, total_processed, pending_alter, isComplete, total_validated, total_rejected, total_repaired } = checkEntityStatus(entity);
    if (total_cut === 0) return null;

    return (
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm mb-2 flex flex-col md:flex-row md:items-center md:justify-between hover:border-indigo-300 transition-colors">
            <div className="flex items-center w-full md:w-1/3 mb-2 md:mb-0">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg mr-3"><Icon size={20}/></div>
                <div>
                    <span className="font-bold text-slate-800 tracking-tight block">{label}</span>
                    <span className="text-xs text-slate-500 font-bold">{total_processed} / {total_cut} pieces</span>
                </div>
            </div>

            <div className="w-full md:w-1/3 h-2.5 bg-slate-100 rounded-full flex overflow-hidden shadow-inner md:mx-4 mb-3 md:mb-0">
                <div className="bg-green-500" style={{ width: `${(total_validated/total_cut)*100}%` }}></div>
                <div className="bg-teal-400" style={{ width: `${(total_repaired/total_cut)*100}%` }}></div>
                <div className="bg-amber-400" style={{ width: `${(pending_alter/total_cut)*100}%` }}></div>
                <div className="bg-red-500" style={{ width: `${(total_rejected/total_cut)*100}%` }}></div>
            </div>

            <div className="w-full md:w-1/3 flex justify-start md:justify-end items-center space-x-2">
                {pending_alter > 0 && (
                     <button onClick={() => onRepair(entity)} className="px-3 py-1.5 text-xs bg-amber-100 text-amber-800 border border-amber-200 rounded-md hover:bg-amber-200 font-semibold flex items-center shadow-sm">
                        <Hammer className="w-3 h-3 mr-1.5"/> Fix Rework ({pending_alter})
                    </button>
                )}
                {!isComplete ? (
                    <button onClick={() => onInspect(entity)} className="px-4 py-1.5 text-sm bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 font-bold shadow-sm active:scale-95 flex items-center">
                        Inspect
                    </button>
                ) : (
                    <span className="px-3 py-1.5 text-xs text-slate-400 font-bold flex items-center w-max">
                        <Check className="w-3 h-3 mr-1"/> Done
                    </span>
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
    const [isProcessing, setIsProcessing] = useState(false); // Global locking state
    const [error, setError] = useState(null);
    const [modalState, setModalState] = useState(null);
    const [headerInfo, setHeaderInfo] = useState({});

    const fetchQueue = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await universalApi.getWorkstationData();
            console.log("Fetched workstation data:", res.data); 
            if (res.data.error) throw new Error(res.data.error);
            setBatches(res.data.batches || []);
            setHeaderInfo(res.data.workstationInfo || {});
        } catch (err) { setError(err.message || "Failed to load workstation data."); } 
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => { 
        fetchQueue(); 
        universalApi.getDefectCodes().then(res => setDefectCodes(res.data)).catch(console.error);
    }, [fetchQueue]);

    const handleValidationSubmit = async (validationData) => {
        setIsProcessing(true);
        try {
            await universalApi.logPieceCheck(validationData);
            // setModalState(null);
            await fetchQueue(); // Re-fetch immediately to ensure perfect DB sync
        } catch (err) { 
            alert(err.response?.data?.error || `Error: ${err.message}`); 
            throw err; // Rethrow to trigger modal retry logic
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApproveAlterSubmit = async (pieceIds) => {
        setIsProcessing(true);
        try {
            const { batchId } = modalState;
            await universalApi.approveAlteredPieces({ batchId, pieceIds });
            setModalState(null);
            await fetchQueue();
        } catch (err) { 
            alert(err.response?.data?.error || `Error: ${err.message}`); 
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading && !isProcessing) return <Spinner />;
    if (error) return <div className="p-8"><ErrorDisplay message={error} /></div>;

    return (
        <div className="p-4 sm:p-8 bg-slate-100 min-h-screen font-inter text-slate-800 relative">
            
            {/* Global Processing Lock Overlay */}
            {isProcessing && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex flex-col items-center justify-center">
                    <Loader2 className="w-14 h-14 text-white animate-spin mb-4" />
                    <h2 className="text-white text-2xl font-black tracking-widest uppercase">Syncing Server...</h2>
                </div>
            )}

            <div className="max-w-6xl mx-auto">
                <header className="mb-10">
                     <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6">
                        <div>
                            <h1 className="text-4xl font-black text-slate-900 flex items-center tracking-tight">
                                <ClipboardCheck className="w-10 h-10 mr-4 text-indigo-600"/>
                                {headerInfo.line_name || 'Workstation'}
                            </h1>
                            <p className="text-slate-500 mt-2 font-bold text-lg">
                                Mode: <strong className="text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg ml-1 uppercase">{headerInfo.processing_mode}</strong>
                            </p>
                        </div>
                    </div>
                </header>

                <div className="space-y-8">
                    {batches.length === 0 && (
                        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-300 shadow-sm">
                            <p className="text-slate-400 font-bold text-lg">No active batches assigned to this line.</p>
                        </div>
                    )}

                    {batches.map(batch => {
                        const isBundleMode = headerInfo.processing_mode === 'BUNDLE';
                        
                        return (
                            <div key={batch.batch_id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="bg-slate-50 border-b border-slate-100 p-5 flex flex-col md:flex-row md:justify-between md:items-center relative gap-4">
                                    <h2 className="text-xl font-black text-slate-900 flex items-center">
                                        <Shirt className="w-6 h-6 mr-3 text-indigo-500" /> Batch #{batch.batch_id} <span className="ml-2 text-sm font-medium text-slate-500 font-mono">({batch.batch_code})</span>
                                    </h2>
                                    
                                    <StageCompletionHandoff 
                                        batchId={batch.batch_id} 
                                        lineId={headerInfo.line_id} 
                                        onBatchComplete={() => fetchQueue()} 
                                    />
                                </div>

                                <div className="p-6">
                                    {/* BUNDLE MODE (Hierarchical Grouping) */}
                                    {isBundleMode && batch.bundles && batch.bundles.length > 0 ? (() => {
                                        // 1. Group bundles dynamically by Roll -> Part
                                        const groupedBundles = batch.bundles.reduce((acc, bundle) => {
                                            const rId = bundle.roll_id || 'Unknown';
                                            const pName = bundle.part_name || 'Mixed';
                                            if (!acc[rId]) acc[rId] = {};
                                            if (!acc[rId][pName]) acc[rId][pName] = [];
                                            acc[rId][pName].push(bundle);
                                            return acc;
                                        }, {});

                                        return Object.entries(groupedBundles).map(([rollId, parts]) => (
                                            <div key={rollId} className="mb-8 last:mb-0 border-l-4 border-indigo-500 pl-4">
                                                <h3 className="font-black text-indigo-900 mb-4 flex items-center text-sm uppercase tracking-widest bg-indigo-50/50 p-2 rounded-md w-max">
                                                    <Layers className="w-4 h-4 mr-2 text-indigo-600"/> ROLL #{rollId}
                                                </h3>
                                                
                                                {Object.entries(parts).map(([partName, bundles]) => (
                                                    <div key={partName} className="bg-white border border-slate-200 rounded-xl mb-4 shadow-sm overflow-hidden p-4">
                                                        <h4 className="font-black text-slate-800 text-md tracking-tight uppercase mb-3 flex items-center border-b border-slate-100 pb-2">
                                                            <Component className="w-5 h-5 mr-2 text-indigo-500" />
                                                            {partName}
                                                        </h4>
                                                        
                                                        <div className="space-y-2 pl-2">
                                                            {bundles.map(bundle => (
                                                                <ValidationProgressRow 
                                                                    key={bundle.bundle_id} 
                                                                    label={`Bundle: ${bundle.bundle_code}`} 
                                                                    icon={Package} 
                                                                    entity={bundle}
                                                                    onInspect={() => setModalState({ type: 'validate', isBundle: true, batchId: batch.batch_id, batchCode: batch.batch_code, ...bundle })}
                                                                    onRepair={() => setModalState({ type: 'alter', isBundle: true, batchId: batch.batch_id, batchCode: batch.batch_code, ...bundle })}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ));
                                    })() : null}
                                    {/* PIECE MODE (Hierarchical Accordions) */}
                                    {!isBundleMode && batch.rolls && batch.rolls.length > 0 ? (
                                        batch.rolls.map(roll => (
                                            <div key={roll.roll_id} className="mb-8 last:mb-0 border-l-4 border-indigo-500 pl-4">
                                                <h3 className="font-black text-indigo-900 mb-4 flex items-center text-sm uppercase tracking-widest bg-indigo-50/50 p-2 rounded-md w-max">
                                                    <Layers className="w-4 h-4 mr-2 text-indigo-600"/> ROLL #{roll.roll_id}
                                                </h3>
                                                {roll.parts_details.map(part => (
                                                    <PartAccordion 
                                                        key={part.part_id} 
                                                        batch={batch} 
                                                        roll={roll} 
                                                        part={part} 
                                                        setModalState={setModalState} 
                                                    />
                                                ))}
                                            </div>
                                        ))
                                    ) : null}
                                    
                                    {(!batch.bundles || batch.bundles.length === 0) && (!batch.rolls || batch.rolls.length === 0) && (
                                        <div className="text-sm text-slate-500 italic p-4 text-center">No actionable items found for this batch.</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {modalState && modalState.type === 'validate' && (
                <UniversalValidationModal 
                    itemInfo={modalState} 
                    defectCodes={defectCodes} 
                    onClose={() => setModalState(null)} 
                    onValidationSubmit={handleValidationSubmit} 
                />
            )}
            
            {modalState && modalState.type === 'alter' && (
                <ApproveAlteredModal 
                    itemInfo={modalState} 
                    onClose={() => setModalState(null)} 
                    onSave={handleApproveAlterSubmit} 
                />
            )}
        </div>
    );
};

export default UniversalWorkstationDashboard;