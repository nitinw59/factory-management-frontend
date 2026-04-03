import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { numberingCheckerApi } from '../../api/numberingCheckerApi';
import { 
    Shirt, Layers, ClipboardCheck, Component, Check, X, 
    Hammer, Loader2, ChevronDown, ChevronRight, CheckCircle2, 
    Search, RefreshCw, FolderCheck, CheckSquare, Square, XCircle, ArrowLeft
} from 'lucide-react';

// ============================================================================
// UI HELPERS
// ============================================================================
const Spinner = () => (
    <div className="flex justify-center items-center p-8">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
    </div>
);

const ErrorDisplay = ({ message }) => (
    <div className="p-4 bg-red-100 text-red-700 rounded-lg font-medium shadow-sm">{message}</div>
);

// ============================================================================
// LOGIC HELPERS 
// ============================================================================
const checkSizeStatus = (detail) => {
    const pieces = detail.pieces || [];
    const total_cut = pieces.length;
    const total_validated = pieces.filter(p => p.qc_status === 'APPROVED').length;
    const total_rejected = pieces.filter(p => p.qc_status === 'QC_REJECTED').length;
    const total_repaired = pieces.filter(p => p.qc_status === 'REPAIRED').length;
    const pending_alter = pieces.filter(p => p.qc_status === 'NEEDS_REWORK').length;
    
    const total_processed = total_validated + total_rejected + total_repaired;
    const isComplete = (total_processed + pending_alter) >= total_cut && total_cut > 0 && pending_alter === 0;

    return { total_cut, total_processed, pending_alter, isComplete, total_validated, total_rejected, total_repaired };
};

const checkRollStatus = (roll) => {
    if (!roll.parts_details || roll.parts_details.length === 0) return false;
    return roll.parts_details.every(part => part.size_details.every(size => checkSizeStatus(size).isComplete));
};

const isBatchComplete = (batch) => {
    if (!batch.rolls || batch.rolls.length === 0) return false;
    return batch.rolls.every(r => checkRollStatus(r));
};

const hasPartData = (part) => part.size_details && part.size_details.some(detail => (detail.pieces?.length || 0) > 0);
const hasRollData = (roll) => roll.parts_details && roll.parts_details.some(part => hasPartData(part));
const hasBatchData = (batch) => batch.rolls && batch.rolls.some(roll => hasRollData(roll));

// ============================================================================
// TOUCH-FRIENDLY VALIDATION MODAL (No Dropdowns!)
// ============================================================================

const getPieceColorClass = (status, isSelected) => {
    if (isSelected) return "bg-indigo-600 border-indigo-600 text-white shadow-lg transform scale-110 z-10";
    switch(status) {
        case 'APPROVED': return "bg-green-50 border-green-200 text-green-600 opacity-50 cursor-not-allowed";
        case 'REPAIRED': return "bg-teal-50 border-teal-200 text-teal-600 opacity-50 cursor-not-allowed";
        case 'QC_REJECTED': return "bg-red-50 border-red-200 text-red-600 opacity-50 cursor-not-allowed";
        case 'NEEDS_REWORK': return "bg-amber-100 border-amber-300 text-amber-700 cursor-pointer hover:border-amber-500 shadow-sm";
        case 'PENDING':
        default: return "bg-white border-slate-300 text-slate-700 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer shadow-sm";
    }
};

