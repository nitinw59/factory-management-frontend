import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { storeManagerApi } from '../../api/storeManagerApi';
import FabricIntakeForm from './FabricIntakeForm';

import { FiPackage, FiList, FiFileText, FiPlus, FiFilter, FiX, FiClock, FiTruck, FiCheckCircle, FiArchive } from 'react-icons/fi'; 

// --- SHARED UI COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;
const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
                <h2 className="text-lg font-semibold">{title}</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><FiX size={20}/></button>
            </div>
            <div className="p-6">{children}</div>
        </div>
    </div>
);
const Placeholder = ({ icon: Icon, title, message }) => (
     <div className="text-center py-10 px-4 bg-white rounded-lg shadow-sm border border-dashed">
        <Icon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-lg font-medium text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{message}</p>
    </div>
);


// --- Reusable Card for Displaying Batch Rolls ---
const BatchRollsCard = ({ batch }) => {
    // Determine the overall despatch status
    const dispatchStatus = useMemo(() => {
        if (!batch.rolls || batch.rolls.length === 0) return { category: 'empty', text: 'No Rolls', color: 'gray', icon: FiArchive };
        
        const assignedCount = batch.rolls.filter(r => r.status === 'ASSIGNED_TO_PRODUCTION').length;
        const inProdCount = batch.rolls.filter(r => r.status === 'IN_PRODUCTION').length;
        const totalRolls = batch.rolls.length;

        if (assignedCount === totalRolls) {
            return { category: 'pending', text: 'Pending Despatch', color: 'yellow', icon: FiClock };
        }
        if (inProdCount === totalRolls) {
             return { category: 'despatched', text: 'Fully Despatched', color: 'green', icon: FiCheckCircle };
        }
        if (assignedCount > 0 && inProdCount > 0) {
            return { category: 'partial', text: 'Partially Despatched', color: 'blue', icon: FiTruck };
        }
        
        return { category: 'unknown', text: 'Unknown Status', color: 'gray', icon: FiList }; // Fallback for other statuses
    }, [batch.rolls]);

    const StatusIcon = dispatchStatus.icon;

    return (
        <div className="bg-white rounded-lg shadow-md border overflow-hidden transition-shadow hover:shadow-lg">
            {/* Header with Status */}
            <div className={`p-3 border-l-4 border-${dispatchStatus.color}-500 bg-${dispatchStatus.color}-50`}>
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-gray-800 flex items-center"><FiFileText className="mr-2"/>{batch.product_name}</h3>
                        <p className="font-mono text-xs text-gray-500">{batch.batch_code || `BATCH-${batch.batch_id}`}</p>
                    </div>
                    <span className={`inline-flex items-center text-xs font-bold px-2 py-1 rounded-full bg-${dispatchStatus.color}-100 text-${dispatchStatus.color}-800`}>
                       <StatusIcon size={14} className="mr-1.5"/> {dispatchStatus.text}
                    </span>
                </div>
            </div>
            {/* Roll Details Table */}
            <div className="p-4 max-h-48 overflow-y-auto"> {/* Added max-height and scroll */}
                <table className="min-w-full text-sm">
                    <thead>
                        <tr>
                            <th className="text-left font-medium text-gray-500 pb-1 w-1/4">Roll ID</th>
                            <th className="text-left font-medium text-gray-500 pb-1 w-1/2">Fabric</th>
                            <th className="text-right font-medium text-gray-500 pb-1 w-1/4">Meters</th>
                            {/* Status column removed as it's reflected in the card header */}
                        </tr>
                    </thead>
                    <tbody>
                        {batch.rolls.map(roll => (
                            <tr key={roll.id} className="border-t">
                                <td className="py-1.5 font-mono text-xs">ROLL-{roll.id}</td>
                                <td className="py-1.5">{roll.type} - {roll.color}({roll.color_number || 'n/a'})</td>
                                <td className="py-1.5 text-right font-semibold">{roll.meter}</td>
                            </tr>
                        ))}
                         {/* Add a row if the rolls array is empty */}
                         {(!batch.rolls || batch.rolls.length === 0) && (
                            <tr><td colSpan="3" className="text-center py-4 text-xs text-gray-400 italic">No rolls assigned.</td></tr>
                         )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// --- Main Page Component ---
const StoreManagerDashboardPage = () => {
    const [allAssignedBatches, setAllAssignedBatches] = useState([]);
    const [inStockRolls, setInStockRolls] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [error, setError] = useState(null);
    const [filterText, setFilterText] = useState('');

    const fetchInventory = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await storeManagerApi.getFabricInventory();
            setInStockRolls(response.data.inStockRolls || []);
            setAllAssignedBatches(response.data.assignedBatches || []);
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
            fetchInventory(); 
        } catch (error) {
            alert('Failed to save intake. Please try again.');
            // Keep modal open on error
        }
    };

    // --- Categorize and Filter Batches ---
    const categorizedBatches = useMemo(() => {
        const pending = [];
        const partial = [];
        const despatched = [];

        const lowerFilter = filterText.toLowerCase();
        
        allAssignedBatches
            .filter(batch => 
                !filterText || 
                batch.batch_id?.toString().includes(lowerFilter) || 
                batch.batch_code?.toLowerCase().includes(lowerFilter) ||
                batch.product_name?.toLowerCase().includes(lowerFilter)
            )
            .forEach(batch => {
                if (!batch.rolls || batch.rolls.length === 0) {
                     // Optionally decide if batches with no rolls should appear somewhere
                     // For now, skipping them from categorization.
                     return; 
                }

                const assignedCount = batch.rolls.filter(r => r.status === 'ASSIGNED_TO_PRODUCTION').length;
                const inProdCount = batch.rolls.filter(r => r.status === 'IN_PRODUCTION').length;
                const totalRolls = batch.rolls.length;

                if (assignedCount === totalRolls) pending.push(batch);
                else if (inProdCount === totalRolls) despatched.push(batch);
                else if (assignedCount > 0 && inProdCount > 0) partial.push(batch);
                // Batches with only 'IN_PRODUCTION' rolls (but not all) or other statuses
                // could be added to 'partial' or a separate 'other' category if needed.
                // For simplicity, they might currently fall into 'partial' if at least one is assigned.
            });
            
        // Sort each category (e.g., by batch ID descending for recency)
        pending.sort((a,b) => b.batch_id - a.batch_id);
        partial.sort((a,b) => b.batch_id - a.batch_id);
        despatched.sort((a,b) => b.batch_id - a.batch_id);

        return { pending, partial, despatched };

    }, [allAssignedBatches, filterText]);
    // --- End Categorization ---

    return (
        <div className="p-6 bg-gray-100 min-h-screen space-y-8">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Fabric Inventory Dashboard</h1>
                    <p className="text-gray-600 mt-1">Track stock and manage fabric despatch for production.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="flex-shrink-0 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold flex items-center shadow-sm">
                    <FiPlus size={18} className="mr-1.5"/> Record New Fabric Intake
                </button>
            </header>
            
            {isLoading ? <Spinner /> : error ? <div className="p-4 text-center text-red-600 bg-red-50 rounded-lg shadow-sm border border-red-200">{error}</div> : (
                <>
                    {/* Assigned Batches Section with Filter */}
                    <section>
                        <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-4">
                             <h2 className="text-2xl font-semibold text-gray-700 flex items-center"><FiList className="mr-3 text-gray-400"/>Assigned to Production</h2>
                             <div className="relative w-full md:w-auto max-w-xs">
                                 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                     <FiFilter className="text-gray-400" size={16}/>
                                 </div>
                                 <input 
                                     type="text"
                                     placeholder="Filter Batches..."
                                     value={filterText}
                                     onChange={(e) => setFilterText(e.target.value)}
                                     className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" // Added pr-10 for clear button space
                                 />
                                 {filterText && (
                                     <button onClick={() => setFilterText('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600" title="Clear filter"><FiX size={18}/></button>
                                 )}
                             </div>
                        </div>

                        {/* Sub-sections for Batch Statuses */}
                        <div className="space-y-6">
                            {/* Pending Despatch */}
                            <div>
                                <h3 className="text-lg font-medium text-yellow-700 mb-3 flex items-center"><FiClock className="mr-2"/> Pending Despatch ({categorizedBatches.pending.length})</h3>
                                {categorizedBatches.pending.length > 0 ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                        {categorizedBatches.pending.map(batch => <BatchRollsCard key={batch.batch_id} batch={batch} />)}
                                    </div>
                                ) : <Placeholder icon={FiPackage} title="No Batches Pending" message={filterText ? "No pending batches match your filter." : "All assigned batches have started despatch."} />}
                            </div>

                            {/* Partially Despatched */}
                            <div>
                                <h3 className="text-lg font-medium text-blue-700 mb-3 flex items-center"><FiTruck className="mr-2"/> Partially Despatched ({categorizedBatches.partial.length})</h3>
                                {categorizedBatches.partial.length > 0 ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                        {categorizedBatches.partial.map(batch => <BatchRollsCard key={batch.batch_id} batch={batch} />)}
                                    </div>
                                ) : <Placeholder icon={FiList} title="No Batches Partially Despatched" message={filterText ? "No partially despatched batches match your filter." : "No batches currently have mixed roll statuses."} />}
                            </div>

                            {/* Fully Despatched */}
                            <div>
                                <h3 className="text-lg font-medium text-green-700 mb-3 flex items-center"><FiCheckCircle className="mr-2"/> Fully Despatched ({categorizedBatches.despatched.length})</h3>
                                {categorizedBatches.despatched.length > 0 ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                        {categorizedBatches.despatched.map(batch => <BatchRollsCard key={batch.batch_id} batch={batch} />)}
                                    </div>
                                ) : <Placeholder icon={FiList} title="No Batches Fully Despatched" message={filterText ? "No fully despatched batches match your filter." : "No assigned batches have all rolls in production yet."} />}
                            </div>
                        </div>
                    </section>

                    {/* Section for In Stock Rolls */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 flex items-center"><FiPackage className="mr-3 text-gray-400"/>In Stock Fabric Rolls ({inStockRolls.length})</h2>
                        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
                             <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                                        <tr>
                                            <th className="py-2 px-4 text-left">Roll ID</th>
                                            <th className="py-2 px-4 text-left">Fabric Type</th>
                                            <th className="py-2 px-4 text-left">Color</th>
                                            <th className="py-2 px-4 text-right">Meters</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 text-sm">
                                        {inStockRolls.map(item => (
                                            <tr key={item.id}>
                                                <td className="py-2 px-4 font-mono text-xs">ROLL-{item.id}</td>
                                                <td className="py-2 px-4">{item.fabric_type}</td>
                                                <td className="py-2 px-4">{item.fabric_color}({item.color_number || 'n/a'})</td>
                                                <td className="py-2 px-4 text-right font-semibold">{item.meter}</td>
                                            </tr>
                                        ))}
                                        {inStockRolls.length === 0 && (
                                            <tr><td colSpan="4" className="text-center py-6 text-gray-500">No fabric is currently in stock.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                </>
            )}
      
            {isModalOpen && <Modal title="Record New Fabric Intake" onClose={() => setIsModalOpen(false)}><FabricIntakeForm onSave={handleSaveIntake} onClose={() => setIsModalOpen(false)} /></Modal>}
        </div>
    );
};

export default StoreManagerDashboardPage;