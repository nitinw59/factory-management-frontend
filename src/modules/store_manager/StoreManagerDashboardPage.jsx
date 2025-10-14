import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { storeManagerApi } from '../../api/storeManagerApi';
import FabricIntakeForm from './FabricIntakeForm';
import Modal from '../../shared/Modal';
import { LuPackage, LuList, LuFileText } from 'react-icons/lu';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

// --- NEW CARD FOR DISPLAYING BATCH-ASSIGNED ROLLS ---
const BatchRollsCard = ({ batch }) => {
    // This logic calculates the dispatch status based on the rolls' statuses.
    const dispatchStatus = useMemo(() => {
        if (!batch.rolls || batch.rolls.length === 0) return { text: 'No Rolls', color: 'gray' };
        
        if (batch.rolls.some(roll => roll.status === 'ASSIGNED_TO_PRODUCTION')) {
            return { text: 'DESPATCH PENDING', color: 'yellow' };
        }
        
        if (batch.rolls.every(roll => roll.status === 'IN_PRODUCTION')) {
            return { text: 'All Rolls Despatched', color: 'green' };
        }
        
        return { text: 'Mixed Status', color: 'blue' }; // Fallback
    }, [batch.rolls]);

    const statusColors = {
        yellow: 'border-yellow-500 bg-yellow-50 text-yellow-800',
        green: 'border-green-500 bg-green-50 text-green-800',
        blue: 'border-blue-500 bg-blue-50 text-blue-800',
        gray: 'border-gray-300 bg-gray-50 text-gray-500'
    };

    return (
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
            <div className={`p-3 border-l-4 ${statusColors[dispatchStatus.color]}`}>
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-gray-800 flex items-center"><LuFileText className="mr-2"/>{batch.product_name}</h3>
                        <p className="font-mono text-xs text-gray-500">{batch.batch_code || `BATCH-${batch.batch_id}`}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${statusColors[dispatchStatus.color]}`}>
                        {dispatchStatus.text}
                    </span>
                </div>
            </div>
            <div className="p-4">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr>
                            <th className="text-left font-medium text-gray-500 pb-1">Roll ID</th>
                            <th className="text-left font-medium text-gray-500 pb-1">Fabric</th>
                            <th className="text-right font-medium text-gray-500 pb-1">Meters</th>
                            <th className="text-right font-medium text-gray-500 pb-1">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {batch.rolls.map(roll => (
                            <tr key={roll.id} className="border-t">
                                <td className="py-2 font-mono text-xs">ROLL-{roll.id}</td>
                                <td className="py-2">{roll.type} - {roll.color}</td>
                                <td className="py-2 text-right font-semibold">{roll.meter}</td>
                                <td className="py-2 text-right text-xs font-medium">{roll.status.replace('_', ' ')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// --- MAIN PAGE CONTAINER (REWRITTEN) ---
const StoreManagerDashboardPage = () => {
    const [inStockRolls, setInStockRolls] = useState([]);
    const [assignedBatches, setAssignedBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [error, setError] = useState(null);

    const fetchInventory = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await storeManagerApi.getFabricInventory();
            setInStockRolls(response.data.inStockRolls || []);
            setAssignedBatches(response.data.assignedBatches || []);
        } catch (err) {
            console.error("Failed to fetch inventory", err);
            setError("Could not load fabric inventory.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchInventory(); }, [fetchInventory]);
  
    const handleSaveIntake = async (data) => {
        try {
            await storeManagerApi.createFabricIntake(data);
            setIsModalOpen(false);
            fetchInventory(); // Refresh inventory after new intake
        } catch (error) {
            alert('Failed to save intake. Please try again.');
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Fabric Inventory Dashboard</h1>
                <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Record New Fabric Intake
                </button>
            </div>
            
            {isLoading ? <Spinner /> : error ? <div className="p-4 text-center text-red-600 bg-red-50 rounded-lg">{error}</div> : (
                <>
                    {/* Section for Assigned Batches */}
                    <div>
                        <h2 className="text-2xl font-semibold mb-4 flex items-center"><LuList className="mr-3 text-gray-400"/>Assigned to Production</h2>
                        {assignedBatches.length > 0 ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {assignedBatches.map(batch => <BatchRollsCard key={batch.batch_id} batch={batch} />)}
                            </div>
                        ) : (
                            <p className="text-gray-500">No fabric rolls are currently assigned to production batches.</p>
                        )}
                    </div>

                    {/* Section for In Stock Rolls */}
                    <div>
                        <h2 className="text-2xl font-semibold mb-4 flex items-center"><LuPackage className="mr-3 text-gray-400"/>In Stock Fabric</h2>
                        <div className="bg-white p-4 rounded-lg shadow">
                            <table className="min-w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="py-2 px-3 text-left">Roll ID</th>
                                        <th className="py-2 px-3 text-left">Fabric Type</th>
                                        <th className="py-2 px-3 text-left">Color</th>
                                        <th className="py-2 px-3 text-right">Meters</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {inStockRolls.map(item => (
                                        <tr key={item.id}>
                                            <td className="py-2 px-3 font-mono text-xs">ROLL-{item.id}</td>
                                            <td className="py-2 px-3">{item.fabric_type}</td>
                                            <td className="py-2 px-3">{item.fabric_color}</td>
                                            <td className="py-2 px-3 text-right font-semibold">{item.meter}</td>
                                        </tr>
                                    ))}
                                    {inStockRolls.length === 0 && (
                                        <tr><td colSpan="4" className="text-center p-4 text-gray-500">No fabric is currently in stock.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
      
            {isModalOpen && <Modal title="Record New Fabric Intake" onClose={() => setIsModalOpen(false)}><FabricIntakeForm onSave={handleSaveIntake} onClose={() => setIsModalOpen(false)} /></Modal>}
        </div>
    );
};

export default StoreManagerDashboardPage;
