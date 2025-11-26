import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { storeManagerApi } from '../../api/storeManagerApi';
import { LuClock, LuPackageCheck, LuPackage, LuTriangleAlert, LuRefreshCw, LuReplace, LuArrowLeft, LuListOrdered, LuWarehouse, LuInfo } from 'react-icons/lu';

const Spinner = () => <div className="flex justify-center items-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

// --- New, Sophisticated Fulfillment Modal ---
const FulfillmentModal = ({ item, onClose, onSubmit }) => {
    // Combine the original item and its substitutes into a single list of options
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
        if (!selectedOption) {
            alert("Please select an item to fulfill with.");
            return;
        }
        if (isNaN(quantity) || quantity <= 0) {
            alert("Invalid quantity. Please enter a number greater than 0.");
            return;
        }
        if (quantity > maxAllowed) {
            alert(`Error: Quantity cannot be greater than the available stock (${selectedOption.available_stock}) or remaining required (${remainingRequired}).`);
            return;
        }
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
                                <label key={option.id} htmlFor={`variant-${option.id}`} className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedVariantId === option.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-400'}`}>
                                    <input type="radio" id={`variant-${option.id}`} name="fulfillment-variant" value={option.id} checked={selectedVariantId === option.id} onChange={() => setSelectedVariantId(option.id)} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                                    <div className="ml-4 flex-1">
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold text-gray-900">{option.item_name} - {option.color_name}</span>
                                            {option.is_substitute && (
                                                <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full flex items-center"><LuReplace className="mr-1"/>SUBSTITUTE</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-600">Available Stock: {option.available_stock}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label htmlFor="fulfill-quantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity to Fulfill (Remaining: {remainingRequired})</label>
                        <input type="number" id="fulfill-quantity" value={quantity} onChange={e => setQuantity(parseInt(e.target.value, 10) || 0)} className="w-full p-2 border border-gray-300 rounded-md shadow-sm" min="1" max={maxAllowed} />
                    </div>
                </div>
                <div className="px-6 py-4 bg-white border-t flex justify-end space-x-3">
                    <button onClick={onClose} className="px-5 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300">Cancel</button>
                    <button onClick={handleSubmit} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">Confirm Fulfillment</button>
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
    const [error, setError] = useState(null);
    const [modalState, setModalState] = useState({ isOpen: false, item: null });

    const fetchDetails = useCallback(async () => {
        setIsLoading(true); // Always set loading to true when fetching
        setError(null);
        try {
            const response = await storeManagerApi.getTrimOrderDetails(orderId);
            console.log("Fetched order details:", response.data);
            const sanitizedItems = (response.data.items || []).map(item => ({
                ...item,
                quantity_fulfilled: item.quantity_fulfilled || 0,
            }));
            console.log("Sanitized items:", sanitizedItems);
            setItems(sanitizedItems);
            console.log("Missing items:", response.data.missing_items || []);
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
    }, [orderId]);

    const handleFulfillClick = (item) => {
        setModalState({ isOpen: true, item: item });
    };

    const handleFulfillmentSubmit = async (fulfillmentData) => {
        try {
            await storeManagerApi.fulfillWithVariant(fulfillmentData);
            setModalState({ isOpen: false, item: null });
            fetchDetails();
        } catch (err) {
            alert(`Fulfillment failed: ${err.response?.data?.error || 'Server error'}`);
        }
    };
    
    const handleRecheck = async () => {
        try {
            console.log("Initiating re-check for missing items...");
            const response = await storeManagerApi.recheckMissingItems(orderId);
            alert(response.data.message || "Re-check complete.");
            fetchDetails();
        } catch (err) {
            alert(`Re-check failed: ${err.response?.data?.error || 'Server error'}`);
        }
    };
    
    const getItemStatus = (item) => {
        const remainingRequired = item.quantity_required - item.quantity_fulfilled;
        if (item.is_fulfilled) return { text: 'Fulfilled', color: 'green', icon: LuPackageCheck };
        if (item.quantity_fulfilled > 0) return { text: 'Partially Fulfilled', color: 'purple', icon: LuPackage };
        if (item.available_stock >= remainingRequired) return { text: 'Ready to Fulfill', color: 'blue', icon: LuPackage };
        if (item.substitutes && item.substitutes.some(sub => sub.available_stock >= remainingRequired)) return { text: 'Substitute Available', color: 'teal', icon: LuReplace };
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
                <Link to="/store-manager/trim-orders" className="text-sm text-blue-600 hover:underline flex items-center mb-4">
                    <LuArrowLeft className="mr-2" /> Back to All Orders
                </Link>
                <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Trim Order #{orderId}</h1>
                        {orderInfo?.batchId && <p className="text-sm text-gray-600">For Production Batch #{orderInfo.batchId}</p>}
                    </div>
                    {orderInfo?.status && (
                        <span className={`px-3 py-1 text-sm font-bold rounded-full ${orderInfo.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {orderInfo.status}
                        </span>
                    )}
                </div>
            </header>
            
            {isLoading ? <Spinner /> : error ? (
                <div className="p-4 bg-red-100 text-red-700 rounded-lg shadow-sm border border-red-200">{error}</div>
            ) : (
                <main className="space-y-6">
                    {missingItems.length > 0 && (
                         <div className="p-5 border-l-4 border-red-500 bg-white rounded-r-lg shadow-sm">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center">
                                    <LuTriangleAlert className="h-8 w-8 text-red-500 mr-4" />
                                    <div>
                                        <h2 className="text-lg font-bold text-red-800">Action Required: Missing Items</h2>
                                        <p className="text-sm text-red-700">These trim variants must be created in the system before the order can be completed.</p>
                                    </div>
                                </div>
                                <button onClick={handleRecheck} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center font-semibold">
                                    <LuRefreshCw className="mr-2 h-4 w-4"/> Re-check Inventory
                                </button>
                            </div>
                            <ul className="list-disc list-inside pl-12 mt-3 space-y-1 text-sm text-red-900">
                                {missingItems.map(item => (
                                    <li key={item.id}><strong>{Math.ceil(item.quantity_required)} units</strong> of {item.item_name} - {item.color_name || "AGNOSTIC"}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                        <div className="p-4 border-b">
                            <h3 className="text-xl font-semibold text-gray-800 flex items-center"><LuListOrdered className="mr-3 text-gray-400"/>Order Items</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="py-3 px-4 text-left">Item Details</th>
                                        <th className="py-3 px-4 text-center">Required</th>
                                        <th className="py-3 px-4 text-center">Fulfilled</th>
                                        <th className="py-3 px-4 text-center">In Stock</th>
                                        <th className="py-3 px-4 text-center">Status</th>
                                        <th className="py-3 px-4 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {items.map(item => {
                                        const status = getItemStatus(item);
                                        const Icon = status.icon;
                                        return (
                                            <tr key={item.id} className="hover:bg-gray-50">
                                                <td className="py-3 px-4 font-medium text-gray-800">{item.item_name} - {item.color_name} ({item.color_number})</td>
                                                <td className="py-3 px-4 text-center font-bold text-gray-900">{item.quantity_required}</td>
                                                <td className="py-3 px-4 text-center font-semibold text-gray-600">{item.quantity_fulfilled}</td>
                                                <td className="py-3 px-4 text-center text-gray-600">{item.available_stock}</td>

                                                <td className="py-3 px-4 text-center">
                                                    <div className="relative group inline-flex justify-center">
                                                         <span className={`inline-flex items-center font-semibold text-xs text-${status.color}-700 bg-${status.color}-100 px-2.5 py-1 rounded-full cursor-default`}>
                                                            <Icon className="mr-1.5 h-4 w-4"/> {status.text}
                                                         </span>
                                                         {(item.fulfillment_log && item.fulfillment_log.length > 0) && (
                                                             <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 invisible group-hover:visible pointer-events-none">
                                                                <h4 className="font-bold border-b border-gray-600 pb-1 mb-1">Fulfillment History:</h4>
                                                                <ul className="space-y-1">
                                                                    {item.fulfillment_log.map((log, index) => (
                                                                        <li key={index} className="flex items-start">
                                                                             <LuClock size={12} className="mr-1.5 mt-0.5 text-gray-400 flex-shrink-0"/>
                                                                             <div>
                                                                                {log.quantity_fulfilled} units with <strong className={log.used_substitute ? 'text-purple-300' : ''}>{log.fulfilled_item_name} - {log.fulfilled_color_name}</strong>
                                                                                {log.used_substitute && <span className="text-purple-300 text-[10px]"> (Sub)</span>}
                                                                             </div>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                                 <div className="absolute bottom-[-4px] left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-gray-800"></div> {/* Arrow */}
                                                            </div>
                                                         )}
                                                    </div>
                                                </td>


                                                <td className="py-3 px-4 text-center">
                                                    <button onClick={() => handleFulfillClick(item)} disabled={!isFulfillmentPossible(item)} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700">
                                                        Fulfill
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {items.length === 0 && (
                                        <tr><td colSpan="6" className="text-center py-6 text-gray-500">No valid items were included in this order.</td></tr>
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
