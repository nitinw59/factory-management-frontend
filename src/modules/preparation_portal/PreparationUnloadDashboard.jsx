

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    ClipboardCheck, Package, X, Loader2, Check, CheckCircle, 
    Layers, Shirt, ChevronDown, ChevronUp, AlertTriangle 
} from 'lucide-react';

import preparationUnloadApi from '../../api/preparationUnloadApi';

const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;


const PreparationUnloadDetails = ({ batchId, onQueueRefresh }) => {
    const [pieces, setPieces] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [processingGroup, setProcessingGroup] = useState(null); 

    const fetchDetails = useCallback(() => {
        setIsLoading(true); 
        preparationUnloadApi.getPreparationDetails(batchId)
            .then(res => { setPieces(res.data || []); })
            .catch(() => setError("Could not load piece details."))
            .finally(() => setIsLoading(false));
    }, [batchId]);

    useEffect(() => { fetchDetails(); }, [fetchDetails]);

    const groupedItems = useMemo(() => {
        if (!Array.isArray(pieces)) return [];
        const map = new Map();
        pieces.forEach(p => {
            const groupKey = `${p.fabric_roll_id}-${p.part_name}`;
            if (!map.has(groupKey)) {
                map.set(groupKey, {
                    key: groupKey,
                    fabric_roll_id: p.fabric_roll_id,
                    part_name: p.part_name,
                    items: [],
                    totalQty: 0,
                    status: 'COMPLETED' 
                });
            }
            const group = map.get(groupKey);
            group.items.push(p);
            group.totalQty += (p.quantity_cut || 0);
            const pStatus = p?.status?.toString().toUpperCase();
            if (pStatus !== 'COMPLETED') group.status = 'PENDING';
        });
        return Array.from(map.values());
    }, [pieces]);

    const handleCompleteGroup = async (group) => {
        setProcessingGroup(group.key);
        setError(null);

        // 1. Gather IDs
        const pendingIds = group.items
            .filter(p => p.status !== 'COMPLETED')
            .map(p => p.preparation_log_id);

        if (pendingIds.length === 0) {
             setProcessingGroup(null);
             return;
        }

        try {
            // 2. Call Bulk API
            const res = await preparationUnloadApi.completePiecesBulk({ 
                preparationLogIds: pendingIds 
            });

            if (res.data.batchCompleted) {
                onQueueRefresh(); 
            } else {
                fetchDetails(); 
            }
        } catch (err) {
            setError(err.response?.data?.error || "Failed to complete items.");
        } finally {
            setProcessingGroup(null);
        }
    };

    const pendingGroups = groupedItems.filter(g => g.status === 'PENDING');
    const completedGroups = groupedItems.filter(g => g.status === 'COMPLETED');

    if (isLoading) return <Spinner />;

    return (
        <div className="p-4 bg-gray-50 border-t border-gray-200">
            {error && <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-lg border border-red-200 flex items-center"><AlertTriangle className="w-5 h-5 mr-2"/>{error}</div>}
            
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                {/* Pending Section */}
                <section>
                    <h4 className="font-bold text-sm text-gray-500 uppercase mb-3 flex items-center">
                        <Loader2 className="w-4 h-4 mr-2"/> Pending Unload ({pendingGroups.length})
                    </h4>
                    {pendingGroups.length === 0 && <div className="p-4 bg-white rounded-lg border border-gray-200 text-center text-gray-400 italic text-sm">No pending items.</div>}

                    <div className="space-y-3">
                        {pendingGroups.map(group => (
                            <div key={group.key} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 transition-colors">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center">
                                            <Layers className="w-4 h-4 text-blue-500 mr-2"/>
                                            <span className="font-bold text-gray-800 text-lg">Roll #{group.fabric_roll_id}</span>
                                        </div>
                                        <div className="mt-1 flex items-center text-gray-600">
                                            <Shirt className="w-4 h-4 mr-2"/>
                                            <span className="font-medium">{group.part_name}</span>
                                            <span className="mx-2 text-gray-300">|</span>
                                            <span className="text-sm">{group.items.length} bundles ({group.totalQty} pcs)</span>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {group.items.map(item => (
                                                <span key={item.preparation_log_id} className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-xs font-mono text-gray-600 border border-gray-200">
                                                    {item.size}: {item.quantity_cut}
                                                    {item.status === 'COMPLETED' && <CheckCircle className="w-3 h-3 ml-1 text-green-500"/>}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleCompleteGroup(group)}
                                        disabled={processingGroup === group.key}
                                        className="flex-shrink-0 ml-4 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center shadow-sm transition-all active:scale-95"
                                    >
                                        {processingGroup === group.key ? (
                                            <><Loader2 className="w-4 h-4 animate-spin mr-2"/> Saving...</>
                                        ) : (
                                            <><Check className="w-4 h-4 mr-2"/> Mark Complete</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Completed Section */}
                {completedGroups.length > 0 && (
                    <section className="pt-4 border-t border-gray-200">
                        <h4 className="font-bold text-sm text-green-700 uppercase mb-3 flex items-center">
                            <CheckCircle className="w-4 h-4 mr-2"/> Completed ({completedGroups.length})
                        </h4>
                        <div className="space-y-2 opacity-75">
                            {completedGroups.map(group => (
                                <div key={group.key} className="bg-green-50 p-3 rounded-lg border border-green-100 flex justify-between items-center">
                                    <div className="flex items-center">
                                        <span className="font-bold text-green-800 mr-3">Roll #{group.fabric_roll_id}</span>
                                        <span className="text-green-700">{group.part_name}</span>
                                        <span className="mx-2 text-green-300">|</span>
                                        <span className="text-xs text-green-600">{group.totalQty} pcs</span>
                                    </div>
                                    <CheckCircle className="w-5 h-5 text-green-500"/>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};

const PreparationUnloadDashboard = () => {
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedBatchId, setExpandedBatchId] = useState(null);

    const fetchQueue = useCallback(async () => {
        setIsLoading(true);
        preparationUnloadApi.getMyQueue()
            .then(res => setBatches(res.data || []))
            .catch(() => setError("Could not load your unload queue."))
            .finally(() => setIsLoading(false));
    }, []);

    useEffect(() => { fetchQueue(); }, [fetchQueue]);

    const handleBatchComplete = () => { fetchQueue(); };
    const handleToggleExpand = (batchId) => { setExpandedBatchId(prevId => (prevId === batchId ? null : batchId)); };

    const BatchCard = ({ batch, isExpanded, onExpand, onQueueRefresh }) => (
        <div className={`bg-white rounded-lg shadow border-l-4 border-blue-500 overflow-hidden transition-all duration-200 ${isExpanded ? 'ring-2 ring-blue-100' : ''}`}>
            <div className="p-4">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-lg text-gray-800 flex items-center">
                             <ClipboardCheck className="w-5 h-5 mr-2 text-blue-500"/>
                             {batch.batch_code || `Batch #${batch.id}`}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1 ml-7">{batch.product_name}</p>
                    </div>
                    <button 
                        onClick={onExpand} 
                        className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isExpanded ? 'bg-gray-100 text-gray-700' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'}`}
                    >
                        {isExpanded ? 'Close Details' : 'Unload Items'}
                    </button>
                </div>
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
            <header className="mb-6">
                 <h1 className="text-3xl font-bold text-gray-800 mb-2">Preparation Unload Queue</h1>
                 <p className="text-gray-500">Verify and unload preparation items to advance batches to sewing.</p>
            </header>
            {isLoading ? <Spinner /> : error ? <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {batches.length > 0 ? batches.map(batch => <BatchCard key={batch.id} batch={batch} isExpanded={expandedBatchId === batch.id} onExpand={() => handleToggleExpand(batch.id)} onQueueRefresh={fetchQueue}/>) : <div className="col-span-full text-center py-16 bg-white rounded-lg shadow-sm border border-gray-200"><Package className="mx-auto h-16 w-16 text-gray-300 mb-4" /><h3 className="text-xl font-bold text-gray-800">Queue is Empty</h3></div>}
                </div>
            )}
        </div>
    );
};

export default PreparationUnloadDashboard;