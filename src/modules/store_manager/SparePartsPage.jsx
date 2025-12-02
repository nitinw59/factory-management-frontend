







import React, { useState, useEffect, useMemo } from 'react';
import { 
    Package, Search, Plus, AlertTriangle, DollarSign, 
    Filter, ShoppingCart, ArrowUpRight, X, Loader2 
} from 'lucide-react';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /></div>;

const Modal = ({ title, onClose, children }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 text-lg">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6">{children}</div>
        </div>
    </div>
);

// --- SUB-COMPONENT: Create Part Form ---
const CreatePartForm = ({ categories, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        name: '', part_number: '', category_id: '', 
        location: '', min_stock_threshold: 5, 
        current_stock: 0, unit_cost: 0
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onSave(formData);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Part Name</label>
                <input required type="text" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Sewing Needle Size 11" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Part Number (SKU)</label>
                    <input required type="text" className="w-full p-2 border rounded-lg" value={formData.part_number} onChange={e => setFormData({...formData, part_number: e.target.value})} placeholder="e.g. SN-11" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select required className="w-full p-2 border rounded-lg bg-white" value={formData.category_id} onChange={e => setFormData({...formData, category_id: e.target.value})}>
                        <option value="">Select...</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location / Shelf</label>
                <input type="text" className="w-full p-2 border rounded-lg" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="e.g. Aisle 3, Bin B" />
            </div>
            <div className="grid grid-cols-3 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Min Limit</label>
                    <input type="number" className="w-full p-1 border rounded text-sm" value={formData.min_stock_threshold} onChange={e => setFormData({...formData, min_stock_threshold: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Opening Stock</label>
                    <input type="number" className="w-full p-1 border rounded text-sm" value={formData.current_stock} onChange={e => setFormData({...formData, current_stock: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Unit Cost</label>
                    <input type="number" step="0.01" className="w-full p-1 border rounded text-sm" value={formData.unit_cost} onChange={e => setFormData({...formData, unit_cost: e.target.value})} />
                </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-70">
                    {isSubmitting ? 'Saving...' : 'Create Part'}
                </button>
            </div>
        </form>
    );
};

// --- SUB-COMPONENT: Restock Form ---
const RestockForm = ({ part, onSave, onCancel }) => {
    const [qty, setQty] = useState('');
    const [newCost, setNewCost] = useState(part.unit_cost);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Calculate projected stats
    const projectedQty = parseInt(part.current_stock) + (parseInt(qty) || 0);
    const projectedCost = useMemo(() => {
        const q = parseInt(qty) || 0;
        const c = parseFloat(newCost) || 0;
        if (q <= 0) return part.unit_cost;
        // Weighted Average Formula
        const totalValue = (part.current_stock * part.unit_cost) + (q * c);
        return (totalValue / projectedQty).toFixed(2);
    }, [qty, newCost, part.current_stock, part.unit_cost, projectedQty]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onSave({ spare_id: part.id, qty: parseInt(qty), new_unit_cost: parseFloat(newCost) });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-center justify-between">
                <div>
                    <p className="text-xs font-bold text-blue-500 uppercase">Current Stock</p>
                    <p className="text-xl font-bold text-blue-900">{part.current_stock} <span className="text-sm font-normal text-blue-700">units</span></p>
                </div>
                <div className="text-right">
                    <p className="text-xs font-bold text-blue-500 uppercase">Avg Cost</p>
                    <p className="text-xl font-bold text-blue-900">${parseFloat(part.unit_cost).toFixed(2)}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Qty Received</label>
                    <input 
                        type="number" min="1" required autoFocus
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-green-500 font-mono text-lg" 
                        value={qty} onChange={e => setQty(e.target.value)} 
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Unit Price ($)</label>
                    <input 
                        type="number" step="0.01" required
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-green-500 font-mono text-lg" 
                        value={newCost} onChange={e => setNewCost(e.target.value)} 
                    />
                </div>
            </div>

            {/* Projection / Preview */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                <span className="text-gray-600">Projected New Avg Cost:</span>
                <span className="font-bold text-gray-800 flex items-center">
                    ${projectedCost} 
                    {parseFloat(projectedCost) !== parseFloat(part.unit_cost) && (
                        <ArrowUpRight size={14} className="ml-1 text-gray-400"/>
                    )}
                </span>
            </div>

            <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={isSubmitting || !qty} className="px-4 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm disabled:opacity-70">
                    {isSubmitting ? 'Updating...' : 'Confirm Purchase'}
                </button>
            </div>
        </form>
    );
};


// --- MAIN PAGE COMPONENT ---
const SparePartsPage = () => {
    const [spares, setSpares] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    
    // Modal States
    const [activeModal, setActiveModal] = useState(null); // 'create', 'restock'
    const [selectedPart, setSelectedPart] = useState(null);

    // Load Data
    const fetchData = async () => {
        setLoading(true);
        try {
            const [sparesData, catsData] = await Promise.all([
                sparesApi.getAllSpares(),
                sparesApi.getCategories()
            ]);
            setSpares(sparesData || []);
            setCategories(catsData || []);
        } catch (error) {
            console.error("Failed to load inventory", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Handlers
    const handleCreate = async (data) => {
        await sparesApi.createSparePart(data);
        // In a real app, you'd re-fetch or update local state. Mocking update:
        fetchData();
        setActiveModal(null);
    };

    const handleRestock = async (data) => {
        await sparesApi.restockSparePart(data);
        fetchData();
        setActiveModal(null);
    };

    // Filtering
    const filteredSpares = useMemo(() => {
        return spares.filter(s => {
            const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                s.part_number.toLowerCase().includes(searchTerm.toLowerCase());
            const matchCat = filterCategory ? s.category_id === parseInt(filterCategory) : true;
            return matchSearch && matchCat;
        });
    }, [spares, searchTerm, filterCategory]);

    return (
        <div className="min-h-screen bg-gray-100 p-6 font-inter text-gray-900">
            <div className="max-w-6xl mx-auto">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-gray-800 flex items-center">
                            <Package className="mr-3 text-indigo-600"/> Parts Inventory
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">Manage spare parts, stock levels, and purchases.</p>
                    </div>
                    <button 
                        onClick={() => setActiveModal('create')}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg shadow-md font-bold flex items-center transition-all"
                    >
                        <Plus size={18} className="mr-2"/> Add New Part
                    </button>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-4">
                    <div className="relative flex-grow">
                        <Search className="absolute left-3 top-2.5 text-gray-400 w-5 h-5"/>
                        <input 
                            type="text" 
                            placeholder="Search by Name or SKU..." 
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="relative md:w-64">
                        <Filter className="absolute left-3 top-2.5 text-gray-400 w-5 h-5"/>
                        <select 
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white appearance-none"
                            value={filterCategory}
                            onChange={e => setFilterCategory(e.target.value)}
                        >
                            <option value="">All Categories</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>

                {/* Inventory Table */}
                {loading ? <Spinner /> : (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 font-semibold text-gray-700">Part Details</th>
                                    <th className="px-6 py-3 font-semibold text-gray-700 hidden sm:table-cell">Location</th>
                                    <th className="px-6 py-3 font-semibold text-gray-700 text-right">Stock Level</th>
                                    <th className="px-6 py-3 font-semibold text-gray-700 text-right">Value</th>
                                    <th className="px-6 py-3 font-semibold text-gray-700 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredSpares.length === 0 && (
                                    <tr><td colSpan="5" className="p-8 text-center text-gray-400 italic">No parts found matching your search.</td></tr>
                                )}
                                {filteredSpares.map(part => {
                                    const isLowStock = part.current_stock <= part.min_stock_threshold;
                                    return (
                                        <tr key={part.id} className={`group hover:bg-gray-50 transition-colors ${isLowStock ? 'bg-red-50/30' : ''}`}>
                                            <td className="px-6 py-3">
                                                <div className="font-bold text-gray-900">{part.name}</div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{part.part_number}</span>
                                                    <span className="text-xs text-gray-500">{part.category_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 hidden sm:table-cell text-gray-600">
                                                {part.location || '-'}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <div className={`font-bold text-lg ${isLowStock ? 'text-red-600' : 'text-gray-800'}`}>
                                                    {part.current_stock}
                                                </div>
                                                {isLowStock && <span className="text-[10px] font-bold text-red-500 uppercase flex items-center justify-end"><AlertTriangle size={10} className="mr-1"/> Low Stock</span>}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <div className="font-medium text-gray-900">${parseFloat(part.unit_cost).toFixed(2)}</div>
                                                <div className="text-xs text-gray-400">per unit</div>
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <button 
                                                    onClick={() => { setSelectedPart(part); setActiveModal('restock'); }}
                                                    className="bg-white border border-gray-300 text-gray-700 hover:bg-green-50 hover:text-green-700 hover:border-green-200 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center justify-center mx-auto"
                                                >
                                                    <ShoppingCart size={14} className="mr-1.5"/> Purchase
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODALS */}
            {activeModal === 'create' && (
                <Modal title="Add New Spare Part" onClose={() => setActiveModal(null)}>
                    <CreatePartForm categories={categories} onSave={handleCreate} onCancel={() => setActiveModal(null)} />
                </Modal>
            )}

            {activeModal === 'restock' && selectedPart && (
                <Modal title={`Restock: ${selectedPart.name}`} onClose={() => setActiveModal(null)}>
                    <RestockForm part={selectedPart} onSave={handleRestock} onCancel={() => setActiveModal(null)} />
                </Modal>
            )}
        </div>
    );
};

export default SparePartsPage;