import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Shirt, Layers, ClipboardCheck, GitMerge as Component, Check, X, Hammer, Wrench, Loader2, Bell, PackageCheck,
    Play, ListTodo, Square, CheckSquare, XCircle, BookHeart, AlertTriangle, CheckCircle, Camera, PlusCircle, User 
} from 'lucide-react';
import {sewingPortalApi } from '../../api/sewingPortalApi';
import Modal from '../../shared/Modal';

// --- UI & LOGIC COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="p-4 bg-red-100 text-red-700 rounded-lg">{message}</div>;
const MessageDisplay = ({ message }) => <div className="p-4 bg-green-100 text-green-700 rounded-lg">{message}</div>;

// --- MODAL FOR LOGGING SEWING STATUS ---
const SewingLogModal = ({ itemInfo, onClose, onLogStatus, mode }) => { // ✅ Added mode prop
    const total_cut_num = parseInt(itemInfo.total_cut, 10) || 0;
    const total_completed = parseInt(itemInfo.total_completed, 10) || 0; 
    const total_rejected = parseInt(itemInfo.total_rejected, 10) || 0;
    const total_repaired = parseInt(itemInfo.total_repaired, 10) || 0;
    const total_altered = parseInt(itemInfo.total_altered, 10) || 0;

    const total_processed = total_completed + total_rejected + total_repaired;
    const pending_alter = total_altered - total_repaired;
    const remaining_to_complete = total_cut_num - (total_processed + pending_alter);
    
    // Determine input quantity and maximum based on mode
    const quantityToLog = mode === 'single' ? 1 : remaining_to_complete; 
    const maxQty = remaining_to_complete;
    
    const [quantity, setQuantity] = useState(quantityToLog);

    const handleStatusClick = (qcStatus) => {
        const finalQuantity = mode === 'single' ? 1 : quantity;

        if (finalQuantity <= 0 || finalQuantity > maxQty) {
            alert(`Quantity must be between 1 and ${maxQty}.`); 
            return;
        }
        
        onLogStatus({ 
            partId: itemInfo.partId, 
            size: itemInfo.size, 
            quantity: finalQuantity, 
            qcStatus 
        });
    };

    return (
        <Modal title={`Log Status: ${itemInfo.partName} (Size: ${itemInfo.size})`} onClose={onClose}>
            <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded text-sm space-y-1">
                    <p>Total Cut (Verified): <span className="font-bold">{total_cut_num}</span></p>
                    <p>Total Completed: <span className="font-bold">{total_completed}</span></p>
                    <p>Total Processed (Final): <span className="font-bold">{total_processed}</span></p>
                    <p className="font-bold text-blue-600 mt-1">Remaining to Process: <span className="font-bold">{remaining_to_complete}</span></p>
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to Log (Max: {maxQty})</label>
                    <input 
                        type="number" 
                        value={quantity} 
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 0)} 
                        disabled={mode === 'single'}
                        className="w-full p-2 border rounded-md" 
                        min="1" 
                        max={maxQty}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Status</label>
                    <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => handleStatusClick('COMPLETED')} disabled={remaining_to_complete <= 0} className="p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-semibold disabled:bg-gray-300">
                            COMPLETED ({mode === 'single' ? 1 : quantity})
                        </button>
                        <button onClick={() => handleStatusClick('REJECTED')} disabled={remaining_to_complete <= 0} className="p-3 bg-red-500 text-white rounded-lg hover:bg-red-600 font-semibold disabled:bg-gray-300">
                            REJECT ({mode === 'single' ? 1 : quantity})
                        </button>
                        <button onClick={() => handleStatusClick('ALTER')} disabled={remaining_to_complete <= 0} className="p-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-semibold disabled:bg-gray-300">
                            ALTER ({mode === 'single' ? 1 : quantity})
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

