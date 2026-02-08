import React, { useState, useEffect } from 'react';
import { customerApi } from '../../api/customerApi';
import { 
    Users, ShoppingBag, Plus, Search, Calendar, FileText, ChevronDown, ChevronRight, X, Loader2
} from 'lucide-react';

const Spinner = () => <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-600"/></div>;

// --- SALES ORDER MODAL ---
const SalesOrderModal = ({ onClose, onSave }) => {
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [fabricTypes, setFabricTypes] = useState([]);
    const [fabricColors, setFabricColors] = useState([]);
    
    // Form State
    const [formData, setFormData] = useState({
        customer_id: '',
        order_number: `SO-${new Date().getFullYear()}-`,
        delivery_date: '',
        notes: '',
        // The nested structure
        products: [] 
    });

    useEffect(() => {
        Promise.all([
            customerApi.getCustomers(),
            customerApi.getProducts(),
            customerApi.getFabricTypes(),
            customerApi.getFabricColors()
        ]).then(([c, p, ft, fc]) => {
            setCustomers(c.data);
            setProducts(p.data);
            setFabricTypes(ft.data);
            setFabricColors(fc.data);
        });
    }, []);

    const addProductGroup = () => {
        setFormData(prev => ({
            ...prev,
            products: [...prev.products, {
                product_id: '',
                fabric_type_id: '',
                size_breakdown: { S: 1, M: 2, L: 1, XL: 1 }, // Default ratio
                colors: [{ fabric_color_id: '', quantity: 0, unit_price: 0 }]
            }]
        }));
    };

    const updateProductGroup = (index, field, value) => {
        const newProducts = [...formData.products];
        newProducts[index][field] = value;
        setFormData({ ...formData, products: newProducts });
    };

    const addColorRow = (productIndex) => {
        const newProducts = [...formData.products];
        newProducts[productIndex].colors.push({ fabric_color_id: '', quantity: 0, unit_price: 0 });
        setFormData({ ...formData, products: newProducts });
    };

    const updateColorRow = (prodIndex, colorIndex, field, value) => {
        const newProducts = [...formData.products];
        newProducts[prodIndex].colors[colorIndex][field] = value;
        setFormData({ ...formData, products: newProducts });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-8 flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b flex justify-between items-center bg-indigo-50">
                    <h3 className="font-bold text-lg text-indigo-900">Create Sales Order</h3>
                    <button onClick={onClose}><X className="text-gray-500"/></button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto">
                    {/* Header Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">Customer</label>
                            <select required className="w-full p-2 border rounded" value={formData.customer_id} onChange={e => setFormData({...formData, customer_id: e.target.value})}>
                                <option value="">Select Customer</option>
                                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Order #</label>
                            <input required className="w-full p-2 border rounded" value={formData.order_number} onChange={e => setFormData({...formData, order_number: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Delivery Date</label>
                            <input type="date" required className="w-full p-2 border rounded" value={formData.delivery_date} onChange={e => setFormData({...formData, delivery_date: e.target.value})} />
                        </div>
                    </div>

                    {/* Dynamic Products */}
                    <div className="space-y-6">
                        {formData.products.map((prod, pIdx) => (
                            <div key={pIdx} className="border border-indigo-100 rounded-lg p-4 bg-indigo-50/30">
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500">Product Style</label>
                                        <select required className="w-full p-2 border rounded bg-white" value={prod.product_id} onChange={e => updateProductGroup(pIdx, 'product_id', e.target.value)}>
                                            <option value="">Select Product</option>
                                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500">Fabric</label>
                                        <select required className="w-full p-2 border rounded bg-white" value={prod.fabric_type_id} onChange={e => updateProductGroup(pIdx, 'fabric_type_id', e.target.value)}>
                                            <option value="">Select Fabric</option>
                                            {fabricTypes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                
                                {/* Size Ratios */}
                                <div className="mb-3">
                                    <label className="text-xs font-bold text-gray-500">Size Breakdown (Ratio)</label>
                                    <div className="flex gap-2 mt-1">
                                        {Object.keys(prod.size_breakdown).map(size => (
                                            <div key={size} className="flex items-center bg-white border rounded px-2">
                                                <span className="text-gray-500 text-xs mr-2">{size}:</span>
                                                <input 
                                                    type="number" className="w-12 p-1 outline-none text-center font-bold" 
                                                    value={prod.size_breakdown[size]} 
                                                    onChange={(e) => {
                                                        const newSizes = { ...prod.size_breakdown, [size]: parseInt(e.target.value) || 0 };
                                                        updateProductGroup(pIdx, 'size_breakdown', newSizes);
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Colors Table */}
                                <div className="bg-white rounded border overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-100 text-gray-600">
                                            <tr>
                                                <th className="p-2 text-left">Color</th>
                                                <th className="p-2 text-right">Quantity (Pcs)</th>
                                                <th className="p-2 text-right">Unit Price</th>
                                                <th className="p-2"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {prod.colors.map((color, cIdx) => (
                                                <tr key={cIdx}>
                                                    <td className="p-2">
                                                        <select required className="w-full p-1 border rounded" value={color.fabric_color_id} onChange={e => updateColorRow(pIdx, cIdx, 'fabric_color_id', e.target.value)}>
                                                            <option value="">Select Color</option>
                                                            {fabricColors.map(fc => <option key={fc.id} value={fc.id}>{fc.name} - {fc.color_number}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="p-2"><input type="number" required className="w-full p-1 border rounded text-right" value={color.quantity} onChange={e => updateColorRow(pIdx, cIdx, 'quantity', e.target.value)} /></td>
                                                    <td className="p-2"><input type="number" required className="w-full p-1 border rounded text-right" value={color.unit_price} onChange={e => updateColorRow(pIdx, cIdx, 'unit_price', e.target.value)} /></td>
                                                    <td className="p-2 text-center text-red-500 cursor-pointer" onClick={() => {
                                                        const newProducts = [...formData.products];
                                                        newProducts[pIdx].colors = newProducts[pIdx].colors.filter((_, i) => i !== cIdx);
                                                        setFormData({...formData, products: newProducts});
                                                    }}><X size={14}/></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <button type="button" onClick={() => addColorRow(pIdx)} className="w-full py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50">+ Add Color Variant</button>
                                </div>
                            </div>
                        ))}
                        
                        <button type="button" onClick={addProductGroup} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-400 hover:text-indigo-600 font-medium transition-colors">
                            + Add Product Style
                        </button>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">Create Order</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
const CustomerManagementPage = () => {
    const [view, setView] = useState('orders'); // 'orders' | 'customers'
    const [orders, setOrders] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showOrderModal, setShowOrderModal] = useState(false);

    // Initial Data Load
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [oRes, cRes] = await Promise.all([
                    customerApi.getSalesOrders(),
                    customerApi.getCustomers()
                ]);
                setOrders(oRes.data);
                setCustomers(cRes.data);
            } catch (e) { console.error(e); } 
            finally { setLoading(false); }
        };
        load();
    }, []);

    const handleCreateOrder = async (data) => {
        try {
            await customerApi.createSalesOrder(data);
            setShowOrderModal(false);
            // Refresh
            const res = await customerApi.getSalesOrders();
            setOrders(res.data);
        } catch (e) { alert("Failed"); }
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen font-inter">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800">Sales & Customers</h1>
                    <div className="flex gap-4 mt-2">
                        <button onClick={() => setView('orders')} className={`text-sm font-medium ${view==='orders' ? 'text-blue-600 underline' : 'text-gray-500'}`}>Sales Orders</button>
                        <button onClick={() => setView('customers')} className={`text-sm font-medium ${view==='customers' ? 'text-blue-600 underline' : 'text-gray-500'}`}>Customer Database</button>
                    </div>
                </div>
                <button onClick={() => setShowOrderModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center shadow-sm hover:bg-blue-700">
                    <Plus size={18} className="mr-2"/> New Sales Order
                </button>
            </header>

            {loading ? <Spinner /> : (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    {view === 'orders' ? (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 border-b">
                                <tr>
                                    <th className="p-4">Order #</th>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">Customer</th>
                                    <th className="p-4 text-right">Total Qty</th>
                                    <th className="p-4 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(o => (
                                    <tr key={o.id} className="border-b hover:bg-gray-50">
                                        <td className="p-4 font-mono font-bold text-indigo-600">{o.order_number}</td>
                                        <td className="p-4">{new Date(o.order_date).toLocaleDateString()}</td>
                                        <td className="p-4 font-medium">{o.customer_name}</td>
                                        <td className="p-4 text-right font-bold">{o.total_quantity}</td>
                                        <td className="p-4 text-center"><span className="bg-gray-100 px-2 py-1 rounded text-xs font-bold text-gray-600">{o.status}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="p-8 text-center text-gray-500">Customer list implementation similar to orders...</div>
                    )}
                </div>
            )}

            {showOrderModal && <SalesOrderModal onClose={() => setShowOrderModal(false)} onSave={handleCreateOrder} />}
        </div>
    );
};

export default CustomerManagementPage;