const ValidationModal = ({ itemInfo, defectCodes, onClose, onValidationSubmit }) => {
    const pieces = itemInfo.pieces || []; 
    const pendingPieces = pieces.filter(p => !p.qc_status || p.qc_status === 'PENDING');

    const [selectedIds, setSelectedIds] = useState(new Set());
    const [submittingAction, setSubmittingAction] = useState(null); 
    const submitLock = useRef(false);

    // 🚨 NEW UX STATES: For the 2-Step touch button flow
    const [intendedAction, setIntendedAction] = useState(null); // 'NEEDS_REWORK' or 'QC_REJECTED'
    const [selectedCategory, setSelectedCategory] = useState(null);

    // If user deselects all pieces while in the defect menu, auto-cancel the flow
    useEffect(() => {
        if (selectedIds.size === 0 && intendedAction !== null) {
            setIntendedAction(null);
            setSelectedCategory(null);
        }
    }, [selectedIds.size, intendedAction]);

    const togglePiece = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === pendingPieces.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(pendingPieces.map(p => p.id)));
    };

    // Triggered when user clicks Approve, Rework, or Reject
    const handleActionInitiation = (action) => {
        if (selectedIds.size === 0) { alert("Please select pieces first."); return; }
        
        if (action === 'APPROVED') {
            // Approval needs no defect reason, submit instantly
            submitValidation('APPROVED', null);
        } else {
            // Rework/Reject needs a defect reason, open the category view
            setIntendedAction(action);
            setSelectedCategory(null);
        }
    };

    // The final submission method
    const submitValidation = async (qcStatus, defectCodeId) => {
        if (submitLock.current || submittingAction !== null) return;
        submitLock.current = true;
        setSubmittingAction(qcStatus);
        
        try {
            await onValidationSubmit({ 
                batchId: itemInfo.batchId, rollId: itemInfo.rollId, partId: itemInfo.partId, 
                size: itemInfo.size, pieceIds: Array.from(selectedIds), qcStatus, defectCodeId: defectCodeId || null
            });
        } catch (err) {
            submitLock.current = false;
            setSubmittingAction(null);
            // Reset UI if it fails so they can try again
            setIntendedAction(null);
            setSelectedCategory(null);
        }
    };

    const categories = Array.from(new Set(defectCodes.map(d => d.category)));
    const availableDefects = defectCodes.filter(d => d.category === selectedCategory);

    return (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={submittingAction === null ? onClose : undefined}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight">Piece-Level QC: {itemInfo.partName}</h3>
                        <div className="text-sm mt-1 text-slate-600 font-medium">
                             Batch <span className="font-bold text-slate-900">{itemInfo.batchCode || itemInfo.batchId}</span> | 
                             Roll <span className="font-bold text-indigo-700 mx-1">#{itemInfo.rollId}</span> | 
                             Size <span className="font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded ml-1">{itemInfo.size}</span>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={submittingAction !== null} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-6 h-6 text-slate-500"/></button>
                </div>

                {/* Piece Grid */}
                <div className="p-6 overflow-y-auto flex-grow bg-slate-100/50">
                    <div className="flex justify-between items-center mb-4">
                        <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Interactive Ply Sequence</label>
                        <button onClick={toggleSelectAll} className="flex items-center text-sm font-semibold text-indigo-700 hover:text-indigo-900 transition-colors bg-indigo-100 px-3 py-2 rounded-lg shadow-sm">
                            {selectedIds.size === pendingPieces.length && pendingPieces.length > 0 ? <CheckSquare className="w-4 h-4 mr-2" /> : <Square className="w-4 h-4 mr-2" />}
                            {selectedIds.size === pendingPieces.length ? 'Deselect All Pending' : 'Select All Pending'}
                        </button>
                    </div>

                    <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-3">
                        {pieces.map(piece => {
                            const isPending = !piece.qc_status || piece.qc_status === 'PENDING';
                            const isSelected = selectedIds.has(piece.id);
                            return (
                                <button
                                    key={piece.id} disabled={!isPending || submittingAction !== null} onClick={() => togglePiece(piece.id)}
                                    className={`relative aspect-square rounded-xl border-2 font-mono font-black text-lg flex items-center justify-center transition-all duration-200 select-none ${getPieceColorClass(piece.qc_status, isSelected)}`}
                                >
                                    {piece.piece_sequence}
                                    {isSelected && <Check className="absolute top-1 right-1 w-4 h-4 text-white" strokeWidth={3} />}
                                    {piece.qc_status === 'NEEDS_REWORK' && <Hammer className="absolute -top-2 -right-2 w-5 h-5 text-amber-500 bg-white rounded-full p-0.5 shadow-sm" />}
                                    {piece.qc_status === 'QC_REJECTED' && <XCircle className="absolute -top-2 -right-2 w-5 h-5 text-red-500 bg-white rounded-full p-0.5 shadow-sm" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 🚀 THE NEW TOUCH-FRIENDLY FOOTER */}
                <div className="px-6 py-5 border-t bg-white flex flex-col shrink-0 min-h-[120px] justify-center relative">
                    
                    {/* View 1: Default Actions (Approve, Rework, Reject) */}
                    {!intendedAction && (
                        <div className="flex justify-between items-center animate-in fade-in slide-in-from-left-4">
                            <span className="text-sm font-bold text-slate-500">Selected: <strong className="text-indigo-600 text-3xl ml-1">{selectedIds.size}</strong></span>
                            <div className="grid grid-cols-3 gap-4 w-3/4">
                                <button onClick={() => handleActionInitiation('APPROVED')} disabled={selectedIds.size === 0} className="py-4 px-2 bg-green-600 text-white rounded-2xl font-bold shadow-md hover:bg-green-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center text-lg">
                                    <Check className="w-6 h-6 mr-2"/> APPROVE
                                </button>
                                <button onClick={() => handleActionInitiation('NEEDS_REWORK')} disabled={selectedIds.size === 0} className="py-4 px-2 bg-amber-500 text-white rounded-2xl font-bold shadow-md hover:bg-amber-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center text-lg">
                                    <Hammer className="w-6 h-6 mr-2"/> REWORK
                                </button>
                                <button onClick={() => handleActionInitiation('QC_REJECTED')} disabled={selectedIds.size === 0} className="py-4 px-2 bg-red-600 text-white rounded-2xl font-bold shadow-md hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center text-lg">
                                    <XCircle className="w-6 h-6 mr-2"/> REJECT
                                </button>
                            </div>
                        </div>
                    )}

                    {/* View 2: Category Selection */}
                    {intendedAction && !selectedCategory && (
                        <div className="animate-in fade-in slide-in-from-right-4">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm font-black text-slate-700 flex items-center uppercase tracking-wide">
                                    {intendedAction === 'NEEDS_REWORK' ? <Hammer className="w-5 h-5 mr-2 text-amber-500"/> : <XCircle className="w-5 h-5 mr-2 text-red-500"/>}
                                    Select Defect Category
                                </span>
                                <button onClick={() => setIntendedAction(null)} className="text-sm text-slate-500 hover:text-slate-800 font-bold flex items-center bg-slate-100 px-3 py-1.5 rounded-lg active:scale-95">
                                    <X className="w-4 h-4 mr-1"/> Cancel
                                </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {categories.map(cat => (
                                    <button 
                                        key={cat} 
                                        onClick={() => setSelectedCategory(cat)} 
                                        className="p-4 border-2 border-slate-200 rounded-2xl font-black text-slate-600 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 transition-all active:scale-95 shadow-sm text-center"
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* View 3: Specific Defect Selection */}
                    {intendedAction && selectedCategory && (
                        <div className="animate-in fade-in slide-in-from-right-4 relative">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm font-black text-slate-700 flex items-center uppercase tracking-wide">
                                    <span className="bg-slate-800 text-white px-2.5 py-1 rounded-md mr-3">{selectedCategory}</span> 
                                    Select Specific Defect
                                </span>
                                <button onClick={() => setSelectedCategory(null)} className="text-sm text-indigo-600 hover:text-indigo-800 font-bold flex items-center bg-indigo-50 px-3 py-1.5 rounded-lg active:scale-95">
                                    <ArrowLeft className="w-4 h-4 mr-1"/> Back
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-48 overflow-y-auto pr-2 pb-2">
                                {availableDefects.map(defect => (
                                    <button
                                        key={defect.id}
                                        onClick={() => submitValidation(intendedAction, defect.id)}
                                        disabled={submittingAction !== null}
                                        className={`p-4 border-2 rounded-2xl text-left transition-all active:scale-95 shadow-sm flex flex-col justify-center
                                            ${intendedAction === 'NEEDS_REWORK' ? 'border-amber-200 hover:border-amber-500 hover:bg-amber-50 text-amber-900 bg-amber-50/30' : 'border-red-200 hover:border-red-500 hover:bg-red-50 text-red-900 bg-red-50/30'}
                                        `}
                                    >
                                        <span className="font-black text-xs mb-1 opacity-60 tracking-wider">{defect.code}</span>
                                        <span className="font-bold text-sm leading-snug">{defect.description}</span>
                                    </button>
                                ))}
                            </div>
                            
                            {/* Loading Overlay if saving */}
                            {submittingAction && (
                                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
                                    <div className="bg-white p-4 rounded-full shadow-lg flex items-center">
                                        <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mr-3"/>
                                        <span className="font-bold text-slate-700">Saving...</span>
                                    </div>
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
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={!isSubmitting ? onClose : undefined}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                 <div className="px-6 py-4 border-b bg-amber-50 border-amber-100 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-amber-900 tracking-tight">Validate Repairs: {itemInfo.partName}</h3>
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

                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-3">
                        {reworkPieces.map((piece) => {
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
// HIERARCHICAL DATA ROWS & CARDS
// ============================================================================
const SizeValidationRow = ({ sizeDetail, onValidateClick, onApproveAlterClick }) => {
    const { total_cut, total_processed, pending_alter, isComplete, total_validated, total_repaired, total_rejected } = checkSizeStatus(sizeDetail);
    if (total_cut === 0) return null;

    const approvedPercent = total_cut > 0 ? (total_validated / total_cut) * 100 : 0;
    const repairedPercent = total_cut > 0 ? (total_repaired / total_cut) * 100 : 0;
    const rejectedPercent = total_cut > 0 ? (total_rejected / total_cut) * 100 : 0;
    const pendingAlterPercent = total_cut > 0 ? (pending_alter / total_cut) * 100 : 0;
    
    return (
        <div className="p-3 bg-white border-b last:border-b-0 hover:bg-slate-50 transition-colors">
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center">
                    <span className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm mr-3 border border-slate-200">
                        {sizeDetail.size}
                    </span>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Progress</span>
                        <span className="text-sm font-bold text-slate-800">{total_processed} <span className="text-slate-400 text-xs font-normal">/ {total_cut} pieces</span></span>
                    </div>
                </div>
                
                <div className="flex items-center space-x-2">
                    {pending_alter > 0 && (
                         <button onClick={onApproveAlterClick} className="px-3 py-1.5 text-xs bg-amber-100 text-amber-800 border border-amber-200 rounded-md hover:bg-amber-200 font-semibold flex items-center transition-colors shadow-sm">
                            <Hammer className="w-3 h-3 mr-1.5"/> Fix Rework ({pending_alter})
                        </button>
                    )}
                    {!isComplete ? (
                        <button onClick={onValidateClick} className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-bold shadow-sm transition-all active:scale-95 flex items-center">
                            Inspect Pieces <ChevronRight className="w-4 h-4 ml-1" />
                        </button>
                    ) : (
                        <span className="px-3 py-1 text-xs bg-green-100 text-green-700 border border-green-200 rounded-md font-bold flex items-center">
                            <Check className="w-3 h-3 mr-1"/> Validated
                        </span>
                    )}
                </div>
            </div>

            <div className="w-full h-2.5 bg-slate-200 rounded-full flex overflow-hidden shadow-inner mt-1">
                <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${approvedPercent}%` }} title={`Approved: ${total_validated}`}></div>
                <div className="bg-teal-400 h-full transition-all duration-500" style={{ width: `${repairedPercent}%` }} title={`Repaired: ${total_repaired}`}></div>
                <div className="bg-amber-400 h-full transition-all duration-500" style={{ width: `${pendingAlterPercent}%` }} title={`Needs Rework: ${pending_alter}`}></div>
                <div className="bg-red-500 h-full transition-all duration-500" style={{ width: `${rejectedPercent}%` }} title={`Rejected: ${total_rejected}`}></div>
            </div>
        </div>
    );
};

const PrimaryPartCard = ({ part, rollId, onValidateClick, onApproveAlterClick, activeContext }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    useEffect(() => {
        if (activeContext && String(activeContext.rollId) === String(rollId) && String(activeContext.partId) === String(part.part_id)) setIsExpanded(true);
    }, [activeContext, rollId, part.part_id]);

    if (!hasPartData(part)) return null;

    const partStats = part.size_details.reduce((acc, curr) => {
        const stats = checkSizeStatus(curr);
        return { processed: acc.processed + stats.total_processed, cut: acc.cut + stats.total_cut };
    }, { processed: 0, cut: 0 });

    const percent = partStats.cut > 0 ? Math.round((partStats.processed / partStats.cut) * 100) : 0;
    const isPartComplete = partStats.processed >= partStats.cut;

    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm transition-all mb-2">
            <div onClick={() => setIsExpanded(!isExpanded)} className={`p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50 border-b border-slate-100' : ''}`}>
                <div className="flex items-center">
                    <div className={`p-1.5 rounded mr-3 ${isExpanded ? 'bg-slate-200 text-slate-700' : 'text-slate-400'}`}>
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                    <span className="font-black text-slate-800 text-[15px] flex items-center">
                        <Component className="w-5 h-5 mr-2 text-indigo-600"/> {part.part_name}
                    </span>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="text-right">
                        <div className="text-xs font-bold text-slate-500">{partStats.processed} / {partStats.cut}</div>
                        <div className="w-20 h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full rounded-full ${isPartComplete ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${percent}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>
            {isExpanded && (
                <div className="bg-slate-50/50 p-2 space-y-2">
                    {part.size_details.map(detail => (
                        <SizeValidationRow 
                            key={detail.size} sizeDetail={detail} 
                            onValidateClick={() => onValidateClick({ partId: part.part_id, partName: part.part_name, rollId, ...detail })} 
                            onApproveAlterClick={() => onApproveAlterClick({ partId: part.part_id, rollId, ...detail})} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const FabricRollCard = ({ roll, onValidateClick, onApproveAlterClick, activeContext }) => {
    const validParts = roll.parts_details.filter(hasPartData);
    if (validParts.length === 0) return null;
    return (
        <div className="mb-4">
            <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-t-xl flex items-center">
                <Layers className="w-5 h-5 mr-2 text-indigo-600"/>
                <span className="font-black text-indigo-900 text-sm">Roll #{roll.roll_id}</span>
                <span className="ml-auto text-xs font-bold text-indigo-500 bg-white px-2 py-0.5 rounded-md border border-indigo-100 shadow-sm">{validParts.length} Primary Parts</span>
            </div>
            <div className="p-3 bg-indigo-50/20 border-x border-b border-indigo-100 rounded-b-xl shadow-sm">
                {validParts.map(part => (
                    <PrimaryPartCard 
                        key={part.part_id} part={part} rollId={roll.roll_id} 
                        onValidateClick={onValidateClick} onApproveAlterClick={onApproveAlterClick} activeContext={activeContext} 
                    />
                ))}
            </div>
        </div>
    );
};

const ProductionBatchCard = ({ batch, onValidateClick, onApproveAlterClick, activeContext, initiallyExpanded = false }) => {
    const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
    const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);

    const validRolls = batch.rolls.filter(hasRollData);
    const completedRolls = validRolls.filter(r => checkRollStatus(r));
    const activeRolls = validRolls.filter(r => !checkRollStatus(r));

    if (validRolls.length === 0) return null;
    
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all mb-6">
            <div 
                className={`bg-white border-b border-slate-100 p-5 cursor-pointer hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-indigo-50/30' : ''}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex justify-between items-center">
                    <div className="flex items-center">
                        <div className={`p-2.5 rounded-xl mr-4 transition-colors ${isExpanded ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                            <Shirt className="w-7 h-7" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 flex items-center">Batch #{batch.batch_id}</h2>
                            <p className="text-xs text-slate-500 font-bold mt-0.5 tracking-wide">{batch.batch_code || 'No Code'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Pending Rolls</span>
                            <span className="text-2xl font-black text-indigo-600 leading-none">{activeRolls.length}</span>
                        </div>
                        <div className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''} text-slate-400`}><ChevronDown size={24} /></div>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="p-5 bg-slate-50/50">
                    {activeRolls.length > 0 ? (
                        <div className="space-y-2 mb-4">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center mb-4">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 mr-2 shadow-sm"></span> Active Rolls
                            </h4>
                            {activeRolls.map(roll => (
                                <FabricRollCard 
                                    key={roll.roll_id} roll={roll} 
                                    onValidateClick={(itemInfo) => onValidateClick(batch.batch_id, batch.batch_code, itemInfo)} 
                                    onApproveAlterClick={(itemInfo) => onApproveAlterClick(batch.batch_id, itemInfo)} 
                                    activeContext={activeContext}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="p-6 text-center text-sm text-slate-500 font-bold bg-white rounded-xl border-2 border-dashed border-slate-200 mb-4">All active rolls completed!</div>
                    )}

                    {completedRolls.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-slate-200">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsCompletedExpanded(!isCompletedExpanded); }}
                                className="flex items-center justify-between w-full text-left group bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300"
                            >
                                <h4 className="text-sm font-black text-slate-500 uppercase tracking-wider flex items-center group-hover:text-slate-700 transition-colors">
                                    <CheckCircle2 className="w-5 h-5 text-green-500 mr-2"/> Completed Rolls ({completedRolls.length})
                                </h4>
                                <div className="text-slate-400 transition-colors">{isCompletedExpanded ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}</div>
                            </button>
                            
                            {isCompletedExpanded && (
                                <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                    {completedRolls.map(roll => (
                                        <div key={roll.roll_id} className="opacity-75 hover:opacity-100 transition-opacity">
                                            <FabricRollCard 
                                                roll={roll} 
                                                onValidateClick={(itemInfo) => onValidateClick(batch.batch_id, batch.batch_code, itemInfo)} 
                                                onApproveAlterClick={(itemInfo) => onApproveAlterClick(batch.batch_id, itemInfo)} 
                                                activeContext={activeContext} 
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// MAIN PAGE DASHBOARD
// ============================================================================
const NumberingCheckerDashboardPage = () => {
    const [batches, setBatches] = useState([]);
    const [defectCodes, setDefectCodes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefetching, setIsRefetching] = useState(false);
    const [error, setError] = useState(null);
    const [modalState, setModalState] = useState({ type: null, data: null });
    const [headerInfo, setHeaderInfo] = useState({ lineName: 'N/A', lineId: null });
    
    const [batchFilter, setBatchFilter] = useState('');
    const [showCompletedBatches, setShowCompletedBatches] = useState(false);
    const [lastActiveContext, setLastActiveContext] = useState(null);

    const fetchQueue = useCallback(async (isInitial = false) => {
        if (isInitial) setIsLoading(true); else setIsRefetching(true);
        try {
            const res = await numberingCheckerApi.getMyQueue();
            let fetchedBatches = res.data.batches || [];
            fetchedBatches.sort((a, b) => a.batch_id - b.batch_id);
            setBatches(fetchedBatches);
            setHeaderInfo({ lineName: res.data.workstationInfo?.line_name || 'N/A', lineId: res.data.workstationInfo?.line_id || null });
            setError(null);
        } catch (err) {
            if (isInitial) setError("Could not load your assigned queue."); else console.error(err);
        } finally { 
            setIsLoading(false); setIsRefetching(false);
        }
    }, []);

    useEffect(() => { 
        fetchQueue(true); 
        numberingCheckerApi.getDefectCodes?.().then(res => setDefectCodes(res.data)).catch(console.error);
    }, [fetchQueue]);

    const openValidationModal = (batchId, batchCode, itemInfo) => setModalState({ type: 'validate', data: { batchId, itemInfo: { ...itemInfo, batchCode } } });
    const openAlterModal = (batchId, itemInfo) => setModalState({ type: 'alter', data: { batchId, itemInfo } });
    const closeModal = () => setModalState({ type: null, data: null });

    const applyLocalPieceUpdate = useCallback((batchId, rollId, partId, size, pieceIds, qcStatus) => {
        setBatches(prevBatches => prevBatches.map(batch => {
            if (batch.batch_id !== batchId) return batch;
            return { ...batch, rolls: batch.rolls.map(roll => {
                if (roll.roll_id !== rollId) return roll;
                return { ...roll, parts_details: roll.parts_details.map(part => {
                    if (part.part_id !== partId) return part;
                    return { ...part, size_details: part.size_details.map(sz => {
                        if (sz.size !== size) return sz;
                        const updatedPieces = (sz.pieces || []).map(p => {
                            if (pieceIds.includes(p.id)) return { ...p, qc_status: qcStatus };
                            return p;
                        });
                        return { ...sz, pieces: updatedPieces };
                    })};
                })};
            })};
        }));
    }, []);

    const handleValidationSubmit = async (validationData) => {
        try {
            const batchId = modalState.data.batchId;
            setLastActiveContext({ batchId, rollId: validationData.rollId, partId: validationData.partId });
            console.log("Submitting validation for pieces with IDs:", batchId, validationData.rollId, validationData.partId, validationData.size, validationData.pieceIds, validationData.qcStatus);
            await numberingCheckerApi.logNumberingCheck({ ...validationData, batchId });
            applyLocalPieceUpdate(batchId, validationData.rollId, validationData.partId, validationData.size, validationData.pieceIds, validationData.qcStatus);
            closeModal();
            fetchQueue(false); 
        } catch (err) { alert(err.response?.data?.error || `Error: ${err.message}`); }
    };

    const handleApproveAlterSubmit = async (pieceIds) => {
        try {
            const { itemInfo, batchId } = modalState.data;
            setLastActiveContext({ batchId, rollId: itemInfo.rollId, partId: itemInfo.partId });
            
            console.log("Approving altered pieces with IDs:", batchId, itemInfo.rollId, itemInfo.partId, itemInfo.size, pieceIds);
            await numberingCheckerApi.approveAlteredPieces({ batchId, ...itemInfo, pieceIds });
            applyLocalPieceUpdate(batchId, itemInfo.rollId, itemInfo.partId, itemInfo.size, pieceIds, 'REPAIRED');
            closeModal();
            fetchQueue(false);
        } catch (err) { alert(err.response?.data?.error || `Error: ${err.message}`); }
    };

    const validBatches = batches.filter(hasBatchData);
    const filteredBatches = validBatches.filter(b => 
        (b.batch_id?.toString() || '').includes(batchFilter) || 
        (b.batch_code?.toLowerCase() || '').includes(batchFilter.toLowerCase())
    );

    const activeBatchesList = filteredBatches.filter(b => !isBatchComplete(b));
    const completedBatchesList = filteredBatches.filter(b => isBatchComplete(b));

    return (
        <div className="p-4 sm:p-8 bg-slate-100 min-h-screen font-inter text-slate-800">
            <div className="max-w-6xl mx-auto">
                <header className="mb-10">
                     <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6">
                        <div>
                            <h1 className="text-4xl font-black text-slate-900 flex items-center tracking-tight">
                                <ClipboardCheck className="w-10 h-10 mr-4 text-indigo-600"/>
                                QC & Validation
                                {isRefetching && <Loader2 className="ml-4 w-6 h-6 animate-spin text-slate-400" />}
                            </h1>
                            <p className="text-slate-500 mt-2 font-bold text-lg">Station: <strong className="text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg ml-1">{headerInfo.lineName}</strong></p>
                        </div>
                        <div className="relative w-full md:w-auto">
                            <Search className="absolute left-4 top-3.5 text-slate-400 w-5 h-5" />
                            <input 
                                type="text" placeholder="Filter Batch Code..." value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}
                                className="pl-11 pr-4 py-3 border-2 border-slate-200 rounded-xl text-base focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none w-full md:w-64 shadow-sm transition-all font-semibold text-slate-700"
                            />
                        </div>
                    </div>
                </header>

                {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                    <div className="space-y-8">
                        <div>
                            <h2 className="text-xl font-black text-slate-700 mb-5 flex items-center uppercase tracking-wider">
                                <span className="w-4 h-4 rounded-full bg-indigo-500 mr-3 shadow-md"></span>
                                Active Queue ({activeBatchesList.length})
                            </h2>
                            {activeBatchesList.length > 0 ? (
                                activeBatchesList.map(batch => (
                                    <ProductionBatchCard 
                                        key={batch.batch_id} batch={batch} 
                                        onValidateClick={openValidationModal} onApproveAlterClick={openAlterModal} 
                                        activeContext={lastActiveContext} initiallyExpanded={true}
                                    />
                                ))
                            ) : (
                                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-300 shadow-sm">
                                    <p className="text-slate-400 font-bold text-lg">{batchFilter ? "No active batches match your filter." : "No active batches available for checking."}</p>
                                </div>
                            )}
                        </div>

                        {completedBatchesList.length > 0 && (
                            <div className="mt-12 pt-8 border-t-2 border-slate-200">
                                <button 
                                    onClick={() => setShowCompletedBatches(!showCompletedBatches)}
                                    className="flex items-center justify-between w-full p-6 bg-white rounded-2xl shadow-sm border-2 border-slate-200 hover:border-indigo-300 transition-all active:scale-[0.99]"
                                >
                                    <div className="flex items-center text-slate-700">
                                        <FolderCheck className="w-8 h-8 mr-4 text-green-500" />
                                        <h2 className="text-xl font-black uppercase tracking-wider">Completed Batches ({completedBatchesList.length})</h2>
                                    </div>
                                    <div className="text-slate-400 bg-slate-50 p-2 rounded-lg">{showCompletedBatches ? <ChevronDown size={28} /> : <ChevronRight size={28} />}</div>
                                </button>

                                {showCompletedBatches && (
                                    <div className="mt-6 space-y-6 animate-in slide-in-from-top-4 duration-300">
                                        {completedBatchesList.map(batch => (
                                            <div key={batch.batch_id} className="opacity-75 hover:opacity-100 transition-opacity">
                                                <ProductionBatchCard batch={batch} onValidateClick={openValidationModal} onApproveAlterClick={openAlterModal} activeContext={lastActiveContext} initiallyExpanded={false} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {modalState.type === 'validate' && <ValidationModal itemInfo={modalState.data.itemInfo} defectCodes={defectCodes} onClose={closeModal} onValidationSubmit={handleValidationSubmit} />}
            {modalState.type === 'alter' && <ApproveAlteredModal itemInfo={modalState.data.itemInfo} onClose={closeModal} onSave={handleApproveAlterSubmit} />}
        </div>
    );
};

export default NumberingCheckerDashboardPage;