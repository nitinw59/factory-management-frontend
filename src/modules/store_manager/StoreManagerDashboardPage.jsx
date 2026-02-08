import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { storeManagerApi } from '../../api/storeManagerApi';
// import FabricIntakeForm from '../accounts/purchase/FabricIntakeForm';
import { 
    Package, List, FileText, Plus, Filter, X, Clock, Truck, 
    CheckCircle, Archive, ChevronDown, ChevronRight, Hash, Layers 
} from 'lucide-react';

// --- SHARED UI COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto">{children}</div>
        </div>
    </div>
);

const Placeholder = ({ icon: Icon, title, message }) => (
     <div className="text-center py-10 px-4 bg-white rounded-lg shadow-sm border border-dashed">
        <Icon className="mx-auto h-12 w-12 text-gray-300" />
        <h3 className="mt-2 text-lg font-medium text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{message}</p>
    </div>
);

// --- COLLAPSIBLE SECTION COMPONENT ---
const CollapsibleSection = ({ title, count, icon: Icon, color, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    const colorClasses = {
        yellow: 'bg-yellow-50 text-yellow-800 border-yellow-200',
        blue: 'bg-blue-50 text-blue-800 border-blue-200',
        green: 'bg-green-50 text-green-800 border-green-200',
        gray: 'bg-gray-50 text-gray-800 border-gray-200',
        indigo: 'bg-indigo-50 text-indigo-800 border-indigo-200'
    };

    const headerClass = colorClasses[color] || colorClasses.gray;

    return (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden mb-4 transition-all">
            <div 
                onClick={() => setIsOpen(!isOpen)} 
                className={`flex items-center justify-between p-4 cursor-pointer hover:bg-opacity-80 transition-colors ${headerClass}`}
            >
                <div className="flex items-center space-x-3">
                    <div className="p-1 rounded-md bg-white/50">
                        {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                    <div className="flex items-center space-x-2">
                        {Icon && <Icon size={20} />}
                        <h3 className="font-bold text-lg">{title}</h3>
                    </div>
                </div>
                {count !== undefined && (
                    <span className="bg-white/60 px-3 py-1 rounded-full text-xs font-bold shadow-sm">
                        {count} Items
                    </span>
                )}
            </div>
            
            {/* Drawer Content */}
            {isOpen && (
                <div className="p-4 bg-gray-50/50 border-t animate-in slide-in-from-top-2 fade-in duration-200">
                    {children}
                </div>
            )}
        </div>
    );
};

// --- Reusable Card for Displaying Batch Rolls ---
const BatchRollsCard = ({ batch }) => {
    // Determine the overall despatch status
    const dispatchStatus = useMemo(() => {
        if (!batch.rolls || batch.rolls.length === 0) return { category: 'empty', text: 'No Rolls', color: 'gray', icon: Archive };
        
        const assignedCount = batch.rolls.filter(r => r.status === 'ASSIGNED_TO_PRODUCTION').length;
        const inProdCount = batch.rolls.filter(r => r.status === 'IN_PRODUCTION').length;
        const totalRolls = batch.rolls.length;

        if (assignedCount === totalRolls) {
            return { category: 'pending', text: 'Pending Despatch', color: 'yellow', icon: Clock };
        }
        if (inProdCount === totalRolls) {
             return { category: 'despatched', text: 'Fully Despatched', color: 'green', icon: CheckCircle };
        }
        if (assignedCount > 0 && inProdCount > 0) {
            return { category: 'partial', text: 'Partially Despatched', color: 'blue', icon: Truck };
        }
        
        return { category: 'unknown', text: 'Unknown Status', color: 'gray', icon: List }; 
    }, [batch.rolls]);

    const StatusIcon = dispatchStatus.icon;

    return (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden transition-shadow hover:shadow-md">
            {/* Header with Status */}
            <div className={`px-4 py-3 border-b border-gray-100 flex justify-between items-center`}>
                <div>
                    <h3 className="font-bold text-gray-800 flex items-center text-sm"><FileText size={16} className="mr-2 text-gray-400"/>{batch.product_name}</h3>
                    <p className="font-mono text-xs text-gray-500 pl-6">{batch.batch_code || `BATCH-${batch.batch_id}`}</p>
                </div>
                <span className={`inline-flex items-center text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full border bg-white text-gray-600`}>
                   <StatusIcon size={12} className="mr-1.5"/> {dispatchStatus.text}
                </span>
            </div>
            {/* Roll Details Table */}
            <div className="max-h-48 overflow-y-auto"> 
                <table className="min-w-full text-xs text-left">
                    <thead className="bg-gray-50 sticky top-0">
                        <tr>
                            <th className="px-4 py-2 font-medium text-gray-500">Ref #</th>
                            <th className="px-4 py-2 font-medium text-gray-500">Roll ID</th>
                            <th className="px-4 py-2 font-medium text-gray-500">Fabric</th>
                            <th className="px-4 py-2 font-medium text-gray-500 text-right">Meters</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {batch.rolls.map(roll => (
                            <tr key={roll.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-gray-500 font-mono">{roll.reference_number || '-'}</td>
                                <td className="px-4 py-2 font-mono text-gray-600">R-{roll.id}</td>
                                <td className="px-4 py-2 text-gray-700">{roll.type} - {roll.color}</td>
                                <td className="px-4 py-2 text-right font-semibold text-gray-800">{roll.meter}</td>
                            </tr>
                        ))}
                         {(!batch.rolls || batch.rolls.length === 0) && (
                            <tr><td colSpan="4" className="text-center py-4 text-gray-400 italic">No rolls assigned.</td></tr>
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
        }
    };

    // --- Categorize Batches ---
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
                if (!batch.rolls || batch.rolls.length === 0) return; 

                const assignedCount = batch.rolls.filter(r => r.status === 'ASSIGNED_TO_PRODUCTION').length;
                const inProdCount = batch.rolls.filter(r => r.status === 'IN_PRODUCTION').length;
                const totalRolls = batch.rolls.length;

                if (assignedCount === totalRolls) pending.push(batch);
                else if (inProdCount === totalRolls) despatched.push(batch);
                else if (assignedCount > 0 && inProdCount > 0) partial.push(batch);
            });
            
        pending.sort((a,b) => b.batch_id - a.batch_id);
        partial.sort((a,b) => b.batch_id - a.batch_id);
        despatched.sort((a,b) => b.batch_id - a.batch_id);

        return { pending, partial, despatched };

    }, [allAssignedBatches, filterText]);

    // --- Group In-Stock Rolls by Reference Number ---
    const groupedStock = useMemo(() => {
        const groups = {};
        inStockRolls.forEach(roll => {
            const ref = roll.reference_number || 'No Reference / Unassigned';
            if (!groups[ref]) groups[ref] = [];
            groups[ref].push(roll);
        });
        return groups;
    }, [inStockRolls]);
    
    // Sort reference numbers for display (optional, keeps 'No Reference' last or first)
    const sortedRefNumbers = Object.keys(groupedStock).sort((a, b) => {
        if (a === 'No Reference / Unassigned') return 1;
        if (b === 'No Reference / Unassigned') return -1;
        return a.localeCompare(b);
    });

    return (
        <div className="p-6 bg-gray-100 min-h-screen space-y-8 font-inter text-slate-800">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Fabric Inventory</h1>
                    <p className="text-slate-500 mt-1">Track stock intake and production despatch.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="flex-shrink-0 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold flex items-center shadow-md transition-all">
                    <Plus size={18} className="mr-1.5"/> New Fabric Intake
                </button>
            </header>
            
            {isLoading ? <Spinner /> : error ? <div className="p-4 text-center text-red-600 bg-red-50 rounded-lg shadow-sm border border-red-200">{error}</div> : (
                <>
                    {/* Assigned Batches Section */}
                    <section>
                        <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
                             <h2 className="text-xl font-bold text-slate-700 flex items-center"><List className="mr-3 text-gray-400"/>Production Assignments</h2>
                             <div className="relative w-full md:w-auto max-w-xs">
                                 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                     <Filter className="text-gray-400" size={16}/>
                                 </div>
                                 <input 
                                     type="text"
                                     placeholder="Filter Batches..."
                                     value={filterText}
                                     onChange={(e) => setFilterText(e.target.value)}
                                     className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                                 />
                                 {filterText && (
                                     <button onClick={() => setFilterText('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600" title="Clear filter"><X size={18}/></button>
                                 )}
                             </div>
                        </div>

                        <div className="space-y-4">
                            {/* 1. Pending Despatch (Collapsed by default as requested) */}
                            <CollapsibleSection 
                                title="Pending Despatch" 
                                count={categorizedBatches.pending.length} 
                                icon={Clock} 
                                color="yellow"
                                defaultOpen={false}
                            >
                                {categorizedBatches.pending.length > 0 ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                        {categorizedBatches.pending.map(batch => <BatchRollsCard key={batch.batch_id} batch={batch} />)}
                                    </div>
                                ) : <Placeholder icon={Package} title="No Batches Pending" message="All assigned batches have started despatch." />}
                            </CollapsibleSection>

                            {/* 2. Partially Despatched (Collapsed) */}
                            <CollapsibleSection 
                                title="Partially Despatched" 
                                count={categorizedBatches.partial.length} 
                                icon={Truck} 
                                color="blue"
                                defaultOpen={false}
                            >
                                {categorizedBatches.partial.length > 0 ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                        {categorizedBatches.partial.map(batch => <BatchRollsCard key={batch.batch_id} batch={batch} />)}
                                    </div>
                                ) : <Placeholder icon={List} title="No Partial Batches" message="No batches currently have mixed roll statuses." />}
                            </CollapsibleSection>

                            {/* 3. Fully Despatched (Collapsed) */}
                            <CollapsibleSection 
                                title="Fully Despatched" 
                                count={categorizedBatches.despatched.length} 
                                icon={CheckCircle} 
                                color="green"
                                defaultOpen={false}
                            >
                                {categorizedBatches.despatched.length > 0 ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                        {categorizedBatches.despatched.map(batch => <BatchRollsCard key={batch.batch_id} batch={batch} />)}
                                    </div>
                                ) : <Placeholder icon={Archive} title="No Completed Batches" message="No batches have been fully despatched yet." />}
                            </CollapsibleSection>
                        </div>
                    </section>

                    <hr className="border-gray-200 my-8"/>

                    {/* Section for In Stock Rolls - GROUPED BY REFERENCE NUMBER */}
                    <section>
                        <h2 className="text-xl font-bold mb-6 flex items-center text-slate-700"><Package className="mr-3 text-gray-400"/>In Stock Fabric</h2>
                        
                        <div className="space-y-4">
                            {sortedRefNumbers.map(refNum => {
                                const rolls = groupedStock[refNum];
                                const totalMeters = rolls.reduce((acc, r) => acc + parseFloat(r.meter || 0), 0).toFixed(2);
                                
                                return (
                                    <CollapsibleSection 
                                        key={refNum}
                                        title={refNum}
                                        count={rolls.length}
                                        icon={Hash}
                                        color="indigo"
                                        defaultOpen={false}
                                    >
                                        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                                            <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center text-xs font-semibold text-indigo-800">
                                                <span>Total Quantity: {totalMeters} m</span>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="min-w-full text-sm text-left">
                                                    <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider text-xs">
                                                        <tr>
                                                            <th className="py-3 px-4 w-24">Roll ID</th>
                                                            <th className="py-3 px-4">Fabric Type</th>
                                                            <th className="py-3 px-4">Color</th>
                                                            <th className="py-3 px-4 text-right">Meters</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {rolls.map(item => (
                                                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                                                <td className="py-3 px-4 font-mono text-xs text-gray-600">R-{item.id}</td>
                                                                <td className="py-3 px-4 text-gray-800">{item.fabric_type}</td>
                                                                <td className="py-3 px-4 text-gray-800">{item.fabric_color} <span className="text-gray-400 text-xs ml-1">({item.color_number || '-'})</span></td>
                                                                <td className="py-3 px-4 text-right font-bold text-gray-700">{item.meter}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </CollapsibleSection>
                                );
                            })}
                            
                            {inStockRolls.length === 0 && (
                                <Placeholder icon={Layers} title="Empty Warehouse" message="No fabric rolls are currently in stock." />
                            )}
                        </div>
                    </section>
                </>
            )}

           {/* {isModalOpen && <Modal title="Record New Fabric Intake" onClose={() => setIsModalOpen(false)}><FabricIntakeForm onSave={handleSaveIntake} onClose={() => setIsModalOpen(false)} /></Modal>} */}
        </div>
    );
};

export default StoreManagerDashboardPage;