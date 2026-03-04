import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
    LuClock, LuPackageCheck, LuPackage, LuTriangleAlert, LuRefreshCw, 
    LuReplace, LuArrowLeft, LuListOrdered, LuCircleCheck, LuWand, 
    LuTrash2, LuFileText, LuBookOpen, LuScissors, LuTag
} from 'react-icons/lu';
import { Loader2, Info } from 'lucide-react'; 
import { storeManagerApi } from '../../api/storeManagerApi';
const Spinner = () => <div className="flex justify-center items-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

// --- Reference Data Modal (BOM & Cutting) ---
const ReferenceDataModal = ({ isOpen, onClose, orderId }) => {
    const [activeTab, setActiveTab] = useState('bom');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ bom: [], cutting: [] });

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            storeManagerApi.getOrderReferenceData(orderId)
                .then(res => setData(res.data))
                .catch(err => console.error("Failed to load reference data", err))
                .finally(() => setLoading(false));
               
        }

        console.log("Reference MModal Data:", data);
    }, [isOpen, orderId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 transition-opacity duration-300">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                
                {/* Modal Header */}
                <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <div>
                        <h3 className="text-xl font-extrabold text-gray-800 flex items-center">
                            <LuBookOpen className="mr-2 text-indigo-600" /> Batch Reference Details
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">View single piece requirements and cutting history.</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-gray-200 text-gray-600 hover:bg-gray-300 rounded-full transition-colors">
                        <LuTrash2 className="h-4 w-4" style={{display: 'none'}} />
                        <span className="font-bold px-1">✕</span>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 bg-white">
                    <button 
                        onClick={() => setActiveTab('bom')}
                        className={`flex-1 py-3.5 text-sm font-bold border-b-2 transition-colors flex justify-center items-center ${activeTab === 'bom' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        <LuTag className="mr-2 h-4 w-4" /> Single Piece BOM
                    </button>
                    <button 
                        onClick={() => setActiveTab('cutting')}
                        className={`flex-1 py-3.5 text-sm font-bold border-b-2 transition-colors flex justify-center items-center ${activeTab === 'cutting' ? 'border-blue-600 text-blue-700 bg-blue-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        <LuScissors className="mr-2 h-4 w-4" /> Cutting Details
                    </button>
                </div>

                {/* Tab Content */}
                <div className="p-0 overflow-y-auto flex-1 bg-gray-50/30">
                    {loading ? (
                        <div className="py-20 flex justify-center items-center flex-col">
                            <Loader2 className="animate-spin h-8 w-8 text-indigo-500 mb-4" />
                            <p className="text-gray-500 font-medium">Fetching details...</p>
                        </div>
                    ) : (
                        <>
                            {/* BOM TAB */}
                            {activeTab === 'bom' && (
                                <table className="min-w-full text-left border-collapse">
                                    <thead className="bg-gray-100 text-xs uppercase text-gray-600 font-bold sticky top-0">
                                        <tr>
                                            <th className="py-3 px-5 border-b">Material Name</th>
                                            <th className="py-3 px-5 border-b text-center">Req. Qty / Pc</th>
                                            <th className="py-3 px-5 border-b">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {data.bom.length > 0 ? data.bom.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="py-3 px-5 font-semibold text-gray-800">{item.item_name}</td>
                                                <td className="py-3 px-5 text-center font-mono font-bold text-indigo-600 bg-indigo-50/30">{parseFloat(item.quantity_per_piece).toFixed(4)}</td>
                                                <td className="py-3 px-5 text-sm text-gray-500 italic">{item.notes || '-'}</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="3" className="py-10 text-center text-gray-400">No BOM data found for this product.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {/* CUTTING TAB */}
                            {activeTab === 'cutting' && (
                                <table className="min-w-full text-left border-collapse">
                                    <thead className="bg-gray-100 text-xs uppercase text-gray-600 font-bold sticky top-0">
                                        <tr>
                                            <th className="py-3 px-5 border-b">Roll No.</th>
                                            <th className="py-3 px-5 border-b">Color</th>
                                            <th className="py-3 px-5 border-b text-center">Total Cut Qty</th>
                                            <th className="py-3 px-5 border-b">Size Breakdown</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {data.cutting.length > 0 ? data.cutting.map((cut, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="py-3 px-5 font-bold text-gray-800">{cut.roll_no}</td>
                                                <td className="py-3 px-5 text-sm text-gray-600 font-medium">{cut.color_name || 'N/A'}</td>
                                                <td className="py-3 px-5 text-center font-bold text-blue-700">{cut.total_cut}</td>
                                                <td className="py-3 px-5 text-sm text-gray-500 font-mono bg-gray-50">{cut.sizes || 'N/A'}</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="4" className="py-10 text-center text-gray-400">No cutting records found for this batch yet.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Fulfillment Modal ---
const FulfillmentModal = ({ item, onClose, onSubmit }) => {
    const fulfillmentOptions = [
        ...(item.available_stock > 0 ? [{ ...item, id: item.trim_item_variant_id, is_substitute: false }] : []),
        ...(item.substitutes || []).map(sub => ({ ...sub, id: sub.substitute_variant_id, is_substitute: true }))
    ];

    const remainingRequired = item.quantity_required - item.quantity_fulfilled;
    const [selectedVariantId, setSelectedVariantId] = useState(fulfillmentOptions[0]?.id || '');
    const [quantity, setQuantity] = useState(remainingRequired);

    const selectedOption = fulfillmentOptions.find(opt => opt.id === selectedVariantId);
    const maxAllowed = selectedOption ? Math.min(remainingRequired, selectedOption.available_stock) : 0;

    const handleSubmit = () => {
        if (!selectedOption) return alert("Please select an item to fulfill with.");
        if (isNaN(quantity) || quantity <= 0) return alert("Invalid quantity. Please enter a number greater than 0.");
        if (quantity > maxAllowed) return alert(`Error: Quantity cannot be greater than the available stock (${selectedOption.available_stock}) or remaining required (${remainingRequired}).`);
        
        onSubmit({
            orderItemId: item.id,
            quantityToFulfill: quantity,
            fulfillingVariantId: selectedVariantId
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4 transition-opacity duration-300">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b">
                    <h3 className="text-xl font-bold text-gray-800">Fulfill Order Item</h3>
                    <p className="text-sm text-gray-500">Required: <strong>{item.item_name} - {item.color_name} - {item.color_number}</strong></p>
                </div>
                <div className="p-6 space-y-5 bg-gray-50">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Select Item to Use for Fulfillment</label>
                        <div className="space-y-3">
                            {fulfillmentOptions.map(option => (
                                <label key={option.id} htmlFor={`variant-${option.id}`} className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedVariantId === option.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
                                    <input type="radio" id={`variant-${option.id}`} name="fulfillment-variant" value={option.id} checked={selectedVariantId === option.id} onChange={() => setSelectedVariantId(option.id)} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                                    <div className="ml-4 flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold text-gray-900 text-sm">{option.item_name}</span>
                                            {option.is_substitute && (
                                                <span className="text-[10px] font-extrabold text-purple-600 bg-purple-100 px-2 py-0.5 rounded flex items-center"><LuReplace className="mr-1"/>SUBSTITUTE</span>
                                            )}
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-600 font-medium">
                                            <span>{option.color_name}</span>
                                            <span className="bg-gray-100 px-2 rounded">Stock: {option.available_stock}</span>
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label htmlFor="fulfill-quantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity to Fulfill (Remaining: {remainingRequired})</label>
                        <input type="number" id="fulfill-quantity" value={quantity} onChange={e => setQuantity(parseInt(e.target.value, 10) || 0)} className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold" min="1" max={maxAllowed} />
                    </div>
                </div>
                <div className="px-6 py-4 bg-white border-t flex justify-end space-x-3">
                    <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 text-gray-800 rounded-lg font-bold hover:bg-gray-200 transition-colors">Cancel</button>
                    <button onClick={handleSubmit} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md">Confirm Fulfillment</button>
                </div>
            </div>
        </div>
    );
};

// --- Main Page Component ---
const TrimOrderDetailPage = () => {
    const { orderId } = useParams();
    const [orderInfo, setOrderInfo] = useState(null);
    const [items, setItems] = useState([]);
    const [missingItems, setMissingItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFulfillingAll, setIsFulfillingAll] = useState(false); 
    const [isReverting, setIsReverting] = useState(false);
    const [error, setError] = useState(null);
    
    // Modals state
    const [modalState, setModalState] = useState({ isOpen: false, item: null });
    const [refModalOpen, setRefModalOpen] = useState(false); // NEW: Reference Modal State

    const fetchDetails = useCallback(async () => {
        setIsLoading(true); 
        setError(null);
        try {
            const response = await storeManagerApi.getTrimOrderDetails(orderId);
            const sanitizedItems = (response.data.items || []).map(item => ({
                ...item,
                quantity_fulfilled: parseInt(item.quantity_fulfilled) || 0,
                quantity_required: parseInt(item.quantity_required) || 0,
            }));
            setItems(sanitizedItems);
            setMissingItems(response.data.missing_items || []);
            
            setOrderInfo({
                status: response.data.status,
                batchId: response.data.production_batch_id,
                batch_code: response.data.batch_code,
            });
        } catch (err) {
            setError('Could not load order details.');
        } finally {
            setIsLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        fetchDetails();
    }, [fetchDetails]);

    // 1. Primary Exact Fulfillable Items
    const exactFulfillableItems = useMemo(() => {
        return items.filter(item => {
            const remaining = item.quantity_required - item.quantity_fulfilled;
            return !item.is_fulfilled && remaining > 0 && item.available_stock >= remaining;
        });
    }, [items]);

    // 2. Substitute Fulfillable Items
    const substituteFulfillableItems = useMemo(() => {
        return items.filter(item => {
            const remaining = item.quantity_required - item.quantity_fulfilled;
            const needsSub = item.available_stock < remaining;
            const hasGoodSub = item.substitutes && item.substitutes.some(sub => sub.available_stock >= remaining);
            return !item.is_fulfilled && remaining > 0 && needsSub && hasGoodSub;
        });
    }, [items]);

    const handleFulfillAllExact = async () => {
        if (!window.confirm(`Auto-fulfill ${exactFulfillableItems.length} items using exact matches?`)) return;
        setIsFulfillingAll(true);
        try {
            const res = await storeManagerApi.autoFulfillOrder(orderId);
            alert(res.data.message);
            fetchDetails();
        } catch (err) {
            alert(`Failed: ${err.response?.data?.error || 'Server error'}`);
        } finally {
            setIsFulfillingAll(false);
        }
    };

    const handleFulfillAllSubs = async () => {
        if (!window.confirm(`Auto-fulfill ${substituteFulfillableItems.length} items using available substitutes?`)) return;
        setIsFulfillingAll(true);
        try {
            const res = await storeManagerApi.autoFulfillSubstitutes(orderId);
            alert(res.data.message);
            fetchDetails();
        } catch (err) {
            alert(`Failed: ${err.response?.data?.error || 'Server error'}`);
        } finally {
            setIsFulfillingAll(false);
        }
    };

    const handleFulfillClick = (item) => setModalState({ isOpen: true, item: item });

    const handleFulfillmentSubmit = async (fulfillmentData) => {
        try {
            await storeManagerApi.fulfillWithVariant(fulfillmentData);
            setModalState({ isOpen: false, item: null });
            fetchDetails();
        } catch (err) {
            alert(`Fulfillment failed: ${err.response?.data?.error || 'Server error'}`);
        }
    };

    const handleRevertFulfillment = async (logId) => {
        if (!window.confirm("Are you sure you want to remove this fulfillment? The items will be returned to inventory and you will need to fulfill this again.")) return;
        setIsReverting(true);
        try {
            await storeManagerApi.revertFulfillment(logId);
            fetchDetails();
        } catch (err) {
            alert(`Failed to revert: ${err.response?.data?.error || 'Server error'}`);
        } finally {
            setIsReverting(false);
        }
    };
    
    const handleRecheck = async () => {
        try {
            const response = await storeManagerApi.recheckMissingItems(orderId);
            alert(response.data.message);
            fetchDetails();
        } catch (err) {
            alert(`Re-check failed: ${err.response?.data?.error || 'Server error'}`);
        }
    };
    
    const getItemStatus = (item) => {
        const remaining = item.quantity_required - item.quantity_fulfilled;
        if (item.is_fulfilled) return { text: 'Fulfilled', color: 'green', icon: LuPackageCheck };
        if (item.quantity_fulfilled > 0) return { text: 'Partially Fulfilled', color: 'purple', icon: LuPackage };
        if (item.available_stock >= remaining) return { text: 'Ready to Fulfill', color: 'blue', icon: LuPackage };
        if (item.substitutes && item.substitutes.some(sub => sub.available_stock >= remaining)) return { text: 'Substitute Available', color: 'teal', icon: LuReplace };
        return { text: 'Insufficient Stock', color: 'red', icon: LuTriangleAlert };
    };

    const isFulfillmentPossible = (item) => {
        if (item.is_fulfilled) return false;
        if (item.available_stock > 0) return true;
        if (item.substitutes && item.substitutes.some(sub => sub.available_stock > 0)) return true;
        return false;
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <header className="mb-6">
                <Link to="/store-manager/trim-orders" className="text-sm text-blue-600 hover:underline flex items-center mb-4 font-semibold">
                    <LuArrowLeft className="mr-2" /> Back to All Orders
                </Link>
                
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                                <h1 className="text-2xl font-extrabold text-gray-900">Trim Order #{orderId}</h1>
                                {orderInfo?.status && (
                                    <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${orderInfo.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                        {orderInfo.status}
                                    </span>
                                )}
                            </div>
                            
                            {orderInfo && (
                                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600 bg-gray-50 border border-gray-100 p-3 rounded-lg inline-flex">
                                    <div className="flex items-center">
                                        <span className="font-bold text-gray-400 uppercase text-[10px] tracking-wider mr-2">Batch:</span> 
                                        <span className="font-semibold text-gray-800">
                                            #{orderInfo.batchId} 
                                            {orderInfo.batch_code && <span className="ml-1 text-gray-500">({orderInfo.batch_code})</span>}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex flex-col sm:flex-row items-end gap-3 shrink-0 mt-2 md:mt-0">
                            {/* ✅ NEW BUTTON: Opens Reference Modal */}
                            <button 
                                onClick={() => setRefModalOpen(true)}
                                className="px-5 py-2.5 bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 hover:border-gray-400 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center"
                            >
                                <Info className="mr-2 h-5 w-5 text-gray-500" /> 
                                View Ref & BOM
                            </button>

                            <Link 
                                to={`/store-manager/trim-orders/${orderId}/summary`} 
                                className="px-5 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-100 hover:border-indigo-600 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center group"
                            >
                                <LuFileText className="mr-2 h-5 w-5 text-indigo-500 group-hover:text-indigo-200 transition-colors" /> 
                                View Order Summary
                            </Link>
                        </div>
                    </div>
                </div>
            </header>
            
            {isLoading && !isFulfillingAll && !isReverting ? <Spinner /> : error ? (
                <div className="p-4 bg-red-100 text-red-700 rounded-lg shadow-sm border border-red-200">{error}</div>
            ) : (
                <main className="space-y-6">
                    {missingItems.length > 0 && (
                         <div className="p-5 border-l-4 border-red-500 bg-white rounded-r-xl shadow-sm">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center">
                                    <LuTriangleAlert className="h-8 w-8 text-red-500 mr-4" />
                                    <div>
                                        <h2 className="text-lg font-bold text-red-800">Action Required: Missing Items</h2>
                                        <p className="text-sm text-red-700 font-medium">These trim variants must be created in the system before the order can be completed.</p>
                                    </div>
                                </div>
                                <button onClick={handleRecheck} className="px-5 py-2.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center font-bold shadow-sm transition-colors">
                                    <LuRefreshCw className="mr-2 h-4 w-4"/> Re-check Inventory
                                </button>
                            </div>
                            <ul className="list-disc list-inside pl-12 mt-3 space-y-1 text-sm text-red-900 font-medium">
                                {missingItems.map(item => (
                                    <li key={item.id}><strong>{Math.ceil(item.quantity_required)} units</strong> of {item.item_name} - {item.color_name || "AGNOSTIC"}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-5 border-b border-gray-100 flex flex-wrap justify-between items-center gap-4 bg-gray-50/50">
                            <h3 className="text-xl font-bold text-gray-800 flex items-center">
                                <LuListOrdered className="mr-3 text-blue-600"/>Order Requirements
                            </h3>
                            
                            <div className="flex gap-3">
                                {substituteFulfillableItems.length > 0 && (
                                    <button 
                                        onClick={handleFulfillAllSubs} 
                                        disabled={isFulfillingAll || isReverting}
                                        className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg shadow-sm hover:bg-purple-700 transition-colors flex items-center disabled:opacity-70"
                                    >
                                        {isFulfillingAll ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <LuWand className="mr-2 h-4 w-4"/>}
                                        Auto-Fulfill {substituteFulfillableItems.length} Substitutes
                                    </button>
                                )}
                                {exactFulfillableItems.length > 0 && (
                                    <button 
                                        onClick={handleFulfillAllExact} 
                                        disabled={isFulfillingAll || isReverting}
                                        className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg shadow-sm hover:bg-green-700 transition-colors flex items-center disabled:opacity-70"
                                    >
                                        {isFulfillingAll ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <LuCircleCheck className="mr-2 h-4 w-4"/>}
                                        Auto-Fulfill {exactFulfillableItems.length} Exact Matches
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-white text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                    <tr>
                                        <th className="py-4 px-5 text-left font-bold">Item Requirement</th>
                                        <th className="py-4 px-5 text-center font-bold">In Stock</th>
                                        <th className="py-4 px-5 text-center font-bold">Status</th>
                                        <th className="py-4 px-5 text-left font-bold min-w-[280px]">Fulfillment Details & Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 relative">
                                    {(isFulfillingAll || isReverting) && (
                                        <tr>
                                            <td colSpan="4" className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                                                <div className="bg-white px-6 py-3 rounded-xl shadow-lg border flex items-center font-bold text-blue-700">
                                                    <Loader2 className="animate-spin h-5 w-5 mr-3"/> Processing Operation...
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    
                                    {items.map(item => {
                                        const status = getItemStatus(item);
                                        const Icon = status.icon;
                                        const isComplete = item.is_fulfilled;

                                        return (
                                            <tr key={item.id} className={`hover:bg-blue-50/30 transition-colors align-top ${isComplete ? 'bg-green-50/20' : ''}`}>
                                                
                                                <td className="py-4 px-5">
                                                    <div className="font-bold text-gray-900 text-base mb-1">{item.item_name}</div>
                                                    <div className="text-sm font-medium text-gray-600 flex items-center">
                                                        Req: <span className="font-bold text-gray-900 ml-1.5 bg-gray-100 px-2 rounded">{item.quantity_required}</span> 
                                                        <span className="mx-2 text-gray-300">|</span> 
                                                        Color: <span className="font-bold text-gray-800 ml-1.5">{item.color_name} {item.color_number ? `- ${item.color_number}` : ''}</span>
                                                    </div>
                                                </td>

                                                <td className="py-4 px-5 text-center">
                                                    <span className={`text-lg font-bold ${item.available_stock > 0 ? 'text-blue-700' : 'text-red-500'}`}>
                                                        {item.available_stock}
                                                    </span>
                                                </td>

                                                <td className="py-4 px-5 text-center">
                                                    <span className={`inline-flex items-center font-bold text-[11px] uppercase tracking-wide text-${status.color}-700 bg-${status.color}-100 px-3 py-1.5 rounded-full border border-${status.color}-200`}>
                                                        <Icon className="mr-1.5 h-4 w-4"/> {status.text}
                                                    </span>
                                                </td>

                                                <td className="py-4 px-5">
                                                    <div className="flex flex-col gap-3">
                                                        
                                                        {!isComplete && (
                                                            <div>
                                                                <button 
                                                                    onClick={() => handleFulfillClick(item)} 
                                                                    disabled={!isFulfillmentPossible(item)} 
                                                                    className="w-full py-2 text-sm bg-blue-600 text-white rounded-lg font-bold disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors shadow-sm flex justify-center items-center"
                                                                >
                                                                    <LuPackage className="mr-2 h-4 w-4"/> Allocate Stock
                                                                </button>
                                                            </div>
                                                        )}

                                                        {item.fulfillment_log && item.fulfillment_log.length > 0 && (
                                                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                                                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex justify-between border-b pb-1">
                                                                    <span>Allocated: {item.quantity_fulfilled} / {item.quantity_required}</span>
                                                                    <span>History</span>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    {item.fulfillment_log.map(log => (
                                                                       
                                                                        <div key={log.id} className="flex items-center justify-between bg-white border border-gray-200 px-3 py-2 rounded shadow-sm hover:border-blue-300 transition-colors group">
                                                                            <div className="flex flex-col text-left overflow-hidden pr-2">
                                                                                <span className="text-xs font-bold text-gray-800 leading-tight truncate flex items-center">
                                                                                    <span className="bg-gray-100 text-gray-600 px-1.5 rounded text-[10px] mr-2">{log.quantity_fulfilled}x</span>
                                                                                    {log.fulfilled_item_name}
                                                                                </span>
                                                                                <span className="text-[10px] font-semibold text-gray-500 leading-tight truncate mt-0.5 ml-[26px]">
                                                                                    {log.fulfilled_color_name} {log.fulfilled_color_number ? `- ${log.fulfilled_color_number}` : ''}
                                                                                    {log.used_substitute && <span className="text-purple-600 font-bold ml-1.5 bg-purple-50 px-1 rounded">(Substituted)</span>}
                                                                                </span>
                                                                            </div>
                                                                            
                                                                            <button 
                                                                                onClick={() => handleRevertFulfillment(log.id)}
                                                                                className="text-red-400 hover:text-white hover:bg-red-500 p-1.5 rounded transition-colors flex-shrink-0"
                                                                                title="Undo this specific fulfillment"
                                                                            >
                                                                                <LuTrash2 size={14} />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {items.length === 0 && (
                                        <tr><td colSpan="4" className="text-center py-10 text-gray-500 font-medium">No valid items were included in this order.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            )}
            
            {/* Existing Fulfillment Modal */}
            {modalState.isOpen && (
                <FulfillmentModal item={modalState.item} onClose={() => setModalState({ isOpen: false, item: null })} onSubmit={handleFulfillmentSubmit} />
            )}

            {/* NEW Reference & BOM Modal */}
            <ReferenceDataModal isOpen={refModalOpen} onClose={() => setRefModalOpen(false)} orderId={orderId} />

        </div>
    );
};

export default TrimOrderDetailPage;