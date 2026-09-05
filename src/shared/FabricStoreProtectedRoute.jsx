import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const FabricStoreProtectedRoute = ({ children }) => {
    const { user } = useAuth();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (user.role !== 'fabric_store_manager' && user.role !== 'factory_admin') {
        return <Navigate to="/unauthorized" replace />;
    }

    return children; // ✅ Wraps FabricStoreLayout and its Outlet
};

export default FabricStoreProtectedRoute;
