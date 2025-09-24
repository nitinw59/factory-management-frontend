import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const InitialRedirect = () => {
    const { user } = useAuth();

    // This is a fallback for safety. The ProtectedRoute should prevent this
    // component from rendering if there is no authenticated user.
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // --- This is the central role-based routing logic ---
    // The switch statement explicitly handles each role defined in your application.
    switch (user.role) {
        case 'factory_admin':
            // Factory Admins are sent to the main administrative dashboard.
            return <Navigate to="/admin/dashboard" replace />;
        
        case 'store_manager':
            // Store Managers are sent directly to their dedicated inventory dashboard.
            return <Navigate to="/store-manager/dashboard" replace />;
            
        case 'production_manager':
            // Production Managers are sent to their production planning dashboard.
            return <Navigate to="/production-manager/dashboard" replace />;

        default:
            // If a user has a valid login but their role is not recognized
            // by the application's portals, they are sent to an unauthorized page.
            return <Navigate to="/unauthorized" replace />;
    }
};

export default InitialRedirect;

