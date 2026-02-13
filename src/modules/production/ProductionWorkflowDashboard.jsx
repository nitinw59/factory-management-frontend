import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Search, Filter, Plus, Box, FileText, ShoppingCart, 
    Scissors, ChevronRight, Printer, Clock, AlertCircle, 
    ZoomIn, ZoomOut, Maximize, Loader2, X, User, Calendar, Trash2, Layers
} from 'lucide-react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { accountingApi } from '../../api/accountingApi'; 
import { storeManagerApi } from '../../api/storeManagerApi'; 
import Modal from '../../shared/Modal';
import { useAuth } from '../../context/AuthContext';
import jsPDF from 'jspdf'; // Import jsPDF
import autoTable from 'jspdf-autotable'; // Import autoTable

const Spinner = () => <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;

// --- CONSTANTS & STYLES ---
const NODE_WIDTH = 280;
const NODE_HEIGHT = 160; 
const GAP_X = 120;
const GAP_Y = 50;
const VIEWPORT_BUFFER = 400; // Pixel buffer to render outside viewport (prevents pop-in)

// ... (Keep StatusBadge component same) ...
const StatusBadge = ({ status }) => {
    const colors = {
        'CONFIRMED': 'bg-blue-100 text-blue-700 border-blue-200',
        'RECEIVED': 'bg-green-100 text-green-700 border-green-200',
        'COMPLETED': 'bg-emerald-100 text-emerald-700 border-emerald-200',
        'IN_PROGRESS': 'bg-indigo-100 text-indigo-700 border-indigo-200',
        'ISSUED': 'bg-amber-100 text-amber-700 border-amber-200',
        'DRAFT': 'bg-gray-100 text-gray-600 border-gray-200',
        'PENDING': 'bg-yellow-50 text-yellow-700 border-yellow-200'
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${colors[status] || 'bg-gray-100 text-gray-500'}`}>
            {status ? status.replace('_', ' ') : 'N/A'}
        </span>
    );
};

// ... (Keep Connector component same) ...
const Connector = ({ start, end }) => {
    const p1 = { x: start.x, y: start.y };
    const p2 = { x: end.x, y: end.y };
    const dist = Math.abs(p2.x - p1.x);
    const controlPointOffset = dist * 0.5;
    const c1 = { x: p1.x + controlPointOffset, y: p1.y };
    const c2 = { x: p2.x - controlPointOffset, y: p2.y };
    const path = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
    return <path d={path} fill="none" stroke="#cbd5e1" strokeWidth="2" />;
};

// --- NODES (Identical to previous, just ensuring they are defined) ---
const SalesOrderNode = ({ data, x, y, onDetails, onAddPO }) => (
    <div 
        className="absolute bg-white rounded-xl shadow-sm border border-l-4 border-l-blue-500 border-slate-200 p-4 hover:shadow-md transition-all cursor-pointer group"
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT, left: x, top: y }}
        onClick={() => onDetails(data.id)} 
    >
        <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-lg">
                    <FileText className="text-blue-600" size={16} />
                </div>
                <span className="font-bold text-slate-700 text-sm">{data.order_number}</span>
            </div>
            <StatusBadge status={data.status} />
        </div>
        <p className="text-sm text-slate-800 font-semibold truncate" title={data.customer_name}>{data.customer_name}</p>
        <p className="text-xs text-slate-400 mt-1">Date: {new Date(data.order_date).toLocaleDateString()}</p>
        
        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
                onClick={(e) => { e.stopPropagation(); onAddPO(data.id); }} 
                className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
            >
                <Plus size={12} /> Add PO
            </button>
        </div>
    </div>
);

const PurchaseOrderNode = ({ data, x, y, onDetails, onCreateBatch }) => {
    const { user } = useAuth();
    const ordered = parseFloat(data.total_ordered_qty || 0);
    const received = parseFloat(data.total_received_qty || 0);
    const percent = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;
    
    // Check user permissions
   const canPlanBatch = user && ['production_manager', 'factory_admin','cutting_manager'].includes(user.role);
    console.log('User r ole:', user, 'Can plan batch:', canPlanBatch);
    let progressColor = 'bg-amber-500';
    if (percent >= 100) progressColor = 'bg-green-500';
    else if (percent > 0) progressColor = 'bg-blue-500';

    return (
        <div 
            className="absolute bg-white rounded-xl shadow-sm border border-l-4 border-l-amber-500 border-slate-200 p-4 hover:shadow-md transition-all cursor-pointer group"
            style={{ width: NODE_WIDTH, height: NODE_HEIGHT, left: x, top: y }}
            onClick={() => onDetails(data.id)} 
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-amber-50 rounded-lg">
                        <ShoppingCart className="text-amber-600" size={16} />
                    </div>
                    <span className="font-bold text-slate-700 text-sm">{data.po_code || data.po_number}</span>
                </div>
                <StatusBadge status={data.status} />
            </div>
            <p className="text-sm text-slate-800 font-medium truncate">{data.supplier_name}</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">Delivery: {data.expected_delivery_date ? new Date(data.expected_delivery_date).toLocaleDateString() : 'N/A'}</p>

            <div className="mt-3">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                    <span>Recv: {received} / {ordered}</span>
                    <span className="font-bold">{percent}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${progressColor}`} style={{ width: `${percent}%` }}></div>
                </div>
            </div>

            {canPlanBatch && (
                <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onCreateBatch(data.id); }}
                        className="flex items-center gap-1 text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 font-medium shadow-sm transition-colors"
                    >
                        <Plus size={12} /> Plan Batch
                    </button>
                </div>
            )}
        </div>
    );
};

