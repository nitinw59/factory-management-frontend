import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Play, ListTodo, Square, CheckSquare, XCircle, Loader2,
    ClipboardCheck, Package, BookHeart, AlertTriangle, CheckCircle , ChevronDown, ChevronUp
} from 'lucide-react';
import { preparationManagerApi } from '../../api/preparationManagerApi';
import Modal from '../../shared/Modal';
import { LuClipboardCheck, LuPackage, LuBookHeart, LuPlay, LuListTodo } from 'react-icons/lu';

const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;


const PartGroupRow = ({ group, isOpen, onToggle, selectedPieceIds, onTogglePiece }) => {

    // Calculate selection status for this group's *pending* pieces
    const pendingPieces = useMemo(() => group.pieces.filter(p => p.prep_status === 'PENDING'), [group.pieces]);
    const selectedPendingCount = useMemo(() => {
        const pendingIds = new Set(pendingPieces.map(p => p.id));
        return selectedPieceIds.filter(id => pendingIds.has(id)).length;
    }, [selectedPieceIds, pendingPieces]);
    
    const selectionText = `${selectedPendingCount} / ${pendingPieces.length} pending selected`;

    // Determine overall status for the group
    const groupStatus = useMemo(() => {
        if (group.isCompleted) return { text: 'Completed', color: 'green-500', icon: <CheckCircle className="w-4 h-4" /> };
        if (!group.isPending && !group.isCompleted) return { text: 'In Progress', color: 'blue-500', icon: <Loader2 className="w-4 h-4 animate-spin" /> };
        return { text: 'Pending', color: 'gray-500', icon: <ListTodo className="w-4 h-4" /> };
    }, [group.isCompleted, group.isPending]);

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Header (Always Visible) */}
            <button
                type="button"
                onClick={onToggle}
                className="flex items-center w-full p-3 text-left"
            >
                {isOpen ? <ChevronUp className="w-5 h-5 mr-2 text-gray-500" /> : <ChevronDown className="w-5 h-5 mr-2 text-gray-500" />}
                <span className="flex-1 font-bold text-gray-800 text-md">{group.partName}</span>
                <span className="text-sm text-indigo-700 font-medium mx-4">{selectionText}</span>
                <span className="text-sm font-semibold text-gray-700 mx-4">Total: {group.totalQuantity} pcs</span>
                <span className={`flex items-center text-xs font-semibold px-2 py-1 rounded-full text-${groupStatus.color} bg-${groupStatus.color.split('-')[0]}-100`}>
                    {groupStatus.icon}
                    <span className="ml-1.5">{groupStatus.text}</span>
                </span>
            </button>

            {/* Expandable Content (Individual Pieces) */}
            {isOpen && (
                <div className="border-t border-gray-200 p-3 bg-gray-50 space-y-2">
                    {group.pieces.map(piece => {
                        const isCompleted = piece.prep_status === 'COMPLETED';
                        const isPending = piece.prep_status === 'PENDING';
                        const isSelected = selectedPieceIds.includes(piece.id);

                        return (
                            <div
                                key={piece.id}
                                className={`flex items-center justify-between p-2 rounded-md ${
                                    isSelected && !isCompleted ? 'bg-indigo-100 border-indigo-300' : 'bg-white border-gray-200'
                                } border`}
                            >
                                <div className="flex items-center flex-grow">
                                    {isPending ? (
                                        <button
                                            type="button"
                                            onClick={() => onTogglePiece(piece.id)}
                                            className="mr-3 text-indigo-600 hover:text-indigo-800 focus:outline-none"
                                            aria-label={`Toggle selection for ${piece.part_name} ${piece.size}`}
                                        >
                                            {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                        </button>
                                    ) : (
                                        <div className="w-5 h-5 mr-3 flex-shrink-0">
                                            {isCompleted ? <CheckSquare className="w-5 h-5 text-green-500 opacity-50" /> : <ListTodo className="w-5 h-5 text-blue-500 opacity-50" />}
                                        </div>
                                    )}
                                    <label className={`text-sm flex-grow ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                        Size: <span className="font-semibold">{piece.size}</span>
                                        <span className="ml-2 text-xs">({piece.quantity_cut} pcs)</span>
                                    </label>
                                </div>
                                <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                                    isCompleted ? 'bg-green-100 text-green-800' :
                                    piece.prep_status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                                    'bg-gray-100 text-gray-700'
                                }`}>
                                    {piece.prep_status}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const RollDetailsModal = ({ batch, roll, onRollStartSuccess, onClose }) => {
    const allPieces = roll?.parts || [];

    // State for UI interactions
    const [isStarting, setIsStarting] = useState(false);
    const [message, setMessage] = useState(null);
    const [messageType, setMessageType] = useState(null);
    const [openPartName, setOpenPartName] = useState(null); // Tracks the open accordion

    // State to hold the IDs of the pieces the user wants to start preparation on
    const initialSelectedIds = useMemo(() => {
        return allPieces
            .filter(p => p.prep_status === 'PENDING') // Only select PENDING by default
            .map(p => p.id);
    }, [allPieces]);

    const [selectedPieceIds, setSelectedPieceIds] = useState(initialSelectedIds);

    // Groups pieces by part_name and calculates summary data
    const groupedByPartName = useMemo(() => {
        const groups = new Map();
        allPieces.forEach(piece => {
            const partName = piece.part_name || 'Uncategorized';
            if (!groups.has(partName)) {
                groups.set(partName, {
                    partName: partName,
                    totalQuantity: 0,
                    pieces: [],
                    isCompleted: true,
                    isPending: true,
                });
            }
            const group = groups.get(partName);
            group.pieces.push(piece);
            group.totalQuantity += (piece.quantity_cut || 0);

            if (piece.prep_status !== 'COMPLETED') group.isCompleted = false;
            if (piece.prep_status !== 'PENDING') group.isPending = false;
        });
        return Array.from(groups.values());
    }, [allPieces]);

    // Check overall roll status for display purposes
    const isPreparationCompleted = allPieces.length > 0 && allPieces.every(p => p.prep_status === 'COMPLETED');
    const isPreparationStarted = allPieces.some(p => p.prep_status !== 'PENDING');

    // Determine which pieces can still be selected (i.e., PENDING)
    const selectablePieces = allPieces.filter(p => p.prep_status === 'PENDING');
    const allSelectableAreSelected = selectablePieces.length > 0 && selectablePieces.every(p => selectedPieceIds.includes(p.id));

    // --- Handlers ---
    const togglePieceSelection = (pieceId) => {
        setSelectedPieceIds(prev =>
            prev.includes(pieceId)
                ? prev.filter(id => id !== pieceId)
                : [...prev, pieceId]
        );
    };

    const toggleSelectAll = () => {
        if (allSelectableAreSelected) {
            setSelectedPieceIds([]);
        } else {
            setSelectedPieceIds(selectablePieces.map(p => p.id));
        }
    };

    const handleToggleGroup = (partName) => {
        setOpenPartName(prev => (prev === partName ? null : partName));
    };

    const handleStartRoll = async () => {
        setMessage(null);
        setMessageType(null);
        setIsStarting(true);
        
        try {
            if (selectedPieceIds.length === 0) {
                throw new Error("You must select at least one PENDING piece to start preparation.");
            }

            const response = await preparationManagerApi.startPreparationForPieces({
                batchId: batch.id,
                rollId: roll.roll_id,
                pieceIds: selectedPieceIds
            });
            console.log("Start Preparation Response:", response);
            
            setMessage(response.message);
            setMessageType('success');
            onRollStartSuccess(); // Refetch data
            setSelectedPieceIds([]); // Clear selection
        } catch (error) {
            console.error("Failed to start preparation:", error);
            setMessage(error.message || "A network or server error occurred.");
            setMessageType('error');
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <div className="p-6 bg-white max-w-4xl mx-auto font-inter">
            <h3 className="font-extrabold text-xl mb-2 text-purple-700">Roll Details: ROLL-{roll.roll_id}</h3>
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 mb-4 bg-indigo-50 rounded-lg border border-indigo-200">
                <div className="mb-3 sm:mb-0">
                    <span className={`text-lg font-bold ${isPreparationCompleted ? 'text-green-600' : isPreparationStarted ? 'text-blue-600' : 'text-red-600'}`}>
                        Overall Roll Status: {isPreparationCompleted ? 'COMPLETED' : isPreparationStarted ? 'IN PROGRESS' : 'PENDING'}
                    </span>
                    <p className="text-sm text-indigo-700 mt-1">Select PENDING pieces below to start preparation.</p>
                </div>
                
                {!isPreparationCompleted && (
                    <button 
                        onClick={handleStartRoll} 
                        disabled={isStarting || selectedPieceIds.length === 0} 
                        className="w-full sm:w-auto flex items-center justify-center px-6 py-2 bg-green-600 text-white rounded-full font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                    >
                        {isStarting ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <Play className="mr-2 h-5 w-5"/>}
                        {isStarting ? 'Processing...' : `Start ${selectedPieceIds.length} Piece(s)`}
                    </button>
                )}
            </div>

            {message && (
                <div className={`p-3 mb-4 rounded-lg flex items-center ${messageType === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {messageType === 'error' ? <AlertTriangle className="w-5 h-5 mr-3"/> : <CheckCircle className="w-5 h-5 mr-3"/>}
                    <p className="font-medium text-sm">{message}</p>
                </div>
            )}
            
            <div className="max-h-[50vh] overflow-y-auto border p-4 rounded-lg bg-gray-50 space-y-2">
                {selectablePieces.length > 0 && (
                     <button
                        onClick={toggleSelectAll}
                        className="text-indigo-600 text-sm font-medium hover:text-indigo-800 my-2 flex items-center"
                    >
                        {allSelectableAreSelected ? <CheckSquare className="w-4 h-4 mr-1"/> : <Square className="w-4 h-4 mr-1"/>}
                        {allSelectableAreSelected ? 'Deselect All Pending' : 'Select All Pending'}
                    </button>
                )}

                {groupedByPartName.length > 0 ? (
                    groupedByPartName.map(group => (
                        <PartGroupRow
                            key={group.partName}
                            group={group}
                            isOpen={openPartName === group.partName}
                            onToggle={() => handleToggleGroup(group.partName)}
                            selectedPieceIds={selectedPieceIds}
                            onTogglePiece={togglePieceSelection}
                        />
                    ))
                ) : (
                    <p className="text-center text-gray-500 p-4">No cut pieces have been logged for this roll yet.</p>
                )}
            </div>

            <div className="mt-6 pt-4 border-t flex justify-end">
                <button onClick={onClose} className="px-5 py-2 bg-gray-200 text-gray-800 rounded-full font-medium hover:bg-gray-300 transition-colors">
                    Close
                </button>
            </div>
        </div>
    );
};


// --- Batch Card Component ---
const BatchCard = ({ batch, onActionSuccess, onRollDetailsClick }) => {
    const [isStartingBatch, setIsStartingBatch] = useState(false);
    const [localError, setLocalError] = useState(null);

    const batchStatus = batch.progress?.status;
    const isBatchPending = batchStatus === 'PENDING';
    const isBatchInProgress = batchStatus === 'IN_PROGRESS';
    
    const handleStartBatch = async () => {
        setLocalError(null);
        setIsStartingBatch(true);
        try {
            await preparationManagerApi.startBatchPreparation({
                batchId: batch.id,
                cycleFlowId: batch.cycle_flow_id
            });
            onActionSuccess();
        } catch (error) {
            console.error("Failed to start batch preparation:", error);
            setLocalError(error.message || "Failed to start batch preparation. Check console.");
        } finally {
            setIsStartingBatch(false);
        }
    };
    
    const totalRolls = batch.rolls ? batch.rolls.length : 0;
    // Roll completion check: all parts in a roll are 'COMPLETED'
    const completedRolls = batch.rolls ? batch.rolls.filter(r => r.parts && r.parts.every(p => p.prep_status === 'COMPLETED')).length : 0;
    const progressText = `${completedRolls} / ${totalRolls}`;

    return (
        <div className="bg-white p-4 rounded-xl shadow-lg border-l-4 border-purple-500 hover:shadow-xl transition-shadow flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <div>
                    <h3 className="font-bold text-lg text-purple-600 tracking-wider">{batch.batch_code || `Batch #${batch.id}`}</h3>
                    <p className="text-sm text-gray-600">{batch.product_name}</p>
                    <p className="text-xs text-gray-400 mt-1">Step: <span className="font-medium text-gray-600">{batch.current_step_name || 'N/A'}</span></p>
                </div>
                
                {/* Conditional rendering for the action button/status tag */}
                {isBatchPending ? (
                    <button 
                        onClick={handleStartBatch} 
                        disabled={isStartingBatch} 
                        className="flex items-center px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 transition-colors shadow-md"
                    >
                        <Play className="mr-1 h-4 w-4" /> {isStartingBatch ? 'Starting...' : 'Start Batch'}
                    </button>
                ) : (
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full shadow-sm ${batchStatus === 'COMPLETED' ? 'bg-gray-200 text-gray-700' : isBatchInProgress ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                        {batchStatus || 'PENDING'}
                    </span>
                )}
            </div>
            
            {localError && (
                 <div className="text-xs p-2 my-2 bg-red-50 text-red-600 rounded-md flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-1"/> Error: {localError}
                 </div>
            )}

            {/* Rolls Section */}
            {isBatchInProgress && (
                 <div className="mt-3 border-t pt-3 flex-grow">
                    <h4 className="text-xs font-semibold text-gray-500 mb-2 flex justify-between">
                        <span>ROLL PROGRESS: <span className="text-gray-800 font-bold">{progressText}</span> Completed</span>
                    </h4>
                    <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto p-1 -m-1">
                        {(batch.rolls || []).map(roll => {
                             // Roll status checks
                             const isRollCompleted = roll.parts && roll.parts.every(p => p.prep_status === 'COMPLETED');
                             const isRollInProgress = roll.parts && roll.parts.some(p => p.prep_status === 'IN_PROGRESS');
                             
                             return (
                                <button 
                                    key={roll.roll_id} 
                                    onClick={() => onRollDetailsClick(batch, roll)}
                                    title={`Status: ${isRollCompleted ? 'Completed' : isRollInProgress ? 'In Progress' : 'Pending'}`}
                                    className={`flex items-center text-xs px-2.5 py-1 rounded-full transition-colors shadow-sm border ${
                                        isRollCompleted ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200' :
                                        isRollInProgress ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200' :
                                        'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                                    }`}
                                >
                                   <Package className="mr-1 h-3 w-3"/> R-{roll.roll_id}
                                   {isRollCompleted && <ClipboardCheck className="ml-1 h-3 w-3"/>}
                                </button>
                             );
                        })}
                        {totalRolls === 0 && (
                            <p className="text-xs text-gray-500 italic p-1">No rolls found for this batch step.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


// --- Main Dashboard Component (App) ---
const PreparationManagerDashboardPage = () => {
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedRoll, setSelectedRoll] = useState(null); // Stores { batch: ..., roll: ... }

    const fetchQueue = useCallback(() => {
        setIsLoading(true);
        preparationManagerApi.getMyQueue()
            .then(res => {
                
                const sortedBatches = (res.data || []).sort((a, b) => {
                    if (a.progress.status === 'IN_PROGRESS' && b.progress.status !== 'IN_PROGRESS') return -1;
                    if (a.progress.status !== 'IN_PROGRESS' && b.progress.status === 'IN_PROGRESS') return 1;
                    return 0;
                });
                setBatches(sortedBatches);
                console.log('Fetched Batches:', sortedBatches);
            })
            .catch((err) => {
                console.error('API Error:', err);
                setError("Could not load your production queue. Please check the console for details.");
            })
            .finally(() => setIsLoading(false));
    }, []);

    useEffect(() => {
        fetchQueue();
    }, [fetchQueue]);

    const handleActionSuccess = () => {
        setSelectedRoll(null);
        fetchQueue(); // Refresh the dashboard to show updated data
    };
    
    const handleRollDetailsClick = (batch, roll) => {
        console.log("Roll clicked:", batch, roll);
        // Rolls are clickable only if the current step is 'Preparation' and IN_PROGRESS
        //const isActiveStep = batch.current_step_name.toLowerCase() === 'preparation' && batch.progress?.status === 'IN_PROGRESS';
        const isActiveStep=true;
        if (isActiveStep) {
             setSelectedRoll({ batch, roll });
        } else {
             setError(`Rolls are only interactive during the active 'Preparation' step.`);
             setTimeout(() => setError(null), 3000);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-inter">
            <h1 className="text-3xl font-extrabold mb-6 text-gray-800 border-b pb-2">My Production Queue 
                <span className="text-purple-600"> 🏭</span>
            </h1>
            
            {isLoading ? <Spinner /> : error ? (
                <div className="p-4 bg-red-100 text-red-700 rounded-lg border-l-4 border-red-500 flex items-center shadow-md mb-6">
                    <AlertTriangle className="w-5 h-5 mr-3"/>
                    <p className="font-medium">{error}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batches.length > 0 ? (
                        batches.map(batch => (
                            <BatchCard 
                                key={batch.id} 
                                batch={batch} 
                                onActionSuccess={handleActionSuccess} 
                                onRollDetailsClick={handleRollDetailsClick}
                            />
                        ))
                    ) : (
                        <div className="text-center text-gray-500 p-10 col-span-full bg-white rounded-xl shadow-inner border border-gray-200">
                            <BookHeart className="mx-auto w-12 h-12 text-gray-400 mb-3"/>
                            <p className="font-semibold text-lg">Queue Clear!</p>
                            <p className="text-sm">No active batches are currently assigned to your line.</p>
                        </div>
                    )}
                </div>
            )}

            {selectedRoll && (
                <Modal 
                    title={`Start Pieces for ${selectedRoll.batch.batch_code} / R-${selectedRoll.roll.roll_id}`} 
                    onClose={() => setSelectedRoll(null)}
                >
                    <RollDetailsModal
                        batch={selectedRoll.batch}
                        roll={selectedRoll.roll}
                        onRollStartSuccess={handleActionSuccess}
                        onClose={() => setSelectedRoll(null)}
                    />
                </Modal>
            )}
        </div>
    );
};

export default PreparationManagerDashboardPage;