// --- MODAL FOR APPROVING ALTERED PIECES (Logic unchanged) ---
const ApproveAlteredModal = ({ itemInfo, onClose, onSave }) => {
    const pending_alter = parseInt(itemInfo.total_altered, 10) - parseInt(itemInfo.total_repaired, 10);
    
    const handleSave = () => {
        if (pending_alter <= 0) {
            alert("No pieces are pending alteration.");
            return;
        }
        onSave(1); // Always save a quantity of 1
    };
    
    return (
        <Modal title={`Approve Repaired: ${itemInfo.partName} (Size: ${itemInfo.size})`} onClose={onClose}>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pieces Pending Alteration: <span className="font-bold text-lg">{pending_alter}</span>
                    </label>
                    <p className="text-sm text-gray-500">Click the button below to approve a single repaired piece.</p>
                </div>
            </div>
            <div className="px-6 py-4 -mx-6 -mb-6 mt-4 bg-gray-50 border-t flex justify-end space-x-2">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                <button 
                    onClick={handleSave} 
                    disabled={pending_alter <= 0}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-300">
                    Save Repaired (1)
                </button>
            </div>
        </Modal>
    );
};


// --- UI Components adapted from template (REMOVED ASSEMBLE LOGIC) ---
const SizeValidationRow = ({ sizeDetail, onLogStatusClick, onApproveAlterClick }) => {
    const total_cut = parseInt(sizeDetail.total_cut, 10) || 0;
    const total_completed = parseInt(sizeDetail.total_completed, 10) || 0;
    const total_rejected = parseInt(sizeDetail.total_rejected, 10) || 0;
    const total_altered = parseInt(sizeDetail.total_altered, 10) || 0;
    const total_repaired = parseInt(sizeDetail.total_repaired, 10) || 0;

    const total_processed = total_completed + total_rejected + total_repaired;
    const pending_alter = total_altered - total_repaired;
    const isValidationComplete = (total_processed + pending_alter) >= total_cut;

    const completedPercent = total_cut > 0 ? (total_completed / total_cut) * 100 : 0;
    const repairedPercent = total_cut > 0 ? (total_repaired / total_cut) * 100 : 0;
    const rejectedPercent = total_cut > 0 ? (total_rejected / total_cut) * 100 : 0;
    const pendingAlterPercent = total_cut > 0 ? (pending_alter / total_cut) * 100 : 0;
    
    return (
        <div className="p-3 rounded-md bg-white border">
            <div className="flex justify-between items-center mb-2">
                <div className="font-semibold text-gray-800 text-lg">{sizeDetail.size}</div>
                <div className="text-sm font-bold text-gray-700">{total_processed} / {total_cut} Completed</div>
            </div>

            <div title="Green=Completed, Orange=Repaired, Red=Rejected, Yellow=Pending Alter" className="w-full bg-gray-200 rounded-full h-4 mb-2 flex overflow-hidden text-white text-xs items-center justify-center">
                <div className="bg-green-500 h-4" style={{ width: `${completedPercent}%` }}></div>
                <div className="bg-orange-500 h-4" style={{ width: `${repairedPercent}%` }}></div>
                <div className="bg-red-500 h-4" style={{ width: `${rejectedPercent}%` }}></div>
                <div className="bg-yellow-400 h-4" style={{ width: `${pendingAlterPercent}%` }}></div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                <span className="flex items-center"><CheckSquare className="text-green-500 mr-1.5"/> Completed: <strong>{total_completed}</strong></span>
                <span className="flex items-center"><Wrench className="text-orange-500 mr-1.5"/> Repaired: <strong>{total_repaired}</strong></span>
                <span className="flex items-center"><X className="text-red-500 mr-1.5"/> Rejected: <strong>{total_rejected}</strong></span>
                <span className="flex items-center"><Hammer className="text-yellow-500 mr-1.5"/> Pending Alter: <strong>{pending_alter}</strong></span>
            </div>

            <div className="flex justify-end space-x-2 mt-3 pt-2 border-t">
                {pending_alter > 0 && (
                     <button onClick={onApproveAlterClick} className="px-3 py-1 text-xs bg-orange-100 text-orange-800 rounded-full hover:bg-orange-200 font-semibold">
                        Approve Repaired (1)
                    </button>
                )}
                <button onClick={onLogStatusClick} disabled={isValidationComplete} className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 font-semibold disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed">
                    {isValidationComplete ? 'Complete' : 'Log Status (1)'}
                </button>
            </div>
        </div>
    );
};

