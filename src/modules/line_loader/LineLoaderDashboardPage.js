import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { lineLoaderApi } from '../../api/lineLoaderApi';
import { Link } from 'react-router-dom';
import Modal from '../../shared/Modal';
import { 
    Circle, Loader, Edit3, RotateCw, Square, CheckCircle, 
    List, Package, FileText, ExternalLink 
} from 'lucide-react';
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
                setLines(linesRes.data || []);
                const rollData = rollsRes.data || [];
                setRolls(rollData);
                setSelectedRolls(new Set(rollData.map(r => r.id))); 
            } catch (error) { console.error("Failed to fetch modal data", error); } 
            finally { setIsLoading(false); }
        };
        fetchModalData();
    }, [cycleFlow.line_type_id, batchId]);

    const handleRollToggle = (rollId) => {
        setSelectedRolls(prevSelected => {
            const newSelected = new Set(prevSelected);
            if (newSelected.has(rollId)) newSelected.delete(rollId);
            else newSelected.add(rollId);
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
            selectedRollIds: Array.from(selectedRolls)
        });
    };

    return (
        <div className="p-4">
            <h3 className="text-lg font-medium mb-4 text-gray-800">Assign Line for: <span className="font-bold text-blue-600">{cycleFlow.line_type_name}</span></h3>
            {isLoading ? <Spinner /> : (
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Step 1: Choose Production Line</label>
                        <select
                            value={selectedLine}
                            onChange={(e) => setSelectedLine(e.target.value)}
                            className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">-- Choose a line --</option>
                            {lines.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Step 2: Select Fabric Rolls</label>
                        <div className="space-y-2 max-h-48 overflow-y-auto border p-3 rounded-lg bg-gray-50">
                            {rolls.length > 0 ? rolls.map(roll => (
                                <div key={roll.id} onClick={() => handleRollToggle(roll.id)} className="flex items-center p-2 rounded-md cursor-pointer hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100">
                                    {selectedRolls.has(roll.id) ? 
                                     <RotateCw className="text-blue-600 mr-3" size={20}/> :
                                     <Square className="text-gray-400 mr-3" size={20}/>}
                                    <div className="text-sm">
                                        <span className="font-semibold text-gray-800">Roll #{roll.roll_id}</span>
                                        <span className="text-gray-500"> • {roll.fabric_type} • {roll.color_name}</span>
                                        <span className="ml-2 bg-gray-200 px-1.5 py-0.5 rounded text-xs font-mono">{roll.meter}m</span>
                                    </div>
                                </div>
                            )) : <p className="text-sm text-gray-500 text-center italic">No rolls found for this batch.</p>}
                        </div>
                    </div>
                </div>
            )}
            <div className="mt-8 flex justify-end space-x-3 pt-4 border-t">
                <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleSave} disabled={!selectedLine || selectedRolls.size === 0 || isLoading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 shadow-sm">Assign & Log Rolls</button>
            </div>
        </div>
    );
};

// --- Batch Card Component ---
const BatchCard = ({ batch, onAssign }) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [activeFlowData, setActiveFlowData] = useState(null);

    // Status Logic
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
        COMPLETED: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-t-green-500', icon: <CheckCircle size={14}/>, label: 'Completed' },
        NO_FLOW: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-t-red-500', icon: null, label: 'Setup Required' },
    };
    const currentStatus = statusStyles[overallStatus];

    return (
        <div className={`bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200 hover:shadow-md transition-shadow border-t-4 ${currentStatus.border}`}>
            {/* Card Header */}
            <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex justify-between items-start mb-2">
                    <h2 className="font-bold text-lg text-gray-800">{batch.batch_code || `BATCH-${batch.batch_id}`}</h2>
                    <span className={`flex items-center text-xs font-bold px-2.5 py-1 rounded-full border ${currentStatus.bg.replace('bg-', 'border-')} ${currentStatus.bg} ${currentStatus.text}`}>
                       {currentStatus.icon && <span className="mr-1.5">{currentStatus.icon}</span>} {currentStatus.label}
                    </span>
                </div>
                <p className="text-sm text-gray-600">{batch.product_name}</p>
                
                {/* NEW: Trim Order Links */}
                {batch.trim_orders && batch.trim_orders.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5 flex items-center">
                            <List size={12} className="mr-1"/> Trim Orders
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {batch.trim_orders.map(to => (
                                <Link 
                                    key={to.id}
                                    to={`/line-loader/trim-orders/${to.id}/summary`}
                                    className="flex items-center text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-100 hover:bg-purple-100 hover:border-purple-200 transition-colors"
                                    title={`View Summary for Order #${to.id}`}
                                >
                                    <FileText size={10} className="mr-1"/> #{to.id} <ExternalLink size={8} className="ml-1 opacity-50"/>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            
            {/* Workflow Nodes */}
            <div className="p-5 bg-gray-50/50 flex-1">
                <p className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Production Cycle</p>
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
                           COMPLETED: 'bg-green-100 text-green-700 border-green-200 cursor-default',
                           PENDING: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 cursor-pointer',
                           ENABLED: 'bg-white border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400 cursor-pointer shadow-sm',
                           DISABLED: 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                        };
                        
                        return (
                            <button key={cf.id} 
                                disabled={buttonState === 'DISABLED' || buttonState === 'COMPLETED'}
                                onClick={() => handleButtonClick(cf, progressEntry)}
                                className={`px-3 py-2 text-sm font-medium rounded-lg border transition-all flex items-center ${buttonStyles[buttonState]}`}>
                               {cf.line_type_name}
                               {buttonState === 'PENDING' && (
                                   <span className="ml-2 text-xs font-normal opacity-80 truncate flex items-center pl-2 border-l border-amber-300/50">
                                       {progressEntry.line_name} <Edit3 className="ml-1" size={10}/>
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

// --- MAIN PAGE COMPONENT ---
const LineLoaderDashboardPage = () => {
    const [allBatches, setAllBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDashboardData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Using mock/real API toggle
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

    return (
        <div className="p-6 bg-gray-100 min-h-screen font-inter text-slate-800">
            <header className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Line Loader Dashboard</h1>
                <p className="text-slate-500 mt-1">Assign production lines and track batch flow.</p>
            </header>
            
            {isLoading ? <Spinner /> : error ? (
                 <div className="p-4 bg-red-100 text-red-700 rounded-lg shadow-sm border border-red-200 flex items-center"><span className="mr-2">⚠️</span> {error}</div>
            ) : (
                <div className="space-y-10">
                    {allBatches.length === 0 && (
                        <Placeholder 
                            icon={Package} 
                            title="No Work Pending" 
                            message="There are no batches currently assigned to your lines." 
                        />
                    )}

                    {/* Render batches by group */}
                    {sortedGroupNames.map(groupName => (
                        <section key={groupName}>
                            <div className="flex items-center mb-4 pb-2 border-b border-gray-200">
                                <h2 className="text-xl font-bold text-gray-700 mr-3">
                                    {groupName}
                                </h2>
                                <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
                                    {groupedBatches[groupName].length}
                                </span>
                            </div>
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