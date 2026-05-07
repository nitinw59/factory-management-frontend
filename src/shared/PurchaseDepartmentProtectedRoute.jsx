import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PurchaseDepartmentProtectedRoute = ({ children }) => {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    if (user.role !== 'purchase_manager' && user.role !== 'factory_admin') {
        return <Navigate to="/unauthorized" replace />;
    }
    return children;
};

export default PurchaseDepartmentProtectedRoute;
