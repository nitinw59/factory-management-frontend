import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Readers of the trim-loss feature (FE brief Part 2, line 119): every reporter/pm/hr/second-approver
// plus store_manager + accountant. Per-action buttons are gated inline on the pages themselves.
const TrimLossProtectedRoute = ({ children }) => {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/" replace />;
    }

    const allowedRoles = [
        'line_loader', 'line_supervisor', 'line_manager',
        'production_manager', 'factory_admin',
        'hr_manager', 'purchase_manager',
        'store_manager', 'accountant',
    ];

    if (!allowedRoles.includes(user.role)) {
        return <Navigate to="/unauthorized" replace />;
    }

    return children ? children : <Outlet />;
};

export default TrimLossProtectedRoute;
