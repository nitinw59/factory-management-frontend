import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { numberingCheckerApi } from '../../api/numberingCheckerApi';
import { Shirt, Layers, ClipboardCheck, Component, Check, X, Hammer, Wrench, Loader2, ChevronDown, ChevronRight, CheckCircle2, Search, RefreshCw, FolderCheck } from 'lucide-react';

// --- UI & LOGIC COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;
const ErrorDisplay = ({ message }) => <div className="p-4 bg-red-100 text-red-700 rounded-lg">{message}</div>;

// --- REUSABLE QUANTITY SLIDER ---
const QuantitySlider = ({ value, onChange, min = 1, max, disabled, activeColor = 'blue' }) => {
    const handleMinus = () => {
        if (value > min && !disabled) onChange(value - 1);
    };
    const handlePlus = () => {
        if (value < max && !disabled) onChange(value + 1);
    };

    // Style adjustments based on context
    const accentClass = activeColor === 'amber' ? 'accent-amber-500' : 'accent-blue-600';
    const textClass = activeColor === 'amber' ? 'text-amber-600' : 'text-blue-600';

    return (
        <div className="flex flex-col items-center py-2">
            <div className={`text-6xl font-black ${textClass} font-mono mb-6 tracking-tighter drop-shadow-sm`}>
                {value}
            </div>
            <div className="flex items-center w-full gap-4 px-2">
                <button
                    type="button"
                    onClick={handleMinus}
                    disabled={disabled || value <= min}
                    className="w-14 h-14 shrink-0 flex items-center justify-center bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 active:bg-gray-300 disabled:opacity-40 disabled:cursor-not-allowed text-3xl font-medium transition-all shadow-sm"
                >
                    -
                </button>

                <input
                    type="range"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value, 10))}
                    onWheel={(e) => e.target.blur()} // Drop focus to prevent mouse-wheel scroll from changing value
                    disabled={disabled}
                    className={`w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 touch-none ${accentClass}`}
                />

                <button
                    type="button"
                    onClick={handlePlus}
                    disabled={disabled || value >= max}
                    className="w-14 h-14 shrink-0 flex items-center justify-center bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 active:bg-gray-300 disabled:opacity-40 disabled:cursor-not-allowed text-3xl font-medium transition-all shadow-sm"
                >
                    +
                </button>
            </div>
            <div className="flex justify-between w-full px-4 mt-2 text-xs font-bold text-gray-400">
                <span>Min: {min}</span>
                <span>Max: {max}</span>
            </div>
        </div>
    );
};

// --- LOGIC HELPERS ---
const checkSizeStatus = (detail) => {
    const total_cut = parseInt(detail.total_cut, 10) || 0;
    const total_validated = parseInt(detail.total_validated, 10) || 0;
    const total_rejected = parseInt(detail.total_rejected, 10) || 0;
    const total_altered = parseInt(detail.total_altered, 10) || 0;
    const total_repaired = parseInt(detail.total_repaired, 10) || 0;

    const total_processed = total_validated + total_rejected + total_repaired;
    // Pending alter: Altered - (Repaired + Rejected)
    const pending_alter = Math.max(0, total_altered - (total_repaired + total_rejected));
    const isComplete = (total_processed + pending_alter) >= total_cut;

    return { total_cut, total_processed, pending_alter, isComplete };
};

const checkRollStatus = (roll) => {
    if (!roll.parts_details) return false;
    return roll.parts_details.every(part => 
        part.size_details.every(size => checkSizeStatus(size).isComplete)
    );
};

const isBatchComplete = (batch) => {
    if (!batch.rolls || batch.rolls.length === 0) return false;
    return batch.rolls.every(r => checkRollStatus(r));
};

// --- OPTIMIZATION HELPER ---
const willActionCompleteRoll = (roll, action) => {
    return roll.parts_details.every(part => {
        return part.size_details.every(detail => {
            const isTarget = part.part_id === action.partId && detail.size === action.size;
            
            let { total_validated, total_rejected, total_repaired, total_altered, total_cut } = detail;
            total_validated = parseInt(total_validated || 0);
            total_rejected = parseInt(total_rejected || 0);
            total_repaired = parseInt(total_repaired || 0);
            total_altered = parseInt(total_altered || 0);
            total_cut = parseInt(total_cut || 0);

            if (isTarget) {
                const qty = parseInt(action.quantity || 0);
                if (action.qcStatus === 'APPROVED') total_validated += qty;
                else if (action.qcStatus === 'REJECT') total_rejected += qty;
                else if (action.qcStatus === 'ALTER') total_altered += qty;
                else if (action.qcStatus === 'REPAIRED') total_repaired += qty;
            }

            const total_processed = total_validated + total_rejected + total_repaired;
            const pending_alter = Math.max(0, total_altered - (total_repaired + total_rejected));
            
            const allAccountedFor = (total_processed + pending_alter) >= total_cut;
            const noPendingAlter = pending_alter === 0;

            return allAccountedFor && noPendingAlter;
        });
    });
};

