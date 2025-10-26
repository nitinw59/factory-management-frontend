import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { storeManagerApi } from '../../api/storeManagerApi';
import { FiClock, FiCheckCircle, FiList, FiPackage } from 'react-icons/fi'; 

const Spinner = () => <div className="flex justify-center items-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

// --- Reusable Order Card ---
const OrderCard = ({ order }) => {
    // Determine status based on order.status
    const statusInfo = {
        PENDING: { color: 'yellow', icon: FiClock, text: 'Pending' },
        PREPARED: { color: 'blue', icon: FiPackage, text: 'Prepared' },
        COMPLETED: { color: 'green', icon: FiCheckCircle, text: 'Completed' },
    }[order.status] || { color: 'gray', icon: FiList, text: order.status }; // Default fallback

    const Icon = statusInfo.icon;

    return (
        <Link 
            to={`/store-manager/trim-orders/${order.id}`} 
            className={`block bg-white p-4 rounded-lg shadow-md border-l-4 border-${statusInfo.color}-500 hover:shadow-lg hover:border-${statusInfo.color}-600 transition-all duration-200`}
        >
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="font-bold text-lg text-gray-800">Order #{order.id}</h3>
                    <p className="text-sm text-gray-600 mt-1">For Batch #{order.production_batch_id}</p>
                </div>
                 <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full bg-${statusInfo.color}-100 text-${statusInfo.color}-800`}>
                     <Icon size={14} className="mr-1.5"/>
                     {statusInfo.text}
                 </span>
            </div>
            <p className="text-xs text-gray-400 mt-3 pt-2 border-t border-gray-100">
                Created by {order.created_by} on {new Date(order.created_at).toLocaleDateString()}
            </p>
        </Link>
    );
};

const TrimOrdersPage = () => {
    const [allOrders, setAllOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchOrders = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await storeManagerApi.getAllTrimOrders();
            setAllOrders(response.data || []);
        } catch (err) {
            console.error("Failed to fetch trim orders", err);
            setError("Could not load trim orders. Please try again.");
            setAllOrders([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);
    
    // Separate orders into pending/prepared and completed lists
    const { pendingOrders, completedOrders } = useMemo(() => {
        const pending = [];
        const completed = [];
        allOrders.forEach(order => {
            if (order.status === 'COMPLETED') {
                completed.push(order);
            } else {
                pending.push(order); // Includes PENDING, PREPARED, etc.
            }
        });
         // Sort pending orders to show most recent first
        pending.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        // Sort completed orders to show most recent first
        completed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return { pendingOrders: pending, completedOrders: completed };
    }, [allOrders]);

    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Trim Orders</h1>
                <p className="text-gray-600 mt-1">Manage and fulfill trim requirements for production batches.</p>
            </header>

            {isLoading ? <Spinner /> : error ? (
                 <div className="p-4 bg-red-100 text-red-700 rounded-lg shadow-sm border border-red-200">{error}</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    
                    {/* Pending Orders Section */}
                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-yellow-700 flex items-center">
                            <FiClock className="mr-2"/> Pending & Prepared Orders ({pendingOrders.length})
                        </h2>
                        {pendingOrders.length > 0 ? (
                            <div className="space-y-4">
                                {pendingOrders.map(order => <OrderCard key={order.id} order={order} />)}
                            </div>
                        ) : (
                            <div className="text-center py-10 px-4 bg-white rounded-lg shadow-sm border">
                                <FiPackage className="mx-auto h-12 w-12 text-gray-400" />
                                <h3 className="mt-2 text-lg font-medium text-gray-900">All Caught Up!</h3>
                                <p className="mt-1 text-sm text-gray-500">There are no pending or prepared trim orders.</p>
                            </div>
                        )}
                    </section>

                    {/* Completed Orders Section */}
                     <section>
                        <h2 className="text-xl font-semibold mb-4 text-green-700 flex items-center">
                            <FiCheckCircle className="mr-2"/> Completed Orders ({completedOrders.length})
                        </h2>
                        {completedOrders.length > 0 ? (
                            <div className="space-y-4">
                                {completedOrders.map(order => <OrderCard key={order.id} order={order} />)}
                            </div>
                        ) : (
                             <div className="text-center py-10 px-4 bg-white rounded-lg shadow-sm border">
                                <FiList className="mx-auto h-12 w-12 text-gray-400" />
                                <h3 className="mt-2 text-lg font-medium text-gray-900">No History Yet</h3>
                                <p className="mt-1 text-sm text-gray-500">No trim orders have been completed yet.</p>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};

export default TrimOrdersPage;