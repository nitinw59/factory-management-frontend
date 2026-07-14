import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Notification link_to target /trim-kits/orders/:id is shared across roles.
// Resolve to the right portal mount for the logged-in user.
const TrimKitLinkResolver = () => {
    const { orderId } = useParams();
    const { user, isLoading } = useAuth();

    if (isLoading) return null;
    if (!user) return <Navigate to="/" replace />;

    switch (user.role) {
        case 'line_loader':
        case 'factory_admin':
            return <Navigate to={`/line-loader/trim-kits/orders/${orderId}`} replace />;
        case 'store_manager':
            return <Navigate to={`/store-manager/trim-orders/${orderId}`} replace />;
        case 'production_manager':
            return <Navigate to={`/production-manager/trim-kits/orders/${orderId}`} replace />;
        default:
            return <Navigate to="/unauthorized" replace />;
    }
};

export default TrimKitLinkResolver;