const hasPartData = (part) => part.size_details && part.size_details.some(detail => (parseInt(detail.total_cut, 10) || 0) > 0);
const hasRollData = (roll) => roll.parts_details && roll.parts_details.some(part => hasPartData(part));
const hasBatchData = (batch) => batch.rolls && batch.rolls.some(roll => hasRollData(roll));

// Fuzzy search for roll numbers
const isRollMatch = (text, pattern) => {
    if (!pattern) return true;
    try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(text.toString());
    } catch (e) {
        return text.toString().toLowerCase().includes(pattern.toLowerCase());
    }
};

// --- MODAL COMPONENTS ---
const ValidationModal = ({ itemInfo, unloadMode, onClose, onValidationSubmit }) => {
    const total_cut_num = parseInt(itemInfo.total_cut, 10) || 0;
    const total_validated_num = parseInt(itemInfo.total_validated, 10) || 0;
    const total_rejected_num = parseInt(itemInfo.total_rejected, 10) || 0;
    const total_altered_num = parseInt(itemInfo.total_altered, 10) || 0;
    const remaining = total_cut_num - (total_validated_num + total_rejected_num + total_altered_num);
    
    const [quantity, setQuantity] = useState(unloadMode === 'bundle' ? remaining : 1);
    const [submittingAction, setSubmittingAction] = useState(null); // 'APPROVED' or 'ALTER'
    const submitLock = useRef(false);

    useEffect(() => { setQuantity(unloadMode === 'bundle' ? remaining : 1); }, [unloadMode, remaining]);

    const handleStatusClick = async (qcStatus) => {
        if (submitLock.current || submittingAction !== null) return;
        if (quantity <= 0 || quantity > remaining) {
            alert("Invalid quantity selected.");
            return;
        }
        
        submitLock.current = true;
        setSubmittingAction(qcStatus);
        
        try {
            await onValidationSubmit({ rollId: itemInfo.rollId, partId: itemInfo.partId, size: itemInfo.size, quantity, qcStatus });
            // Modal remains open, waiting for parent to execute `closeModal()`
        } catch (err) {
            // Unlock on failure so the user can try again
            submitLock.current = false;
            setSubmittingAction(null);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={submittingAction === null ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Validate: {itemInfo.partName}</h3>
                        <div className="text-sm mt-1 text-gray-600">
                             Batch: <span className="font-bold text-gray-900">{itemInfo.batchCode || itemInfo.batchId}</span>
                             <span className="mx-2">|</span>
                             Roll: <span className="font-bold text-indigo-700">#{itemInfo.rollId}</span>
                        </div>
                        {(itemInfo.rollColor || itemInfo.rollType) && (
                            <div className="text-xs text-gray-500 mt-0.5">
                                {itemInfo.rollType} &bull; <span className="font-semibold text-gray-700">{itemInfo.rollColor}</span>
                            </div>
                        )}
                        <div className="mt-2">
                             <span className="text-xs font-bold uppercase tracking-wide bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                Size: {itemInfo.size}
                             </span>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={submittingAction !== null}><X className="w-6 h-6 text-gray-400 hover:text-gray-600"/></button>
                </div>
                <div className="p-6 space-y-6">
                    <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-sm font-semibold text-gray-700">Quantity to Validate</label>
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Remaining: {remaining}</span>
                        </div>
                        
                        <QuantitySlider 
                            value={quantity} 
                            onChange={setQuantity} 
                            min={1} 
                            max={remaining} 
                            disabled={unloadMode === 'single' || submittingAction !== null} 
                            activeColor="blue"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">QC Decision</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => handleStatusClick('APPROVED')} 
                                disabled={submittingAction !== null || quantity <= 0} 
                                className={`py-3 px-4 bg-green-600 text-white rounded-xl font-bold shadow-sm flex items-center justify-center transition-all ${submittingAction !== null ? 'opacity-70 cursor-not-allowed' : 'hover:bg-green-700 active:scale-95'}`}
                            >
                                {submittingAction === 'APPROVED' ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Check className="w-5 h-5 mr-2"/> APPROVE</>}
                            </button>
                            <button 
                                onClick={() => handleStatusClick('ALTER')} 
                                disabled={submittingAction !== null || quantity <= 0} 
                                className={`py-3 px-4 bg-amber-500 text-white rounded-xl font-bold shadow-sm flex items-center justify-center transition-all ${submittingAction !== null ? 'opacity-70 cursor-not-allowed' : 'hover:bg-amber-600 active:scale-95'}`}
                            >
                                {submittingAction === 'ALTER' ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Hammer className="w-5 h-5 mr-2"/> ALTER</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ApproveAlteredModal = ({ itemInfo, onClose, onSave }) => {
    const pending_alter = parseInt(itemInfo.total_altered, 10) - (parseInt(itemInfo.total_repaired, 10) + parseInt(itemInfo.total_rejected, 10));
    const [quantity, setQuantity] = useState(pending_alter);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submitLock = useRef(false);

    const handleSave = async () => {
        if (submitLock.current || isSubmitting) return;
        if (isNaN(quantity) || quantity <= 0 || quantity > pending_alter) {
            alert("Invalid quantity selected.");
            return;
        }
        
        submitLock.current = true;
        setIsSubmitting(true);
        try {
            await onSave(quantity);
            // Modal remains open, waiting for parent to execute `closeModal()`
        } catch (err) {
            submitLock.current = false;
            setIsSubmitting(false); 
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={!isSubmitting ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                 <div className="px-6 py-4 border-b bg-amber-50 border-amber-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-amber-900">Approve Repaired Pieces</h3>
                        <p className="text-xs text-amber-700 mt-1">Returning from alteration</p>
                    </div>
                    <button onClick={onClose} disabled={isSubmitting}><X className="w-6 h-6 text-amber-400 hover:text-amber-600"/></button>
                </div>
                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Quantity Repaired</label>
                        
                        <QuantitySlider 
                            value={quantity} 
                            onChange={setQuantity} 
                            min={1} 
                            max={pending_alter} 
                            disabled={isSubmitting} 
                            activeColor="amber"
                        />
                    </div>
                </div>
                <div className="px-6 py-4 border-t bg-gray-50 flex justify-end space-x-3">
                    <button onClick={onClose} disabled={isSubmitting} className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                    <button 
                        onClick={handleSave} 
                        disabled={isSubmitting || quantity <= 0} 
                        className={`px-8 py-3 bg-amber-600 text-white font-bold rounded-xl shadow-sm flex items-center ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-amber-700 active:scale-95'}`}
                    >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : null}
                        Confirm Fix
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- DATA ROW COMPONENTS ---
const SizeValidationRow = ({ sizeDetail, onValidateClick, onApproveAlterClick }) => {
    const { total_cut, total_processed, pending_alter, isComplete } = checkSizeStatus(sizeDetail);
    if (total_cut === 0) return null;

    const approvedPercent = total_cut > 0 ? (parseInt(sizeDetail.total_validated||0) / total_cut) * 100 : 0;
    const repairedPercent = total_cut > 0 ? (parseInt(sizeDetail.total_repaired||0) / total_cut) * 100 : 0;
    const rejectedPercent = total_cut > 0 ? (parseInt(sizeDetail.total_rejected||0) / total_cut) * 100 : 0;
    const pendingAlterPercent = total_cut > 0 ? (pending_alter / total_cut) * 100 : 0;
    
    return (
        <div className="p-3 bg-white border-b last:border-b-0 hover:bg-gray-50 transition-colors">
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center">
                    <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-700 text-sm mr-3 border border-gray-200">
                        {sizeDetail.size}
                    </span>
                    <div className="flex flex-col">
                        <span className="text-xs text-gray-500 font-medium uppercase">Progress</span>
                        <span className="text-sm font-bold text-gray-800">{total_processed} <span className="text-gray-400 text-xs font-normal">/ {total_cut}</span></span>
                    </div>
                </div>
                
                <div className="flex items-center space-x-2">
                    {pending_alter > 0 && (
                         <button onClick={onApproveAlterClick} className="px-3 py-1.5 text-xs bg-amber-100 text-amber-800 border border-amber-200 rounded-md hover:bg-amber-200 font-semibold flex items-center transition-colors">
                            <Wrench className="w-3 h-3 mr-1.5"/> Fix ({pending_alter})
                        </button>
                    )}
                    {!isComplete ? (
                        <button onClick={onValidateClick} className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold shadow-sm transition-all active:scale-95">
                            Validate
                        </button>
                    ) : (
                        <span className="px-3 py-1 text-xs bg-green-100 text-green-700 border border-green-200 rounded-md font-bold flex items-center">
                            <Check className="w-3 h-3 mr-1"/> Done
                        </span>
                    )}
                </div>
            </div>

            <div className="w-full h-2 bg-gray-200 rounded-full flex overflow-hidden">
                <div className="bg-green-500 h-full" style={{ width: `${approvedPercent}%` }} title="Approved"></div>
                <div className="bg-orange-500 h-full" style={{ width: `${repairedPercent}%` }} title="Repaired"></div>
                <div className="bg-red-500 h-full" style={{ width: `${rejectedPercent}%` }} title="Rejected"></div>
                <div className="bg-amber-400 h-full" style={{ width: `${pendingAlterPercent}%` }} title="In Alteration"></div>
            </div>
        </div>
    );
};

// Expandable Part Card
const PrimaryPartCard = ({ part, rollId, onValidateClick, onApproveAlterClick, activeContext }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Auto-expand if this is the last acted upon part
    useEffect(() => {
        if (activeContext && 
            String(activeContext.rollId) === String(rollId) && 
            String(activeContext.partId) === String(part.part_id)) {
            setIsExpanded(true);
        }
    }, [activeContext, rollId, part.part_id]);

    if (!hasPartData(part)) return null;

    const partStats = part.size_details.reduce((acc, curr) => {
        const stats = checkSizeStatus(curr);
        return { 
            processed: acc.processed + stats.total_processed, 
            cut: acc.cut + stats.total_cut 
        };
    }, { processed: 0, cut: 0 });

    const percent = partStats.cut > 0 ? Math.round((partStats.processed / partStats.cut) * 100) : 0;
    const isPartComplete = partStats.processed >= partStats.cut;

    return (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm transition-all">
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                className={`p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-gray-50 border-b border-gray-100' : ''}`}
            >
                <div className="flex items-center">
                    <div className={`p-1 rounded mr-3 ${isExpanded ? 'bg-gray-200 text-gray-700' : 'text-gray-400'}`}>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-semibold text-gray-800 text-sm flex items-center">
                            <Component className="w-4 h-4 mr-1.5 text-blue-600"/> {part.part_name}
                        </span>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="text-right">
                        <div className="text-xs font-medium text-gray-500">{partStats.processed} / {partStats.cut}</div>
                        <div className="w-16 h-1 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full rounded-full ${isPartComplete ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${percent}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>
            
            {isExpanded && (
                <div className="bg-gray-50/50 p-2 space-y-2">
                    {part.size_details.map(detail => (
                        <SizeValidationRow 
                            key={detail.size} 
                            sizeDetail={detail} 
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
        <div className="mb-2">
            <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded-lg flex items-center mb-2">
                <Layers className="w-5 h-5 mr-2.5 text-indigo-600"/>
                <span className="font-bold text-indigo-900 text-sm">Roll #{roll.fabric_roll_id}</span>
                <span className="ml-auto text-xs font-medium text-indigo-400 bg-white px-2 py-0.5 rounded border border-indigo-100 shadow-sm">
                    {validParts.length} Parts
                </span>
            </div>
            <div className="pl-2 space-y-2 border-l-2 border-indigo-100 ml-4">
                {validParts.map(part => (
                    <PrimaryPartCard 
                        key={part.part_id} 
                        part={part} 
                        rollId={roll.fabric_roll_id} 
                        onValidateClick={(partInfo) => onValidateClick({ ...partInfo, rollColor: roll.fabric_color || roll.color, rollType: roll.fabric_type || roll.type })} 
                        onApproveAlterClick={(partInfo) => onApproveAlterClick({ ...partInfo, rollColor: roll.fabric_color || roll.color, rollType: roll.fabric_type || roll.type })} 
                        activeContext={activeContext}
                    />
                ))}
            </div>
        </div>
    );
};

// --- BATCH CARD with GROUPED ROLLS (Collapsible) ---
const ProductionBatchCard = ({ batch, onValidateClick, onApproveAlterClick, onReconcile, isReconciling, activeContext, rollFilter, initiallyExpanded = false }) => {
    const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
    const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);

    const validRolls = batch.rolls.filter(hasRollData);
    
    // Apply Roll Filter here (Regex/Search)
    const filteredRolls = useMemo(() => {
        if (!rollFilter) return validRolls;
        return validRolls.filter(r => isRollMatch(r.fabric_roll_id, rollFilter));
    }, [validRolls, rollFilter]);

    const completedRolls = filteredRolls.filter(r => checkRollStatus(r));
    const activeRolls = filteredRolls.filter(r => !checkRollStatus(r));

    // Auto-expand if this batch contains the active context or matches search
    useEffect(() => {
        if ((activeContext && String(activeContext.batchId) === String(batch.batch_id)) || rollFilter) {
            setIsExpanded(true);
        }
    }, [activeContext, batch.batch_id, rollFilter]);

    // If filter is applied and no rolls match, don't render batch
    if (filteredRolls.length === 0 && rollFilter) return null;
    if (validRolls.length === 0) return null;
    
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow mb-4">
            {/* Batch Header - Click to toggle */}
            <div 
                className={`bg-white border-b border-gray-100 p-4 cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-blue-50/30' : ''}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex justify-between items-center">
                    <div className="flex items-center">
                        <div className={`p-2 rounded-lg mr-3 transition-colors ${isExpanded ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 text-blue-600'}`}>
                            <Shirt className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 flex items-center">
                                Batch #{batch.batch_id}
                            </h2>
                            <p className="text-xs text-gray-500 font-mono mt-0.5">{batch.batch_code || 'No Code'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Re-conciliation Button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); onReconcile(batch.batch_id); }}
                            className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors border border-transparent hover:border-indigo-200 shadow-sm bg-white"
                            title="Force Re-check Batch Completion"
                            disabled={isReconciling}
                        >
                            <RefreshCw size={18} className={isReconciling ? "animate-spin text-indigo-400" : ""} />
                        </button>
                        
                        <div className="text-right">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">Pending Rolls</span>
                            <span className="text-lg font-bold text-blue-600 leading-none">{activeRolls.length}</span>
                        </div>
                        <div className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''} text-gray-400`}>
                            <ChevronDown size={20} />
                        </div>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="p-4 bg-gray-50/30">
                    {/* ACTIVE ROLLS SECTION */}
                    {activeRolls.length > 0 ? (
                        <div className="space-y-4 mb-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase flex items-center mb-3">
                                <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                                Active / Pending Rolls
                            </h4>
                            {activeRolls.map(roll => (
                                <FabricRollCard 
                                    key={roll.fabric_roll_id} 
                                    roll={roll} 
                                    onValidateClick={(itemInfo) => onValidateClick(batch.batch_id, batch.batch_code, itemInfo)} 
                                    onApproveAlterClick={(itemInfo) => onApproveAlterClick(batch.batch_id, itemInfo)} 
                                    activeContext={activeContext}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="p-4 text-center text-sm text-gray-500 italic bg-white rounded border border-dashed mb-4">
                            {rollFilter ? "No active rolls match your search." : "All active rolls completed!"}
                        </div>
                    )}

                    {/* COMPLETED ROLLS SECTION (COLLAPSIBLE) */}
                    {completedRolls.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-gray-200">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsCompletedExpanded(!isCompletedExpanded); }}
                                className="flex items-center justify-between w-full text-left group"
                            >
                                <h4 className="text-xs font-bold text-gray-400 uppercase flex items-center group-hover:text-gray-600 transition-colors">
                                    <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                                    Completed Rolls ({completedRolls.length})
                                </h4>
                                <div className="p-1 rounded hover:bg-gray-200 text-gray-400 transition-colors">
                                    {isCompletedExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                </div>
                            </button>
                            
                            {isCompletedExpanded && (
                                <div className="mt-3 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                    {completedRolls.map(roll => (
                                        <div key={roll.fabric_roll_id} className="opacity-80">
                                            <div className="border border-green-100 p-2 rounded-lg bg-green-50/20">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-bold text-green-800 flex items-center"><CheckCircle2 className="w-4 h-4 mr-2"/> Roll #{roll.fabric_roll_id}</span>
                                                    <span className="text-xs font-medium text-green-600">Complete</span>
                                                </div>
                                                {/* Render details for context even if completed */}
                                                <FabricRollCard roll={roll} onValidateClick={(itemInfo) => onValidateClick(batch.batch_id, batch.batch_code, itemInfo)} onApproveAlterClick={(itemInfo) => onApproveAlterClick(batch.batch_id, itemInfo)} activeContext={activeContext} />
                                            </div>
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

// --- MAIN PAGE ---
const NumberingCheckerDashboardPage = () => {
    const [batches, setBatches] = useState([]);
    const [unloadMode, setUnloadMode] = useState('bundle');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefetching, setIsRefetching] = useState(false);
    const [error, setError] = useState(null);
    const [modalState, setModalState] = useState({ type: null, data: null });
    const [headerInfo, setHeaderInfo] = useState({ lineName: 'N/A', processType: 'unknown', lineId: null });
    const [batchFilter, setBatchFilter] = useState('');
    const [rollFilter, setRollFilter] = useState('');
    
    // UI State for grouping completed batches
    const [showCompletedBatches, setShowCompletedBatches] = useState(false);
    const [reconcilingBatchId, setReconcilingBatchId] = useState(null);

    // Track context of last action to maintain expanded state
    const [lastActiveContext, setLastActiveContext] = useState(null);

    useEffect(() => { const savedMode = localStorage.getItem('unloadMode') || 'bundle'; setUnloadMode(savedMode); }, []);

    const fetchQueue = useCallback(async (isInitial = false) => {
        if (isInitial) setIsLoading(true);
        else setIsRefetching(true);
        
        try {
            const res = await numberingCheckerApi.getMyQueue();
            let fetchedBatches = res.data.batches || [];
            fetchedBatches.sort((a, b) => a.batch_id - b.batch_id);
            setBatches(fetchedBatches);
            setHeaderInfo({ lineName: res.data.production_line_name || 'N/A', processType: res.data.workstation_process_type || 'unknown', lineId: res.data.production_line_id || null });
            setError(null);
        } catch (err) {
            if (isInitial) setError("Could not load your assigned queue.");
            else console.error("Background refresh failed", err);
        } finally { 
            setIsLoading(false); 
            setIsRefetching(false);
        }
    }, []);

    useEffect(() => { fetchQueue(true); }, [fetchQueue]);
    
    const handleModeToggle = () => {
        const newMode = unloadMode === 'bundle' ? 'single' : 'bundle';
        setUnloadMode(newMode);
        localStorage.setItem('unloadMode', newMode);
    };

    const openValidationModal = (batchId, batchCode, itemInfo) => setModalState({ type: 'validate', data: { batchId, itemInfo: { ...itemInfo, batchCode } } });
    const openAlterModal = (batchId, itemInfo) => setModalState({ type: 'alter', data: { batchId, itemInfo } });
    const closeModal = () => setModalState({ type: null, data: null });

    // ✅ NEW: Apply state locally for instant UI response before background fetch completes
    const applyLocalUpdate = useCallback((batchId, rollId, partId, size, quantity, qcStatus) => {
        setBatches(prevBatches => prevBatches.map(batch => {
            if (batch.batch_id !== batchId) return batch;
            return {
                ...batch,
                rolls: batch.rolls.map(roll => {
                    if (roll.fabric_roll_id !== rollId) return roll;
                    return {
                        ...roll,
                        parts_details: roll.parts_details.map(part => {
                            if (part.part_id !== partId) return part;
                            return {
                                ...part,
                                size_details: part.size_details.map(sz => {
                                    if (sz.size !== size) return sz;
                                    const qty = parseInt(quantity, 10);
                                    const updatedSize = { ...sz };
                                    if (qcStatus === 'APPROVED') updatedSize.total_validated = (parseInt(updatedSize.total_validated) || 0) + qty;
                                    if (qcStatus === 'REJECT') updatedSize.total_rejected = (parseInt(updatedSize.total_rejected) || 0) + qty;
                                    if (qcStatus === 'ALTER') updatedSize.total_altered = (parseInt(updatedSize.total_altered) || 0) + qty;
                                    if (qcStatus === 'REPAIRED') updatedSize.total_repaired = (parseInt(updatedSize.total_repaired) || 0) + qty;
                                    return updatedSize;
                                })
                            };
                        })
                    };
                })
            };
        }));
    }, []);

    const handleReconcileBatch = async (batchId) => {
        setReconcilingBatchId(batchId);
        try {
            // Find a rollId to pass if required by the backend
            const batch = batches.find(b => b.batch_id === batchId);
            const rollId = batch?.rolls?.[0]?.fabric_roll_id;
            
            await numberingCheckerApi.checkAndCompleteStages({
                rollId: rollId || 0, // Fallback if no rolls exist (shouldn't happen)
                batchId: batchId,
                lineId: headerInfo.lineId
            });
            
            // Refresh to see if it moved to completed
            await fetchQueue(false);
        } catch (err) {
            alert(`Re-conciliation failed: ${err.message}`);
        } finally {
            setReconcilingBatchId(null);
        }
    };

    const handleValidationSubmit = async (validationData) => {
        try {
            const batchId = modalState.data.batchId;
            setLastActiveContext({ 
                batchId: batchId,
                rollId: validationData.rollId,
                partId: validationData.partId
            });

            await numberingCheckerApi.logNumberingCheck(validationData);

            const currentBatch = batches.find(b => b.batch_id === batchId);
            if (currentBatch) {
                const pendingRolls = currentBatch.rolls.filter(r => !checkRollStatus(r));
                const currentRoll = pendingRolls.find(r => r.fabric_roll_id === validationData.rollId);
                if (pendingRolls.length === 1 && currentRoll) {
                    if (willActionCompleteRoll(currentRoll, { ...validationData })) {
                        await numberingCheckerApi.checkAndCompleteStages({
                            rollId: validationData.rollId,
                            batchId: batchId,
                            lineId: headerInfo.lineId
                        });
                    }
                }
            }
            
            // ✅ Optimistically update UI so the row flips to 'Done' instantly
            applyLocalUpdate(batchId, validationData.rollId, validationData.partId, validationData.size, validationData.quantity, validationData.qcStatus);
            
            closeModal();
            fetchQueue(false); // Background refresh ensures perfect sync
        } catch (err) { 
            alert(`Error: ${err.message}`); 
            throw err; 
        }
    };

    const handleApproveAlterSubmit = async (quantity) => {
        try {
            const { itemInfo, batchId } = modalState.data;
            setLastActiveContext({ 
                batchId: batchId,
                rollId: itemInfo.rollId,
                partId: itemInfo.partId
            });

            await numberingCheckerApi.approveAlteredPieces({ ...itemInfo, quantity });
            
            const currentBatch = batches.find(b => b.batch_id === batchId);
            if (currentBatch) {
                const pendingRolls = currentBatch.rolls.filter(r => !checkRollStatus(r));
                const currentRoll = pendingRolls.find(r => r.fabric_roll_id === itemInfo.rollId);
                if (pendingRolls.length === 1 && currentRoll) {
                    if (willActionCompleteRoll(currentRoll, { 
                        partId: itemInfo.partId, 
                        size: itemInfo.size, 
                        quantity: quantity, 
                        qcStatus: 'REPAIRED' 
                    })) {
                        await numberingCheckerApi.checkAndCompleteStages({
                            rollId: itemInfo.rollId,
                            batchId: batchId,
                            lineId: headerInfo.lineId
                        });
                    }
                }
            }
            
            // ✅ Optimistically update UI so the row flips to 'Done' instantly
            applyLocalUpdate(batchId, itemInfo.rollId, itemInfo.partId, itemInfo.size, quantity, 'REPAIRED');

            closeModal();
            fetchQueue(false);
        } catch (err) { 
            alert(`Error: ${err.message}`); 
            throw err; 
        }
    };

    const validBatches = batches.filter(hasBatchData);
    const filteredBatches = validBatches.filter(b => 
        (b.batch_id?.toString() || '').includes(batchFilter) || 
        (b.batch_code?.toLowerCase() || '').includes(batchFilter.toLowerCase())
    );

    // Split batches into Active and Completed
    const activeBatchesList = filteredBatches.filter(b => !isBatchComplete(b));
    const completedBatchesList = filteredBatches.filter(b => isBatchComplete(b));

    return (
        <div className="p-6 bg-gray-100 min-h-screen font-inter text-slate-800">
            <div className="max-w-5xl mx-auto">
                <header className="mb-8">
                     <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
                        <div>
                            <h1 className="text-3xl font-extrabold text-slate-900 flex items-center tracking-tight">
                                <ClipboardCheck className="w-8 h-8 mr-3 text-blue-600"/>
                                Numbering Check
                                {isRefetching && <Loader2 className="ml-3 w-5 h-5 animate-spin text-slate-400" />}
                            </h1>
                            <p className="text-slate-500 mt-1">Station: <strong className="text-slate-700">{headerInfo.lineName}</strong></p>
                        </div>
                        <div className="flex flex-col md:flex-row gap-4 items-end md:items-center">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
                                <input 
                                    type="text" 
                                    placeholder="Filter Batch..." 
                                    value={batchFilter}
                                    onChange={(e) => setBatchFilter(e.target.value)}
                                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-40"
                                />
                            </div>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
                                <input 
                                    type="text" 
                                    placeholder="Find Roll #..." 
                                    value={rollFilter}
                                    onChange={(e) => setRollFilter(e.target.value)}
                                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-40"
                                />
                            </div>

                            <div className="flex flex-col items-end">
                                <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5 tracking-wider">Validation Mode</label>
                                <div onClick={handleModeToggle} className="cursor-pointer relative w-36 h-9 flex items-center bg-slate-200 rounded-full p-1 shadow-inner transition-colors hover:bg-slate-300">
                                    <div className={`absolute left-1 top-1 w-[4.25rem] h-7 bg-white rounded-full shadow-sm transform transition-all duration-300 ease-out ${unloadMode === 'bundle' ? 'translate-x-0' : 'translate-x-[4.25rem]'}`}></div>
                                    <div className={`w-1/2 text-center z-10 text-xs font-bold transition-colors ${unloadMode === 'bundle' ? 'text-blue-700' : 'text-slate-500'}`}>Bundle</div>
                                    <div className={`w-1/2 text-center z-10 text-xs font-bold transition-colors ${unloadMode === 'single' ? 'text-blue-700' : 'text-slate-500'}`}>Single</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>
                
                {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                    <div className="space-y-6">
                        
                        {/* --- ACTIVE BATCHES --- */}
                        <div>
                            <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center">
                                <span className="w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
                                Active Checking Queue ({activeBatchesList.length})
                            </h2>
                            {activeBatchesList.length > 0 ? (
                                activeBatchesList.map(batch => (
                                    <ProductionBatchCard 
                                        key={batch.batch_id} 
                                        batch={batch} 
                                        onValidateClick={openValidationModal} 
                                        onApproveAlterClick={openAlterModal} 
                                        onReconcile={handleReconcileBatch}
                                        isReconciling={reconcilingBatchId === batch.batch_id}
                                        activeContext={lastActiveContext} 
                                        rollFilter={rollFilter}
                                        initiallyExpanded={true}
                                    />
                                ))
                            ) : (
                                <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
                                    <p className="text-slate-400 font-medium">
                                        {batchFilter || rollFilter ? "No active batches match your filter." : "No active batches available for checking."}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* --- COMPLETED BATCHES (COLLAPSIBLE) --- */}
                        {completedBatchesList.length > 0 && (
                            <div className="mt-8 border-t border-gray-200 pt-6">
                                <button 
                                    onClick={() => setShowCompletedBatches(!showCompletedBatches)}
                                    className="flex items-center justify-between w-full p-4 bg-white rounded-xl shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center text-gray-700">
                                        <FolderCheck className="w-6 h-6 mr-3 text-green-500" />
                                        <h2 className="text-lg font-bold">
                                            Completed Batches ({completedBatchesList.length})
                                        </h2>
                                    </div>
                                    <div className="text-gray-400">
                                        {showCompletedBatches ? <ChevronDown size={24} /> : <ChevronRight size={24} />}
                                    </div>
                                </button>

                                {showCompletedBatches && (
                                    <div className="mt-4 space-y-4 animate-in slide-in-from-top-4 duration-300">
                                        {completedBatchesList.map(batch => (
                                            <div key={batch.batch_id} className="opacity-90">
                                                <ProductionBatchCard 
                                                    batch={batch} 
                                                    onValidateClick={openValidationModal} 
                                                    onApproveAlterClick={openAlterModal} 
                                                    onReconcile={handleReconcileBatch}
                                                    isReconciling={reconcilingBatchId === batch.batch_id}
                                                    activeContext={lastActiveContext} 
                                                    rollFilter={rollFilter}
                                                    initiallyExpanded={false}
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

            {modalState.type === 'validate' && (
                <ValidationModal itemInfo={modalState.data.itemInfo} unloadMode={unloadMode} onClose={closeModal} onValidationSubmit={handleValidationSubmit} />
            )}
            
            {modalState.type === 'alter' && (
                <ApproveAlteredModal itemInfo={modalState.data.itemInfo} onClose={closeModal} onSave={handleApproveAlterSubmit} />
            )}
        </div>
    );
};

export default NumberingCheckerDashboardPage;