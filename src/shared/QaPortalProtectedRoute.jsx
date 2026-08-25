import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Union of every role allowed to READ anywhere in the QA Portal (analytics +
// Final QC). Per-action buttons (create/waive/close inspection) are gated
// more narrowly inline on the pages themselves — see the spec's role tables.
const ALLOWED_ROLES = [
    'factory_admin', 'line_loader', 'numbering_user', 'cutting_manager',
    'garment_checker', 'production_manager', 'quality_manager',
    'dispatch_officer', 'accountant', 'store_manager',
];

const QaPortalProtectedRoute = ({ children }) => {
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

    if (!ALLOWED_ROLES.includes(user.role)) {
        return <Navigate to="/unauthorized" replace />;
    }

    return children ? children : <Outlet />;
};

export default QaPortalProtectedRoute;
