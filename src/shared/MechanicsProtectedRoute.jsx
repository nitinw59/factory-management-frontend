import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const MechanicsProtectedRoute = ({ children }) => {
    const { user } = useAuth();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (user.role !== 'mechanic' && user.role !== 'factory_admin') {
        return <Navigate to="/unauthorized" replace />;
    }

    return children; // ✅ Wraps MechanicLayout and its Outlet
};

export default MechanicsProtectedRoute;