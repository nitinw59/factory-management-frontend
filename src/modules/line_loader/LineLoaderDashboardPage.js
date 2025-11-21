import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { lineLoaderApi } from '../../api/lineLoaderApi';
import Modal from '../../shared/Modal';
import { FiCircle, FiLoader, FiEdit3, FiRotateCw, FiSquare, FiCheckCircle, FiList, FiPackage } from 'react-icons/fi';

// --- Reusable Components ---
const Spinner = () => <div className="flex justify-center items-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;
const Placeholder = ({ icon: Icon, title, message }) => (
     <div className="text-center py-10 px-4 bg-white rounded-lg shadow-sm border border-dashed">
        <Icon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-lg font-medium text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{message}</p>
    </div>
);


// --- Line Selection Modal Component ---
const LineSelectionModal = ({ batchId, cycleFlow, currentLineId, onClose, onSave }) => {
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
                    lineLoaderApi.getLinesByType(cycleFlow.line_type_id),
                    lineLoaderApi.getRollsForBatch(batchId)
                ]);
                console.log("Fetched lines:", linesRes.data);
                setLines(linesRes.data || []);
                const rollData = rollsRes.data || [];
                setRolls(rollData);
                setSelectedRolls(new Set(rollData.map(r => r.id))); // Select all by default
            } catch (error) { console.error("Failed to fetch modal data", error); } 
            finally { setIsLoading(false); }
        };
        fetchModalData();
    }, [cycleFlow.line_type_id, batchId]);

    const handleRollToggle = (rollId) => {
        setSelectedRolls(prevSelected => {
            const newSelected = new Set(prevSelected);
            if (newSelected.has(rollId)) {
                newSelected.delete(rollId);
            } else {
                newSelected.add(rollId);
            }
            return newSelected;
        });
    };
    
    const handleSave = async () => {
        if (!selectedLine || selectedRolls.size === 0) {
            alert("Please select a line and at least one fabric roll.");
            return;
        }
        // Pass cycleFlow.id as cycleFlowId
        await onSave({
            batchId,
            cycleFlowId: cycleFlow.id,
            lineId: selectedLine,
            selectedRollIds: Array.from(selectedRolls)
        });
    };

    return (
        <div>
            <h3 className="text-lg font-medium mb-4">Assign Line for: <span className="font-bold">{cycleFlow.line_type_name}</span></h3>
            {isLoading ? <Spinner /> : (
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Step 1: Choose Production Line</label>
                        <select
                            value={selectedLine}
                            onChange={(e) => setSelectedLine(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md"
                        >
                            <option value="">-- Choose a line --</option>
                            {lines.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Step 2: Select Fabric Rolls to Log</label>
                        <div className="space-y-2 max-h-48 overflow-y-auto border p-3 rounded-md bg-gray-50">
                            {rolls.length > 0 ? rolls.map(roll => (
                                <div key={roll.id} onClick={() => handleRollToggle(roll.id)} className="flex items-center p-2 rounded-md cursor-pointer hover:bg-blue-50">
                                    {selectedRolls.has(roll.id) ? 
                                     <FiRotateCw className="text-blue-600 mr-3" size={20}/> : // Changed Icon
                                     <FiSquare className="text-gray-400 mr-3" size={20}/>}
                                    <span className="font-medium">Roll #{roll.id}</span>
                                    <span className="ml-auto text-sm text-gray-500">{roll.meter}m</span>
                                </div>
                            )) : <p className="text-sm text-gray-500 text-center">No rolls found for this batch.</p>}
                        </div>
                    </div>
                </div>
            )}
            <div className="mt-6 flex justify-end space-x-3">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                <button onClick={handleSave} disabled={!selectedLine || selectedRolls.size === 0 || isLoading} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400">Assign & Log Rolls</button>
            </div>
        </div>
    );
};

// --- Batch Card Component ---
const BatchCard = ({ batch, onAssign }) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [activeFlowData, setActiveFlowData] = useState(null);

    // --- Logic to determine batch status and next step ---
    const { nextStepSequence, overallStatus } = useMemo(() => {
        if (!batch.cycle_flow || batch.cycle_flow.length === 0) return { nextStepSequence: -1, overallStatus: 'NO_FLOW' };
        const completedFlowIds = new Set(batch.progress?.filter(p => p.status === 'COMPLETED').map(p => p.product_cycle_flow_id));
        if (completedFlowIds.size === batch.cycle_flow.length) return { nextStepSequence: -1, overallStatus: 'COMPLETED' };
        const highestCompletedSeq = batch.cycle_flow.filter(cf => completedFlowIds.has(cf.id)).reduce((max, cf) => Math.max(max, cf.sequence_no), 0);
        return { nextStepSequence: highestCompletedSeq + 1, overallStatus: batch.progress?.length > 0 ? 'IN_PROGRESS' : 'PENDING' };
    }, [batch]);
    // --- End status logic ---

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
        PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: <FiCircle/>, label: 'Pending Start' },
        IN_PROGRESS: { bg: 'bg-blue-100', text: 'text-blue-800', icon: <FiLoader className="animate-spin"/>, label: 'In Progress' },
        COMPLETED: { bg: 'bg-green-100', text: 'text-green-800', icon: <FiCheckCircle/>, label: 'Completed' }, // Changed Icon
        NO_FLOW: { bg: 'bg-red-100', text: 'text-red-800', icon: null, label: 'Setup Required' },
    };
    const currentStatus = statusStyles[overallStatus];

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
            {/* Card Header */}
            <div className={`px-4 py-3 flex items-center justify-between ${currentStatus.bg} border-b border-gray-200`}>
                <h2 className="font-bold text-lg text-gray-800">{batch.batch_code || `BATCH-${batch.batch_id}`}</h2>
                <span className={`flex items-center text-sm font-semibold px-2 py-1 rounded-full ${currentStatus.bg} ${currentStatus.text}`}>
                   {currentStatus.icon && <span className="mr-2">{currentStatus.icon}</span>} {currentStatus.label}
                </span>
            </div>
            <p className="text-sm text-gray-600 px-4 pt-2">{batch.product_name}</p>
            
            {/* Workflow Nodes */}
            <div className="p-4">
                <p className="text-sm font-semibold mb-2 text-gray-600">Production Cycle:</p>
                <div className="flex flex-wrap gap-2">
                    {batch.cycle_flow?.map(cf => {
                        const progressEntry = batch.progress?.find(p => p.product_cycle_flow_id === cf.id);
                        let buttonState = 'DISABLED';
                        
                        if (progressEntry) {
                            buttonState = progressEntry.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING';
                        } else if (cf.sequence_no === nextStepSequence) {
                            buttonState = 'ENABLED';
                        }
                        
                        const buttonStyles = {
                           COMPLETED: 'bg-green-100 text-green-700 cursor-not-allowed',
                           PENDING: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
                           ENABLED: 'bg-blue-500 text-white hover:bg-blue-600',
                           DISABLED: 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        };
                        return (
                            <button key={cf.id} 
                                disabled={buttonState === 'DISABLED' || buttonState === 'COMPLETED'}
                                onClick={() => handleButtonClick(cf, progressEntry)}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center ${buttonStyles[buttonState]}`}>
                               {cf.line_type_name}
                               {buttonState === 'PENDING' && (
                                   <span className="ml-2 text-xs font-normal opacity-90 truncate flex items-center">
                                       ({progressEntry.line_name}) <FiEdit3 className="inline-block ml-1" size={10}/>
                                   </span>
                               )}
                            </button>
                        );
                    })}
                </div>
            </div>
            {modalOpen && (
                <Modal title="Assign Line & Log Rolls" onClose={() => setModalOpen(false)}>
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

// --- MAIN PAGE COMPONENT (REWRITTEN for Grouping) ---
const LineLoaderDashboardPage = () => {
    const [allBatches, setAllBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDashboardData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await lineLoaderApi.getDashboardData();
            console.log("Fetched dashboard data:", response.data);
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
            console.error("Failed to assign line", error);
            alert('Failed to assign line. Please try again.');
        }
    };

    // --- Grouping Logic ---
    const groupedBatches = useMemo(() => {
        return allBatches.reduce((groups, batch) => {
            const groupName = batch.current_step_group || 'Other'; 
            if (!groups[groupName]) {
                groups[groupName] = [];
            }
            groups[groupName].push(batch);
            return groups;
        }, {});
    }, [allBatches]);

    const sortedGroupNames = Object.keys(groupedBatches).sort();
    // --- End Grouping Logic ---

    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Line Loader Dashboard</h1>
            
            {isLoading ? <Spinner /> : error ? (
                 <div className="p-4 bg-red-100 text-red-700 rounded-lg shadow-sm border border-red-200">{error}</div>
            ) : (
                <div className="space-y-8">
                    {allBatches.length === 0 && (
                        <Placeholder 
                            icon={FiPackage} 
                            title="No Work Pending" 
                            message="There are no batches currently assigned to your lines." 
                        />
                    )}

                    {/* Render batches by group */}
                    {sortedGroupNames.map(groupName => (
                        <section key={groupName}>
                            <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">
                                {groupName} Department
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {groupedBatches[groupName].map(batch => (
                                    <BatchCard 
                                        key={batch.batch_id} 
                                        batch={batch} 
                                        onAssign={handleAssign} 
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
};

export default LineLoaderDashboardPage;