import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { validationPortalApi } from '../../api/validationPortalApi';
import Modal from '../../shared/Modal';
import { LuClipboardCheck, LuPackage, LuBookHeart } from 'react-icons/lu';

const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

// --- Main Dashboard Component ---
const ValidationDashboardPage = () => {
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedBatch, setSelectedBatch] = useState(null);

    const fetchQueue = useCallback(() => {
        setIsLoading(true);
        validationPortalApi.getMyQueue()
            .then(res => {
                console.log("Fetched validation queue:", res.data);
                setBatches(res.data || []);
            })
            .catch(() => setError("Could not load your validation queue."))
            .finally(() => setIsLoading(false));
    }, []);

    useEffect(() => {
        fetchQueue();
    }, [fetchQueue]);

    const handleValidationSuccess = () => {
        setSelectedBatch(null);
        fetchQueue(); // Refresh the dashboard to show updated data
    };

    const BatchCard = ({ batch }) => (
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
            <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg text-purple-600">{batch.batch_code || `Batch #${batch.id}`}</h3>
                <button onClick={() => setSelectedBatch(batch)} className="flex items-center px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700">
                    <LuClipboardCheck className="mr-1" /> Validate
                </button>
            </div>
            <p className="text-sm text-gray-600">{batch.product_name}</p>
            <div className="mt-3 border-t pt-2">
                <h4 className="text-xs font-semibold text-gray-500 mb-1">ROLLS IN BATCH</h4>
                <div className="flex flex-wrap gap-2">
                    {batch.rolls.map(roll => (
                        <span key={roll.id} className="flex items-center text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                           <LuPackage size={12} className="mr-1"/> ROLL-{roll.id}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">My Validation Queue</h1>
            {isLoading ? <Spinner /> : error ? (
                <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {batches.length > 0 ? (
                        batches.map(batch => <BatchCard key={batch.id} batch={batch} />)
                    ) : (
                        <p className="text-center text-gray-500 p-4 col-span-full">No batches are currently assigned to your line for validation.</p>
                    )}
                </div>
            )}

            {selectedBatch && (
                <Modal title={`Validate Supporting Pieces for Batch #${selectedBatch.id}`} onClose={() => setSelectedBatch(null)}>
                    <ValidationForm
                        batchId={selectedBatch.id}
                        onSaveSuccess={handleValidationSuccess}
                        onClose={() => setSelectedBatch(null)}
                    />
                </Modal>
            )}
        </div>
    );
};


// --- Form Component for the Modal ---
const ValidationForm = ({ batchId, onSaveSuccess, onClose }) => {
    const [pieces, setPieces] = useState([]);
    const [checkedIds, setCheckedIds] = useState(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        validationPortalApi.getValidationDetails(batchId)
            .then(res => {
                setPieces(res.data || []);
            })
            .finally(() => setIsLoading(false));
    }, [batchId]);
    
    // --- UPDATED: Nested grouping by part_name, then by fabric_roll_id ---
    const groupedPieces = useMemo(() => {
        return pieces.reduce((acc, piece) => {
            if (!acc[piece.part_name]) {
                acc[piece.part_name] = {};
            }
            if (!acc[piece.part_name][piece.fabric_roll_id]) {
                acc[piece.part_name][piece.fabric_roll_id] = [];
            }
            acc[piece.part_name][piece.fabric_roll_id].push(piece);
            return acc;
        }, {});
    }, [pieces]);

    const handleCheckboxChange = (pieceId) => {
        setCheckedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(pieceId)) newSet.delete(pieceId);
            else newSet.add(pieceId);
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (checkedIds.size === pieces.length) setCheckedIds(new Set());
        else setCheckedIds(new Set(pieces.map(p => p.id)));
    };
    
    // --- NEW: Handler to select/deselect all items for a specific roll within a part group ---
    const handleSelectRollGroup = (piecesInGroup, shouldSelect) => {
        setCheckedIds(prev => {
            const newSet = new Set(prev);
            const pieceIdsInGroup = piecesInGroup.map(p => p.id);
            if (shouldSelect) {
                pieceIdsInGroup.forEach(id => newSet.add(id));
            } else {
                pieceIdsInGroup.forEach(id => newSet.delete(id));
            }
            return newSet;
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await validationPortalApi.validatePieces({ cutPieceLogIds: Array.from(checkedIds) });
            onSaveSuccess();
        } catch (error) {
            alert("Failed to save validation.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <Spinner />;

    return (
        <div className="p-4">
             <div className="mb-4 flex justify-between items-center">
                <button onClick={handleSelectAll} className="text-sm text-blue-600 font-medium">
                    {checkedIds.size === pieces.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-sm text-gray-500">
                    {checkedIds.size} / {pieces.length} items selected
                </span>
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-4">
                {Object.entries(groupedPieces).map(([partName, rolls]) => (
                    <div key={partName} className="border rounded-lg p-3">
                        <h4 className="font-bold text-md text-gray-800 mb-2">{partName}</h4>
                        {Object.entries(rolls).map(([rollId, pieceGroup]) => {
                            const areAllInRollSelected = pieceGroup.every(p => checkedIds.has(p.id));
                            return (
                                <div key={rollId} className="border-t mt-2 pt-2">
                                    <div className="flex items-center mb-2">
                                        <input
                                            type="checkbox"
                                            checked={areAllInRollSelected}
                                            onChange={(e) => handleSelectRollGroup(pieceGroup, e.target.checked)}
                                            className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                        />
                                        <label className="ml-2 text-sm font-semibold text-gray-600">ROLL-{rollId}</label>
                                    </div>
                                    <div className="space-y-2 pl-6">
                                        {pieceGroup.map(piece => (
                                            <div key={piece.id} className="flex items-center p-2 bg-gray-50 rounded-md">
                                                <input
                                                    type="checkbox"
                                                    checked={checkedIds.has(piece.id)}
                                                    onChange={() => handleCheckboxChange(piece.id)}
                                                    className="h-5 w-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                                />
                                                <label className="ml-3 flex-grow text-sm">
                                                    Size: <span className="font-semibold">{piece.size}</span> | 
                                                    Quantity: <span className="font-semibold">{piece.quantity_cut}</span>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
            <div className="mt-6 flex justify-end space-x-3">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg">Cancel</button>
                <button onClick={handleSave} disabled={isSaving || checkedIds.size === 0} className="flex items-center px-6 py-2 bg-purple-600 text-white rounded-lg disabled:bg-purple-300">
                    <LuBookHeart className="mr-2"/> Validate ({checkedIds.size}) Selected
                </button>
            </div>
        </div>
    );
};

export default ValidationDashboardPage;