// --- PartCard (Filters rolls based on selectedPartType) ---
const PartCard = ({ batchId, part, rollId, onLogStatusClick, onApproveAlterClick, isFiltered }) => {
     // Only render the card if it contains the selected part, or if no part is selected
    if (isFiltered && part.part_name !== isFiltered) return null;

    return (
        <div className={`p-3 rounded-lg border ${part.part_type === 'PRIMARY' ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-100 border-gray-200'}`}>
            <h5 className="font-bold text-gray-800 flex items-center mb-3 text-lg"><Component className="mr-2 text-indigo-700"/>{part.part_name} <span className="ml-2 text-xs font-normal text-gray-500">({part.part_type})</span></h5>
            <div className="space-y-2">
                {(part.size_details || []).map(detail => (
                    <SizeValidationRow 
                        key={detail.size} 
                        sizeDetail={detail} 
                        onLogStatusClick={() => onLogStatusClick({ partId: part.part_id, partName: part.part_name, rollId, ...detail })} 
                        onApproveAlterClick={() => onApproveAlterClick({ partId: part.part_id, partName: part.part_name, rollId, ...detail})}
                    />
                ))}
                 {(!part.size_details || part.size_details.length === 0) && <p className="text-sm text-gray-500 italic">No cut pieces logged for this part.</p>}
            </div>
        </div>
    );
};

const FabricRollCard = ({ batchId, roll, onLogStatusClick, onApproveAlterClick, isFiltered }) => {
     // Filter parts within the roll
    const filteredParts = useMemo(() => {
        if (!isFiltered) return roll.parts_details;
        return (roll.parts_details || []).filter(p => p.part_name === isFiltered);
    }, [roll.parts_details, isFiltered]);
    
    // Only render roll card if it contains relevant parts
    if (isFiltered && filteredParts.length === 0) return null;

    return (
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <h4 className="font-bold text-blue-800 flex items-center mb-3 text-lg"><Layers className="mr-2"/>Fabric Roll #{roll.fabric_roll_id}</h4>
            <div className="space-y-3">
                {filteredParts.map(part => (
                    <PartCard 
                        key={part.part_id} 
                        part={part} 
                        rollId={roll.fabric_roll_id}
                        onLogStatusClick={onLogStatusClick} 
                        onApproveAlterClick={onApproveAlterClick} 
                    />
                ))}
            </div>
        </div>
    );
};

const ProductionBatchCard = ({ batch, onLogStatusClick, onApproveAlterClick, isFiltered }) => (
    <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
        <div className="border-b pb-3 mb-3">
            <h2 className="text-xl font-bold text-gray-800 flex items-center"><Shirt className="mr-2 text-blue-500"/>Batch #{batch.batch_id} <span className="ml-2 text-sm font-normal text-gray-500">{batch.batch_code}</span></h2>
        </div>
        <div className="space-y-4">
            {(batch.rolls || []).map(roll => (
                <FabricRollCard 
                    key={roll.fabric_roll_id} 
                    roll={roll} 
                    batchId={batch.batch_id}
                    onLogStatusClick={onLogStatusClick} 
                    onApproveAlterClick={onApproveAlterClick}
                    isFiltered={isFiltered} // Pass filter down
                />
            ))}
             {(batch.rolls || []).length === 0 && (
                <p className="text-center text-gray-500 p-4">No rolls are assigned to this batch.</p>
             )}
        </div>
    </div>
);


