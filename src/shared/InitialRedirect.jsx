import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const InitialRedirect = () => {

    console.log("InitialRedirect component rendered.");
    const { user } = useAuth();

    // This is a fallback for safety. The ProtectedRoute should prevent this
    // component from rendering if there is no authenticated user.
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    console.log("User role identified as:", user.role);
    // --- This is the central role-based routing logic ---
    // The switch statement explicitly handles each role defined in your application.
    switch (user.role) {
        case 'factory_admin':
            // Factory Admins are sent to the main administrative dashboard.
            return <Navigate to="/admin/dashboard" replace />;
        
        case 'store_manager':
            // Store Managers are sent directly to their dedicated inventory dashboard.
             return <Navigate to="/store-manager/trim-orders" replace />;
            
        case 'production_manager':
            // Production Managers are sent to their production planning dashboard.
            return <Navigate to="/production-manager/dashboard" replace />;

        case 'cutting_operator':
            // Cutting Operators are sent to their cutting queue dashboard.
            return <Navigate to="/cutting-portal/dashboard" replace />;

        case 'line_loader':
            // Line Loaders are sent to their line loader dashboard.
            return <Navigate to="/line-loader/dashboard" replace />;
        case 'validation_user':
            // Validation Users are sent to their validation dashboard.
            return <Navigate to="/validation-portal/dashboard" replace />;

        case 'line_manager':
            // Line Managers are sent to their line manager dashboard.
            return <Navigate to="/line-manager/dashboard" replace />;
        case 'checking_user':
            // Checking Users are sent to their checking workstation.
            return <Navigate to="/checking-portal" replace />;
        case 'numbering_user':
            // Numbering Users are sent to their numbering workstation.
            return <Navigate to="/numbering-portal" replace />;
        case 'cutting_manager':
            // Cutting Managers are sent to their cutting management dashboard.
            return <Navigate to="/initialization-portal/dashboard" replace />;

        case 'preparation_loader':
            // Preparation Loaders are sent to their preparation workstation.
            return <Navigate to="/preparation-portal" replace />;

        case 'preparation_manager':
            // Preparation Managers are sent to their preparation management dashboard.
            return <Navigate to="/preparation-manager" replace />;

        case 'preparation_unloader':
            // Preparation Unloaders are sent to their preparation unloading workstation.
            return <Navigate to="/preparation-unload-portal" replace />;
        
        case 'sewing_part_operator':
            // Sewing Part Operators are sent to their sewing part operator dashboard.
            return <Navigate to="/sewing-part-operator/dashboard" replace />;
        
       
        case 'sewing_manager':
            // Sewing Managers are sent to their sewing management dashboard.
            return <Navigate to="/sewing-manager/dashboard" replace />;
        case 'assembly_operator':
            // Assembly Operators are sent to their assembly operator dashboard.
            return <Navigate to="/assembly-portal/dashboard" replace />;
        case 'accountant':
            // Accountants are sent to their accounting dashboard.
            return <Navigate to="/accounts/sales/orders" replace />;

         case 'sales_manager':
            // Sales Managers are sent to their sales management dashboard.
            return <Navigate to="/accounts/sales/dashboard" replace />;

        case 'mechanic':
            // Mechanics are sent to their mechanic dashboard.
            return <Navigate to="/mechanics-portal/dashboard" replace />;

        
        default:
            // If a user has a valid login but their role is not recognized
            // by the application's portals, they are sent to an unauthorized page.
           return <Navigate to="/unauthorized" replace />;
    }
};

export default InitialRedirect;

