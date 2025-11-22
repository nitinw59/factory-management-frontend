import React, { useState, useEffect, useCallback } from 'react';
import { initializationPortalApi } from '../../api/initializationPortalApi';
import Modal from '../../shared/Modal';
import { FiPlay, FiLayers, FiInfo, FiMoreHorizontal, FiSquare, FiCheckSquare, FiEdit3 } from 'react-icons/fi'; // Using Fi icons

// --- SHARED & REUSABLE COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="text-center p-4 text-red-600">{message}</div>;

// --- MODAL COMPONENTS ---
const StartBatchModal = ({ batchId, cycleFlow, currentLineId, onClose, onSave }) => {
    const [lines, setLines] = useState([]);
    const [rolls, setRolls] = useState([]);
    const [selectedRolls, setSelectedRolls] = useState(new Set());
    const [isLoading, setIsLoading] = useState(true);
    // Line selection is now disabled, it's informational.
    const [selectedLine, setSelectedLine] = useState(currentLineId || '');

    useEffect(() => {
        const fetchModalData = async () => {
            setIsLoading(true);
            try {
                // We no longer need to fetch lines, as the line is already assigned.
                // We just fetch the rolls.
                const rollsRes = await initializationPortalApi.getRollsForBatch(batchId);
                const rollData = rollsRes.data || [];
                console.log("Fetched rolls for start batch modal:", rollData);
                setRolls(rollData);
                // Select all rolls by default
                setSelectedRolls(new Set(rollData.map(r => r.id)));
                
                // If we need line data (e.g., to display name), fetch it, but it's not for selection
                if(currentLineId) {
                    // This API call might not be necessary if `progress_for_seq1` already has line name
                    // For now, we assume `currentLineId` is sufficient.
                }
                
            } catch (error) { console.error("Failed to fetch modal data", error); }
            finally { setIsLoading(false); }
        };
        fetchModalData();
    }, [cycleFlow.line_type_id, batchId, currentLineId]);

    const handleRollToggle = (rollId) => {
        setSelectedRolls(prev => {
            const newSelected = new Set(prev);
            if (newSelected.has(rollId)) newSelected.delete(rollId);
            else newSelected.add(rollId);
            return newSelected;
        });
    };

    const handleSave = async () => {
        // `selectedLine` is now `currentLineId` which is pre-set
        if (!currentLineId || selectedRolls.size === 0) return alert("Batch must be assigned to a line and have rolls selected.");
        await onSave({ batchId, cycleFlowId: cycleFlow.id, lineId: currentLineId, selectedRollIds: Array.from(selectedRolls) });
    };

    return (
        <Modal title={`Start Batch for: ${cycleFlow.line_type_name}`} onClose={onClose}>
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Production Line</label>
                    {/* Line selection is now disabled, it's informational */}
                    <input 
                        type="text" 
                        value={currentLineId ? `Line ID: ${currentLineId}` : "No Line Assigned"} // Display line ID or name if available
                        disabled 
                        className="w-full p-2 border rounded-md bg-gray-100"
                    />
                     {!currentLineId && <p className="text-xs text-red-600 mt-1">This batch must be assigned to a line by a Line Loader first.</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Fabric Rolls to Start</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto border p-3 rounded-md bg-gray-50">
                        {isLoading ? <Spinner/> : rolls.map(roll => (
                            <div key={roll.roll_id} onClick={() => handleRollToggle(roll.roll_id)} className="flex items-center p-2 rounded-md cursor-pointer hover:bg-blue-50">
                                {selectedRolls.has(roll.roll_id) ? <FiCheckSquare className="text-blue-600 mr-3" size={20}/> : <FiSquare className="text-gray-400 mr-3" size={20}/>}
                                <span className="font-medium">Roll #{roll.roll_id}</span>
                                <span className="font-medium"> - {roll.fabric_type}</span>
                                <span className="font-medium"> - {roll.color_name} ({roll.color_number})</span>
                                <span className="ml-auto text-sm text-gray-500">{roll.meter}m</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md">Cancel</button>
                {/* Button is disabled if no line is assigned or no rolls are selected */}
                <button onClick={handleSave} disabled={!currentLineId || selectedRolls.size === 0 || isLoading} className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-400">
                    Start Batch
                </button>
            </div>
        </Modal>
    );
};

// --- ReceiveRollsModal is REMOVED as per new workflow ---

// --- BATCH CARD (REWRITTEN) & MAIN PAGE ---
const BatchCard = ({ batch, onStartClick }) => {
    // Status is now based on progress_for_seq1
    const progress = batch.progress_for_seq1;
    const status = progress ? progress.status : 'N/A'; // Should be PENDING
    const isCompleted = status === 'COMPLETED';
    const isPending = status === 'PENDING';
    const assignedLineName = progress ? progress.line_name : 'Unassigned';

    let statusColor = 'bg-gray-100 text-gray-800';
    if (isCompleted) statusColor = 'bg-green-100 text-green-800';
    else if (isPending) statusColor = 'bg-yellow-100 text-yellow-800';
    else if (status === 'IN_PROGRESS') statusColor = 'bg-blue-100 text-blue-800';
    
    return (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 flex flex-col">
            <div className="p-4 border-b">
                <div className="flex justify-between items-start">
                    <h2 className="font-bold text-lg text-gray-800">{batch.product_name}</h2>
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${statusColor}`}>
                        {status.replace('_', ' ')}
                    </span>
                </div>
                <p className="font-mono text-sm text-gray-500">{batch.batch_code || `BATCH-${batch.batch_id}`}</p>
                 {progress?.line_name && (
                    <div className="mt-2 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full px-2 py-0.5 inline-block">
                        Assigned to: {progress.line_name}
                    </div>
                )}
            </div>
            <div className="p-4 grid grid-cols-2 gap-4 flex-1">
                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center"><FiInfo className="mr-1"/> Details</h4>
                    <p className="text-sm"><strong className="font-medium">Layer Length:</strong> {batch.length_of_layer_inches || 'N/A'} in</p>
                    <p className="text-sm"><strong className="font-medium">Notes:</strong> {batch.notes || 'None'}</p>
                </div>
                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center"><FiMoreHorizontal className="mr-1"/> Size Ratios</h4>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        {(batch.size_ratios || []).map(sr => <span key={sr.size}><strong>{sr.size}:</strong> {sr.ratio}</span>)}
                    </div>
                </div>
                <div className="col-span-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center"><FiLayers className="mr-1"/> Fabric Rolls</h4>
                    <div className="flex flex-wrap gap-2">
                        {(batch.rolls || []).map(roll => (
                            <span key={roll.id} title={`Status: ${roll.status.replace('_', ' ')}`} className={`px-2 py-0.5 text-xs rounded-full ${
                                roll.status === 'IN_STOCK' ? 'bg-red-100 text-red-800' : 
                                roll.status === 'ASSIGNED_TO_PRODUCTION' ? 'bg-yellow-100 text-yellow-800' : 
                                'bg-green-100 text-green-800'
                            }`}>
                                Roll #{roll.id} - {roll.color}({roll.color_number}) ({roll.meter}m)
                            </span>
                        ))}
                    </div>
                </div>
            </div>
            <div className="p-3 bg-gray-50 border-t flex justify-end space-x-2">
                {/* Button is now for "Start Batch" */}
                <button 
                    onClick={onStartClick} 
                    // Only enabled if the batch is PENDING
                    disabled={!isPending || !batch.first_cycle_flow} 
                    className="px-4 py-2 text-sm font-semibold text-white rounded-md flex items-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    <FiPlay className="mr-2"/>
                    Start Batch
                </button>
            </div>
        </div>
    );
};

const InitializationDashboardPortalPage = () => {
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalState, setModalState] = useState({ type: null, data: null });

    const fetchDashboardData = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await initializationPortalApi.getDashboardData();
            console.log("Fetched dashboard data:", response.data);
            setBatches(response.data);
        } catch (err) {
            setError("Could not load initialization queue.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

    const handleStartBatch = async (data) => {
        try {
            await initializationPortalApi.startBatch(data);
            setModalState({ type: null, data: null });
            fetchDashboardData(); // Refresh list after starting
        } catch (error) {
            alert('Failed to start batch. Please try again.');
            console.error(error);
        }
    };

    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Cutting Manager Dashboard</h1>
            {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batches.length > 0 ? batches.map(batch => (
                        <BatchCard 
                            key={batch.batch_id} 
                            batch={batch}
                            // Removed onReceiveClick
                            onStartClick={() => setModalState({ type: 'start', data: batch })}
                        />
                    )) : (
                        <div className="col-span-full text-center py-16 bg-white rounded-lg shadow border border-gray-200">
                            <h3 className="text-xl font-semibold text-gray-700">Queue is Empty</h3>
                            <p className="text-gray-500 mt-2">There are no new batches pending for your lines.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Removed ReceiveRollsModal */}
            
            {/* StartBatchModal now only opens if the first cycle flow exists */}
            {modalState.type === 'start' && modalState.data.first_cycle_flow && (
                <StartBatchModal
                    batchId={modalState.data.batch_id}
                    cycleFlow={modalState.data.first_cycle_flow}
                    // Pass the line ID from the progress record
                    currentLineId={modalState.data.progress_for_seq1?.line_id}
                    onClose={() => setModalState({ type: null, data: null })}
                    onSave={handleStartBatch}
                />
            )}
        </div>
    );
};

export default InitializationDashboardPortalPage;