import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { storeManagerApi } from '../../api/storeManagerApi';
import { LuPackageCheck, LuPackage, LuStar, LuTriangleAlert, LuRefreshCw ,LuBeanOff} from 'react-icons/lu';

const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

const TrimOrderDetailPage = () => {
    const { orderId } = useParams();
    const [orderInfo, setOrderInfo] = useState(null);
    const [items, setItems] = useState([]);
    const [missingItems, setMissingItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDetails = useCallback(async () => {
        if (!isLoading) setIsLoading(true);
        setError(null);
        try {
            const response = await storeManagerApi.getTrimOrderDetails(orderId);
            console.log("Fetched order details:", response.data);
            // ✅ FIX: Sanitize the incoming data to prevent NaN issues.
            // This ensures `quantity_fulfilled` is always a number.
            const sanitizedItems = (response.data.items || []).map(item => ({
                ...item,
                quantity_fulfilled: item.quantity_fulfilled || 0, // Coalesce null/undefined to 0
            }));

            setItems(sanitizedItems);
            setMissingItems(response.data.missing_items || []);
            setOrderInfo({
                status: response.data.status,
                batchId: response.data.production_batch_id
            });
        } catch (err) {
            console.error(`Failed to fetch details for order ${orderId}`, err);
            setError('Could not load order details.');
        } finally {
            setIsLoading(false);
        }
    }, [orderId, isLoading]);

    useEffect(() => {
        fetchDetails();
    }, [orderId]); // Removed fetchDetails from dependency array to prevent loops, orderId is the trigger.

    const handleFulfill = async (item) => {
        console.log("Fulfilling item:", item);
       
        const remainingQty = item.quantity_required - item.quantity_fulfilled;
        const promptMessage = `How many units of "${item.item_name} - ${item.color_name}" are you fulfilling?\n\nRemaining Required: ${remainingQty}`;
        
        const qtyToFulfillStr = window.prompt(promptMessage, remainingQty);

        if (qtyToFulfillStr === null) return; // User cancelled

        const qtyToFulfill = parseInt(qtyToFulfillStr, 10);

        if (isNaN(qtyToFulfill) || qtyToFulfill <= 0) {
            alert("Invalid quantity. Please enter a number greater than 0.");
            return;
        }
        if (qtyToFulfill > remainingQty) {
            alert(`Error: Quantity cannot be greater than the remaining required amount of ${remainingQty}.`);
            return;
        }

        try {
            await storeManagerApi.fulfillOrderItem({
                orderItemId: item.id,
                quantityToFulfill: qtyToFulfill, // Send the user-provided quantity
                trimItemVariantId: item.trim_item_variant_id
            });
            fetchDetails(); // Refresh details after fulfillment
        } catch (err) {
            alert(`Fulfillment failed: ${err.response?.data?.error || 'Server error'}`);
        }
    };

    const handleRecheck = async () => {
        try {
            const response = await storeManagerApi.recheckMissingItems(orderId);
            alert(response.data.message || "Re-check complete.");
            fetchDetails(); // Refresh the entire page data
        } catch (err) {
            alert(`Re-check failed: ${err.response?.data?.error || 'Server error'}`);
        }
    };
    
    // Helper to determine the status of an item
    const getItemStatus = (item) => {
        if (item.is_fulfilled) {
            return { text: 'Fulfilled', color: 'green', icon: LuPackageCheck };
        }
        if (item.quantity_fulfilled > 0) {
            return { text: 'Partially Fulfilled', color: 'purple', icon: LuPackage };
        }
        if (item.available_stock >= (item.quantity_required - item.quantity_fulfilled)) {
            return { text: 'Ready to Fulfill', color: 'blue', icon: LuBeanOff };
        }
        return { text: 'Insufficient Stock', color: 'red', icon: LuStar };
    };

    return (
        <div>
            <Link to="/store-manager/trim-orders" className="text-blue-600 hover:underline mb-6 block">&larr; Back to All Orders</Link>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold">Details for Trim Order #{orderId}</h1>
                    {orderInfo?.batchId && <p className="text-sm text-gray-500">For Production Batch #{orderInfo.batchId}</p>}
                </div>
                {orderInfo?.status && (
                    <span className={`px-3 py-1 text-sm font-semibold rounded-full ${orderInfo.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        Status: {orderInfo.status}
                    </span>
                )}
            </div>
            
            {isLoading ? <Spinner /> : error ? (
                <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>
            ) : (
                <>
                    {/* Missing Items Warning Box */}
                    {missingItems.length > 0 && (
                         <div className="mb-6 p-4 border-l-4 border-red-500 bg-red-50 rounded-r-lg">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center">
                                    <LuTriangleAlert className="h-6 w-6 text-red-500 mr-3" />
                                    <div>
                                        <h2 className="text-lg font-bold text-red-800">Order Incomplete</h2>
                                        <p className="text-sm text-red-700">The following required trim variants were not found in the system and could not be added to the order.</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleRecheck}
                                    className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 flex items-center"
                                >
                                    <LuRefreshCw className="mr-2 h-4 w-4"/>
                                    Re-check
                                </button>
                            </div>
                            <ul className="list-disc pl-5 mt-3 space-y-1 text-sm text-red-900">
                                {missingItems.map(item => (
                                    <li key={item.id}>
                                        <strong>{Math.ceil(item.quantity_required)} units</strong> of {item.item_name} - {item.color_name}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Existing Items Table */}
                    <div className="bg-white p-4 rounded-lg shadow">
                        <h3 className="text-xl font-semibold mb-4">Order Items</h3>
                        <table className="min-w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="py-2 px-3 text-left">Item</th>
                                    <th className="py-2 px-3 text-right">Required</th>
                                    <th className="py-2 px-3 text-right">Fulfilled</th>
                                    <th className="py-2 px-3 text-right">In Stock</th>
                                    <th className="py-2 px-3 text-center">Status</th>
                                    <th className="py-2 px-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {items.map(item => {
                                    const status = getItemStatus(item);
                                    const Icon = status.icon;
                                    return (
                                        <tr key={item.id}>
                                            <td className="py-2 px-3 font-medium">{item.item_name} - {item.color_name}</td>
                                            <td className="py-2 px-3 text-right font-bold">{item.quantity_required}</td>
                                            <td className="py-2 px-3 text-right font-semibold text-gray-600">{item.quantity_fulfilled}</td>
                                            <td className="py-2 px-3 text-right">{item.available_stock}</td>
                                            <td className="py-2 px-3 text-center">
                                                 <span className={`flex items-center justify-center font-semibold text-${status.color}-600`}>
                                                    <Icon className="mr-1.5"/> {status.text}
                                                 </span>
                                            </td>
                                            <td className="py-2 px-3 text-right">
                                                <button 
                                                    onClick={() => handleFulfill(item)}
                                                    disabled={item.is_fulfilled || item.available_stock < 1}
                                                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                                                >
                                                    Fulfill
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {items.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="text-center py-4 text-gray-500">No valid items were included in this order.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default TrimOrderDetailPage;

