import React, { useState, useEffect, useCallback } from 'react';
import { initializationPortalApi } from '../../api/initializationPortalApi';
import Modal from '../../shared/Modal';
import { LuPlay, LuTruck, LuLayers, LuInfo, LuRuler, LuCheck, LuLoader, LuSquare, LuSquareCheck, LuPencil } from 'react-icons/lu';

// --- SHARED & REUSABLE COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="text-center p-4 text-red-600">{message}</div>;

// --- MODAL COMPONENTS ---
const StartBatchModal = ({ batchId, cycleFlow, currentLineId, onClose, onSave }) => {
    const [lines, setLines] = useState([]);
    const [rolls, setRolls] = useState([]);
    const [selectedRolls, setSelectedRolls] = useState(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [selectedLine, setSelectedLine] = useState(currentLineId || '');

    useEffect(() => {
        const fetchModalData = async () => {
            setIsLoading(true);
            try {
                const [linesRes, rollsRes] = await Promise.all([
                    initializationPortalApi.getLinesByType(cycleFlow.line_type_id),
                    initializationPortalApi.getRollsForBatch(batchId)
                ]);
                setLines(linesRes.data);
                setRolls(rollsRes.data);
                setSelectedRolls(new Set(rollsRes.data.map(r => r.id)));
            } catch (error) { console.error("Failed to fetch modal data", error); }
            finally { setIsLoading(false); }
        };
        fetchModalData();
    }, [cycleFlow.line_type_id, batchId]);

    const handleRollToggle = (rollId) => {
        setSelectedRolls(prev => {
            const newSelected = new Set(prev);
            if (newSelected.has(rollId)) newSelected.delete(rollId);
            else newSelected.add(rollId);
            return newSelected;
        });
    };

    const handleSave = async () => {
        if (!selectedLine || selectedRolls.size === 0) return alert("Please select a line and at least one roll.");
        await onSave({ batchId, cycleFlowId: cycleFlow.id, lineId: selectedLine, selectedRollIds: Array.from(selectedRolls) });
    };

    return (
        <Modal title={`${currentLineId ? 'Edit Assignment' : 'Start Batch'} for: ${cycleFlow.line_type_name}`} onClose={onClose}>
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Step 1: Choose Production Line</label>
                    <select value={selectedLine} onChange={(e) => setSelectedLine(e.target.value)} className="w-full p-2 border rounded-md">
                        <option value="">-- Choose a line --</option>
                        {lines.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Step 2: Confirm Fabric Rolls to Log</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto border p-3 rounded-md bg-gray-50">
                        {rolls.map(roll => (
                            <div key={roll.id} onClick={() => handleRollToggle(roll.id)} className="flex items-center p-2 rounded-md cursor-pointer hover:bg-blue-50">
                                {selectedRolls.has(roll.id) ? <LuSquareCheck className="text-blue-600 mr-3" size={20}/> : <LuSquare className="text-gray-400 mr-3" size={20}/>}
                                <span className="font-medium">Roll #{roll.id}</span>
                                <span className="ml-auto text-sm text-gray-500">{roll.meter}m</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md">Cancel</button>
                <button onClick={handleSave} disabled={!selectedLine || selectedRolls.size === 0 || isLoading} className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-400">
                    {currentLineId ? 'Update Assignment' : 'Start Batch'}
                </button>
            </div>
        </Modal>
    );
};

const ReceiveRollsModal = ({ batch, onClose, onRefresh }) => {
    // ... (This component remains the same)
    const [rolls, setRolls] = useState(batch.rolls || []);
    const [updatingRollId, setUpdatingRollId] = useState(null);
    const handleReceive = async (rollId) => {
        setUpdatingRollId(rollId);
        try {
            await initializationPortalApi.receiveRoll(rollId);
            setRolls(currentRolls => currentRolls.map(r => r.id === rollId ? { ...r, status: 'IN_PRODUCTION' } : r));
            onRefresh();
        } catch (error) {
            alert('Failed to update roll status.');
        } finally {
            setUpdatingRollId(null);
        }
    };
    return (
        <Modal title={`Receive Rolls for Batch ${batch.batch_code || batch.batch_id}`} onClose={onClose}>
            <div className="space-y-2 max-h-80 overflow-y-auto">
                {rolls.map(roll => (
                    <div key={roll.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div>
                            <p className="font-semibold">Roll #{roll.id} ({roll.meter}m)</p>
                            <p className="text-sm text-gray-600">{roll.type} - {roll.color}</p>
                        </div>
                        {roll.status === 'IN_STOCK' ? (
                            <button onClick={() => handleReceive(roll.id)} disabled={updatingRollId === roll.id} className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md flex items-center disabled:bg-gray-400">
                                {updatingRollId === roll.id ? <LuLoader className="animate-spin mr-2" /> : <LuTruck className="mr-2" />} Receive
                            </button>
                        ) : ( <span className="flex items-center text-sm font-semibold text-green-600"><LuCheck className="mr-1" /> In Production</span> )}
                    </div>
                ))}
            </div>
        </Modal>
    );
};

// --- BATCH CARD (REWRITTEN) & MAIN PAGE ---
const BatchCard = ({ batch, onReceiveClick, onStartClick }) => {
    // Check if the batch has progress for sequence 1 and if it's not completed.
    const isAssigned = batch.progress_for_seq1 && batch.progress_for_seq1.status !== 'COMPLETED';
    const isCompleted = batch.progress_for_seq1 && batch.progress_for_seq1.status === 'COMPLETED';

    return (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 flex flex-col">
            <div className="p-4 border-b">
                <h2 className="font-bold text-lg">{batch.product_name}</h2>
                <p className="font-mono text-sm text-gray-500">{batch.batch_code || `BATCH-${batch.batch_id}`}</p>
                 {/* Display the assigned line if the batch is in progress */}
                {isAssigned && (
                    <div className="mt-2 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full px-2 py-0.5 inline-block">
                        Assigned to: {batch.progress_for_seq1.line_name}
                    </div>
                )}
            </div>
            <div className="p-4 grid grid-cols-2 gap-4 flex-1">
                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center"><LuInfo className="mr-1"/> Details</h4>
                    <p className="text-sm"><strong className="font-medium">Layer Length:</strong> {batch.length_of_layer_inches || 'N/A'} inches</p>
                    <p className="text-sm"><strong className="font-medium">Notes:</strong> {batch.notes || 'None'}</p>
                </div>
                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center"><LuRuler className="mr-1"/> Size Ratios</h4>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        {(batch.size_ratios || []).map(sr => <span key={sr.size}><strong>{sr.size}:</strong> {sr.ratio}</span>)}
                    </div>
                </div>
                <div className="col-span-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center"><LuLayers className="mr-1"/> Fabric Rolls</h4>
                    <div className="flex flex-wrap gap-2">
                        {(batch.rolls || []).map(roll => (
                            <span key={roll.id} className={`px-2 py-0.5 text-xs rounded-full ${roll.status === 'IN_STOCK' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                Roll #{roll.id}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
            <div className="p-3 bg-gray-50 border-t flex justify-end space-x-2">
                <button onClick={onReceiveClick} className="px-4 py-2 text-sm font-semibold bg-gray-200 hover:bg-gray-300 rounded-md flex items-center"><LuTruck className="mr-2"/> Receive Rolls</button>
                {/* The "Start/Edit" button logic is now dynamic */}
                <button 
                    onClick={onStartClick} 
                    disabled={!batch.first_cycle_flow || isCompleted} 
                    className={`px-4 py-2 text-sm font-semibold text-white rounded-md flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed ${isAssigned ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                    {isAssigned ? <LuPencil className="mr-2"/> : <LuPlay className="mr-2"/>}
                    {isAssigned ? 'Edit Assignment' : 'Start Batch'}
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
            fetchDashboardData();
        } catch (error) {
            alert('Failed to start batch. Please try again.');
            console.error(error);
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Initialization Portal</h1>
            {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batches.length > 0 ? batches.map(batch => (
                        <BatchCard 
                            key={batch.batch_id} 
                            batch={batch}
                            onReceiveClick={() => setModalState({ type: 'receive', data: batch })}
                            onStartClick={() => setModalState({ type: 'start', data: batch })}
                        />
                    )) : (
                        <div className="col-span-full text-center py-16 bg-white rounded-lg shadow">
                            <h3 className="text-xl font-semibold text-gray-700">Queue is Empty</h3>
                            <p className="text-gray-500 mt-2">There are no new production batches ready for initialization.</p>
                        </div>
                    )}
                </div>
            )}

            {modalState.type === 'receive' && (
                <ReceiveRollsModal 
                    batch={modalState.data}
                    onClose={() => setModalState({ type: null, data: null })}
                    onRefresh={fetchDashboardData}
                />
            )}
            
            {modalState.type === 'start' && modalState.data.first_cycle_flow && (
                <StartBatchModal
                    batchId={modalState.data.batch_id}
                    cycleFlow={modalState.data.first_cycle_flow}
                    currentLineId={modalState.data.progress_for_seq1?.line_id}
                    onClose={() => setModalState({ type: null, data: null })}
                    onSave={handleStartBatch}
                />
            )}
        </div>
    );
};

export default InitializationDashboardPortalPage;

