import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { initializationPortalApi } from '../../api/initializationPortalApi';
import Modal from '../../shared/Modal';
import { 
    Play, Layers, Info, MoreHorizontal, Square, CheckSquare, 
    ChevronDown, ChevronRight, Loader2, AlertCircle, Box, 
    BarChart2, Scissors, ClipboardCheck, Package,Wrench, FileText
} from 'lucide-react';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><Loader2 className="animate-spin h-8 w-8 text-indigo-400" /></div>;
const ErrorDisplay = ({ message }) => <div className="text-center p-4 text-rose-600 bg-rose-50 rounded-xl border border-rose-100 font-medium">{message}</div>;

// --- ROLL ACCORDION COMPONENT ---
const RollProgressRow = ({ roll }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    // Status visual
    const isComplete = roll.wip === 0 && roll.garments_cut > 0;
    
    return (
        <div className="border border-slate-200 rounded-lg mb-2 overflow-hidden">
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between p-3 bg-white hover:bg-slate-50 cursor-pointer transition-colors"
            >
                <div className="flex items-center space-x-3">
                    {isOpen ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
                    <div>
                        <span className="text-sm font-mono font-semibold text-slate-700 block">Roll #{Number(roll.roll_id) % 1000}</span>
                        <span className="text-xs text-slate-400">{roll.meter}m</span>
                    </div>
                </div>
                
                <div className="flex items-center space-x-4 text-xs">
                    <div className="text-right">
                        <span className="block text-slate-400">Garments</span>
                        <span className="font-bold text-slate-700">{roll.garments_cut}</span>
                    </div>
                    <div className="text-right">
                        <span className="block text-slate-400">Checked</span>
                        <span className="font-bold text-indigo-600">{roll.parts_processed}</span>
                    </div>
                     <div className="text-right w-12">
                        <span className="block text-slate-400">WIP</span>
                        <span className={`font-bold ${roll.wip > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{roll.wip}</span>
                    </div>
                    <div>
                        {isComplete ? (
                            <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold">DONE</span>
                        ) : (
                            <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[10px] font-bold">WIP</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded Size Details */}
            {isOpen && (
                <div className="bg-slate-50 p-3 border-t border-slate-100">
                    <table className="w-full text-xs text-left">
                        <thead className="text-slate-400 font-medium uppercase border-b border-slate-200">
                            <tr>
                                <th className="pb-2">Size</th>
                                <th className="pb-2 text-right">Garments Cut</th>
                                <th className="pb-2 text-right">Parts Processed</th>
                                <th className="pb-2 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {roll.sizes.map((size, idx) => {
                                const sizeComplete = parseInt(size.parts_processed) >= parseInt(size.garments_cut); // Simplified assumption 1:1 if unknown
                                return (
                                    <tr key={idx}>
                                        <td className="py-2 font-bold text-slate-600">{size.size}</td>
                                        <td className="py-2 text-right text-slate-700">{size.garments_cut}</td>
                                        <td className="py-2 text-right text-indigo-600 font-medium">{size.parts_processed}</td>
                                        <td className="py-2 text-right">
                                            {sizeComplete ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-amber-500">-</span>}
                                        </td>
                                    </tr>
                                )
                            })}
                            {roll.sizes.length === 0 && <tr><td colSpan="4" className="py-2 text-center text-slate-400">No size data available</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};


// --- PROGRESS REPORT MODAL ---
const BatchProgressModal = ({ batchId, onClose }) => {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await initializationPortalApi.getBatchProgressReport(batchId);
                setData(res.data);
            } catch (err) {
                console.error("Failed to load progress report:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [batchId]);

    if (isLoading) return <Modal title="Loading Report..." onClose={onClose}><div className="flex justify-center p-12"><Spinner/></div></Modal>;
    if (!data) return <Modal title="Error" onClose={onClose}><ErrorDisplay message="Could not load report data."/></Modal>;

    const { batch, stats, rolls } = data;
    
    // Progress Percent based on Parts Checked vs Total Parts Needed
    const progressPercent = stats.total_parts_to_process > 0 
        ? Math.min(100, Math.round((stats.total_parts_processed / stats.total_parts_to_process) * 100)) 
        : 0;

    return (
        <Modal title={`Progress Report: ${batch.batch_code}`} onClose={onClose}>
            <div className="space-y-6">
                
                {/* 1. High Level KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* GARMENTS CUT */}
                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-center">
                        <div className="text-2xl font-bold text-blue-700">{stats.garments_cut}</div>
                        <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Garments Cut</div>
                    </div>
                    
                    {/* PARTS TO PROCESS */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                        <div className="text-2xl font-bold text-slate-700">{stats.total_parts_to_process}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Parts</div>
                    </div>

                    {/* PARTS CHECKED */}
                    <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 text-center relative overflow-hidden">
                        <div className="text-2xl font-bold text-indigo-700">{stats.total_parts_processed}</div>
                        <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Parts Checked</div>
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-200">
                             <div className="h-full bg-indigo-500" style={{ width: `${progressPercent}%` }}></div>
                        </div>
                    </div>

                    {/* WIP */}
                    <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-center">
                        <div className="text-2xl font-bold text-amber-700">{stats.wip}</div>
                        <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pending (WIP)</div>
                    </div>
                </div>

                {/* 2. Bottlenecks / Alerts */}
                <div className="flex space-x-3">
                     <div className="flex-1 bg-rose-50 px-3 py-2 rounded-lg border border-rose-100 flex justify-between items-center">
                        <span className="text-xs font-medium text-rose-700 flex items-center"><AlertCircle size={14} className="mr-1.5"/> Rejected</span>
                        <span className="font-bold text-rose-800 text-sm">{stats.rejected}</span>
                     </div>
                     <div className="flex-1 bg-orange-50 px-3 py-2 rounded-lg border border-orange-100 flex justify-between items-center">
                        <span className="text-xs font-medium text-orange-700 flex items-center"><Wrench size={14} className="mr-1.5"/> Alteration</span>
                        <span className="font-bold text-orange-800 text-sm">{stats.pending_alter}</span>
                     </div>
                </div>

                {/* 3. Detailed Roll List (Accordion) */}
                <div className="mt-2">
                    <div className="flex justify-between items-center mb-3 px-1">
                        <h4 className="font-bold text-slate-700 text-sm">Roll Breakdown</h4>
                        <span className="text-xs text-slate-400">{rolls.length} Rolls</span>
                    </div>
                    <div className="max-h-[50vh] overflow-y-auto pr-1">
                        {rolls.map(roll => (
                            <RollProgressRow key={roll.roll_id} roll={roll} />
                        ))}
                    </div>
                </div>

            </div>
            <div className="mt-6 flex justify-end">
                <button onClick={onClose} className="px-5 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors text-sm">Close Report</button>
            </div>
        </Modal>
    );
};

// ... (Rest of the file: StartBatchModal, BatchCard, InitializationDashboardPortalPage remains same) ...

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
                setSelectedRolls(new Set(rollData.map(r => r.id))); 
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
                    <label className="block text-sm font-semibold text-slate-600 mb-1.5">Assigned Production Line</label>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center">
                        {currentLineId ? (
                             <span className="text-slate-700 font-mono font-medium text-sm">Line ID: {currentLineId}</span>
                        ) : (
                            <span className="text-rose-500 text-sm flex items-center"><AlertCircle className="w-4 h-4 mr-2"/> Waiting for Line Loader</span>
                        )}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-2">Confirm Fabric Rolls</label>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {isLoading ? <div className="flex justify-center p-6"><Loader2 className="animate-spin w-6 h-6 text-slate-300"/></div> : rolls.map(roll => (
                            <div 
                                key={roll.roll_id || roll.id} 
                                onClick={() => handleRollToggle(roll.roll_id || roll.id)} 
                                className={`flex items-center p-3 rounded-xl cursor-pointer transition-all border ${
                                    selectedRolls.has(roll.roll_id || roll.id) 
                                    ? 'bg-indigo-50 border-indigo-100 shadow-sm' 
                                    : 'bg-white border-slate-100 hover:border-indigo-100 hover:bg-slate-50'
                                }`}
                            >
                                {selectedRolls.has(roll.roll_id || roll.id) ? 
                                    <CheckSquare className="text-indigo-500 mr-3" size={20}/> : 
                                    <Square className="text-slate-300 mr-3" size={20}/>
                                }
                                <div className="flex flex-col">
                                    <span className="font-semibold text-slate-700 text-sm">Roll #{Number(roll.roll_id || roll.id) % 1000}</span>
                                    <span className="text-xs text-slate-500">{roll.fabric_type} • {roll.color_name || roll.color}</span>
                                </div>
                                <span className="ml-auto text-xs font-mono font-medium text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-100">
                                    {roll.meter}m
                                </span>
                            </div>
                        ))}
                        {!isLoading && rolls.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">No rolls linked to this batch.</p>}
                    </div>
                </div>
            </div>
            <div className="mt-8 flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 text-slate-600 font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancel</button>
                <button 
                    onClick={handleSave} 
                    disabled={!currentLineId || selectedRolls.size === 0 || isLoading} 
                    className="px-5 py-2.5 bg-indigo-500 text-white font-medium rounded-xl hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-sm hover:shadow transition-all text-sm"
                >
                    Start Batch
                </button>
            </div>
        </Modal>
    );
};

// --- BATCH CARD COMPONENT ---
// Updated to include View Progress Button
const BatchCard = ({ batch, onStartClick, onViewProgress }) => {
    const progress = batch.progress_for_seq1;
    const status = progress ? progress.status : 'N/A';
    const isPending = status === 'PENDING';
    const isCompleted = status === 'COMPLETED';
    const isInProgress = status === 'IN_PROGRESS';

    // Pastel Status Styling
    let statusBadge = "bg-slate-100 text-slate-600 border-slate-200";
    let accentColor = "border-t-slate-300";
    
    if (isCompleted) {
        statusBadge = "bg-emerald-100 text-emerald-700 border-emerald-200";
        accentColor = "border-t-emerald-400";
    } else if (isPending) {
        statusBadge = "bg-amber-100 text-amber-700 border-amber-200";
        accentColor = "border-t-amber-400";
    } else if (isInProgress) {
        statusBadge = "bg-indigo-100 text-indigo-700 border-indigo-200";
        accentColor = "border-t-indigo-400";
    }
    
    return (
        <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full hover:shadow-md transition-all duration-300 border-t-[6px] ${accentColor}`}>
            <div className="p-5 border-b border-slate-50 relative">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center">
                        <div className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-lg border border-slate-100 flex items-center shadow-sm">
                            <Box size={14} className="mr-2 opacity-60" />
                            <span className="text-sm font-bold font-mono tracking-tight">#{batch.batch_id}</span>
                        </div>
                    </div>
                    <span className={`px-3 py-1 text-[10px] uppercase font-bold tracking-wider rounded-full border ${statusBadge}`}>
                        {status.replace('_', ' ')}
                    </span>
                </div>

                <div>
                    <h2 className="font-bold text-lg text-slate-800 leading-tight mb-1">{batch.product_name}</h2>
                    <div className="flex items-center justify-between">
                        <p className="font-mono text-xs text-slate-400">{batch.batch_code}</p>
                        {progress?.line_name && (
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                {progress.line_name}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="p-5 space-y-4 flex-1 text-sm bg-slate-50/30">
                {/* Details Section */}
                <div className="flex items-start space-x-3 group">
                    <div className="p-2 bg-sky-50 text-sky-600 rounded-lg shrink-0 mt-0.5 border border-sky-100 group-hover:bg-sky-100 transition-colors">
                        <Info size={14} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wide">Specs</p>
                        <div className="grid grid-cols-2 gap-2 text-slate-600">
                            <div><span className="text-slate-400 text-xs">Layer:</span> <span className="font-medium bg-white px-1.5 py-0.5 rounded border border-slate-100">{batch.length_of_layer_inches ? `${batch.length_of_layer_inches}"` : '-'}</span></div>
                            <div className="col-span-2 truncate"><span className="text-slate-400 text-xs">Note:</span> <span className="italic text-slate-500">{batch.notes || 'None'}</span></div>
                        </div>
                    </div>
                </div>

                {/* Ratios Section */}
                <div className="flex items-start space-x-3 group">
                    <div className="p-2 bg-violet-50 text-violet-600 rounded-lg shrink-0 mt-0.5 border border-violet-100 group-hover:bg-violet-100 transition-colors">
                        <MoreHorizontal size={14} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wide">Ratios</p>
                        <div className="flex flex-wrap gap-1.5">
                            {(batch.size_ratios || []).map(sr => (
                                <span key={sr.size} className="text-xs bg-white text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md shadow-sm">
                                    <strong className="text-violet-600">{sr.size}:</strong> {sr.ratio}
                                </span>
                            ))}
                            {(!batch.size_ratios || batch.size_ratios.length === 0) && <span className="text-xs text-slate-400">None defined</span>}
                        </div>
                    </div>
                </div>

                {/* Rolls Section */}
                <div className="flex items-start space-x-3 group">
                    <div className="p-2 bg-teal-50 text-teal-600 rounded-lg shrink-0 mt-0.5 border border-teal-100 group-hover:bg-teal-100 transition-colors">
                        <Layers size={14} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wide">Rolls Assigned</p>
                        <div className="flex flex-wrap gap-1.5">
                            {(batch.rolls || []).map((roll, idx) => (
                                <span key={idx} className="text-[10px] font-mono bg-white text-teal-700 border border-slate-200 px-2 py-0.5 rounded-md shadow-sm">
                                    R-{Number(roll.id) % 100}
                                </span>
                            ))}
                            {(!batch.rolls || batch.rolls.length === 0) && <span className="text-xs text-slate-400">None assigned</span>}
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-100 rounded-b-2xl flex gap-3">
                {/* View Progress Button - Available if IN_PROGRESS or COMPLETED */}
                {!isPending && (
                    <button
                        onClick={onViewProgress}
                        className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-800 rounded-xl flex items-center justify-center transition-all"
                    >
                        <BarChart2 className="mr-2 w-4 h-4"/> View Progress
                    </button>
                )}

                {/* START BATCH - Show only for PENDING */}
                {isPending && (
                    <button 
                        onClick={onStartClick} 
                        disabled={!batch.first_cycle_flow} 
                        className={`group w-full px-4 py-2.5 text-sm font-bold text-white rounded-xl flex items-center justify-center transition-all shadow-sm hover:shadow-md bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none`}
                    >
                        <Play className="mr-2 w-4 h-4 fill-current group-hover:scale-110 transition-transform"/>
                        Start Batch
                    </button>
                )}
            </div>
        </div>
    );
};

// --- COLLAPSIBLE GROUP COMPONENT ---
const BatchStatusGroup = ({ title, count, headerBg, countBg, countText, children, isOpen, onToggle }) => {
    return (
        <div className="mb-8 rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-slate-50/50">
            <div 
                onClick={onToggle}
                className={`flex items-center justify-between p-4 cursor-pointer transition-colors select-none ${headerBg} border-b border-slate-100`}
            >
                <div className="flex items-center space-x-3">
                    <div className={`p-1.5 rounded-lg bg-white/80 shadow-sm border border-slate-100 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-4 h-4 text-slate-500"/>
                    </div>
                    <h3 className="font-bold text-slate-700 text-lg flex items-center tracking-tight">
                        {title}
                    </h3>
                </div>
                <span className={`px-3 py-1 text-xs font-bold rounded-full ${countBg} ${countText} shadow-sm`}>
                    {count}
                </span>
            </div>
            
            {isOpen && (
                <div className="p-6 animate-in slide-in-from-top-4 duration-300 ease-out">
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
    
    const [expandedSections, setExpandedSections] = useState({
        PENDING: true,
        IN_PROGRESS: true,
        COMPLETED: false
    });

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
        }
    };

    const toggleSection = (section) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

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
                groups.PENDING.push(batch);
            }
        });
        return groups;
    }, [batches]);

    const hasAnyBatches = batches.length > 0;

    return (
        <div className="p-8 bg-slate-50 min-h-screen font-inter text-slate-800">
            <header className="mb-10 pl-2 border-l-4 border-indigo-500">
                <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Cutting Manager Dashboard</h1>
                <p className="text-slate-500 mt-2 font-medium">Manage and initialize batch production cycles.</p>

                  <div className="flex gap-3">
                     <Link 
                        to="/initialization-portal/reports" 
                        className="flex items-center px-5 py-2.5 bg-white text-indigo-700 border border-indigo-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-300 font-bold shadow-sm transition-all"
                    >
                        <FileText className="w-5 h-5 mr-2"/> Daily Reports
                    </Link>
                </div>
            </header>

            {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : !hasAnyBatches ? (
                <div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                    <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Layers className="w-10 h-10 text-slate-300"/>
                    </div>
                    <h3 className="text-xl font-bold text-slate-700">Queue is Empty</h3>
                    <p className="text-slate-400 mt-2">There are no batches pending initialization.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* IN PROGRESS GROUP */}
                    {groupedBatches.IN_PROGRESS.length > 0 && (
                        <BatchStatusGroup 
                            title="In Progress" 
                            count={groupedBatches.IN_PROGRESS.length}
                            headerBg="bg-white hover:bg-slate-50"
                            countBg="bg-indigo-100"
                            countText="text-indigo-700"
                            isOpen={expandedSections.IN_PROGRESS}
                            onToggle={() => toggleSection('IN_PROGRESS')}
                        >
                            {groupedBatches.IN_PROGRESS.map(batch => (
                                <BatchCard 
                                    key={batch.batch_id} 
                                    batch={batch}
                                    onStartClick={() => setModalState({ type: 'start', data: batch })}
                                    onViewProgress={() => setModalState({ type: 'progress', data: batch })}
                                />
                            ))}
                        </BatchStatusGroup>
                    )}

                    {/* PENDING GROUP */}
                    {groupedBatches.PENDING.length > 0 && (
                        <BatchStatusGroup 
                            title="Pending Start" 
                            count={groupedBatches.PENDING.length}
                            headerBg="bg-amber-50/50 hover:bg-amber-50"
                            countBg="bg-amber-100"
                            countText="text-amber-800"
                            isOpen={expandedSections.PENDING}
                            onToggle={() => toggleSection('PENDING')}
                        >
                            {groupedBatches.PENDING.map(batch => (
                                <BatchCard 
                                    key={batch.batch_id} 
                                    batch={batch}
                                    onStartClick={() => setModalState({ type: 'start', data: batch })}
                                    onViewProgress={() => setModalState({ type: 'progress', data: batch })}
                                />
                            ))}
                        </BatchStatusGroup>
                    )}

                    {/* COMPLETED GROUP */}
                    {groupedBatches.COMPLETED.length > 0 && (
                        <BatchStatusGroup 
                            title="Completed (Sequence 1)" 
                            count={groupedBatches.COMPLETED.length}
                            headerBg="bg-emerald-50/30 hover:bg-emerald-50/50"
                            countBg="bg-emerald-100"
                            countText="text-emerald-800"
                            isOpen={expandedSections.COMPLETED}
                            onToggle={() => toggleSection('COMPLETED')}
                        >
                            {groupedBatches.COMPLETED.map(batch => (
                                <BatchCard 
                                    key={batch.batch_id} 
                                    batch={batch}
                                    onStartClick={() => setModalState({ type: 'start', data: batch })}
                                    onViewProgress={() => setModalState({ type: 'progress', data: batch })}
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

            {/* NEW: Progress Report Modal */}
            {modalState.type === 'progress' && (
                <BatchProgressModal
                    batchId={modalState.data.batch_id}
                    onClose={() => setModalState({ type: null, data: null })}
                />
            )}
        </div>
    );
};

export default InitializationDashboardPortalPage;