const BatchNode = ({ data, x, y, onViewDetails }) => (
    <div 
        className="absolute bg-white rounded-xl shadow-sm border border-l-4 border-l-emerald-500 border-slate-200 p-4 hover:shadow-md transition-all cursor-default"
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT, left: x, top: y }}
    >
        <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-50 rounded-lg">
                    <Scissors className="text-emerald-600" size={16} />
                </div>
                <span className="font-bold text-slate-700 text-sm">{data.batch_code}</span>
            </div>
            <StatusBadge status={data.overall_status || 'PENDING'} />
        </div>
        
        <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{data.product_name}</span>
                <span>{data.overall_status === 'COMPLETED' ? '100%' : 'In Progress'}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${data.overall_status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: data.overall_status === 'COMPLETED' ? '100%' : '40%' }}></div>
            </div>
        </div>

        <div className="mt-4 flex justify-end">
            <button 
                onClick={() => onViewDetails(data.id)}
                className="text-xs text-slate-500 hover:text-indigo-600 flex items-center font-medium transition-colors"
            >
                View Details <ChevronRight size={14} className="ml-0.5" />
            </button>
        </div>
    </div>
);


// --- MODALS (Sales Order & PO) ---

const SalesOrderDetailsModal = ({ orderId, onClose }) => {
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        accountingApi.getSalesOrderDetails(orderId)
            .then(res => setOrder(res.data))
            .catch(err => console.error(err))
            .finally(() => setIsLoading(false));
    }, [orderId]);

    if (isLoading) return <Modal title="Loading..." onClose={onClose}><div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-600"/></div></Modal>;
    if (!order) return null;

    return (
        <Modal title={`Sales Order: ${order.order_number}`} onClose={onClose}>
             <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <div>
                        <p className="text-xs font-bold text-blue-500 uppercase mb-1">Customer</p>
                        <p className="font-semibold text-gray-800">{order.customer_name}</p>
                        <p className="text-sm text-gray-600">{order.customer_email}</p>
                    </div>
                    <div className="text-right">
                         <p className="text-xs font-bold text-blue-500 uppercase mb-1">Status</p>
                         <StatusBadge status={order.status} />
                         <p className="text-xs text-gray-500 mt-2">Date: {new Date(order.order_date).toLocaleDateString()}</p>
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-gray-700 mb-3 flex items-center"><Box size={16} className="mr-2"/> Ordered Products</h3>
                    <div className="space-y-4">
                        {order.products.map((prod, idx) => (
                            <div key={idx} className="border rounded-lg overflow-hidden">
                                <div className="bg-gray-100 px-4 py-2 flex justify-between items-center">
                                    <span className="font-bold text-sm text-gray-800">{prod.product_name}</span>
                                    <span className="text-xs text-gray-500">{prod.fabric_type}</span>
                                </div>
                                <div className="p-3">
                                    <div className="flex gap-2 mb-2">
                                         {prod.size_breakdown && Object.entries(prod.size_breakdown).map(([size, ratio]) => (
                                             <span key={size} className="text-xs bg-gray-50 px-2 py-0.5 rounded border">
                                                 {size}: {ratio}
                                             </span>
                                         ))}
                                    </div>
                                    <table className="w-full text-xs text-left">
                                        <thead>
                                            <tr className="text-gray-400 border-b">
                                                <th className="pb-1 font-medium">Color</th>
                                                <th className="pb-1 font-medium text-right">Quantity</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-gray-700">
                                            {prod.colors.map((c, i) => (
                                                <tr key={i}>
                                                    <td className="py-1">{c.color_name} ({c.color_number})</td>
                                                    <td className="py-1 text-right font-bold">{c.quantity}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

// --- HELPER: Received Rolls List (Reused for PO Details) ---
const ReceivedRollsList = ({ purchaseOrderId }) => {
    const [rolls, setRolls] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRolls = async () => {
            setLoading(true);
            try {
                const res = await storeManagerApi.getFabricRollsByPO(purchaseOrderId);
                setRolls(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        if (purchaseOrderId) fetchRolls();
    }, [purchaseOrderId]);

    if (loading) return <div className="text-xs text-gray-500 p-2">Loading rolls...</div>;
    if (rolls.length === 0) return <div className="text-xs text-gray-400 p-2 italic">No rolls received yet.</div>;

    return (
        <div className="mt-3 bg-gray-50 rounded-md border border-gray-200 p-2">
            <h6 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center">
                <Layers size={12} className="mr-1"/> Received Inventory ({rolls.length})
            </h6>
            <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-xs text-left">
                    <thead>
                        <tr className="text-gray-400 border-b border-gray-200">
                            <th className="pb-1 font-medium w-16">Roll ID</th>
                            <th className="pb-1 font-medium">Fabric</th>
                            <th className="pb-1 font-medium text-right w-16">Meters</th>
                            <th className="pb-1 font-medium text-center w-12">Unit</th>
                            <th className="pb-1 font-medium text-center w-12">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rolls.map(roll => (
                            <tr key={roll.id}>
                                <td className="py-1.5 font-mono text-indigo-600">R-{roll.id}</td>
                                <td className="py-1.5 text-gray-700">
                                    {roll.fabric_type} <span className="text-gray-400">•</span> {roll.fabric_color}
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
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const PurchaseOrderDetailsModal = ({ poId, onClose }) => {
    const [po, setPo] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await accountingApi.getPurchaseOrderDetails(poId);
                setPo(res.data);
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        load();
    }, [poId]);
    
    // --- PDF Generation Logic ---
    const handleGeneratePDF = () => {
        if (!po) return;
        const doc = new jsPDF();

        // Header
        doc.setFontSize(18);
        doc.text("Purchase Order", 14, 20);
        doc.setFontSize(10);
        doc.text(`PO Number: ${po.po_code || po.po_number}`, 14, 28);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 33);
        
        // Supplier Details
        doc.setFontSize(12);
        doc.text("Supplier Details:", 14, 45);
        doc.setFontSize(10);
        doc.text(`Name: ${po.supplier_name}`, 14, 52);
        doc.text(`Email: ${po.supplier_email || 'N/A'}`, 14, 57);

        // Items Table
        const tableColumn = ["Fabric Type", "Color", "Qty", "Unit", "Unit Price", "Total"];
        const tableRows = [];

        po.items.forEach(item => {
            const itemData = [
                item.fabric_type,
                `${item.fabric_color} (${item.color_number})`,
                item.quantity,
                item.uom,
                `$${item.unit_price || 0}`,
                `$${item.total_price || 0}`
            ];
            tableRows.push(itemData);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 65,
        });

        // Grand Total (Calculate if not available in header or just sum items)
        const grandTotal = po.items.reduce((sum, item) => sum + parseFloat(item.total_price || 0), 0);
        
        doc.text(`Grand Total: $${grandTotal.toFixed(2)}`, 14, doc.lastAutoTable.finalY + 10);
        
        doc.save(`PO_${po.po_code || po.po_number}.pdf`);
    };

    if (loading) return <Modal title="Loading PO..." onClose={onClose}><div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-600"/></div></Modal>;
    if (!po) return null;

    return (
        <Modal title={`Purchase Order: ${po.po_code || po.po_number}`} onClose={onClose}>
            <div className="space-y-6">
                <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs text-amber-700 font-bold uppercase mb-1">Supplier</p>
                        <p className="font-bold text-gray-800">{po.supplier_name}</p>
                        <p className="text-xs text-gray-500">{po.supplier_email}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-amber-700 font-bold uppercase mb-1">Status</p>
                        <StatusBadge status={po.status} />
                        <p className="text-xs text-gray-500 mt-2">Delivery: {po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString() : 'N/A'}</p>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="text-sm font-bold text-gray-700 flex items-center">
                            <Box size={16} className="mr-2"/> Ordered Items (Requirements)
                        </h4>
                        {/* ✅ NEW: Print Button */}
                        <button 
                            onClick={handleGeneratePDF}
                            className="flex items-center text-xs bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 shadow-sm transition-colors"
                        >
                            <Printer size={14} className="mr-1.5"/> Print PO
                        </button>
                    </div>
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

                <div>
                    <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center"><Layers size={16} className="mr-2"/> Received Rolls</h4>
                     <ReceivedRollsList purchaseOrderId={po.id} />
                </div>
                
                <div className="flex justify-end pt-4 border-t">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md font-medium">Close</button>
                </div>
            </div>
        </Modal>
    );
};

// CreatePOModal remains the same (just simplified for brevity here)
const CreatePOModal = ({ salesOrderId, onClose, onSave }) => {
    // ... (Keep existing implementation from previous step, ensure imports are correct) ...
    const [suppliers, setSuppliers] = useState([]);
    const [fabricTypes, setFabricTypes] = useState([]);
    const [fabricColors, setFabricColors] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [supplierId, setSupplierId] = useState('');
    const [expectedDate, setExpectedDate] = useState('');
    const [items, setItems] = useState([]);

    useEffect(() => {
        const load = async () => {
            try {
                // Reuse existing endpoints to fetch dropdowns
                const formDataRes = await storeManagerApi.getFabricIntakeFormData();
                if (formDataRes.data) {
                    setSuppliers(formDataRes.data.suppliers || []);
                    setFabricTypes(formDataRes.data.fabricTypes || []);
                    setFabricColors(formDataRes.data.fabricColors || []);
                }
                setItems([{ fabric_type_id: '', fabric_color_id: '', quantity: '', unit_price: '', uom: 'meter' }]);
            } catch (err) { console.error(err); } finally { setIsLoading(false); }
        };
        load();
    }, []);

    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
        setItems(newItems);
    };

    const addItem = () => setItems([...items, { fabric_type_id: '', fabric_color_id: '', quantity: '', unit_price: '', uom: 'meter' }]);
    const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);
        onSave({ sales_order_id: salesOrderId, supplier_id: supplierId, expected_delivery_date: expectedDate, items });
        // NOTE: Parent handles saving state reset or modal close
    };

    if (isLoading) return <Modal title="Loading..." onClose={onClose}><Spinner/></Modal>;

    return (
        <Modal title="New Purchase Order" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Supplier</label>
                        <select required className="w-full p-2 border rounded" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                            <option value="">Select Supplier</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Expected Delivery</label>
                        <input type="date" className="w-full p-2 border rounded" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
                    </div>
                </div>
                 <div className="border-t pt-4">
                    <label className="block text-sm font-bold text-gray-800 mb-2">Fabric Requirements</label>
                    {items.map((item, idx) => (
                        <div key={idx} className="flex gap-2 mb-2 items-center">
                            <select className="p-2 border rounded w-1/3 text-sm" value={item.fabric_type_id} onChange={e => handleItemChange(idx, 'fabric_type_id', e.target.value)} required>
                                <option value="">Type</option>
                                {fabricTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <select className="p-2 border rounded w-1/3 text-sm" value={item.fabric_color_id} onChange={e => handleItemChange(idx, 'fabric_color_id', e.target.value)}>
                                <option value="">Color</option>
                                {fabricColors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <input 
                                type="number" placeholder="Qty" className="p-2 border rounded w-16 text-sm" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', e.target.value)} 
                                onWheel={e => e.target.blur()} required 
                            />
                            <select className="p-2 border rounded w-16 text-sm" value={item.uom} onChange={e => handleItemChange(idx, 'uom', e.target.value)}>
                                <option value="meter">m</option><option value="yard">yd</option><option value="kg">kg</option>
                            </select>
                            <input 
                                type="number" placeholder="$" className="p-2 border rounded w-16 text-sm" value={item.unit_price} onChange={e => handleItemChange(idx, 'unit_price', e.target.value)} 
                                onWheel={e => e.target.blur()}
                            />
                            <button type="button" onClick={() => removeItem(idx)} className="text-red-500"><Trash2 size={16}/></button>
                        </div>
                    ))}
                    <button type="button" onClick={addItem} className="text-sm text-indigo-600 font-medium">+ Add Item</button>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 border rounded">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-6 py-2 bg-amber-600 text-white font-bold rounded flex items-center">
                        {isSaving && <Loader2 className="animate-spin mr-2 h-4 w-4"/>} Create PO
                    </button>
                </div>
            </form>
        </Modal>
    );
};


// --- MAIN DASHBOARD COMPONENT ---
const ProductionWorkflowDashboard = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [zoom, setZoom] = useState(1);
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [searchText, setSearchText] = useState(''); 

    // Scroll Virtualization State
    const containerRef = useRef(null);
    const [viewport, setViewport] = useState({ top: 0, left: 0, width: 0, height: 0 });

    // Modal States
    const [selectedSOId, setSelectedSOId] = useState(null); 
    const [poModalSOId, setPoModalSOId] = useState(null);  
    const [selectedPOId, setSelectedPOId] = useState(null); 

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await productionManagerApi.getWorkflowData(); 
            setData(res.data);
        } catch (err) {
            console.error("Failed to fetch workflow data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // --- Action Handlers ---
    const handleAddPO = (salesOrderId) => setPoModalSOId(salesOrderId);
    const handleViewPODetails = (poId) => setSelectedPOId(poId); 
    
    const handleCreatePOSubmit = async (formData) => {
        try {
            await accountingApi.createPurchaseOrder(formData);
            setPoModalSOId(null);
            fetchData();
        } catch (err) { alert("Failed to create Purchase Order."); }
    };

    const handleCreateBatch = (purchaseOrderId) => {
         navigate(`/initialization-portal/batches/new?poId=${purchaseOrderId}`);
    };

    const handleViewBatchDetails = (batchId) => {
        navigate(`/initialization-portal/batch-details/${batchId}`); // Pointing to initialization portal route as discussed
    };

    // --- Layout Calculation ---
    const filteredData = useMemo(() => {
        let result = data;
        if (filterStatus !== 'ALL') {
            result = result.filter(so => so.status === filterStatus);
        }
        if (searchText) {
            const lowerText = searchText.toLowerCase();
            result = result.filter(so => 
                so.order_number.toLowerCase().includes(lowerText) ||
                so.customer_name.toLowerCase().includes(lowerText)
            );
        }
        return result;
    }, [data, filterStatus, searchText]);

    const layout = useMemo(() => {
        const nodes = [];
        const connectors = [];
        let currentY = 60;
        const startX = 60;

        filteredData.forEach(so => {
            const soY = currentY;
            const soX = startX;
            const poNodes = [];
            let poY = soY;
            const poX = soX + NODE_WIDTH + GAP_X;
            const purchaseOrders = so.purchase_orders || [];

            if (purchaseOrders.length === 0) {
                 nodes.push({ type: 'SALES_ORDER', data: so, x: soX, y: soY });
                 currentY += NODE_HEIGHT + GAP_Y;
                 return;
            }

            purchaseOrders.forEach(po => {
                let batchY = poY;
                const batchX = poX + NODE_WIDTH + GAP_X;
                const batches = po.production_batches || [];
                const localBatchNodes = [];

                if (batches.length === 0) {
                     localBatchNodes.push({ x: batchX, y: batchY }); 
                } else {
                    batches.forEach(batch => {
                        nodes.push({ type: 'BATCH', data: batch, x: batchX, y: batchY });
                        localBatchNodes.push({ x: batchX, y: batchY });
                        connectors.push({ 
                            start: { x: poX + NODE_WIDTH, y: poY + (NODE_HEIGHT/2) }, 
                            end: { x: batchX, y: batchY + (NODE_HEIGHT/2) } 
                        });
                        batchY += NODE_HEIGHT + GAP_Y;
                    });
                }
                
                const poCenterY = localBatchNodes.length > 0 
                    ? (localBatchNodes[0].y + localBatchNodes[localBatchNodes.length-1].y) / 2 
                    : poY;

                nodes.push({ type: 'PURCHASE_ORDER', data: po, x: poX, y: poCenterY });
                poNodes.push({ x: poX, y: poCenterY });
                connectors.push({ 
                    start: { x: soX + NODE_WIDTH, y: soY + (NODE_HEIGHT/2) }, 
                    end: { x: poX, y: poCenterY + (NODE_HEIGHT/2) } 
                });
                poY = Math.max(batchY, poY + NODE_HEIGHT + GAP_Y);
            });

            const soCenterY = poNodes.length > 0
                ? (poNodes[0].y + poNodes[poNodes.length-1].y) / 2
                : soY;
            
            nodes.push({ type: 'SALES_ORDER', data: so, x: soX, y: soCenterY });
            currentY = poY + GAP_Y; 
        });

        return { nodes, connectors, height: currentY };
    }, [filteredData]);

    // --- Virtualization Logic ---
    
    // 1. Handle Scroll
    const handleScroll = useCallback(() => {
        if (containerRef.current) {
            setViewport({
                top: containerRef.current.scrollTop,
                left: containerRef.current.scrollLeft,
                width: containerRef.current.clientWidth,
                height: containerRef.current.clientHeight
            });
        }
    }, []);

    // 2. Initial Measure
    useEffect(() => {
        if (containerRef.current) handleScroll();
        window.addEventListener('resize', handleScroll);
        return () => window.removeEventListener('resize', handleScroll);
    }, [handleScroll]);

    // 3. Filter Visible Items
    const visibleItems = useMemo(() => {
        // If viewport isn't set yet (initial load), render everything or nothing? 
        // Rendering nothing prevents jump. Rendering everything might be slow. 
        // Let's render everything if viewport is 0 (safe fallback) or handle via loading state.
        if (viewport.width === 0) return { nodes: layout.nodes, connectors: layout.connectors };

        const vTop = viewport.top / zoom;
        const vLeft = viewport.left / zoom;
        const vBottom = (viewport.top + viewport.height) / zoom;
        const vRight = (viewport.left + viewport.width) / zoom;
        
        const buffer = VIEWPORT_BUFFER;

        const visibleNodes = layout.nodes.filter(node => {
            const nTop = node.y;
            const nBottom = node.y + NODE_HEIGHT;
            const nLeft = node.x;
            const nRight = node.x + NODE_WIDTH;

            return (
                nBottom >= vTop - buffer &&
                nTop <= vBottom + buffer &&
                nRight >= vLeft - buffer &&
                nLeft <= vRight + buffer
            );
        });

        // Simple Connector Logic: If start OR end node is visible, show connector
        // Optimisation: Map node ID/Coordinates to visibility for O(1) lookup could be done but iterating layout.connectors is O(N) which is fine for <5000 lines
        // A better approach for connectors: Check bounding box of the line
        const visibleConnectors = layout.connectors.filter(conn => {
            const minX = Math.min(conn.start.x, conn.end.x);
            const maxX = Math.max(conn.start.x, conn.end.x);
            const minY = Math.min(conn.start.y, conn.end.y);
            const maxY = Math.max(conn.start.y, conn.end.y);

             return (
                maxY >= vTop - buffer &&
                minY <= vBottom + buffer &&
                maxX >= vLeft - buffer &&
                minX <= vRight + buffer
            );
        });

        return { nodes: visibleNodes, connectors: visibleConnectors };
    }, [layout, viewport, zoom]);


    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden font-inter">
            {/* Sidebar / Filter Panel */}
            <div className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col z-10 shadow-sm shrink-0">
                <h2 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center">
                    <Box className="mr-2 text-indigo-600" size={24}/> Workflow View
                </h2>
                
                <div className="space-y-6">
                    {/* ✅ Text Search Filter */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Search Order</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                            <input 
                                type="text"
                                placeholder="SO Number or Customer..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Order Status</label>
                        <div className="space-y-1">
                            {['ALL', 'DRAFT', 'CONFIRMED', 'IN_PRODUCTION'].map(f => (
                                <button 
                                    key={f} 
                                    onClick={() => setFilterStatus(f)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === f ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}
                                >
                                    {f === 'ALL' ? 'All Orders' : f.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                     <div className="pt-6 mt-auto">
                        <div className="text-xs text-slate-400 flex justify-between">
                            <span>Nodes Visible:</span>
                            <span className="font-mono">{visibleItems.nodes.length} / {layout.nodes.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Canvas Area */}
            <div className="flex-1 relative overflow-hidden bg-slate-50/50">
                 {/* Toolbar */}
                <div className="absolute top-4 right-4 flex gap-2 bg-white p-1.5 rounded-lg shadow-sm border border-slate-200 z-20">
                    <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-2 hover:bg-slate-100 rounded-md text-slate-600"><ZoomOut size={18}/></button>
                    <span className="px-3 flex items-center text-xs font-mono font-bold text-slate-500 w-16 justify-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-2 hover:bg-slate-100 rounded-md text-slate-600"><ZoomIn size={18}/></button>
                    <button onClick={() => setZoom(1)} className="p-2 hover:bg-slate-100 rounded-md text-slate-600 ml-1 border-l pl-3"><Maximize size={18}/></button>
                </div>

                {/* Graph Container */}
                <div 
                    ref={containerRef}
                    onScroll={handleScroll}
                    className="w-full h-full overflow-auto p-0 cursor-grab active:cursor-grabbing bg-dots"
                >
                    <style>{`.bg-dots { background-image: radial-gradient(#cbd5e1 1px, transparent 1px); background-size: 20px 20px; }`}</style>
                    
                    {loading ? (
                        <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-indigo-600" size={32}/></div>
                    ) : (
                        <div 
                            className="relative origin-top-left transition-transform duration-200 ease-out"
                            style={{ 
                                width: '3000px', // Ensure this is large enough or dynamic based on content
                                height: `${Math.max(1000, layout.height + 300)}px`,
                                transform: `scale(${zoom})`,
                                padding: '50px'
                            }}
                        >
                            {/* SVG Layer */}
                            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{zIndex: 0}}>
                                <defs>
                                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                        <polygon points="0 0, 10 3.5, 0 7" fill="#cbd5e1" />
                                    </marker>
                                </defs>
                                {visibleItems.connectors.map((conn, i) => (
                                    <Connector key={i} start={conn.start} end={conn.end} />
                                ))}
                            </svg>

                            {/* Node Layer */}
                            {visibleItems.nodes.map((node, i) => {
                                if (node.type === 'SALES_ORDER') return <SalesOrderNode key={i} {...node} onDetails={setSelectedSOId} onAddPO={handleAddPO} />;
                                if (node.type === 'PURCHASE_ORDER') return <PurchaseOrderNode key={i} {...node} onDetails={handleViewPODetails} onCreateBatch={handleCreateBatch} />; 
                                if (node.type === 'BATCH') return <BatchNode key={i} {...node} onViewDetails={handleViewBatchDetails} />;
                                return null;
                            })}
                            
                            {layout.nodes.length === 0 && (
                                <div className="absolute top-20 left-20 text-slate-400 text-lg font-medium">
                                    No workflow data found for the selected filter.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            {selectedSOId && <SalesOrderDetailsModal orderId={selectedSOId} onClose={() => setSelectedSOId(null)} />}
            {selectedPOId && <PurchaseOrderDetailsModal poId={selectedPOId} onClose={() => setSelectedPOId(null)} />}
            {poModalSOId && <CreatePOModal salesOrderId={poModalSOId} onClose={() => setPoModalSOId(null)} onSave={handleCreatePOSubmit} />}
        </div>
    );
};

export default ProductionWorkflowDashboard;