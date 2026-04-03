import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { lineLoaderApi } from '../../api/lineLoaderApi';
import { Link } from 'react-router-dom';
import Modal from '../../shared/Modal';
import { 
    Circle, Loader, Edit3, CheckCircle2, 
    List, Package, FileText, ExternalLink,
    Search, ChevronDown, ChevronRight, ArrowLeft, Factory
} from 'lucide-react';

// ============================================================================
// REUSABLE COMPONENTS
// ============================================================================
const Spinner = () => (
    <div className="flex justify-center items-center p-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
    </div>
);

const Placeholder = ({ icon: Icon, title, message }) => (
     <div className="text-center py-10 px-4 bg-white rounded-xl shadow-sm border-2 border-dashed border-slate-200">
        <Icon className="mx-auto h-12 w-12 text-slate-300 mb-4" />
        <h3 className="text-lg font-black text-slate-700">{title}</h3>
        <p className="mt-1 text-sm font-medium text-slate-500">{message}</p>
    </div>
);

// ============================================================================
// 2-STEP LINE SELECTION MODAL COMPONENT (WITH HEAVY DEBUGGING)
// ============================================================================
const LineSelectionModal = ({ batchId, cycleFlow, currentLineId, onClose, onSave }) => {
    const [step, setStep] = useState('selection'); 
    
    const [lines, setLines] = useState([]);
    const [rolls, setRolls] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [selectedLine, setSelectedLine] = useState(currentLineId || '');
    const [selectedRollMap, setSelectedRollMap] = useState({}); 
    const [searchTerm, setSearchTerm] = useState('');
    const [collapsedGroups, setCollapsedGroups] = useState({});

    const [wipData, setWipData] = useState(null);
    const [isCheckingWip, setIsCheckingWip] = useState(false);

    // 🚨 DEBUG LOGGER
    const debugLog = (stepName, message, data) => {
        const time = new Date().toISOString().split('T')[1].slice(0, -1);
        console.log(`[${time}] [Modal Debug | ${stepName}] -> ${message}`, data || '');
    };

    useEffect(() => {
        const fetchModalData = async () => {
            setIsLoading(true);
            debugLog('Fetch', `Requesting Lines and Rolls for Batch ${batchId}...`);
            try {
                const [linesRes, rollsRes] = await Promise.all([
                    lineLoaderApi.getLinesByType(cycleFlow.line_type_id),
                    lineLoaderApi.getRollsForBatch(batchId)
                ]);
                
                setLines(linesRes.data || []);
                
                const rollData = rollsRes.data || [];
                
                debugLog('Fetch', `Received ${rollData.length} rolls from API. Inspecting first 3...`, rollData.slice(0, 3));
                
                setRolls(rollData);
                
                const initialMap = {};
                rollData.forEach(r => { 
                    // 🚨 Safely coerce the assignment value to catch string "false" or 0
                    const rawValue = r.is_assigned;
                    const isAssigned = rawValue === true || rawValue === 'true' || rawValue === 1;
                    
                    if (!isAssigned) {
                        initialMap[r.roll_id] = true; 
                    }
                }); 
                
                debugLog('Initial Map', 'Created default selection map:', initialMap);
                setSelectedRollMap(initialMap); 

            } catch (error) { 
                console.error("Failed to fetch modal data", error); 
            } finally { 
                setIsLoading(false); 
            }
        };
        fetchModalData();
    }, [cycleFlow.line_type_id, batchId]);

    useEffect(() => {
        if (!selectedLine) {
            setWipData(null);
            return;
        }
        
        const checkCapacity = async () => {
            setIsCheckingWip(true);
            try {
                const res = await lineLoaderApi.checkLineWip(selectedLine);
                setWipData(res.data);
            } catch (err) {
                console.error("Failed to check line WIP", err);
            } finally {
                setIsCheckingWip(false);
            }
        };
        
        checkCapacity();
    }, [selectedLine]);

    const handleRollToggle = (rollId) => {
        debugLog('Toggle', `User clicked Roll #${rollId}. Current State:`, selectedRollMap[rollId]);
        setSelectedRollMap(prev => ({ ...prev, [rollId]: !prev[rollId] }));
    };

    const toggleGroupCollapse = (groupName) => setCollapsedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));

    const filteredRolls = useMemo(() => {
        if (!searchTerm) return rolls;
        const lower = searchTerm.toLowerCase();
        return rolls.filter(r => 
            String(r.roll_id).toLowerCase().includes(lower) ||
            (r.fabric_type || '').toLowerCase().includes(lower) ||
            (r.color_name || '').toLowerCase().includes(lower)
        );
    }, [rolls, searchTerm]);

    const handleToggleAllFiltered = () => {
        // Find only rolls that are genuinely available based on our strict truthy check
        const availableRolls = filteredRolls.filter(r => {
            const rawValue = r.is_assigned;
            const isAssigned = rawValue === true || rawValue === 'true' || rawValue === 1;
            return !isAssigned;
        });
        
        debugLog('Select All', `Found ${availableRolls.length} available rolls to select/deselect.`);
        
        if (availableRolls.length === 0) return;

        const allFilteredSelected = availableRolls.every(r => selectedRollMap[r.roll_id]);
        const newMap = { ...selectedRollMap };
        availableRolls.forEach(r => { newMap[r.roll_id] = !allFilteredSelected; });
        setSelectedRollMap(newMap);
    };

    const groupedRolls = useMemo(() => {
        const groups = {};
        filteredRolls.forEach(r => {
            const groupName = `${r.fabric_type || 'Unknown'} • ${r.color_name || 'Unknown'}`;
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(r);
        });
        return groups;
    }, [filteredRolls]);

    const selectedRollsList = rolls.filter(r => selectedRollMap[r.roll_id]);
    const selectedCount = selectedRollsList.length;
    const selectedMeters = selectedRollsList.reduce((sum, r) => sum + parseFloat(r.meter || 0), 0).toFixed(2);
    const selectedLineName = lines.find(l => String(l.id) === String(selectedLine))?.name || 'Unknown Line';

    const isAlreadyOnThisLine = String(selectedLine) === String(currentLineId);
    const isWipBlocked = wipData?.isAtCapacity && !isAlreadyOnThisLine;

    const handleProceedToReview = () => {
        if (!selectedLine) return alert("Please select a Production Line first.");
        if (selectedCount === 0) return alert("Please select at least one roll to assign.");
        if (isWipBlocked) return alert("This line is at maximum capacity."); 
        setStep('confirmation');
    };

    const handleFinalConfirm = async () => {
        await onSave({
            batchId,
            cycleFlowId: cycleFlow.id,
            lineId: selectedLine,
            selectedRollIds: selectedRollsList.map(r => r.roll_id)
        });
    };

    if (isLoading) return <Spinner />;

    if (step === 'confirmation') {
        return (
            <div className="p-4 sm:p-2">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 text-center mb-6">
                    <h4 className="text-blue-900 font-black text-xl mb-1">Review Assignment</h4>
                    <p className="text-blue-700 font-medium text-sm">Please confirm your selection before dispatching.</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Target Line</span>
                        <span className="text-lg font-black text-slate-800 truncate block">{selectedLineName}</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">New Payload</span>
                        <span className="text-lg font-black text-blue-600">{selectedCount} Rolls <span className="text-sm font-bold text-slate-500">({selectedMeters}m)</span></span>
                    </div>
                </div>

                <div className="mb-6">
                    <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">Rolls to Dispatch</h5>
                    <div className="max-h-[30vh] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-inner scrollbar-thin scrollbar-thumb-slate-300">
                        {selectedRollsList.map(r => (
                            <div key={r.roll_id} className="p-3 text-sm flex justify-between items-center hover:bg-slate-50">
                                <div>
                                    <span className="font-bold text-slate-800 block">Roll #{r.roll_id}</span>
                                    <span className="text-xs text-slate-500 font-medium">{r.fabric_type} • {r.color_name}</span>
                                </div>
                                <span className="font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md">{r.meter}m</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-8 flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-slate-200">
                    <button onClick={() => setStep('selection')} className="w-full sm:w-auto px-5 py-3.5 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold transition-colors active:scale-95 text-sm flex items-center justify-center">
                        <ArrowLeft size={16} className="mr-2" /> Back to Edit
                    </button>
                    <button onClick={handleFinalConfirm} className="w-full sm:w-auto px-6 py-3.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-md font-bold transition-all active:scale-95 text-sm flex items-center justify-center">
                        <CheckCircle2 size={18} className="mr-2" /> Confirm & Dispatch
                    </button>
                </div>
            </div>
        );
    }

    // Force strict evaluation for visibility toggles
    const hasUnassignedRolls = rolls.some(r => {
        const rawValue = r.is_assigned;
        return !(rawValue === true || rawValue === 'true' || rawValue === 1);
    });

    return (
        <div className="p-4 sm:p-2">
            <h3 className="text-lg font-black mb-5 text-slate-800 flex items-center">
                Assign Line: <span className="ml-2 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm tracking-wide uppercase">{cycleFlow.line_type_name}</span>
            </h3>
            
            <div className="space-y-6">
                {/* 1. Line Selector */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">1. Choose Production Line</label>
                    <select
                        value={selectedLine}
                        onChange={(e) => setSelectedLine(e.target.value)}
                        className={`w-full p-3 border-2 rounded-xl bg-white focus:ring-4 outline-none font-bold text-slate-700 transition-all cursor-pointer shadow-sm appearance-none
                            ${isWipBlocked ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-50' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-50'}`}
                    >
                        <option value="">-- Tap to select line --</option>
                        {lines.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}
                    </select>

                    {selectedLine && (
                        <div className="mt-3 flex items-center">
                            {isCheckingWip ? (
                                <span className="text-xs font-bold text-slate-400 flex items-center"><Loader size={12} className="animate-spin mr-1.5" /> Checking capacity...</span>
                            ) : wipData ? (
                                <div className={`flex items-center text-xs font-bold px-2.5 py-1.5 rounded-md border ${
                                    isWipBlocked 
                                    ? 'bg-rose-50 text-rose-700 border-rose-200' 
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}>
                                    <span className="tracking-wider uppercase mr-2">Line Load:</span>
                                    {wipData.currentWip} / {wipData.wipLimit} Active Batches
                                    
                                    {isWipBlocked && <span className="ml-2 uppercase tracking-widest text-[10px] bg-rose-200 text-rose-800 px-1.5 py-0.5 rounded">Limit Reached</span>}
                                    {wipData.isAtCapacity && isAlreadyOnThisLine && <span className="ml-2 uppercase tracking-widest text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">Bypassed (Existing Batch)</span>}
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>

                {/* 2. Roll Selector */}
                <div className={isWipBlocked ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mb-4 px-1">
                        <div className="flex-1 w-full relative">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">2. Search & Select Rolls</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                                <input type="text" placeholder="Search by Roll #, Color, or Fabric..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm" />
                            </div>
                        </div>
                        {hasUnassignedRolls && filteredRolls.length > 0 && (
                            <button onClick={handleToggleAllFiltered} className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-4 py-2.5 rounded-xl transition-colors active:scale-95 shrink-0 shadow-sm">
                                {filteredRolls.filter(r => {
                                    const val = r.is_assigned;
                                    return !(val === true || val === 'true' || val === 1);
                                }).every(r => selectedRollMap[r.roll_id]) ? 'Deselect Available' : 'Select All Available'}
                            </button>
                        )}
                    </div>
                    
                    <div className="max-h-[40vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 pb-4">
                        {Object.keys(groupedRolls).length > 0 ? (
                            Object.entries(groupedRolls).map(([groupName, groupRolls]) => {
                                const isCollapsed = collapsedGroups[groupName];
                                const selectedInGroup = groupRolls.filter(r => selectedRollMap[r.roll_id]).length;

                                return (
                                    <div key={groupName} className="mb-4 bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                        <div className="bg-slate-50 p-3.5 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => toggleGroupCollapse(groupName)}>
                                            <div className="flex items-center gap-2">
                                                <div className={`text-slate-400 transition-transform ${!isCollapsed ? 'rotate-90' : ''}`}><ChevronRight size={18}/></div>
                                                <span className="font-black text-slate-700 text-sm tracking-tight">{groupName}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {selectedInGroup > 0 && <span className="text-[10px] font-black text-white bg-blue-500 px-2 py-0.5 rounded-full">{selectedInGroup} Selected</span>}
                                                <span className="text-xs font-bold bg-white border border-slate-200 px-2 py-1 rounded-md text-slate-500">{groupRolls.length} Rolls</span>
                                            </div>
                                        </div>
                                        {!isCollapsed && (
                                            <div className="p-3 bg-white grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100">
                                                {groupRolls.map(roll => {
                                                    // 🚨 CRITICAL FIX & VISUAL DEBUG: Force evaluation to handle DB cast issues
                                                    const rawValue = roll.is_assigned;
                                                    const isAssigned = rawValue === true || rawValue === 'true' || rawValue === 1; 
                                                    const isSelected = selectedRollMap[roll.roll_id] || false;
                                                    
                                                    return (
                                                        <div key={roll.roll_id} 
                                                             onClick={() => !isAssigned && handleRollToggle(roll.roll_id)} 
                                                             className={`relative flex justify-between items-center p-4 rounded-xl transition-all duration-200 select-none 
                                                                ${isAssigned 
                                                                    ? 'bg-slate-50 border-2 border-rose-200 opacity-80 cursor-not-allowed' 
                                                                    : isSelected 
                                                                        ? 'bg-blue-50 border-2 border-blue-600 shadow-sm ring-2 ring-blue-500/20 cursor-pointer' 
                                                                        : 'bg-white border-2 border-slate-100 hover:border-blue-300 shadow-sm hover:shadow-md cursor-pointer'
                                                                }`}>
                                                            <div>
                                                                <span className={`font-black text-base block mb-1 
                                                                    ${isAssigned ? 'text-slate-500' : isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                                                                    Roll #{roll.roll_id}
                                                                </span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold tracking-wider border 
                                                                        ${isAssigned ? 'bg-slate-200 text-slate-500 border-slate-300' : isSelected ? 'bg-blue-200 text-blue-800 border-blue-300' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                                        {roll.meter}m
                                                                    </span>
                                                                    {isAssigned && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">In Prod</span>}
                                                                </div>
                                                                
                                                                {/* 🚨 VISUAL ON-SCREEN DEBUGGER */}
                                                                <div className="mt-2 text-[9px] font-mono p-1 bg-yellow-100 border border-yellow-300 text-yellow-800 rounded">
                                                                    RAW: {JSON.stringify(rawValue)} | TYPE: {typeof rawValue} | EVAL: {String(isAssigned)}
                                                                </div>
                                                            </div>
                                                            {isAssigned ? (
                                                                <CheckCircle2 className="text-emerald-500 shrink-0" size={26} />
                                                            ) : isSelected ? (
                                                                <CheckCircle2 className="text-blue-600 drop-shadow-sm shrink-0" size={26} fill="white" />
                                                            ) : (
                                                                <Circle className="text-slate-300 shrink-0" size={26} />
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
                            <div className="bg-slate-50 rounded-2xl p-8 border-2 border-dashed border-slate-200 text-center">
                                <p className="text-sm font-bold text-slate-500">No rolls match your search.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-4 flex flex-col-reverse sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-200">
                <div className="text-sm font-bold text-slate-500 hidden sm:block">
                    {selectedCount} New Rolls <span className="font-black text-slate-800">({selectedMeters}m)</span>
                </div>
                <div className="flex w-full sm:w-auto gap-3">
                    <button onClick={onClose} className="flex-1 sm:flex-none px-5 py-3.5 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold transition-colors active:scale-95 text-sm">
                        Cancel
                    </button>
                    <button 
                        onClick={handleProceedToReview} 
                        disabled={!selectedLine || selectedCount === 0 || isWipBlocked || isCheckingWip} 
                        className="flex-1 sm:flex-none px-6 py-3.5 bg-slate-800 text-white rounded-xl hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-md font-bold transition-all active:scale-95 text-sm"
                    >
                        Review Assignment
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// BATCH CARD COMPONENT
// ============================================================================
const BatchCard = ({ batch, onAssign }) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [activeFlowData, setActiveFlowData] = useState(null);

    const { nextStepSequence, overallStatus } = useMemo(() => {
        if (!batch.cycle_flow || batch.cycle_flow.length === 0) return { nextStepSequence: -1, overallStatus: 'NO_FLOW' };
        const completedFlowIds = new Set(batch.progress?.filter(p => p.status === 'COMPLETED').map(p => p.product_cycle_flow_id));
        if (completedFlowIds.size === batch.cycle_flow.length) return { nextStepSequence: -1, overallStatus: 'COMPLETED' };
        const highestCompletedSeq = batch.cycle_flow.filter(cf => completedFlowIds.has(cf.id)).reduce((max, cf) => Math.max(max, cf.sequence_no), 0);
        return { nextStepSequence: highestCompletedSeq + 1, overallStatus: batch.progress?.length > 0 ? 'IN_PROGRESS' : 'PENDING' };
    }, [batch]);

    const handleButtonClick = (cycleFlow, progress) => {
        const currentLineId = progress ? progress.line_id : null;
        setActiveFlowData({ cycleFlow, currentLineId });
        setModalOpen(true);
    };

    const handleSaveAssignment = async (data) => {
        await onAssign(data);
        setModalOpen(false);
    };

    const statusStyles = {
        PENDING: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-t-amber-500', icon: <Circle size={14}/>, label: 'Pending Start' },
        IN_PROGRESS: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-t-blue-500', icon: <Loader className="animate-spin" size={14}/>, label: 'In Progress' },
        COMPLETED: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-t-green-500', icon: <CheckCircle2 size={14}/>, label: 'Completed' },
        NO_FLOW: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-t-red-500', icon: null, label: 'Setup Required' },
    };
    const currentStatus = statusStyles[overallStatus];
    const assignmentPercentage = batch.total_rolls > 0 ? Math.round((batch.assigned_rolls / batch.total_rolls) * 100) : 0;

    return (
        <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200 hover:shadow-md transition-shadow border-t-4 flex flex-col h-full ${currentStatus.border}`}>
            <div className="px-5 py-5 border-b border-slate-100 flex-1">
                <div className="flex justify-between items-start mb-2">
                    <h2 className="font-black text-lg text-slate-800 tracking-tight">{batch.batch_code || `BATCH-${batch.batch_id}`}</h2>
                    <span className={`flex items-center text-xs font-black px-3 py-1.5 rounded-full border ${currentStatus.bg.replace('bg-', 'border-')} ${currentStatus.bg} ${currentStatus.text} tracking-wider uppercase`}>
                       {currentStatus.icon && <span className="mr-1.5">{currentStatus.icon}</span>} {currentStatus.label}
                    </span>
                </div>
                <p className="text-sm font-bold text-slate-500">{batch.product_name}</p>

                <div className="mt-5">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fabric Assigned</span>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${batch.is_fully_assigned ? 'text-emerald-600' : 'text-blue-600'}`}>
                            {batch.assigned_rolls} / {batch.total_rolls} Rolls
                        </span>
                    </div>
                    <div className="bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                        <div 
                            className={`h-full transition-all duration-500 ${batch.is_fully_assigned ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                            style={{ width: `${assignmentPercentage}%` }}
                        ></div>
                    </div>
                </div>
                
                {batch.trim_orders && batch.trim_orders.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-dashed border-slate-200">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center">
                            <List size={12} className="mr-1.5"/> Trim Orders
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {batch.trim_orders.map(to => (
                                <Link 
                                    key={to.id}
                                    to={`/line-loader/trim-orders/${to.id}/summary`}
                                    className="flex items-center text-xs font-bold bg-purple-50 text-purple-700 px-2.5 py-1.5 rounded-lg border border-purple-100 hover:bg-purple-100 hover:border-purple-200 transition-colors"
                                >
                                    <FileText size={12} className="mr-1.5"/> #{to.id} <ExternalLink size={10} className="ml-1.5 opacity-50"/>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            
            <div className="p-5 bg-slate-50/50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Line Assignment</p>
                <div className="flex flex-wrap gap-2.5">
                    {batch.cycle_flow?.map(cf => {
                        const progressEntry = batch.progress?.find(p => p.product_cycle_flow_id === cf.id);
                        let buttonState = 'DISABLED';
                        
                        if (progressEntry) {
                            if (progressEntry.status === 'COMPLETED') {
                                buttonState = 'COMPLETED';
                            } else if (cf.sequence_no === 1 && batch.is_fully_assigned) {
                                buttonState = 'IN_PROGRESS_FULL';
                            } else {
                                buttonState = 'IN_PROGRESS_PARTIAL';
                            }
                        } else if (cf.sequence_no === nextStepSequence) {
                            buttonState = 'ENABLED';
                        }
                        
                        const buttonStyles = {
                           COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-200 cursor-default',
                           IN_PROGRESS_FULL: 'bg-blue-50 text-blue-800 border-blue-200 cursor-default opacity-80', 
                           IN_PROGRESS_PARTIAL: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200 cursor-pointer shadow-sm', 
                           ENABLED: 'bg-white border-2 border-blue-400 text-blue-700 hover:bg-blue-50 cursor-pointer shadow-sm active:scale-95',
                           DISABLED: 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                        };

                        const isClickable = buttonState === 'ENABLED' || buttonState === 'IN_PROGRESS_PARTIAL';
                        
                        return (
                            <button key={cf.id} 
                                disabled={!isClickable}
                                onClick={() => handleButtonClick(cf, progressEntry)}
                                className={`px-3 py-2 text-sm font-bold rounded-xl border transition-all flex items-center ${buttonStyles[buttonState]}`}>
                               {cf.line_type_name}
                               {buttonState === 'IN_PROGRESS_PARTIAL' && (
                                   <span className="ml-2 text-[10px] font-black uppercase opacity-80 truncate flex items-center pl-2 border-l border-amber-300/50 tracking-wider">
                                       {progressEntry.line_name} <Edit3 className="ml-1" size={12}/>
                                   </span>
                               )}
                               {buttonState === 'IN_PROGRESS_FULL' && (
                                   <span className="ml-2 text-[10px] font-black uppercase opacity-80 truncate flex items-center pl-2 border-l border-blue-200 tracking-wider">
                                       Fully Assigned <CheckCircle2 className="ml-1" size={12}/>
                                   </span>
                               )}
                            </button>
                        );
                    })}
                </div>
            </div>
            {modalOpen && (
                <Modal title="" onClose={() => setModalOpen(false)}>
                    <LineSelectionModal 
                        batchId={batch.batch_id} 
                        cycleFlow={activeFlowData.cycleFlow} 
                        currentLineId={activeFlowData.currentLineId}
                        onClose={() => setModalOpen(false)} 
                        onSave={handleSaveAssignment} 
                    />
                </Modal>
            )}
        </div>
    );
};

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
const LineLoaderDashboardPage = () => {
    const [allBatches, setAllBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedGroup, setExpandedGroup] = useState(null);

    const fetchDashboardData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await lineLoaderApi.getDashboardData();
            setAllBatches(response.data || []);
        } catch (error) {
            console.error("Failed to fetch dashboard data", error);
            setError("Could not load assigned work. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

    const handleAssign = async (data) => {
        try {
            await lineLoaderApi.assignLineAndLogRolls(data);
            fetchDashboardData();
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to assign line. Please try again.');
        }
    };

    const groupedBatches = useMemo(() => {
        return allBatches.reduce((groups, batch) => {
            const groupName = batch.current_step_group || 'Unassigned / Pending'; 
            if (!groups[groupName]) {
                groups[groupName] = [];
            }
            groups[groupName].push(batch);
            return groups;
        }, {});
    }, [allBatches]);

    const sortedGroupNames = Object.keys(groupedBatches).sort();

    useEffect(() => {
        if (sortedGroupNames.length > 0 && !expandedGroup) {
            setExpandedGroup(sortedGroupNames[0]);
        }
    }, [sortedGroupNames, expandedGroup]);

    const toggleGroup = (groupName) => {
        setExpandedGroup(prev => prev === groupName ? null : groupName);
    };

    return (
        <div className="p-6 md:p-8 bg-slate-50 min-h-screen font-inter text-slate-800">
            <header className="mb-10">
                <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">Line Loader Dashboard</h1>
                <p className="text-slate-500 mt-2 font-medium">Assign production lines, scan materials, and track batch flow.</p>
            </header>
            
            {isLoading ? <Spinner /> : error ? (
                 <div className="p-4 bg-rose-50 text-rose-700 font-bold rounded-xl shadow-sm border border-rose-200 flex items-center">
                     <span className="mr-3 text-xl">⚠️</span> {error}
                 </div>
            ) : (
                <div className="space-y-4">
                    {allBatches.length === 0 && (
                        <Placeholder 
                            icon={Package} 
                            title="No Work Pending" 
                            message="There are no active batches waiting for line assignment." 
                        />
                    )}

                    {sortedGroupNames.map(groupName => {
                        const isExpanded = expandedGroup === groupName;
                        
                        return (
                            <section key={groupName} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-200">
                                <button 
                                    onClick={() => toggleGroup(groupName)}
                                    className="w-full flex items-center justify-between p-6 bg-white hover:bg-slate-50 transition-colors focus:outline-none"
                                >
                                    <div className="flex items-center">
                                        <div className={`p-2.5 rounded-xl mr-4 transition-colors ${isExpanded ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                                            <Factory size={24} />
                                        </div>
                                        <h2 className="text-xl font-black text-slate-800 uppercase tracking-wider text-left">
                                            {groupName}
                                        </h2>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="bg-slate-100 text-slate-500 text-xs font-black px-3 py-1.5 rounded-full border border-slate-200">
                                            {groupedBatches[groupName].length} BATCHES
                                        </span>
                                        <div className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                            <ChevronDown size={24} />
                                        </div>
                                    </div>
                                </button>
                                
                                {isExpanded && (
                                    <div className="p-6 border-t border-slate-100 bg-slate-50/50">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-stretch animate-in slide-in-from-top-2 duration-300">
                                            {groupedBatches[groupName].map(batch => (
                                                <BatchCard 
                                                    key={batch.batch_id} 
                                                    batch={batch} 
                                                    onAssign={handleAssign} 
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    ); 
};

export default LineLoaderDashboardPage;