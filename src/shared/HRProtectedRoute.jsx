import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // Adjust path to your auth context

const HRProtectedRoute = ({ children }) => {
    const { user, loading } = useAuth();

    // 1. Wait for auth to initialize to prevent premature redirects
    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    // 2. If not logged in, send to login
    if (!user) {
        return <Navigate to="/" replace />;
    }

    // 3. Define who is allowed in the HR Portal
    const allowedRoles = ['hr_manager', 'factory_admin'];

    // 4. Check permission
    if (!allowedRoles.includes(user.role)) {
        return <Navigate to="/unauthorized" replace />;
    }

    // 5. Render the nested routes (the Layout and Pages)
    return children ? children : <Outlet />;
};

export default HRProtectedRoute;