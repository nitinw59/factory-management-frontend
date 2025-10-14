import React, { useState, useEffect, useCallback } from 'react';
import { initializationPortalApi } from '../../api/initializationPortalApi';
import { LuTriangleAlert, LuHammer, LuWrench, LuCircleX } from 'react-icons/lu';

// --- SHARED UI COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="p-4 bg-red-100 text-red-700 rounded-lg">{message}</div>;

// --- NEW MODAL FOR REJECTING ALTERED PIECES ---
const RejectModal = ({ item, onClose, onSave }) => {
    const [quantity, setQuantity] = useState(item.pending_quantity);

    const handleSave = () => {
        if (isNaN(quantity) || quantity <= 0 || quantity > item.pending_quantity) {
            return alert("Invalid quantity.");
        }
        onSave(quantity);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b">
                    <h3 className="text-xl font-bold text-red-800">Reject Altered Pieces</h3>
                    <p className="text-sm text-gray-600">{item.part_name} (Size: {item.size})</p>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Quantity to Reject (Max: {item.pending_quantity})
                        </label>
                        <input
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                            className="w-full p-2 border rounded-md"
                            min="1"
                            max={item.pending_quantity}
                            autoFocus
                        />
                    </div>
                </div>
                <div className="px-6 py-4 bg-gray-50 border-t flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Confirm Reject</button>
                </div>
            </div>
        </div>
    );
};


// --- DASHBOARD SUB-COMPONENTS ---
const StatCard = ({ title, value, icon, color }) => (
    <div className={`p-4 bg-white rounded-lg shadow-md border-l-4 ${color}`}>
        <div className="flex items-center">
            <div className="p-3 bg-gray-100 rounded-full mr-4">{icon}</div>
            <div>
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
            </div>
        </div>
    </div>
);

const UrgentActionCard = ({ items, onOpenRejectModal }) => {
    return (
        <div className="bg-white rounded-lg shadow-md">
            <div className="p-4 bg-red-500 text-white rounded-t-lg flex items-center">
                <LuTriangleAlert className="mr-3" size={24}/>
                <h2 className="text-xl font-bold">Urgent Actions Required</h2>
            </div>
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                {items && items.length > 0 ? items.map(item => (
                    <div key={`${item.fabric_roll_id}-${item.product_piece_part_id}-${item.size}`} className="p-3 bg-red-50 border border-red-200 rounded-lg flex justify-between items-center">
                        <div>
                            <p className="font-semibold text-red-800">{item.pending_quantity} x {item.part_name} (Size: {item.size})</p>
                            <p className="text-xs text-gray-500">From Batch #{item.batch_id} / Roll #{item.fabric_roll_id}</p>
                        </div>
                        <button 
                            onClick={() => onOpenRejectModal(item)}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                        >
                            Reject
                        </button>
                    </div>
                )) : (
                    <p className="text-center text-gray-500 py-4">No urgent actions required.</p>
                )}
            </div>
        </div>
    );
};

// --- MAIN PAGE COMPONENT ---
const AlterPiecesDashboardPage = () => {
    const [dashboardData, setDashboardData] = useState({ overall_stats: {}, urgent_actions: [], batch_details: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await initializationPortalApi.getAlterPiecesData();
            setDashboardData(response.data || { overall_stats: {}, urgent_actions: [], batch_details: [] });
            console.log("Fetched dashboard data:", response.data);
        } catch (err) {
            setError("Could not load dashboard data. Please try again later.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleOpenRejectModal = (item) => {
        setSelectedItem(item);
        setIsRejectModalOpen(true);
    };

    const handleRejectSubmit = async (quantity) => {
        if (!selectedItem) return;
        try {
            await initializationPortalApi.rejectAltered({ 
                rollId: selectedItem.fabric_roll_id,
                partId: selectedItem.product_piece_part_id,
                size: selectedItem.size,
                quantity: quantity
            });
            setIsRejectModalOpen(false);
            setSelectedItem(null);
            fetchData(); // Refresh all data after action
        } catch (err) {
            alert(`Failed to reject pieces: ${err.message || 'Server error'}`);
        }
    };

    const stats = dashboardData.overall_stats || {};
    const urgentActions = dashboardData.urgent_actions || [];
    const batchDetails = dashboardData.batch_details || [];

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold">Alter Pieces Dashboard</h1>
            
            {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content Area */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Overall Stats Section */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <StatCard title="Total Marked for Alter" value={stats.total_altered || 0} icon={<LuHammer size={24}/>} color="border-yellow-500" />
                            <StatCard title="Total Repaired" value={stats.total_repaired || 0} icon={<LuWrench size={24}/>} color="border-orange-500" />
                            <StatCard title="Total Rejected" value={stats.total_rejected || 0} icon={<LuCircleX size={24}/>} color="border-red-500" />
                        </div>

                        {/* Detailed Batch Data Section */}
                        <div className="bg-white p-4 rounded-lg shadow-md">
                             <h2 className="text-xl font-bold mb-4 text-gray-800">Batch QC Summary</h2>
                            <table className="min-w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase">Batch</th>
                                        <th className="py-2 px-3 text-right text-xs font-semibold text-gray-500 uppercase">Altered</th>
                                        <th className="py-2 px-3 text-right text-xs font-semibold text-gray-500 uppercase">Repaired</th>
                                        <th className="py-2 px-3 text-right text-xs font-semibold text-gray-500 uppercase">Rejected</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {batchDetails.map(batch => (
                                        <tr key={batch.batch_id}>
                                            <td className="py-2 px-3">
                                                <p className="font-semibold">{batch.product_name}</p>
                                                <p className="text-xs text-gray-500 font-mono">{batch.batch_code || `BATCH-${batch.batch_id}`}</p>
                                            </td>
                                            <td className="py-2 px-3 text-right font-bold text-yellow-600">{batch.altered_count}</td>
                                            <td className="py-2 px-3 text-right font-bold text-orange-600">{batch.repaired_count}</td>
                                            <td className="py-2 px-3 text-right font-bold text-red-600">{batch.rejected_count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Urgent Actions Sidebar */}
                    <div className="lg:col-span-1">
                        <UrgentActionCard items={urgentActions} onOpenRejectModal={handleOpenRejectModal} />
                    </div>
                </div>
            )}

            {isRejectModalOpen && selectedItem && (
                <RejectModal 
                    item={selectedItem}
                    onClose={() => setIsRejectModalOpen(false)}
                    onSave={handleRejectSubmit}
                />
            )}
        </div>
    );
};

export default AlterPiecesDashboardPage;

