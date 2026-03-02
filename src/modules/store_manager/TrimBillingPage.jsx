import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, IndianRupee, Receipt, ChevronDown, Search, Loader2} from 'lucide-react';
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

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter options based on search term
    const filteredOptions = options.filter(option => 
        (option[labelKey] || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Robust comparison for selected option (handle string vs number)
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
                                placeholder="Search items..."
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

    const [billData, setBillData] = useState(null);
    const [items, setItems] = useState([]);
    const [batchInfo, setBatchInfo] = useState({});
    
    // For adding new items - Two Step Process
    const [trimItemsList, setTrimItemsList] = useState([]);
    const [selectedTrimItemName, setSelectedTrimItemName] = useState('');
    const [availableVariants, setAvailableVariants] = useState([]);
    const [selectedVariantId, setSelectedVariantId] = useState('');
    const [addQty, setAddQty] = useState(1);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast({ message: '', type: '' }), 3000);
    };

    useEffect(() => {
        const initializeBilling = async () => {
            setLoading(true);
            try {
                // 1. Fetch all variants for the "Add Item" dropdowns from real API
                const variantsResponse = await storeManagerApi.getAllVariantsDetailed();
                const variantsData = variantsResponse.data || [];
                
                // Format the variants and extract unique master items
                const uniqueItems = Array.from(new Set(variantsData.map(v => v.item_name)));
                setTrimItemsList(uniqueItems);

                const formattedVariants = variantsData.map(v => ({
                    ...v,
                    id: v.variant_id, 
                    master_name: v.item_name,
                    dropdownLabel: `${v.color_name} (₹${parseFloat(v.selling_price || 0).toFixed(2)})`
                }));
                setAvailableVariants(formattedVariants);

                // 2. Check if Bill already exists
                const billResponse = await storeManagerApi.getTrimBill(orderId);
                const billDetails = billResponse.data;
                
                if (billDetails && billDetails.exists) {
                    setBillData(billDetails.bill);
                    setItems(billDetails.items.map(i => ({
                        id: i.variant_id, 
                        variant_id: i.variant_id,
                        item_name: i.item_name,
                        color_name: i.color_name,
                        quantity: parseFloat(i.quantity),
                        selling_price: parseFloat(i.selling_price)
                    })));
                    
                    // Fetch batch info for the header
                    const summaryRes = await storeManagerApi.getTrimOrderSummary(orderId);
                    setBatchInfo(summaryRes.data.order);
                } else {
                    // First time billing: Generate from consumption report
                    const summaryRes = await storeManagerApi.getTrimOrderSummary(orderId);
                    setBatchInfo(summaryRes.data.order);

                    const initialItems = summaryRes.data.consumption_report.map(cr => ({
                        id: cr.variant_id,
                        variant_id: cr.variant_id,
                        item_name: cr.item_name + (cr.brand ? ' - ' + cr.brand : ''),
                        color_name: cr.color_name,
                        quantity: cr.total_consumed,
                        selling_price: parseFloat(cr.selling_price) || 0
                    }));
                    setItems(initialItems);
                }
            } catch (err) {
                console.error("Billing init error", err);
                showToast("Failed to load billing data. Please check your connection.", "error");
            } finally {
                setLoading(false);
            }
        };

        if (orderId) {
            initializeBilling();
        }
    }, [orderId]);

    const handleQuantityChange = (id, newQty) => {
        setItems(prev => prev.map(item => 
            item.id === id ? { ...item, quantity: parseFloat(newQty) || 0 } : item
        ));
    };

    const handleRemoveItem = (id) => {
        setItems(prev => prev.filter(item => item.id !== id));
    };

    const handleAddItem = () => {
        if (!selectedVariantId) return;
        
        const variant = availableVariants.find(v => String(v.id) === String(selectedVariantId));
        if (!variant) return;

        // Check if item already exists in the bill
        const existingItem = items.find(i => String(i.variant_id) === String(selectedVariantId));
        if (existingItem) {
            handleQuantityChange(selectedVariantId, existingItem.quantity + parseFloat(addQty));
        } else {
            setItems([...items, {
                id: variant.variant_id,
                variant_id: variant.variant_id,
                item_name: variant.master_name,
                color_name: variant.color_name,
                quantity: parseFloat(addQty),
                selling_price: parseFloat(variant.selling_price) || 0
            }]);
        }
        
        setSelectedVariantId('');
        setAddQty(1);
    };

    const handleSaveBill = async () => {
        if (items.length === 0) return showToast("Cannot save an empty bill.", "error");

        setSaving(true);
        try {
            const payload = {
                production_batch_id: batchInfo.production_batch_id,
                status: 'FINALIZED',
                items: items
            };
            
            const response = await storeManagerApi.saveTrimBill(orderId, payload);
            
            showToast("Invoice saved successfully!");
            if (!billData) {
                setBillData({ 
                    id: response.data.bill_id, 
                    bill_number: `TRIM-BILL-${orderId}-${response.data.bill_id}` 
                });
            }
            
        } catch (err) {
            showToast(err.response?.data?.error || err.message || "Failed to save bill", "error");
        } finally {
            setSaving(false);
        }
    };

    const grandTotal = items.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0);

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin rounded-full h-8 w-8 text-indigo-600" /></div>;

    return (
        <div className="p-6 max-w-5xl mx-auto bg-gray-50 min-h-screen font-inter pb-24">
            <Toast message={toast.message} type={toast.type} />
            
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => navigate(-1)} className="flex items-center text-gray-600 hover:text-gray-900 font-medium transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Summary
                </button>
                <button 
                    onClick={handleSaveBill} 
                    disabled={saving}
                    className="flex items-center px-6 py-2.5 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 font-bold transition-all disabled:opacity-50"
                >
                    <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save Invoice'}
                </button>
            </div>

            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
                        <Receipt className="w-6 h-6 mr-3 text-indigo-500" />
                        {billData ? `Invoice: ${billData.bill_number || 'Saved'}` : 'Draft Invoice'}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-gray-500 text-sm font-medium bg-gray-100 px-2.5 py-1 rounded">Order #{orderId}</span>
                        <span className="text-gray-500 text-sm font-medium bg-gray-100 px-2.5 py-1 rounded">Batch: {batchInfo.batch_code || 'N/A'}</span>
                    </div>
                </div>
                <div className="text-right bg-indigo-50 p-4 rounded-xl border border-indigo-100 min-w-[200px]">
                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Grand Total</p>
                    <p className="text-3xl font-black text-indigo-700 flex items-center justify-end">
                        <IndianRupee className="w-6 h-6 mr-1" /> {grandTotal.toFixed(2)}
                    </p>
                </div>
            </div>

            {/* Invoice Items */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Item Description</th>
                                <th className="px-6 py-4 w-32 text-right">Unit Price</th>
                                <th className="px-6 py-4 w-40 text-center">Quantity</th>
                                <th className="px-6 py-4 w-32 text-right">Line Total</th>
                                <th className="px-6 py-4 w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900 text-base">{item.item_name}</div>
                                        <div className="text-sm font-medium text-gray-500">{item.color_name}</div>
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
                            {items.length === 0 && (
                                <tr><td colSpan="5" className="text-center py-12 text-gray-400 italic">No items in this bill. Use the form below to add items.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add More Items Section - TWO STEP SELECTION */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full md:w-1/3">
                    <label className="block text-sm font-bold text-gray-700 mb-2">1. Select Trim Item</label>
                    <select 
                        value={selectedTrimItemName}
                        onChange={(e) => {
                            setSelectedTrimItemName(e.target.value);
                            setSelectedVariantId(''); // Reset variant when master item changes
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm outline-none transition-all text-sm"
                    >
                        <option value="">Choose a Trim Item...</option>
                        {trimItemsList.map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex-1 w-full md:w-1/3">
                    <label className="block text-sm font-bold text-gray-700 mb-2">2. Select Color / Variant</label>
                    <SearchableDropdown 
                        options={availableVariants.filter(v => v.master_name === selectedTrimItemName)}
                        value={selectedVariantId}
                        onChange={(val) => setSelectedVariantId(val)}
                        placeholder={selectedTrimItemName ? "Search available variants..." : "Select an item first..."}
                        labelKey="dropdownLabel"
                        disabled={!selectedTrimItemName}
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
                    <Plus className="w-5 h-5 mr-2" /> Add Item
                </button>
            </div>
        </div>
    );
};

export default TrimBillingPage;