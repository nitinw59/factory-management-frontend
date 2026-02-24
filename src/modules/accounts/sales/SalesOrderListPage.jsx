import React, { useState, useEffect } from 'react';
import { productionManagerApi } from '../../../api/productionManagerApi'; 
import { storeManagerApi } from '../../../api/storeManagerApi';
import { accountingApi } from '../../../api/accountingApi'; 
import { 
    FileText, ShoppingCart, Truck, ChevronDown, ChevronRight, Package, Edit3, Eye, Layers, Loader2, X, Search, Filter, Box, Calendar, DollarSign, Info, Palette
} from 'lucide-react';
import Modal from '../../../shared/Modal';
import FabricIntakeForm from '../purchase/FabricIntakeForm'; 
import EditFabricRollModal from '../purchase/EditFabricRollModal';

// --- HELPER COMPONENT: Received Rolls List ---
const ReceivedRollsList = ({ purchaseOrderId }) => {
    const [rolls, setRolls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [meterFilter, setMeterFilter] = useState('');
    const [editingRoll, setEditingRoll] = useState(null);

    const fetchRolls = async () => {
        setLoading(true);
        try {
            const res = await storeManagerApi.getFabricRollsByPO(purchaseOrderId);
            setRolls(res.data);
        } catch (err) {
            console.error(err);
            setError("Failed to load rolls");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (purchaseOrderId) fetchRolls();
    }, [purchaseOrderId]);

    const handleUpdateRoll = async (updatedData) => {
        try {
            await storeManagerApi.updateFabricRoll(updatedData.id, { meter: updatedData.meter });
            fetchRolls(); 
        } catch (err) {
            alert("Failed to update roll.");
        }
    };

    const filteredRolls = rolls.filter(r => !meterFilter || r.meter.toString().includes(meterFilter));

    if (loading) return <div className="text-xs text-gray-500 p-2 flex items-center"><Loader2 className="animate-spin mr-2 h-3 w-3"/> Loading rolls...</div>;
    if (error) return <div className="text-xs text-red-500 p-2">{error}</div>;
    if (rolls.length === 0) return <div className="text-xs text-gray-400 p-2 italic">No rolls received yet.</div>;

    return (
        <div className="mt-3 bg-gray-50 rounded-md border border-gray-200 p-2 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center border-b border-gray-200 pb-2 mb-2">
                <h6 className="text-xs font-bold text-gray-500 uppercase flex items-center">
                    <Layers size={12} className="mr-1"/> Received Inventory ({filteredRolls.length}/{rolls.length})
                </h6>
                <div className="relative">
                    <Search className="absolute left-2 top-1.5 text-gray-400 w-3 h-3" />
                    <input 
                        type="number" 
                        placeholder="Filter by meters..." 
                        value={meterFilter}
                        onChange={(e) => setMeterFilter(e.target.value)}
                        className="pl-6 pr-2 py-1 text-xs border rounded w-32 focus:outline-none focus:border-blue-400"
                    />
                </div>
            </div>
            
            <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-xs text-left">
                    <thead>
                        <tr className="text-gray-400">
                            <th className="pb-1 font-medium w-16">Roll ID</th>
                            <th className="pb-1 font-medium">Fabric Details</th>
                            <th className="pb-1 font-medium text-right w-16">Meters</th>
                            <th className="pb-1 font-medium text-center w-12">Unit</th>
                            <th className="pb-1 font-medium text-center w-12">Status</th>
                            <th className="pb-1 font-medium text-center w-8"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredRolls.map(roll => (
                            <tr key={roll.id} className="hover:bg-gray-100 transition-colors">
                                <td className="py-1.5 font-mono text-indigo-600">R-{roll.id}</td>
                                <td className="py-1.5 text-gray-700">
                                    {roll.fabric_type} <span className="text-gray-400 mx-1">•</span> {roll.fabric_color}
                                </td>
                                <td className="py-1.5 text-right font-bold text-gray-800">{roll.meter}</td>
                                <td className="py-1.5 text-center text-gray-500">{roll.uom || 'm'}</td>
                                <td className="py-1.5 text-center">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        roll.status === 'IN_STOCK' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                    }`}>
                                        {roll.status === 'IN_STOCK' ? 'Stock' : 'Prod'}
                                    </span>
                                </td>
                                <td className="py-1.5 text-center">
                                    <button 
                                        onClick={() => setEditingRoll(roll)}
                                        className="text-gray-400 hover:text-blue-600 transition-colors" 
                                        title="Edit Roll"
                                        disabled={roll.status !== 'IN_STOCK'}
                                    >
                                        <Edit3 size={12} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filteredRolls.length === 0 && <tr><td colSpan="6" className="text-center py-2 text-gray-400">No matching rolls found.</td></tr>}
                    </tbody>
                </table>
            </div>
            {editingRoll && (
                <EditFabricRollModal 
                    roll={editingRoll} 
                    onSave={handleUpdateRoll} 
                    onClose={() => setEditingRoll(null)} 
                />
            )}
        </div>
    );
};

// --- COMPONENT: Sales Order Summary & Details Section ---
const SalesOrderExpandedDetails = ({ orderId }) => {
    const [details, setDetails] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await accountingApi.getSalesOrderDetails(orderId);
                setDetails(res.data);
            } catch (err) {
                console.error("Failed to load SO details", err);
            } finally {
                setLoading(false);
            }
        };
        if(orderId) load();
    }, [orderId]);

    if(loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin text-gray-400 w-5 h-5" /></div>;
    if(!details) return <div className="p-4 text-center text-red-500 text-sm">Failed to load details.</div>;

    return (
        <div className="mb-6 bg-white border border-blue-100 rounded-lg overflow-hidden shadow-sm">
            {/* Summary Header */}
            <div className="bg-blue-50/50 p-4 border-b border-blue-100 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                    <span className="block text-xs font-bold text-gray-400 uppercase mb-1">Customer Details</span>
                    <p className="font-semibold text-gray-800">{details.customer_name}</p>
                    <p className="text-xs text-gray-500">{details.customer_email || 'No email'}</p>
                </div>
                <div>
                    <span className="block text-xs font-bold text-gray-400 uppercase mb-1">Order Refs & Dates</span>
                    <p className="text-gray-700">
                        <span className="text-gray-400 text-xs mr-1">Buyer PO:</span> 
                        <span className="font-semibold text-indigo-700">{details.buyer_po_number || 'N/A'}</span>
                    </p>
                    <p className="text-gray-700"><span className="text-gray-400 text-xs mr-1">Ordered:</span> {new Date(details.order_date).toLocaleDateString()}</p>
                    {details.delivery_date && <p className="text-gray-700"><span className="text-gray-400 text-xs mr-1">Delivery:</span> {new Date(details.delivery_date).toLocaleDateString()}</p>}
                </div>
                <div>
                    <span className="block text-xs font-bold text-gray-400 uppercase mb-1">Financials</span>
                    <p className="font-bold text-emerald-700 flex items-center text-lg">
                        <DollarSign size={16} className="mr-0.5"/> {details.total_amount || '0.00'}
                    </p>
                </div>
                <div>
                    <span className="block text-xs font-bold text-gray-400 uppercase mb-1">Notes</span>
                    <p className="text-xs text-gray-500 italic line-clamp-2">{details.notes || 'No notes provided.'}</p>
                </div>
            </div>

            {/* Detailed Products Table */}
            <div className="p-0">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase flex items-center">
                    <Box size={14} className="mr-2"/> Order Items & Color Breakdown
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white text-gray-500 border-b border-gray-100">
                            <tr>
                                <th className="px-4 py-3 font-medium w-1/4">Product Style</th>
                                <th className="px-4 py-3 font-medium w-1/6">Fabric</th>
                                <th className="px-4 py-3 font-medium w-1/4">Size Breakdown</th>
                                <th className="px-4 py-3 font-medium">Color Details & Quantities</th>
                                <th className="px-4 py-3 font-medium text-right w-20">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {details.products.map((prod, idx) => {
                                const totalQty = prod.colors ? prod.colors.reduce((sum, c) => sum + parseInt(c.quantity || 0), 0) : 0;
                                return (
                                    <tr key={idx} className="hover:bg-gray-50/30 align-top">
                                        <td className="px-4 py-3">
                                            <p className="font-semibold text-gray-800">{prod.product_name}</p>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{prod.fabric_type}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1.5">
                                                {prod.size_breakdown && Object.entries(prod.size_breakdown).map(([size, ratio]) => (
                                                    <span key={size} className="text-[10px] bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded text-indigo-700 shadow-sm flex flex-col items-center min-w-[2rem]">
                                                        <span className="font-bold opacity-60 text-[8px] leading-tight">{size}</span>
                                                        <span className="font-extrabold leading-tight">{ratio}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-1.5">
                                                {prod.colors && prod.colors.length > 0 ? prod.colors.map((c, i) => (
                                                    <div key={i} className="text-xs bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-md flex justify-between items-center w-full max-w-[240px] shadow-sm">
                                                        <span className="text-slate-700 font-medium flex items-center">
                                                            <Palette size={12} className="text-slate-400 mr-1.5"/>
                                                            {c.color_name} <span className="text-slate-400 font-normal ml-1">({c.color_number})</span>
                                                        </span>
                                                        <span className="font-bold text-blue-700">{c.quantity} pcs</span>
                                                    </div>
                                                )) : <span className="text-xs text-gray-400 italic">No colors defined</span>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-extrabold text-gray-800 text-base">{totalQty}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENT: Purchase Order Details Modal ---
const PurchaseOrderDetailsModal = ({ poId, onClose }) => {
    const [po, setPo] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await accountingApi.getPurchaseOrderDetails(poId);
                setPo(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [poId]);

    if (loading) return (
        <Modal title="Loading PO..." onClose={onClose}>
            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-600"/></div>
        </Modal>
    );

    if (!po) return null;

    return (
        <Modal title={`Purchase Order: ${po.po_code || po.po_number}`} onClose={onClose}>
            <div className="space-y-6">
                {/* Header Info */}
                <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs text-amber-700 font-bold uppercase mb-1">Supplier</p>
                        <p className="font-bold text-gray-800">{po.supplier_name}</p>
                        <p className="text-xs text-gray-500">{po.supplier_email}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-amber-700 font-bold uppercase mb-1">Status</p>
                        <span className="px-2 py-1 bg-white text-amber-800 border border-amber-200 rounded text-xs font-bold">
                            {po.status}
                        </span>
                        <p className="text-xs text-gray-500 mt-2">Delivery: {po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString() : 'N/A'}</p>
                    </div>
                </div>

                {/* Items Table */}
                <div>
                    <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                        <Box size={16} className="mr-2"/> Ordered Items (Requirements)
                    </h4>
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 border-b">
                                <tr>
                                    <th className="px-4 py-2 font-medium">Fabric Type</th>
                                    <th className="px-4 py-2 font-medium">Color</th>
                                    <th className="px-4 py-2 font-medium text-right">Quantity</th>
                                    <th className="px-4 py-2 font-medium text-right">Unit Price</th>
                                    <th className="px-4 py-2 font-medium text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {po.items.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 font-medium text-gray-800">{item.fabric_type}</td>
                                        <td className="px-4 py-2 text-gray-600">{item.fabric_color} <span className="text-xs text-gray-400">({item.color_number})</span></td>
                                        <td className="px-4 py-2 text-right font-bold">{item.quantity} {item.uom}</td>
                                        <td className="px-4 py-2 text-right text-gray-500">${item.unit_price}</td>
                                        <td className="px-4 py-2 text-right text-gray-800">${item.total_price}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Received Rolls Summary */}
                <div>
                    <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center">
                        <Layers size={16} className="mr-2"/> Received Rolls
                    </h4>
                     <ReceivedRollsList purchaseOrderId={po.id} />
                </div>
            </div>
            <div className="flex justify-end pt-4 border-t mt-4">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md font-medium">Close</button>
            </div>
        </Modal>
    );
};

const SalesOrderListPage = () => {
    const [workflowData, setWorkflowData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedSO, setExpandedSO] = useState({});
    
    // Modal States
    const [intakeModalOpen, setIntakeModalOpen] = useState(false);
    const [poDetailsModalOpen, setPoDetailsModalOpen] = useState(false);
    
    const [selectedPO, setSelectedPO] = useState(null); 
    const [expandedPO, setExpandedPO] = useState({});
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await productionManagerApi.getWorkflowData();
            // Sort by order_date descending by default
            const sortedData = (res.data || []).sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
            setWorkflowData(sortedData);
            setFilteredData(sortedData);
        } catch (err) {
            console.error("Failed to load orders", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filter Logic
    useEffect(() => {
        if (!searchTerm) {
            setFilteredData(workflowData);
        } else {
            const lowerTerm = searchTerm.toLowerCase();
            const filtered = workflowData.filter(so => 
                so.order_number.toLowerCase().includes(lowerTerm) || 
                so.customer_name.toLowerCase().includes(lowerTerm) ||
                (so.buyer_po_number && so.buyer_po_number.toLowerCase().includes(lowerTerm))
            );
            setFilteredData(filtered);
        }
    }, [searchTerm, workflowData]);

    const toggleSO = (id) => {
        setExpandedSO(prev => ({ ...prev, [id]: !prev[id] }));
    };
    
    const togglePO = (id) => {
        setExpandedPO(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleReceiveFabricClick = (e, po) => {
        e.stopPropagation(); 
        setSelectedPO(po);
        setIntakeModalOpen(true);
    };

    const handleViewPODetails = (po) => {
        setSelectedPO(po);
        setPoDetailsModalOpen(true);
    };

    const handleIntakeSave = async (data) => {
        try {
            await storeManagerApi.createFabricIntake(data);
            setIntakeModalOpen(false);
            fetchData(); 
        } catch (err) {
            alert("Failed to save intake.");
        }
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-600" /></div>;

    return (
        <div className="p-6 bg-slate-50 min-h-screen font-inter text-slate-800">
            <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900">Sales & Purchase Orders</h1>
                    <p className="text-slate-500 mt-1">Manage orders and receive fabric against Purchase Orders.</p>
                </div>
                <div className="relative w-full md:w-64">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="text-slate-400" size={18}/>
                    </div>
                    <input 
                        type="text"
                        placeholder="Search SO, PO or Customer..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow focus:shadow-sm"
                    />
                </div>
            </header>

            <div className="space-y-4">
                {filteredData.map(so => (
                    <div key={so.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-shadow hover:shadow-md">
                        {/* Sales Order Header */}
                        <div 
                            onClick={() => toggleSO(so.id)}
                            className={`flex items-center justify-between p-4 cursor-pointer transition-colors select-none ${expandedSO[so.id] ? 'bg-slate-50 border-b border-slate-100' : 'hover:bg-slate-50'}`}
                        >
                            <div className="flex items-center gap-4">
                                <button className={`p-1 rounded hover:bg-slate-200 text-slate-500 transition-transform duration-300 ${expandedSO[so.id] ? 'rotate-180' : ''}`}>
                                    <ChevronDown size={20}/>
                                </button>
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800 flex items-center">
                                        <FileText size={18} className="mr-2 text-blue-600"/> 
                                        {so.order_number}
                                        {so.buyer_po_number && (
                                            <span className="ml-3 px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] rounded-md border border-slate-300 font-bold uppercase tracking-wider shadow-sm">
                                                Ref: {so.buyer_po_number}
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-sm text-slate-500">{so.customer_name}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right hidden md:block">
                                     <p className="text-xs text-slate-400">Date</p>
                                     <p className="text-sm font-medium text-slate-700">{new Date(so.order_date).toLocaleDateString()}</p>
                                </div>
                                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                    {so.status}
                                </span>
                            </div>
                        </div>

                        {/* Expanded Content */}
                        {expandedSO[so.id] && (
                            <div className="bg-white p-4 space-y-4 animate-in slide-in-from-top-1 fade-in duration-200">
                                
                                {/* 1. Sales Order Details Summary */}
                                <SalesOrderExpandedDetails orderId={so.id} />

                                {/* 2. Linked Purchase Orders */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1 flex items-center">
                                        <ShoppingCart size={14} className="mr-1.5"/> Linked Purchase Orders
                                    </h4>
                                    
                                    {so.purchase_orders && so.purchase_orders.length > 0 ? (
                                        <div className="space-y-3">
                                            {so.purchase_orders.map(po => (
                                                <div key={po.id} className="bg-white p-0 rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                                                    {/* PO Row Header */}
                                                    <div 
                                                        className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                                                        onClick={() => handleViewPODetails(po)}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg mt-1">
                                                                <Truck size={18}/>
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-slate-700 text-sm flex items-center hover:text-amber-700 transition-colors">
                                                                    {po.po_code || po.po_number}
                                                                    <span className="ml-2 text-[10px] text-slate-400 font-normal border px-1 rounded flex items-center bg-white"><Eye size={10} className="mr-1"/> Details</span>
                                                                </p>
                                                                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                                                                    {po.supplier_name}
                                                                </p>
                                                                <p className="text-xs text-slate-400 mt-1 truncate max-w-md">
                                                                    {po.material_summary || 'No material summary available'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex items-center gap-3 self-end md:self-center">
                                                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase ${
                                                                po.status === 'RECEIVED' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                                                            }`}>
                                                                {po.status}
                                                            </span>

                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); togglePO(po.id); }}
                                                                className={`flex items-center px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-100 transition-colors ${expandedPO[po.id] ? 'bg-slate-100' : 'bg-white'}`}
                                                            >
                                                                <Layers size={14} className="mr-1.5"/> {expandedPO[po.id] ? 'Hide Rolls' : 'View Rolls'}
                                                            </button>

                                                            <button 
                                                                onClick={(e) => handleReceiveFabricClick(e, po)}
                                                                className="flex items-center px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                                                            >
                                                                <Package size={14} className="mr-1.5"/> Receive
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Expanded Rolls List for this PO (Inline) */}
                                                    {expandedPO[po.id] && (
                                                        <div className="px-4 pb-4 bg-slate-50 border-t border-slate-100">
                                                            <ReceivedRollsList purchaseOrderId={po.id} />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center p-6 text-sm text-slate-400 italic border-2 border-dashed border-slate-100 rounded-lg bg-slate-50/50">
                                            No Purchase Orders linked to this Sales Order.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {filteredData.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-200 shadow-sm">
                        <p className="text-slate-400 text-lg font-medium">No sales orders found matching "{searchTerm}"</p>
                    </div>
                )}
            </div>

            {/* Modal for Fabric Intake */}
            {intakeModalOpen && selectedPO && (
                <Modal title={`Receive Fabric for ${selectedPO.po_code || selectedPO.po_number}`} onClose={() => setIntakeModalOpen(false)}>
                    <FabricIntakeForm 
                        onSave={handleIntakeSave} 
                        onClose={() => setIntakeModalOpen(false)}
                        purchaseOrder={selectedPO} 
                    />
                </Modal>
            )}

            {/* Modal for PO Details */}
            {poDetailsModalOpen && selectedPO && (
                <PurchaseOrderDetailsModal poId={selectedPO.id} onClose={() => setPoDetailsModalOpen(false)} />
            )}
        </div>
    );
};

export default SalesOrderListPage;