import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { lineLoaderApi } from '../../api/lineLoaderApi';
import Modal from '../../shared/Modal';
import { LuCircle, LuLoader, LuPencil, LuRotateCwSquare, LuSquare } from 'react-icons/lu';

// --- Reusable Components ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

// --- Line Selection Modal Component (Completely Rewritten) ---
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
                // Fetch lines and rolls in parallel for better performance
                const [linesRes, rollsRes] = await Promise.all([
                    lineLoaderApi.getLinesByType(cycleFlow.line_type_id),
                    lineLoaderApi.getRollsForBatch(batchId)
                ]);
                
                setLines(linesRes.data);
                setRolls(rollsRes.data);

                // By default, all rolls are selected.
                setSelectedRolls(new Set(rollsRes.data.map(r => r.id)));
            } catch (error) {
                console.error("Failed to fetch modal data", error);
            } finally {
                setIsLoading(false);
            }
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
        await onSave({
            batchId,
            cycleFlowId: cycleFlow.id,
            lineId: selectedLine,
            selectedRollIds: Array.from(selectedRolls) // Convert Set to Array for JSON
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
                                     <LuRotateCwSquare className="text-blue-600 mr-3" size={20}/> : 
                                     <LuSquare className="text-gray-400 mr-3" size={20}/>}
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

// --- Batch Card and Main Page Components (No functional changes needed) ---
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

    const handleButtonClick = (cycleFlow, currentLineId) => {
        setActiveFlowData({ cycleFlow, currentLineId });
        setModalOpen(true);
    };

    const handleSaveAssignment = async (data) => {
        await onAssign(data);
        setModalOpen(false);
    };

    const statusStyles = {
        PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: <LuCircle/>, label: 'Pending Start' },
        IN_PROGRESS: { bg: 'bg-blue-100', text: 'text-blue-800', icon: <LuLoader className="animate-spin"/>, label: 'In Progress' },
        COMPLETED: { bg: 'bg-green-100', text: 'text-green-800', icon: <LuCircle/>, label: 'Completed' },
        NO_FLOW: { bg: 'bg-red-100', text: 'text-red-800', icon: null, label: 'Setup Required' },
    };
    const currentStatus = statusStyles[overallStatus];

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className={`px-4 py-2 flex items-center justify-between ${currentStatus.bg}`}>
                <h2 className="font-bold text-lg">BATCH - <span className="font-mono">{batch.batch_id}-{batch.product_name}</span></h2>
                <span className={`flex items-center text-sm font-semibold px-2 py-1 rounded-full ${currentStatus.bg} ${currentStatus.text}`}>
                   {currentStatus.icon && <span className="mr-2">{currentStatus.icon}</span>} {currentStatus.label}
                </span>
            </div>
            <div className="p-4">
                <p className="text-sm font-semibold mb-2 text-gray-600">Production Cycle:</p>
                <div className="flex flex-wrap gap-2">
                    {batch.cycle_flow?.map(cf => {
                        const progressEntry = batch.progress?.find(p => p.product_cycle_flow_id === cf.id);
                        let buttonState = 'DISABLED';
                        if (progressEntry) buttonState = progressEntry.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING';
                        else if (cf.sequence_no === nextStepSequence) buttonState = 'ENABLED';
                        const buttonStyles = {
                           COMPLETED: 'bg-green-500 text-white cursor-not-allowed', PENDING: 'bg-yellow-500 text-white hover:bg-yellow-600',
                           ENABLED: 'bg-blue-500 text-white hover:bg-blue-600', DISABLED: 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        };
                        return (
                            <button key={cf.id} disabled={buttonState === 'DISABLED' || buttonState === 'COMPLETED'}
                                onClick={() => handleButtonClick(cf, progressEntry?.line_id)}
                                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors flex items-center ${buttonStyles[buttonState]}`}>
                               {cf.line_type_name}
                               {buttonState === 'PENDING' && <span className="ml-2 text-xs font-normal opacity-90 truncate">({progressEntry.line_name}) <LuPencil className="inline-block ml-1" size={10}/></span>}
                            </button>
                        );
                    })}
                </div>
            </div>
            {modalOpen && (
                <Modal title="Assign Line" onClose={() => setModalOpen(false)}>
                    <LineSelectionModal batchId={batch.batch_id} cycleFlow={activeFlowData.cycleFlow} currentLineId={activeFlowData.currentLineId}
                        onClose={() => setModalOpen(false)} onSave={handleSaveAssignment} />
                </Modal>
            )}
        </div>
    );
};

const LineLoaderDashboardPage = () => {
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchDashboardData = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await lineLoaderApi.getDashboardData();
            setBatches(response.data);
        } catch (error) {
            console.error("Failed to fetch dashboard data", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

    const handleAssign = async (data) => {
        try {
            await lineLoaderApi.assignLine(data);
            fetchDashboardData();
        } catch (error) {
            console.error("Failed to assign line", error);
            alert('Failed to assign line. Please try again.');
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Line Loader Dashboard</h1>
            {isLoading ? <Spinner /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batches.map(batch => <BatchCard key={batch.batch_id} batch={batch} onAssign={handleAssign} />)}
                </div>
            )}
        </div>
    );
};

export default LineLoaderDashboardPage;
