import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializationPortalApi } from '../../api/initializationPortalApi';
import Modal from '../../shared/Modal';
import { 
    Play, Layers, Info, MoreHorizontal, Square, CheckSquare, 
    Edit3, ChevronDown, ChevronRight, Loader2, AlertCircle, Box
} from 'lucide-react';

// --- SHARED & REUSABLE COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="text-center p-4 text-red-600">{message}</div>;

const StartBatchModal = ({ batchId, cycleFlow, currentLineId, onClose, onSave }) => {
    const [rolls, setRolls] = useState([]);
    const [selectedRolls, setSelectedRolls] = useState(new Set());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchModalData = async () => {
            setIsLoading(true);
            try {
                const rollsRes = await initializationPortalApi.getRollsForBatch(batchId);
                const rollData = rollsRes.data || [];
                setRolls(rollData);
                setSelectedRolls(new Set(rollData.map(r => r.id))); // Select all by default
            } catch (error) { console.error("Failed to fetch modal data", error); }
            finally { setIsLoading(false); }
        };
        fetchModalData();
    }, [batchId]);

    const handleRollToggle = (rollId) => {
        setSelectedRolls(prev => {
            const newSelected = new Set(prev);
            if (newSelected.has(rollId)) newSelected.delete(rollId);
            else newSelected.add(rollId);
            return newSelected;
        });
    };

    const handleSave = async () => {
        if (!currentLineId || selectedRolls.size === 0) return alert("Batch must be assigned to a line and have rolls selected.");
        await onSave({ batchId, cycleFlowId: cycleFlow.id, lineId: currentLineId, selectedRollIds: Array.from(selectedRolls) });
    };

    return (
        <Modal title={`Start Batch Step: ${cycleFlow.line_type_name}`} onClose={onClose}>
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Production Line</label>
                    <input 
                        type="text" 
                        value={currentLineId ? `Line ID: ${currentLineId}` : "No Line Assigned"} 
                        disabled 
                        className="w-full p-2.5 border rounded-lg bg-gray-100 text-gray-600 font-mono text-sm"
                    />
                     {!currentLineId && <p className="text-xs text-red-600 mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>Waiting for Line Loader assignment.</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Fabric Rolls</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto border p-3 rounded-lg bg-gray-50">
                        {isLoading ? <div className="flex justify-center p-4"><Loader2 className="animate-spin w-5 h-5 text-gray-400"/></div> : rolls.map(roll => (
                            <div key={roll.roll_id || roll.id} onClick={() => handleRollToggle(roll.roll_id || roll.id)} className="flex items-center p-2 rounded-md cursor-pointer hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100">
                                {selectedRolls.has(roll.roll_id || roll.id) ? <CheckSquare className="text-blue-600 mr-3" size={20}/> : <Square className="text-gray-400 mr-3" size={20}/>}
                                <div className="text-sm">
                                    <span className="font-semibold text-gray-800">Roll #{Number(roll.roll_id || roll.id) % 10}</span>
                                    <span className="text-gray-500"> • {roll.fabric_type} • {roll.color_name || roll.color}</span>
                                    <span className="ml-2 font-mono text-xs bg-gray-200 px-1.5 py-0.5 rounded">{roll.meter}</span>
                                </div>
                            </div>
                        ))}
                        {!isLoading && rolls.length === 0 && <p className="text-sm text-gray-500 italic text-center">No rolls linked to this batch.</p>}
                    </div>
                </div>
            </div>
            <div className="mt-8 flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={!currentLineId || selectedRolls.size === 0 || isLoading} className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-sm">
                    Start Batch
                </button>
            </div>
        </Modal>
    );
};