// --- NEW Main Dashboard Page ---
const SewingDashboardPage = () => {
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [modalState, setModalState] = useState({ type: null, data: null });
    const [headerInfo, setHeaderInfo] = useState({ 
        lineName: 'N/A', 
        processType: 'unknown', 
        lineId: null, 
        workstationId: null,
        workstation_name: null
    });
    
    // --- NEW CONFIGURATION STATE ---
    const [config, setConfig] = useState(() => {
        const savedMode = localStorage.getItem('sewingMode') || 'single';
        const savedPart = localStorage.getItem('sewingPartFilter') || null;
        return {
            selectedPartType: savedPart, 
            viewMode: 'batch', // Default to batch view
            inputScope: savedMode // 'single' or 'bundle'
        };
    });

    // Effect to save Input Scope to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('sewingMode', config.inputScope);
        localStorage.setItem('sewingPartFilter', config.selectedPartType || '');
    }, [config.inputScope, config.selectedPartType]);

    const fetchQueue = useCallback(async () => { 
        setIsLoading(true);
        setError(null);
        setMessage(null);
        try {
            const res = await sewingPortalApi.getMyQueue();
            setBatches(res.data.batches || []);
            // Automatically set filter to the first PRIMARY part if none is saved/selected
            const firstPrimaryPart = res.data.batches?.[0]?.rolls?.[0]?.parts_details?.find(p => p.part_type === 'PRIMARY')?.part_name;
            
            setConfig(prev => ({
                ...prev,
                selectedPartType: prev.selectedPartType || firstPrimaryPart
            }));
            
            setHeaderInfo({ 
                lineName: res.data.production_line_name || 'N/A', 
                processType: res.data.workstation_process_type || 'unknown', 
                lineId: res.data.production_line_id || null,
                workstationId: res.data.workstation_id || null,
                workstation_name: res.data.workstation_name || null
            });
        } catch (err) {
            setError("Could not load your assigned queue. Please ensure you are assigned to a sewing workstation.");
        } finally { setIsLoading(false); }
    }, []);
    
    useEffect(() => { fetchQueue(); }, [fetchQueue]);
    
    const openLogModal = (batchId, itemInfo) => { setModalState({ type: 'log_status', data: { batchId, itemInfo } }); };
    const openAlterModal = (batchId, itemInfo) => { setModalState({ type: 'alter', data: { batchId, itemInfo } }); };
    const closeModal = () => setModalState({ type: null, data: null });

     const handleLogStatus = async (statusData) => { 
        const { batchId } = modalState.data;
        const payload = {
            ...statusData,
            batchId: batchId,
            productId: batches.find(b => b.batch_id === batchId)?.product_id,
            lineId: headerInfo.lineId,
            workstationId: headerInfo.workstationId,
            rollId: modalState.data.itemInfo.rollId 
        };

        setError(null);
        setMessage(null);
        
        try {
            // ✅ API call is still valid, as it just passes the qcStatus string
            const res = await sewingPortalApi.logSewingStatus(payload);
            setMessage(res.data.message || 'Status logged successfully.');
            
            // This portal no longer completes batches, so we just refresh
            fetchQueue(); 
            closeModal();
        } catch (err) { 
            setError(err.response?.data?.error || "Failed to log status.");
        }
    };
    
    const handleApproveRepaired = async (quantity) => { 
        const { batchId, itemInfo } = modalState.data;
         const payload = {
            quantity, // This will be 1
            partId: itemInfo.partId,
            size: itemInfo.size,
            batchId: batchId,
            productId: batches.find(b => b.batch_id === batchId)?.product_id,
            lineId: headerInfo.lineId,
            workstationId: headerInfo.workstationId,
            rollId: itemInfo.rollId 
        };

        setError(null);
        setMessage(null);

        try {
            const res = await sewingPortalApi.approveRepairedPieces(payload);
            setMessage(res.data.message || 'Repaired pieces logged.');
            // This portal no longer completes batches, so we just refresh
            fetchQueue(); 
            closeModal();
        } catch (err) {
            setError(err.response?.data?.error || "Failed to approve repaired pieces.");
        }
    };
    // --- NEW LOGIC: Extract Unique Part Names for Dropdown ---
    const allUniquePartNames = useMemo(() => {
        const names = new Set();
        batches.forEach(batch => {
            (batch.rolls || []).forEach(roll => {
                (roll.parts_details || []).forEach(part => {
                    if (part.part_type === 'PRIMARY') { // Filter by PRIMARY only for the dropdown selector
                       names.add(part.part_name);
                    }
                });
            });
        });
        return Array.from(names).sort();
    }, [batches]);
    
    // --- NEW LOGIC: Filtered Batches ---
    const filteredBatches = useMemo(() => {
        if (!config.selectedPartType) return batches;
        
        return batches.filter(batch => {
            // Check if ANY roll in the batch contains the selected part type
            return (batch.rolls || []).some(roll => 
                (roll.parts_details || []).some(part => 
                    part.part_name === config.selectedPartType
                )
            );
        });
    }, [batches, config.selectedPartType]);
    // --- End Filtered Logic ---


    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <header className="mb-6">
                     <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 flex items-center"><ClipboardCheck className="mr-3 text-gray-500"/>Sewing Part Completion Queue</h1>
                            <p className="text-gray-600">Showing batches for <strong className="text-gray-800">{headerInfo.lineName}</strong>. Your workstation type is: <strong className="capitalize">{headerInfo.workstation_name}</strong>.</p>
                        </div>
                        {/* --- CONFIGURATION BAR --- */}
                        <div className="bg-white p-3 rounded-lg shadow-sm border space-y-2 flex-shrink-0 w-full md:w-auto">
                            <h3 className="text-sm font-semibold text-gray-700">Filter By Primary Part</h3>
                            <select 
                                value={config.selectedPartType || ''}
                                onChange={(e) => setConfig(prev => ({ ...prev, selectedPartType: e.target.value || null }))}
                                className="w-full p-2 border rounded-md text-sm"
                            >
                                <option value="">--- Show All Parts ---</option>
                                {allUniquePartNames.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                            
                            <h3 className="text-sm font-semibold text-gray-700 pt-2 border-t mt-3">Input Mode</h3>
                             <div className="flex space-x-2 w-full justify-center">
                                <button
                                    onClick={() => setConfig(prev => ({ ...prev, inputScope: 'bundle' }))}
                                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${config.inputScope === 'bundle' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                                >
                                    Bundle
                                </button>
                                <button
                                    onClick={() => setConfig(prev => ({ ...prev, inputScope: 'single' }))}
                                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${config.inputScope === 'single' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                                >
                                    Single
                                </button>
                             </div>
                        </div>
                        {/* --- END CONFIGURATION BAR --- */}
                    </div>
                    {error && <ErrorDisplay message={error} />}
                    {message && <MessageDisplay message={message} />}
                </header>
                
                {isLoading ? <Spinner /> : (
                    <div className="space-y-6">
                        {filteredBatches.length === 0 && (
                            <p className="text-center text-gray-500 p-8 col-span-full">No batches match the current filter or are currently 'In Progress' on your line.</p>
                        )}
                        {filteredBatches.map(batch => 
                            <ProductionBatchCard 
                                key={batch.batch_id} 
                                batch={batch} 
                                onLogStatusClick={(itemInfo) => openLogModal(batch.batch_id, itemInfo)} 
                                onApproveAlterClick={(itemInfo) => openAlterModal(batch.batch_id, itemInfo)} 
                                isFiltered={config.selectedPartType} // Pass filter for internal card rendering
                            />
                        )}
                    </div>
                )}
            </div>

            {modalState.type === 'log_status' && (
                <SewingLogModal 
                    itemInfo={modalState.data.itemInfo} 
                    onClose={closeModal} 
                    onLogStatus={handleLogStatus} 
                    mode={config.inputScope} // Pass the selected input mode
                />
            )}
            
            {modalState.type === 'alter' && (
                <ApproveAlteredModal 
                    itemInfo={modalState.data.itemInfo} 
                    onClose={closeModal} 
                    onSave={handleApproveRepaired} 
                />
            )}
        </div>
    );
};

export default SewingDashboardPage;