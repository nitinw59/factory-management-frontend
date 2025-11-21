import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Play, ListTodo, Square, CheckSquare, XCircle, Loader2, AlertTriangle, CheckCircle, 
    Package, Plus, Search, Layers, GitMerge as Component, Truck, Box, X, ChevronDown, ChevronUp, Info, Hammer, Wrench 
} from 'lucide-react';
// --- IMPORTANT: UNCOMMENT THIS LINE TO USE THE REAL BACKEND ---
import { assemblyPortalApi } from '../../api/assemblyPortalApi'; 
import Modal from '../../shared/Modal';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="p-4 bg-red-100 text-red-700 rounded-lg border border-red-200 flex items-center"><AlertTriangle className="w-5 h-5 mr-2"/>{message}</div>;
const MessageDisplay = ({ message }) => <div className="p-4 bg-green-100 text-green-700 rounded-lg border border-green-200 flex items-center"><CheckCircle className="w-5 h-5 mr-2"/>{message}</div>;



// --- LOGGING FORM MODAL ---
const AssemblyLogModal = ({ itemInfo, onClose, onSave }) => {
    const maxQty = itemInfo.maxSets;
    const [quantity, setQuantity] = useState(maxQty > 0 ? 1 : 0); 
    const [qcStatus, setQcStatus] = useState('ASSEMBLED');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async () => {
        setError(null);
        if (isNaN(quantity) || quantity <= 0 || quantity > maxQty) {
            setError(`Quantity must be between 1 and ${maxQty}.`);
            return;
        }
        setIsSaving(true);
        try {
            await onSave({ 
                assembledSets: quantity, 
                qcStatus, 
                assemblySize: itemInfo.size,
                rollId: itemInfo.rollId,
                batchId: itemInfo.batchId
            });
        } catch (err) {
            setError(err.message || 'Failed to log assembly.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal title={`Assemble Sets: Size ${itemInfo.size}`} onClose={onClose}>
            <div className="space-y-6">
                {error && <ErrorDisplay message={error} />}
                
                <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                    <div className="flex justify-between items-center mb-2">
                        <p className="text-sm text-gray-600 font-medium">Source Roll: <span className="font-mono font-bold text-gray-800">#{itemInfo.rollId}</span></p>
                        <span className="px-2 py-1 bg-indigo-200 text-indigo-800 text-xs font-bold rounded uppercase">Size {itemInfo.size}</span>
                    </div>
                    <div className="flex items-baseline">
                        <span className="text-3xl font-bold text-indigo-700 mr-2">{maxQty}</span>
                        <span className="text-sm font-medium text-indigo-600">Sets Ready</span>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-indigo-200/60">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Part Availability</p>
                        <ul className="space-y-1 text-sm">
                            {itemInfo.partsBreakdown.map((p, i) => (
                                <li key={i} className="flex justify-between items-center">
                                    <span className="text-gray-700">{p.part_name}</span>
                                    <span className={`font-mono ${p.available_for_assembly === maxQty ? "font-bold text-orange-600" : "text-green-600"}`}>
                                        {p.available_for_assembly} pcs
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Quantity (Sets)</label>
                    <div className="relative">
                        <input 
                            type="number" 
                            value={quantity} 
                            onChange={(e) => setQuantity(Math.max(0, Math.min(maxQty, parseInt(e.target.value) || 0)))}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-lg" 
                            min="1" 
                            max={maxQty}
                            disabled={isSaving || maxQty === 0}
                        />
                        <span className="absolute right-4 top-3.5 text-gray-400 text-sm font-medium">/ {maxQty}</span>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Action</label>
                    {/* Grid updated for 3 buttons */}
                    <div className="grid grid-cols-3 gap-2">
                        <button 
                            onClick={() => setQcStatus('ASSEMBLED')} 
                            className={`p-3 rounded-lg font-bold text-xs transition-all flex flex-col items-center justify-center border-2 ${qcStatus === 'ASSEMBLED' ? 'bg-green-50 border-green-500 text-green-700 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                        >
                            <CheckCircle className={`w-5 h-5 mb-1 ${qcStatus === 'ASSEMBLED' ? 'text-green-600' : 'text-gray-400'}`} />
                            ASSEMBLE
                        </button>
                        <button 
                            onClick={() => setQcStatus('REJECTED')} 
                            className={`p-3 rounded-lg font-bold text-xs transition-all flex flex-col items-center justify-center border-2 ${qcStatus === 'REJECTED' ? 'bg-red-50 border-red-500 text-red-700 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                        >
                            <XCircle className={`w-5 h-5 mb-1 ${qcStatus === 'REJECTED' ? 'text-red-600' : 'text-gray-400'}`} />
                            REJECT
                        </button>
                        {/* NEW: Alter Button */}
                        <button 
                            onClick={() => setQcStatus('ALTER')} 
                            className={`p-3 rounded-lg font-bold text-xs transition-all flex flex-col items-center justify-center border-2 ${qcStatus === 'ALTER' ? 'bg-yellow-50 border-yellow-500 text-yellow-700 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                        >
                            <Hammer className={`w-5 h-5 mb-1 ${qcStatus === 'ALTER' ? 'text-yellow-600' : 'text-gray-400'}`} />
                            ALTER
                        </button>
                    </div>
                </div>
            </div>
            <div className="mt-8 flex justify-end space-x-3 pt-4 border-t">
                <button onClick={onClose} className="px-5 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors">Cancel</button>
                <button onClick={handleSubmit} disabled={isSaving || quantity <= 0} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center shadow-md hover:bg-blue-700 transition-all">
                    {isSaving && <Loader2 className="animate-spin w-4 h-4 mr-2"/>}
                    Confirm Log
                </button>
            </div>
        </Modal>
    );
};

// --- NEW: REPAIR APPROVAL MODAL ---
const ApproveRepairedModal = ({ itemInfo, onClose, onSave }) => {
    const maxQty = itemInfo.pendingAlter; // Sets sent to alteration
    const [quantity, setQuantity] = useState(maxQty > 0 ? 1 : 0); 
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    const handleSave = async () => {
        setError(null);
        if (quantity <= 0 || quantity > maxQty) {
            setError(`Quantity must be between 1 and ${maxQty}.`);
            return;
        }
        setIsSaving(true);
        try {
             await onSave({ 
                quantity, 
                assemblySize: itemInfo.size,
                rollId: itemInfo.rollId,
                batchId: itemInfo.batchId 
            });
        } catch (err) {
            setError(err.message || 'Failed to save repair.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal title={`Approve Repaired Sets: ${itemInfo.size}`} onClose={onClose}>
            <div className="space-y-6">
                {error && <ErrorDisplay message={error} />}
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-100 flex items-center">
                     <Hammer className="w-8 h-8 text-orange-500 mr-3"/>
                     <div>
                         <p className="text-sm font-bold text-orange-800">Sets Pending Repair</p>
                         <p className="text-2xl font-extrabold text-orange-700">{maxQty}</p>
                     </div>
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Quantity Repaired</label>
                    <input 
                        type="number" value={quantity} 
                        onChange={(e) => setQuantity(Math.max(0, Math.min(maxQty, parseInt(e.target.value) || 0)))}
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-lg" 
                        min="1" max={maxQty} disabled={isSaving}
                    />
                </div>
                <button onClick={handleSave} disabled={isSaving || quantity <= 0} className="w-full p-3 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 flex justify-center items-center">
                    {isSaving ? <Loader2 className="animate-spin w-5 h-5"/> : "Confirm Repaired & Assembled"}
                </button>
            </div>
        </Modal>
    );
};


// --- COMPONENT: Roll Assembly Details ---
const RollAssemblyDetails = ({ roll, batchId, onLogAssembly, onApproveRepair }) => { // Added onApproveRepair
    console.log('Roll Detais:', roll);
    const [isExpanded, setIsExpanded] = useState(false);

    const primaryParts = (roll.parts_details || []).filter(p => p.part_type === 'PRIMARY');

    const sizeGroups = useMemo(() => {
        const groups = {};
        primaryParts.forEach(part => {
            if (!groups[part.size]) {
                groups[part.size] = [];
            }
           // console.log('Grouping part:', part);
            groups[part.size].push(part);
        });
        return groups;
    }, [primaryParts]);

    const assemblableSizes = useMemo(() => {
        return Object.keys(sizeGroups).map(size => {
            const parts = sizeGroups[size];
            
            // Max sets logic (bottleneck)
            const maxSets = parts.length > 0 
                ? Math.min(...parts.map(p => p.available_for_assembly)) 
                : 0;

            
            // NEW: Calculate pending alter (based on first part, assuming consistent logging)
            const p = parts[0] || {};
            
            const pendingAlter = (p.sets_altered || 0) - (p.sets_repaired || 0);
            
            const assembledPieces = p.total_assembled_consumed || 0;
            
            return {
                size,
                maxSets: Math.max(0, maxSets),
                pendingAlter: Math.max(0, pendingAlter), // Add pendingAlter
                total_assembled_consumed: assembledPieces,   
                parts: parts
            };
        }).filter(g => g.maxSets > 0 || g.pendingAlter > 0); // Show if can assemble OR fix
    }, [sizeGroups]);

    const totalPossibleSets = assemblableSizes.reduce((sum, g) => sum + g.maxSets, 0);
    const totalPendingRepair = assemblableSizes.reduce((sum, g) => sum + g.pendingAlter, 0);
    const hasWork = totalPossibleSets > 0 || totalPendingRepair > 0;
    const total_assembled_consumed= assemblableSizes.reduce((sum, g) => sum + (g.total_assembled_consumed || 0), 0);
    

    if (!hasWork) return null;

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-3 bg-white shadow-sm">
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                className={`p-3 flex justify-between items-center cursor-pointer transition-colors ${hasWork ? 'hover:bg-blue-50' : ''}`}
            >
                <div className="flex items-center">
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 mr-2"/> : <ChevronDown className="w-4 h-4 text-gray-400 mr-2"/>}
                    <span className="font-bold text-gray-700 flex items-center">
                        <Layers className="w-4 h-4 mr-2 text-blue-600"/> Roll #{roll.roll_id}
                    </span>
                </div>
                <div className="flex space-x-2">
                    {totalPossibleSets > 0 && (
                        <span className="text-xs font-bold bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                            {totalPossibleSets} Ready
                        </span>
                    )}
                    {total_assembled_consumed > 0 && (
                        <span className="text-xs font-bold bg-green-100 text-green-700 px-3 py-1 rounded-full flex items-center">
                            <CheckCircle className="w-3 h-3 mr-1"/> {total_assembled_consumed} Assembled
                        </span>
                    )}
                    {totalPendingRepair > 0 && (
                         <span className="text-xs font-bold bg-orange-100 text-orange-700 px-3 py-1 rounded-full flex items-center">
                            <Wrench className="w-3 h-3 mr-1"/> {totalPendingRepair} Repair
                        </span>
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className="p-3 bg-gray-50 border-t border-gray-100 space-y-3">
                    {assemblableSizes.map((group) => (
                        <div key={group.size} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-3 rounded-md border border-gray-200 shadow-sm">
                            
                            {/* Size & Count */}
                            <div className="flex items-center mb-3 sm:mb-0 min-w-[100px]">
                                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold rounded-lg mr-3 shadow-sm">
                                    {group.size}
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Ready</p>
                                    <p className="text-lg font-bold text-gray-800">{group.maxSets} <span className="text-xs font-normal text-gray-500">Sets</span></p>
                                </div>

                                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 shadow-sm">
                                    <p className="text-xs font-medium text-green-700 uppercase tracking-wider">Assembled</p>
                                    <p className="text-lg font-bold text-green-800">
                                        {group.total_assembled_consumed}
                                        <span className="text-xs font-normal text-green-600 ml-1">Pieces</span>
                                    </p>
                                </div>

                            </div>

                            {/* Parts Breakdown */}
                            <div className="flex-grow mx-4 grid grid-cols-2 gap-2 text-xs">
                                {group.parts.map(part => (
                                    <div key={part.part_id} className="flex justify-between items-center bg-gray-50 px-2 py-1.5 rounded border border-gray-100">
                                        <span className="font-medium text-gray-600 truncate mr-2">{part.part_name}</span>
                                        <span className={`font-mono font-bold ${part.available_for_assembly === group.maxSets ? "text-orange-500" : "text-green-600"}`}>
                                            {part.available_for_assembly}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col sm:flex-row gap-2 sm:ml-4">
                                {group.pendingAlter > 0 && (
                                    <button
                                        onClick={() => onApproveRepair({
                                            batchId,
                                            rollId: roll.roll_id,
                                            size: group.size,
                                            pendingAlter: group.pendingAlter
                                        })}
                                        className="px-3 py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-lg shadow-sm flex items-center justify-center whitespace-nowrap"
                                    >
                                        <Wrench className="w-3 h-3 mr-1.5"/> Fix ({group.pendingAlter})
                                    </button>
                                )}
                                
                                <button
                                    onClick={() => onLogAssembly({
                                        batchId,
                                        rollId: roll.roll_id,
                                        size: group.size,
                                        maxSets: group.maxSets,
                                        partsBreakdown: group.parts
                                    })}
                                    disabled={group.maxSets <= 0}
                                    className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 rounded-lg shadow-sm flex items-center justify-center whitespace-nowrap"
                                >
                                    <Play className="w-3 h-3 mr-1.5 fill-current"/> Assemble
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


// --- COMPONENT: Batch Card ---
const AssemblyBatchCard = ({ batch, onLogAssembly, onApproveRepair }) => {
    const rolls = batch.rolls_summary || [];
    const totalBatchSetsReady = batch.total_sets_ready || 0; 
    const hasWork = totalBatchSetsReady > 0;

    return (
        <div className={`bg-white rounded-xl shadow-md border-l-4 ${hasWork ? 'border-purple-600' : 'border-gray-300'} overflow-hidden flex flex-col h-full`}>
            <div className="p-4 border-b border-gray-100 flex justify-between items-start">
                <div>
                    <h3 className="font-bold text-lg text-gray-800 leading-tight">{batch.product_name}</h3>
                    <p className="text-xs font-mono text-gray-500 mt-1">Batch: {batch.batch_code || `#${batch.batch_id}`}</p>
                </div>
                <div className="text-right bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-100">
                    <span className="block text-2xl font-extrabold text-purple-700 leading-none">{totalBatchSetsReady}</span>
                    <span className="text-[10px] text-purple-500 uppercase tracking-wide font-bold">Total Sets</span>
                </div>
            </div>

            <div className="p-4 bg-gray-50/50 flex-grow overflow-y-auto max-h-[400px]">
                {rolls.length > 0 ? (
                    rolls.map(roll => (
                        <RollAssemblyDetails 
                            key={roll.roll_id} 
                            roll={roll} 
                            batchId={batch.batch_id}
                            onLogAssembly={onLogAssembly}
                            onApproveRepair={onApproveRepair} // Pass down
                        />
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                        <Box className="w-8 h-8 mb-2 opacity-50"/>
                        <p className="text-sm italic">No rolls available.</p>
                    </div>
                )}
            </div>
        </div>
    );
};


// --- MAIN PAGE COMPONENT ---
const AssemblyDashboardPage = () => {
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [modalState, setModalState] = useState({ type: null, data: null }); // Managed types: 'log' or 'repair'
    const [headerInfo, setHeaderInfo] = useState({ lineName: '', workstationId: null });

    const fetchQueue = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setMessage(null);
        try {
            const res = await assemblyPortalApi.getMyQueue();
            setBatches(res.data.batches.filter(b => b.total_sets_ready > 0 || (b.rolls_summary || []).length > 0) || []);
            setHeaderInfo({
                lineName: res.data.production_line_name,
                workstationId: res.data.workstation_id
            });
        } catch (err) {
            setError(err.message || "Could not load assembly queue.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchQueue(); }, [fetchQueue]);

    const handleOpenLogModal = (itemInfo) => {
        setModalState({ type: 'log', data: itemInfo });
    };
    
    const handleOpenRepairModal = (itemInfo) => {
        setModalState({ type: 'repair', data: itemInfo });
    };

    const handleSaveAssembly = async (payload) => {
        try {
            const fullBatch = batches.find(b => b.batch_id === payload.batchId);
            const apiPayload = {
                ...payload,
                lineId: headerInfo.lineId || 4,
                workstationId: headerInfo.workstationId || 9, 
                productId: fullBatch ? fullBatch.product_id : 0
            };

            const res = await assemblyPortalApi.logAssemblyStatus(apiPayload);
            setMessage(res.data.message || 'Assembly logged!');
            setModalState({ type: null, data: null });
            fetchQueue(); 
            setTimeout(() => setMessage(null), 3000);
        } catch (err) {
            throw new Error(err.response?.data?.error || err.message || 'Failed to log assembly.');
        }
    };
    
    const handleSaveRepair = async (payload) => {
         try {
            const fullBatch = batches.find(b => b.batch_id === payload.batchId);
            const apiPayload = {
                ...payload,
                lineId: headerInfo.lineId || 4,
                workstationId: headerInfo.workstationId || 9, 
                productId: fullBatch ? fullBatch.product_id : 0
            };

            const res = await assemblyPortalApi.approveRepairedAssembly(apiPayload);
            setMessage(res.data.message || 'Repair logged!');
            setModalState({ type: null, data: null });
            fetchQueue(); 
            setTimeout(() => setMessage(null), 3000);
        } catch (err) {
             // Error handling within modal
             throw new Error(err.response?.data?.error || err.message || 'Failed to log repair.');
        }
    }

    return (
        <div className="p-6 bg-gray-100 min-h-screen font-inter">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-extrabold text-gray-900 flex items-center">
                                <Package className="w-8 h-8 mr-3 text-blue-600"/> 
                                Assembly Station
                            </h1>
                            {headerInfo.lineName && (
                                <p className="text-sm text-gray-500 mt-1">
                                    Active Line: <span className="font-medium text-gray-800 bg-white px-2 py-0.5 rounded border">{headerInfo.lineName}</span>
                                </p>
                            )}
                        </div>
                        <button onClick={fetchQueue} className="text-sm text-blue-600 hover:underline flex items-center">
                             <Loader2 className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`}/> Refresh Queue
                        </button>
                    </div>
                    
                    {(error || message) && (
                        <div className="mt-4">
                            {error && <ErrorDisplay message={error} />}
                            {message && <MessageDisplay message={message} />}
                        </div>
                    )}
                </header>

                {isLoading ? <Spinner /> : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                        {batches.length > 0 ? (
                            batches.map(batch => (
                                <AssemblyBatchCard 
                                    key={batch.batch_id} 
                                    batch={batch} 
                                    onLogAssembly={handleOpenLogModal}
                                    onApproveRepair={handleOpenRepairModal}
                                />
                            ))
                        ) : (
                            <div className="col-span-full text-center py-12 bg-white rounded-xl shadow-sm border border-dashed border-gray-300">
                                <div className="bg-gray-50 p-4 rounded-full mb-4 w-20 h-20 mx-auto flex items-center justify-center">
                                    <CheckCircle className="w-10 h-10 text-green-500"/>
                                </div>
                                <h3 className="text-xl font-bold text-gray-800">All Caught Up!</h3>
                                <p className="text-gray-500 mt-2 max-w-md mx-auto">There are no sets currently ready for assembly.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {modalState.type === 'log' && (
                <AssemblyLogModal
                    itemInfo={modalState.data}
                    onClose={() => setModalState({ type: null, data: null })}
                    onSave={handleSaveAssembly}
                />
            )}
            
            {modalState.type === 'repair' && (
                <ApproveRepairedModal
                    itemInfo={modalState.data}
                    onClose={() => setModalState({ type: null, data: null })}
                    onSave={handleSaveRepair}
                />
            )}
        </div>
    );
};

export default AssemblyDashboardPage;