// --- BATCH CARD COMPONENT ---
const BatchCard = ({ batch, onStartClick }) => {
    const progress = batch.progress_for_seq1;
    const status = progress ? progress.status : 'N/A';
    const isPending = status === 'PENDING';
    const isCompleted = status === 'COMPLETED';

    // Status Styling
    let statusStyles = 'bg-gray-100 text-gray-600 border-gray-200';
    let borderColor = 'border-t-gray-300';
    if (isCompleted) {
        statusStyles = 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-500/20';
        borderColor = 'border-t-emerald-500';
    } else if (isPending) {
        statusStyles = 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-500/20';
        borderColor = 'border-t-amber-500';
    } else if (status === 'IN_PROGRESS') {
        statusStyles = 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-500/20';
        borderColor = 'border-t-blue-500';
    }
    
    return (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full hover:shadow-lg transition-all duration-300 border-t-4 ${borderColor}`}>
            <div className="p-5 border-b border-gray-100 relative">
                {/* Visual Header */}
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-2">
                        {/* Highlighted Batch ID */}
                        <div className="flex flex-col">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Batch ID</span>
                            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-3 py-1 rounded-md shadow-md shadow-indigo-200 flex items-center">
                                <Box size={14} className="mr-1.5 opacity-80" />
                                <span className="text-sm font-bold font-mono tracking-wide">#{batch.batch_id}</span>
                            </div>
                        </div>
                    </div>
                    <span className={`px-3 py-1 text-[10px] uppercase font-bold tracking-wider rounded-full border ${statusStyles}`}>
                        {status.replace('_', ' ')}
                    </span>
                </div>

                <div className="mt-2">
                    <h2 className="font-bold text-lg text-gray-800 leading-tight mb-1">{batch.product_name}</h2>
                    <div className="flex items-center justify-between">
                        <p className="font-mono text-xs text-gray-400">{batch.batch_code}</p>
                        {progress?.line_name && (
                            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                {progress.line_name}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="p-5 space-y-4 flex-1 text-sm bg-gray-50/30">
                {/* Details Section */}
                <div className="flex items-start space-x-3">
                    <div className="p-1.5 bg-blue-100 text-blue-600 rounded-md shrink-0 mt-0.5">
                        <Info size={14} />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Details</p>
                        <div className="grid grid-cols-2 gap-2 text-gray-700">
                            <div><span className="text-gray-400 text-xs">Layer:</span> <span className="font-medium">{batch.length_of_layer_inches ? `${batch.length_of_layer_inches}"` : '-'}</span></div>
                            <div className="col-span-2 truncate"><span className="text-gray-400 text-xs">Note:</span> <span className="italic text-gray-600">{batch.notes || 'None'}</span></div>
                        </div>
                    </div>
                </div>

                {/* Ratios Section */}
                <div className="flex items-start space-x-3">
                    <div className="p-1.5 bg-purple-100 text-purple-600 rounded-md shrink-0 mt-0.5">
                        <MoreHorizontal size={14} />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Size Ratios</p>
                        <div className="flex flex-wrap gap-1.5">
                            {(batch.size_ratios || []).map(sr => (
                                <span key={sr.size} className="text-xs bg-white text-gray-700 border border-purple-100 px-2 py-0.5 rounded-md shadow-sm">
                                    <strong className="text-purple-700">{sr.size}:</strong> {sr.ratio}
                                </span>
                            ))}
                            {(!batch.size_ratios || batch.size_ratios.length === 0) && <span className="text-xs text-gray-400">None defined</span>}
                        </div>
                    </div>
                </div>

                {/* Rolls Section */}
                <div className="flex items-start space-x-3">
                    <div className="p-1.5 bg-teal-100 text-teal-600 rounded-md shrink-0 mt-0.5">
                        <Layers size={14} />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Assigned Rolls</p>
                        <div className="flex flex-wrap gap-1.5">
                            {(batch.rolls || []).map((roll, idx) => (
                                <span key={idx} className="text-[10px] font-mono bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded">
                                    R-{roll.id}
                                </span>
                            ))}
                            {(!batch.rolls || batch.rolls.length === 0) && <span className="text-xs text-gray-400">None assigned</span>}
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4 bg-white border-t border-gray-100 rounded-b-xl">
                <button 
                    onClick={onStartClick} 
                    disabled={!isPending || !batch.first_cycle_flow} 
                    className="group w-full px-4 py-2.5 text-sm font-bold text-white rounded-lg flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg disabled:shadow-none"
                >
                    <Play className="mr-2 w-4 h-4 fill-current group-hover:scale-110 transition-transform"/>
                    {isCompleted ? 'Completed' : 'Start Batch'}
                </button>
            </div>
        </div>
    );
};

