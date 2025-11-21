

import React, { useState, useEffect, useCallback, useMemo } from 'react';
// Corrected icon import path to use react-icons/fi
import { FiClipboard, FiPackage, FiX, FiLoader, FiCheck, FiCheckCircle } from 'react-icons/fi';
import preparationUnloadApi from '../../api/preparationUnloadApi';

const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

// --- NEW: Details Component (Replaces Modal) ---
const PreparationUnloadDetails = ({ batchId, onQueueRefresh }) => {
    const [pieces, setPieces] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [completingId, setCompletingId] = useState(null);

    const fetchDetails = useCallback(() => {
        setIsLoading(true); // Set loading to true on fetch
        preparationUnloadApi.getPreparationDetails(batchId)
            .then(res => {
                setPieces(res.data || []);
                console.log("Fetched pieces:", res.data);
            })
            .catch(() => setError("Could not load piece details."))
            .finally(() => setIsLoading(false));
    }, [batchId]);

    useEffect(() => {
        fetchDetails();
    }, [fetchDetails]);

    const handleCompletePiece = async (preparationLogId) => {
        setCompletingId(preparationLogId);
        setError(null);
        try {
            const res = await preparationUnloadApi.completePreparationPiece({ preparationLogId });
            
            if (res.data.batchCompleted) {
                onQueueRefresh(); 
            } else {
                fetchDetails();
            }
        } catch (err) {
            // Check for err.response before accessing it
            setError(err.response?.data?.error || err.message || "Failed to complete piece.");
        } finally {
            setCompletingId(null);
        }
    };

    // Memoize to separate completed from pending
    // ✅ FIX: Added a fallback object to useMemo's destructuring
  const { pendingPieces, completedPieces } = useMemo(() => {
  const pending = [];
  const completed = [];

  if (!Array.isArray(pieces)) return { pending, completed };

  pieces.forEach(p => {
    const status = p?.status?.toString().toUpperCase?.();
    if (status === 'COMPLETED') {
      completed.push(p);
    } else if (status === 'IN_PROGRESS' || status === 'PENDING' || !status) {
      pending.push(p);
    }
  });
  console.log("Pending pieces111:", pending);
  return { pendingPieces: pending, completedPieces: completed };
}, [pieces]);

    if (isLoading) return <Spinner />;

    return (
        <div className="p-4 bg-gray-50 border-t border-gray-200">
            {error && <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}
            
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                {/* Pending Pieces Section */}
                <section>
                    {/* Add checks for pendingPieces existing before accessing .length */}
                    <h4 className="font-semibold text-md text-yellow-700 mb-2">Pending Pieces ({pendingPieces?.length || 0  })</h4>
                    <div className="space-y-2">
                        {(pendingPieces?.length || 0) === 0 && <p className="text-sm text-gray-500 italic">All pieces are completed.</p>}
                        {(pendingPieces || []).map(piece => ( // Add fallback array for map
                            <div key={piece.preparation_log_id} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm border">
                                <div>
                                    <span className="font-medium text-gray-800">{piece.part_name}</span>
                                    <span className="text-sm text-gray-500 ml-2">({piece.size} x {piece.quantity_cut})</span>
                                </div>
                                <button
                                    onClick={() => handleCompletePiece(piece.preparation_log_id)}
                                    disabled={completingId === piece.preparation_log_id}
                                    className="flex items-center justify-center px-3 py-1 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300 w-28"
                                >
                                    {completingId === piece.preparation_log_id ? (
                                        <FiLoader className="animate-spin" />
                                    ) : (
                                        <><FiCheck className="mr-1" /> Mark Complete</>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Completed Pieces Section */}
                <section>
                    {/* Add checks for completedPieces existing before accessing .length */}
                    <h4 className="font-semibold text-md text-green-700 mb-2">Completed Pieces ({completedPieces?.length || 0})</h4>
                    <div className="space-y-2">
                        {(completedPieces || []).map(piece => ( // Add fallback array for map
                            <div key={piece.preparation_log_id} className="flex items-center justify-between p-3 bg-gray-100 rounded-lg border">
                                <div>
                                    <span className="font-medium text-gray-500 line-through">{piece.part_name}</span>
                                    <span className="text-sm text-gray-400 ml-2">({piece.size} x {piece.quantity_cut})</span>
                                </div>
                                <span className="flex items-center text-sm font-semibold text-green-600">
                                    <FiCheckCircle className="mr-1.5" /> Completed
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};

// --- Main Dashboard Component ---
const PreparationUnloadDashboard = () => {
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedBatchId, setExpandedBatchId] = useState(null);

    const fetchQueue = useCallback(() => {
        setIsLoading(true);
        preparationUnloadApi.getMyQueue()
            .then(res => setBatches(res.data || []))
            .catch(() => setError("Could not load your unload queue."))
            .finally(() => setIsLoading(false));
    }, []);

    useEffect(() => {
        fetchQueue();
    }, [fetchQueue]);

    const handleBatchComplete = () => {
        fetchQueue(); 
    };

    const handleToggleExpand = (batchId) => {
        setExpandedBatchId(prevId => (prevId === batchId ? null : batchId));
    };

    const BatchCard = ({ batch, isExpanded, onExpand, onQueueRefresh }) => (
        <div className="bg-white rounded-lg shadow border-l-4 border-blue-500 overflow-hidden">
            <div className="p-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-lg text-blue-600">{batch.batch_code || `Batch #${batch.id}`}</h3>
                    <button onClick={onExpand} className="flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                        <FiClipboard className="mr-1" /> {isExpanded ? 'Hide Details' : 'Unload'}
                    </button>
                </div>
                <p className="text-sm text-gray-600">{batch.product_name}</p>
            </div>
            
            {isExpanded && (
                <PreparationUnloadDetails 
                    batchId={batch.id} 
                    onQueueRefresh={onQueueRefresh} 
                />
            )}
        </div>
    );

    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Preparation Unload Queue</h1>
            
            {isLoading ? <Spinner /> : error ? (
                <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batches.length > 0 ? (
                        batches.map(batch => (
                            <BatchCard 
                                key={batch.id} 
                                batch={batch} 
                                isExpanded={expandedBatchId === batch.id}
                                onExpand={() => handleToggleExpand(batch.id)}
                                onQueueRefresh={fetchQueue}
                            />
                        ))
                    ) : (
                         <div className="col-span-full text-center py-10 px-4 bg-white rounded-lg shadow-sm border">
                            <FiPackage className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-lg font-medium text-gray-900">Queue is Empty</h3>
                            <p className="mt-1 text-sm text-gray-500">No batches are currently in progress on your line.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PreparationUnloadDashboard;