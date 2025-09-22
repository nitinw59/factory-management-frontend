import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const InitialRedirect = () => {
    const { user } = useAuth();

    if (!user) {
        // This is a fallback for safety, though the ProtectedRoute should prevent
        // this component from rendering if there's no user.
        return <Navigate to="/login" replace />;
    }

    // --- NEW: Strictly Role-Based Redirect Logic ---
    // This switch statement explicitly handles each role.
    switch (user.role) {
        case 'factory_admin':
            return <Navigate to="/admin/dashboard" replace />;
        case 'store_manager':
            return <Navigate to="/store-manager/dashboard" replace />;
        default:
            // If the role is not recognized or is missing, send to an unauthorized page.
            return <Navigate to="/unauthorized" replace />;
    }
};

export default InitialRedirect;

