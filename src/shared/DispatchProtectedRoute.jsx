import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const DispatchProtectedRoute = ({ children }) => {
    const { user } = useAuth();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (user.role !== 'dispatch_officer' && user.role !== 'factory_admin') {
        return <Navigate to="/unauthorized" replace />;
    }

    return children; // ✅ Wraps DispatchLayout and its Outlet
};

export default DispatchProtectedRoute;