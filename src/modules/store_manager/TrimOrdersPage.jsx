import React, { useState, useEffect, useCallback } from 'react';
import { storeManagerApi } from '../../api/storeManagerApi';
import { Link } from 'react-router-dom';

const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

const TrimOrdersPage = () => {
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchOrders = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await storeManagerApi.getAllTrimOrders();
            setOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch trim orders", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);
    
    const getStatusColor = (status) => {
        switch(status) {
            case 'PENDING': return 'border-yellow-500';
            case 'PREPARED': return 'border-green-500';
            default: return 'border-gray-300';
        }
    };

    const OrderCard = ({ order }) => (
        <Link to={`/store-manager/trim-orders/${order.id}`} className={`block bg-white p-4 rounded-lg shadow border-l-4 ${getStatusColor(order.status)} hover:shadow-md transition-shadow`}>
            <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg text-blue-600">Order #{order.id}</h3>
                <span className="text-xs font-semibold">{order.status}</span>
            </div>
            <p className="text-sm text-gray-600">For Production Batch #{order.production_batch_id}</p>
            <p className="text-xs text-gray-400 mt-2">Created by {order.created_by} on {new Date(order.created_at).toLocaleDateString()}</p>
        </Link>
    );

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Trim Orders</h1>
            {isLoading ? <Spinner /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {orders.length > 0 ? (
                        orders.map(order => <OrderCard key={order.id} order={order} />)
                    ) : (
                        <p className="text-center text-gray-500 col-span-full">No trim orders found.</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default TrimOrdersPage;