// --- COLLAPSIBLE GROUP COMPONENT ---
const BatchStatusGroup = ({ title, count, statusColor, children, isOpen, onToggle }) => {
    return (
        <div className="mb-6 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
            <div 
                onClick={onToggle}
                className="flex items-center justify-between p-4 cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors select-none"
            >
                <div className="flex items-center space-x-3">
                    <div className={`p-1.5 rounded-md ${isOpen ? 'bg-white shadow-sm' : 'bg-transparent'}`}>
                        {isOpen ? <ChevronDown className="w-5 h-5 text-gray-600"/> : <ChevronRight className="w-5 h-5 text-gray-600"/>}
                    </div>
                    <h3 className="font-bold text-gray-800 text-lg">{title}</h3>
                    <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${statusColor}`}>
                        {count}
                    </span>
                </div>
            </div>
            
            {isOpen && (
                <div className="p-4 bg-white border-t border-gray-200 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- MAIN PAGE ---
const InitializationDashboardPortalPage = () => {
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalState, setModalState] = useState({ type: null, data: null });
    
    // State for collapsible sections
    const [expandedSections, setExpandedSections] = useState({
        PENDING: false,
        IN_PROGRESS: true,
        COMPLETED: false
    });

    const fetchDashboardData = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await initializationPortalApi.getDashboardData();
            setBatches(response.data);
            console.log("Fetched dashboard data:", response.data);
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
        }
    };

    const toggleSection = (section) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // Group batches by status
    const groupedBatches = useMemo(() => {
        const groups = {
            PENDING: [],
            IN_PROGRESS: [],
            COMPLETED: []
        };

        batches.forEach(batch => {
            const status = batch.progress_for_seq1?.status || 'PENDING';
            if (groups[status]) {
                groups[status].push(batch);
            } else {
                // Handle unexpected statuses by putting them in PENDING or creating a generic 'Other' key if needed
                groups.PENDING.push(batch);
            }
        });
        return groups;
    }, [batches]);

    const hasAnyBatches = batches.length > 0;

    return (
        <div className="p-6 bg-gray-50 min-h-screen font-inter">
            <header className="mb-8">
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Cutting Manager Dashboard</h1>
                <p className="text-gray-500 mt-1">Manage and initialize batch production cycles.</p>
            </header>

            {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : !hasAnyBatches ? (
                <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                    <Layers className="w-12 h-12 text-gray-300 mx-auto mb-4"/>
                    <h3 className="text-xl font-semibold text-gray-700">Queue is Empty</h3>
                    <p className="text-gray-500 mt-2">There are no batches pending initialization.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {/* IN PROGRESS GROUP */}
                    {groupedBatches.IN_PROGRESS.length > 0 && (
                        <BatchStatusGroup 
                            title="In Progress" 
                            count={groupedBatches.IN_PROGRESS.length}
                            statusColor="bg-blue-100 text-blue-800"
                            isOpen={expandedSections.IN_PROGRESS}
                            onToggle={() => toggleSection('IN_PROGRESS')}
                        >
                            {groupedBatches.IN_PROGRESS.map(batch => (
                                <BatchCard 
                                    key={batch.batch_id} 
                                    batch={batch}
                                    onStartClick={() => setModalState({ type: 'start', data: batch })}
                                />
                            ))}
                        </BatchStatusGroup>
                    )}

                    {/* PENDING GROUP */}
                    {groupedBatches.PENDING.length > 0 && (
                        <BatchStatusGroup 
                            title="Pending Start" 
                            count={groupedBatches.PENDING.length}
                            statusColor="bg-amber-100 text-amber-800"
                            isOpen={expandedSections.PENDING}
                            onToggle={() => toggleSection('PENDING')}
                        >
                            {groupedBatches.PENDING.map(batch => (
                                <BatchCard 
                                    key={batch.batch_id} 
                                    batch={batch}
                                    onStartClick={() => setModalState({ type: 'start', data: batch })}
                                />
                            ))}
                        </BatchStatusGroup>
                    )}

                    {/* COMPLETED GROUP */}
                    {groupedBatches.COMPLETED.length > 0 && (
                        <BatchStatusGroup 
                            title="Completed (Sequence 1)" 
                            count={groupedBatches.COMPLETED.length}
                            statusColor="bg-green-100 text-green-800"
                            isOpen={expandedSections.COMPLETED}
                            onToggle={() => toggleSection('COMPLETED')}
                        >
                            {groupedBatches.COMPLETED.map(batch => (
                                <BatchCard 
                                    key={batch.batch_id} 
                                    batch={batch}
                                    onStartClick={() => setModalState({ type: 'start', data: batch })}
                                />
                            ))}
                        </BatchStatusGroup>
                    )}
                </div>
            )}

            {modalState.type === 'start' && modalState.data?.first_cycle_flow && (
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