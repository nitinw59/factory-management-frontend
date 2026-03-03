import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    ArrowLeft, Save, Plus, Trash2, IndianRupee, Receipt, 
    ChevronDown, Search, Loader2, FileText, CheckCircle2, 
    Printer, Edit2, X 
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { storeManagerApi } from '../../api/storeManagerApi';

// --- Toast Notification Component ---
const Toast = ({ message, type }) => {
    if (!message) return null;
    const bg = type === 'error' ? 'bg-red-500' : 'bg-green-500';
    return (
        <div className={`fixed bottom-4 right-4 ${bg} text-white px-6 py-3 rounded-lg shadow-xl z-50 animate-bounce`}>
            {message}
        </div>
    );
};

// --- Searchable Dropdown Component ---
const SearchableDropdown = ({ options = [], value, onChange, placeholder, disabled, labelKey = 'name' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(option => 
        (option[labelKey] || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedOption = options.find(opt => 
        value !== '' && value !== null && value !== undefined && String(opt.id) === String(value)
    );

    const handleSelect = (option) => {
        onChange(option.id);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full p-3 border border-gray-300 rounded-lg bg-white text-left flex justify-between items-center focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:border-gray-400'}`}
            >
                <span className={`block truncate ${!selectedOption ? 'text-gray-400 font-normal' : 'text-gray-900 font-bold'}`}>
                    {selectedOption ? selectedOption[labelKey] : placeholder}
                </span>
                <ChevronDown size={18} className="text-gray-400 shrink-0" />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-2xl max-h-72 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100 bg-gray-50 sticky top-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="Search variants..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => (
                                <div
                                    key={option.id}
                                    onClick={() => handleSelect(option)}
                                    className={`px-4 py-3 text-sm cursor-pointer border-b border-gray-50 last:border-b-0 hover:bg-indigo-50 transition-colors ${String(option.id) === String(value) ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-700 font-medium'}`}
                                >
                                    {option[labelKey]}
                                </div>
                            ))
                        ) : (
                            <div className="px-4 py-6 text-sm text-gray-500 text-center italic">No items found matching your search.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Main Page Component ---
const TrimBillingPage = () => {
    const { orderId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState({ message: '', type: '' });

    const [existingBills, setExistingBills] = useState([]);
    const [draftItems, setDraftItems] = useState([]);
    const [batchInfo, setBatchInfo] = useState({});
    const [editingBill, setEditingBill] = useState(null); // Track which bill is being edited
    
    // 2-Step Dropdown State
    const [trimItemsList, setTrimItemsList] = useState([]);
    const [selectedTrimItemId, setSelectedTrimItemId] = useState('');
    const [availableVariants, setAvailableVariants] = useState([]);
    const [selectedVariantId, setSelectedVariantId] = useState('');
    const [fetchingVariants, setFetchingVariants] = useState(false);
    const [addQty, setAddQty] = useState(1);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast({ message: '', type: '' }), 3000);
    };

    const initializeBilling = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Trim Items for Dropdown
            const itemsRes = await storeManagerApi.getAllTrimItems();
            setTrimItemsList(itemsRes.data || []);
            
            // 2. Fetch Consumption Summary & Past Bills
            const [summaryRes, billsRes] = await Promise.all([
                storeManagerApi.getTrimOrderSummary(orderId),
                storeManagerApi.getTrimBillsForOrder(orderId)
            ]);

            setBatchInfo(summaryRes.data.order);
            const pastBills = billsRes.data || [];
            setExistingBills(pastBills);

            // 3. Calculate what has ALREADY been billed
            const billedQuantities = {};
            pastBills.forEach(bill => {
                bill.items.forEach(item => {
                    billedQuantities[item.variant_id] = (billedQuantities[item.variant_id] || 0) + parseFloat(item.quantity);
                });
            });

            // 4. Calculate UNBILLED items (Consumed - Billed)
            const unbilledItems = [];
            summaryRes.data.consumption_report.forEach(cr => {
                const consumed = parseFloat(cr.total_consumed) || 0;
                const billed = billedQuantities[cr.variant_id] || 0;
                const remainingToBill = consumed - billed;
                console.log(cr);
                if (remainingToBill > 0) {
                    unbilledItems.push({
                        id: cr.variant_id, 
                        variant_id: cr.variant_id,
                        item_name: cr.item_name,
                        color_name: cr.color_name,
                        color_number: cr.color_number,
                        quantity: remainingToBill,
                        selling_price: parseFloat(cr.selling_price) || 0,
                        main_store_stock: cr.main_store_stock // Captured from backend update
                    });
                }
            });

            setDraftItems(unbilledItems);
            setEditingBill(null); // Reset edit state on load
        } catch (err) {
            console.error("Billing init error", err);
            showToast("Failed to load billing data.", "error");
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        if (orderId) initializeBilling();
    }, [orderId, initializeBilling]);

    // Fetch Variants when Trim Item is selected
    useEffect(() => {
        const fetchVariants = async () => {
            if (!selectedTrimItemId) {
                setAvailableVariants([]);
                setSelectedVariantId('');
                return;
            }
            
            setFetchingVariants(true);
            try {
                const res = await storeManagerApi.getVariantsByTrimItem(selectedTrimItemId);
                const formattedVariants = (res.data || []).map(v => ({
                    ...v,
                    id: v.variant_id,
                    dropdownLabel: `${v.color_number ? v.color_number + ' - ' : ''}${v.color_name} (₹${parseFloat(v.selling_price || 0).toFixed(2)}) • Stock: ${v.main_store_stock}`
                }));
                setAvailableVariants(formattedVariants);
            } catch (err) {
                console.error("Failed to fetch variants", err);
                showToast("Failed to load item variants.", "error");
            } finally {
                setFetchingVariants(false);
            }
        };
        fetchVariants();
    }, [selectedTrimItemId]);

    // --- PDF INVOICE GENERATION ---
    const handlePrintInvoice = (bill) => {
        const doc = new jsPDF();
        
        // Header
        doc.setFontSize(22);
        doc.setTextColor(31, 41, 55); // Gray 800
        doc.text("TRIM STORE INVOICE", 14, 22);
        
        // Meta Data
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Invoice Number: ${bill.bill_number}`, 14, 32);
        doc.text(`Order ID: #${orderId}`, 14, 38);
        doc.text(`Batch Code: ${batchInfo.batch_code || 'N/A'}`, 14, 44);
        doc.text(`Date Issued: ${new Date(bill.created_at).toLocaleString()}`, 14, 50);

        // Table
        const tableColumn = ["Item Description", "Color/Variant", "Unit Price", "Qty", "Line Total"];
        const tableRows = [];

        bill.items.forEach(item => {
            const itemData = [
                item.item_name,
                item.color_name + ` (${item.color_number})`,
                `Rs. ${parseFloat(item.selling_price).toFixed(2)}`,
                item.quantity,
                `Rs. ${parseFloat(item.total_price).toFixed(2)}`
            ];
            tableRows.push(itemData);
        });

        autoTable(doc, {
            startY: 58,
            head: [tableColumn],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' }, // Indigo 600
            styles: { fontSize: 10, cellPadding: 4 },
            columnStyles: {
                2: { halign: 'right' },
                3: { halign: 'center' },
                4: { halign: 'right', fontStyle: 'bold' }
            },
            foot: [['', '', '', 'Grand Total:', `Rs. ${parseFloat(bill.total_amount).toFixed(2)}`]],
            footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold', halign: 'right' }
        });

        doc.save(`${bill.bill_number}.pdf`);
    };

    // --- EDIT LOGIC ---
    const handleEditInvoice = (bill) => {
        setEditingBill(bill);
        
        // Load the bill's items into the draft editor
        const editItems = bill.items.map(item => ({
            id: item.variant_id,
            variant_id: item.variant_id,
            item_name: item.item_name,
            color_name: item.color_name,
            color_number: item.color_number,
            quantity: parseFloat(item.quantity),
            selling_price: parseFloat(item.selling_price),
            main_store_stock: item.main_store_stock // Requires backend update to fetch
        }));
        
        setDraftItems(editItems);
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingBill(null);
        initializeBilling(); // Reset back to unbilled draft items
    };

    // --- DRAFT / BILLING LOGIC ---
    const handleQuantityChange = (id, newQty) => {
        setDraftItems(prev => prev.map(item => 
            item.id === id ? { ...item, quantity: parseFloat(newQty) || 0 } : item
        ));
    };

    const handleRemoveItem = (id) => {
        setDraftItems(prev => prev.filter(item => item.id !== id));
    };

    const handleAddItem = () => {
        if (!selectedVariantId) return;
        
        const variant = availableVariants.find(v => String(v.id) === String(selectedVariantId));
        if (!variant) return;

        const existingItem = draftItems.find(i => String(i.variant_id) === String(selectedVariantId));
        if (existingItem) {
            handleQuantityChange(selectedVariantId, existingItem.quantity + parseFloat(addQty));
        } else {
            setDraftItems([...draftItems, {
                id: variant.variant_id,
                variant_id: variant.variant_id,
                item_name: `${variant.item_name} ${variant.brand ? '- ' + variant.brand : ''}`.trim(),
                color_name: variant.color_name,
                color_number: variant.color_number,
                quantity: parseFloat(addQty),
                selling_price: parseFloat(variant.selling_price) || 0,
                main_store_stock: variant.main_store_stock
            }]);
        }
        
        setSelectedVariantId('');
        setAddQty(1);
    };

    const handleSaveBill = async () => {
        if (draftItems.length === 0) return showToast("Cannot save an empty bill.", "error");

        setSaving(true);
        try {
            const payload = {
                production_batch_id: batchInfo.production_batch_id,
                status: 'FINALIZED',
                items: draftItems,
                bill_id: editingBill ? editingBill.id : null // Pass ID if editing
            };
            
            await storeManagerApi.saveTrimBill(orderId, payload);
            showToast(editingBill ? "Invoice updated successfully!" : "New Invoice generated successfully!");
            
            await initializeBilling(); // Refresh everything
        } catch (err) {
            showToast(err.response?.data?.error || err.message || "Failed to save bill", "error");
        } finally {
            setSaving(false);
        }
    };

    const grandTotal = draftItems.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0);

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin rounded-full h-8 w-8 text-indigo-600" /></div>;

    return (
        <div className="p-6 max-w-5xl mx-auto bg-gray-50 min-h-screen font-inter pb-24">
            <Toast message={toast.message} type={toast.type} />
            
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => navigate(-1)} className="flex items-center text-gray-600 hover:text-gray-900 font-medium transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Summary
                </button>
                <div className="flex gap-3">
                    {editingBill && (
                        <button onClick={handleCancelEdit} className="px-5 py-2.5 bg-gray-200 text-gray-800 rounded-lg shadow-sm hover:bg-gray-300 font-bold transition-all flex items-center">
                            <X className="w-4 h-4 mr-2" /> Cancel Edit
                        </button>
                    )}
                    <button 
                        onClick={handleSaveBill} 
                        disabled={saving || draftItems.length === 0}
                        className="flex items-center px-6 py-2.5 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        {saving ? 'Saving...' : (editingBill ? 'Update Invoice' : 'Generate Invoice')}
                    </button>
                </div>
            </div>

            {/* PREVIOUS BILLS SECTION */}
            {existingBills.length > 0 && !editingBill && (
                <div className="mb-8">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                        <FileText className="w-5 h-5 mr-2 text-indigo-600"/> Previous Invoices Generated
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {existingBills.map(bill => (
                            <div key={bill.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-indigo-300 transition-colors">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-bold text-gray-900 flex items-center">
                                            {bill.bill_number}
                                            <CheckCircle2 className="w-4 h-4 ml-2 text-green-500" />
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-0.5">{new Date(bill.created_at).toLocaleString()}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className="bg-indigo-50 text-indigo-800 text-sm font-bold px-3 py-1 rounded-lg">₹{parseFloat(bill.total_amount).toFixed(2)}</span>
                                        <div className="flex gap-1">
                                            <button onClick={() => handlePrintInvoice(bill)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Print/Download PDF">
                                                <Printer size={16} />
                                            </button>
                                            <button onClick={() => handleEditInvoice(bill)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Edit this Invoice">
                                                <Edit2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <ul className="text-xs space-y-2">
                                        {bill.items.slice(0, 3).map(item => (
                                            <li key={item.id} className="flex justify-between text-gray-600 border-b border-gray-200 last:border-0 pb-1 last:pb-0">
                                                <span className="truncate pr-2 font-medium">
                                                    <span className="font-bold text-gray-800 mr-1">{item.quantity}x</span> 
                                                    {item.item_name} ({item.color_name}) <span className="text-gray-500">[{item.color_number}]</span>
                                                </span>
                                                <span className="font-mono">₹{parseFloat(item.total_price).toFixed(2)}</span>
                                            </li>
                                        ))}
                                        {bill.items.length > 3 && (
                                            <li className="text-center text-gray-400 pt-1 italic">...and {bill.items.length - 3} more items</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* HEADER FOR DRAFT / EDITOR */}
            <div className={`bg-white rounded-xl shadow-sm border p-6 mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-t-4 ${editingBill ? 'border-t-amber-500 border-x-amber-200 border-b-amber-200' : 'border-t-indigo-500 border-gray-200'}`}>
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
                        {editingBill ? <Edit2 className="w-6 h-6 mr-3 text-amber-500" /> : <Receipt className="w-6 h-6 mr-3 text-indigo-500" />}
                        {editingBill ? `Editing: ${editingBill.bill_number}` : 'Draft Invoice (Unbilled Items)'}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-gray-500 text-sm font-medium bg-gray-100 px-2.5 py-1 rounded">Order #{orderId}</span>
                        <span className="text-gray-500 text-sm font-medium bg-gray-100 px-2.5 py-1 rounded">Batch: {batchInfo.batch_code || 'N/A'}</span>
                    </div>
                </div>
                <div className={`text-right p-4 rounded-xl border min-w-[200px] ${editingBill ? 'bg-amber-50 border-amber-100' : 'bg-indigo-50 border-indigo-100'}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${editingBill ? 'text-amber-600' : 'text-indigo-400'}`}>
                        {editingBill ? 'Updated Total' : 'Draft Total'}
                    </p>
                    <p className={`text-3xl font-black flex items-center justify-end ${editingBill ? 'text-amber-700' : 'text-indigo-700'}`}>
                        <IndianRupee className="w-6 h-6 mr-1" /> {grandTotal.toFixed(2)}
                    </p>
                </div>
            </div>

            {/* DRAFT ITEMS TABLE */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Item Description</th>
                                <th className="px-6 py-4 w-28 text-center">In Stock</th>
                                <th className="px-6 py-4 w-28 text-right">Unit Price</th>
                                <th className="px-6 py-4 w-36 text-center">Quantity</th>
                                <th className="px-6 py-4 w-32 text-right">Line Total</th>
                                <th className="px-6 py-4 w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {draftItems.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900 text-base">{item.item_name}</div>
                                        <div className="text-sm font-medium text-gray-500">{item.color_name} ({item.color_number})</div>
                                    </td>
                                    {/* Stock Display */}
                                    <td className="px-6 py-4 text-center">
                                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200">
                                            {item.main_store_stock !== undefined ? item.main_store_stock : '--'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-gray-600">
                                        ₹{item.selling_price.toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <input 
                                            type="number" 
                                            value={item.quantity}
                                            onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                            className="w-full text-center border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-bold text-gray-900 transition-all shadow-sm"
                                            min="1"
                                        />
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-gray-900 text-lg">
                                        ₹{(item.quantity * item.selling_price).toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button onClick={() => handleRemoveItem(item.id)} className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors">
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {draftItems.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="text-center py-16">
                                        {editingBill ? (
                                            <p className="text-gray-500 font-medium mb-1">You have removed all items from this bill.</p>
                                        ) : (
                                            <>
                                                <p className="text-gray-500 font-medium mb-1">All consumed items have been fully billed!</p>
                                                <p className="text-sm text-gray-400">You can manually add extra items using the form below if needed.</p>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ADD MORE ITEMS SECTION */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full md:w-1/3">
                    <label className="block text-sm font-bold text-gray-700 mb-2">1. Select Trim Item</label>
                    <select 
                        value={selectedTrimItemId}
                        onChange={(e) => {
                            setSelectedTrimItemId(e.target.value);
                            setSelectedVariantId(''); 
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm outline-none transition-all text-sm"
                    >
                        <option value="">Choose a Trim Item...</option>
                        {trimItemsList.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.name} {item.brand ? `- ${item.brand}` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex-1 w-full md:w-1/3">
                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center">
                        2. Select Color / Variant
                        {fetchingVariants && <Loader2 className="w-3 h-3 animate-spin ml-2 text-indigo-500" />}
                    </label>
                    <SearchableDropdown 
                        options={availableVariants}
                        value={selectedVariantId}
                        onChange={(val) => setSelectedVariantId(val)}
                        placeholder={selectedTrimItemId ? (fetchingVariants ? "Loading..." : "Search available variants...") : "Select an item first..."}
                        labelKey="dropdownLabel"
                        disabled={!selectedTrimItemId || fetchingVariants}
                    />
                </div>

                <div className="w-24 shrink-0">
                    <label className="block text-sm font-bold text-gray-700 mb-2">Qty</label>
                    <input 
                        type="number" 
                        value={addQty} 
                        onChange={(e) => setAddQty(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm text-sm"
                        min="1"
                    />
                </div>

                <button 
                    onClick={handleAddItem}
                    disabled={!selectedVariantId}
                    className="px-6 py-3 bg-gray-900 text-white font-bold rounded-lg shadow-sm hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center shrink-0"
                >
                    <Plus className="w-5 h-5 mr-2" /> Add Extra
                </button>
            </div>
        </div>
    );
};

export default TrimBillingPage;