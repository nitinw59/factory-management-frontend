import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { storeManagerApi } from '../../api/storeManagerApi';
import { LuBeanOff, LuStar, LuPackageCheck } from 'react-icons/lu';

const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

const TrimOrderDetailPage = () => {
    const { orderId } = useParams();
    const [items, setItems] = useState([]);
    const [orderInfo, setOrderInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDetails = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await storeManagerApi.getTrimOrderDetails(orderId);
            setItems(response.data.items || []);
            setOrderInfo({
                status: response.data.status,
                batchId: response.data.production_batch_id
            });
        } catch (error) {
            console.error(`Failed to fetch details for order ${orderId}`, error);
            setError('Could not load order details.');
        } finally {
            setIsLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        fetchDetails();
    }, [fetchDetails]);

    const handleFulfill = async (item) => {
        if (window.confirm(`This will deduct ${item.quantity_required} units of "${item.item_name} - ${item.color_name}" from stock. Are you sure?`)) {
            try {
                await storeManagerApi.fulfillOrderItem({
                    orderItemId: item.id,
                    quantityRequired: item.quantity_required,
                    trimItemVariantId: item.trim_item_variant_id
                });
                fetchDetails();
            } catch (err) {
                alert(`Fulfillment failed: ${err.response?.data?.error || 'Server error'}`);
            }
        }
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
                    <span className={`px-3 py-1 text-sm font-semibold rounded-full ${orderInfo.status === 'PREPARED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        Status: {orderInfo.status}
                    </span>
                )}
            </div>
            {isLoading ? <Spinner /> : error ? (
                <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>
            ) : (
                <div className="bg-white p-4 rounded-lg shadow">
                    <table className="min-w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="py-2 px-3 text-left">Item</th>
                                <th className="py-2 px-3 text-left">Color</th>
                                <th className="py-2 px-3 text-right">Required</th>
                                <th className="py-2 px-3 text-right">In Stock</th>
                                <th className="py-2 px-3 text-center">Status</th>
                                <th className="py-2 px-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.map(item => (
                                <tr key={item.id}>
                                    <td className="py-2 px-3 font-medium">{item.item_name}</td>
                                    <td className="py-2 px-3">{item.color_name}</td>
                                    <td className="py-2 px-3 text-right font-bold">{item.quantity_required}</td>
                                    <td className="py-2 px-3 text-right">{item.available_stock}</td>
                                    <td className="py-2 px-3 text-center">
                                        {item.is_fulfilled ? (
                                             <span className="flex items-center justify-center text-green-600 font-semibold"><LuPackageCheck className="mr-1"/> Fulfilled</span>
                                        ) : item.available_stock >= item.quantity_required ? (
                                            <span className="flex items-center justify-center text-blue-600"><LuBeanOff className="mr-1"/> Ready to Fulfill</span>
                                        ) : (
                                            <span className="flex items-center justify-center text-red-600"><LuStar className="mr-1"/> Insufficient Stock</span>
                                        )}
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                        <button 
                                            onClick={() => handleFulfill(item)}
                                            disabled={item.is_fulfilled || item.available_stock < item.quantity_required}
                                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                                        >
                                            Fulfill
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default TrimOrderDetailPage;

