import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { storeManagerApi } from '../../api/storeManagerApi';
import { LuClock, LuPackageCheck, LuPackage, LuTriangleAlert, LuRefreshCw, LuReplace, LuArrowLeft, LuListOrdered, LuCircleCheck, LuWand, LuTrash2 } from 'react-icons/lu';
import { Loader2 } from 'lucide-react'; 

const Spinner = () => <div className="flex justify-center items-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

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

const TrimOrderDetailPage = () => {
    const { orderId } = useParams();
    const [orderInfo, setOrderInfo] = useState(null);
    const [items, setItems] = useState([]);
    const [missingItems, setMissingItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFulfillingAll, setIsFulfillingAll] = useState(false); 
    const [isReverting, setIsReverting] = useState(false);
    const [error, setError] = useState(null);
    const [modalState, setModalState] = useState({ isOpen: false, item: null });

    const fetchDetails = useCallback(async () => {
        setIsLoading(true); 
        setError(null);
        try {
            const response = await storeManagerApi.getTrimOrderDetails(orderId);
            console.log("Fetched order details:", response.data);
            const sanitizedItems = (response.data.items || []).map(item => ({
                ...item,
                quantity_fulfilled: parseInt(item.quantity_fulfilled) || 0,
                quantity_required: parseInt(item.quantity_required) || 0,
            }));
            setItems(sanitizedItems);
            setMissingItems(response.data.missing_items || []);
            setOrderInfo({
                status: response.data.status,
                batchId: response.data.production_batch_id
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

    // 2. Substitute Fulfillable Items (Exact stock is too low, but a substitute has enough)
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

    // 3. Revert (Change) Fulfillment Feature
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
                <div className="flex justify-between items-center bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                    <div>
                        <h1 className="text-2xl font-extrabold text-gray-900">Trim Order #{orderId}</h1>
                        {orderInfo?.batchId && <p className="text-sm font-medium text-gray-500 mt-1">Production Batch #{orderInfo.batchId}</p>}
                    </div>
                    {orderInfo?.status && (
                        <span className={`px-4 py-1.5 text-sm font-bold rounded-full border ${orderInfo.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                            {orderInfo.status}
                        </span>
                    )}
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
                            
                            {/* Bulk Action Buttons */}
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
                                                
                                                {/* ITEM DETAILS */}
                                                <td className="py-4 px-5">
                                                    <div className="font-bold text-gray-900 text-base mb-1">{item.item_name}</div>
                                                    <div className="text-sm font-medium text-gray-600 flex items-center">
                                                        Req: <span className="font-bold text-gray-900 ml-1.5 bg-gray-100 px-2 rounded">{item.quantity_required}</span> 
                                                        <span className="mx-2 text-gray-300">|</span> 
                                                        Color: <span className="font-bold text-gray-800 ml-1.5">{item.color_name} - {item.color_number}</span>
                                                    </div>
                                                </td>

                                                {/* IN STOCK */}
                                                <td className="py-4 px-5 text-center">
                                                    <span className={`text-lg font-bold ${item.available_stock > 0 ? 'text-blue-700' : 'text-red-500'}`}>
                                                        {item.available_stock}
                                                    </span>
                                                </td>

                                                {/* STATUS */}
                                                <td className="py-4 px-5 text-center">
                                                    <span className={`inline-flex items-center font-bold text-[11px] uppercase tracking-wide text-${status.color}-700 bg-${status.color}-100 px-3 py-1.5 rounded-full border border-${status.color}-200`}>
                                                        <Icon className="mr-1.5 h-4 w-4"/> {status.text}
                                                    </span>
                                                </td>

                                                {/* FULFILLMENT DETAILS & ACTIONS */}
                                                <td className="py-4 px-5">
                                                    <div className="flex flex-col gap-3">
                                                        
                                                        {/* The action button if more is needed */}
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

                                                        {/* Fulfillment Logs (The "What was used" view + Revert option) */}
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
                                                                                    {log.fulfilled_color_name} - {log.fulfilled_color_number}
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
            
            {modalState.isOpen && (
                <FulfillmentModal item={modalState.item} onClose={() => setModalState({ isOpen: false, item: null })} onSubmit={handleFulfillmentSubmit} />
            )}
        </div>
    );
};

export default TrimOrderDetailPage;