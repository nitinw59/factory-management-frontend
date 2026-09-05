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
       
        case 'line_manager':
            // Line Managers are sent to their line manager dashboard.
            return <Navigate to="/line-manager/dashboard" replace />;
        
        case 'cutting_manager':
            // Cutting Managers are sent to their cutting management dashboard.
            return <Navigate to="/initialization-portal/dashboard" replace />;

        case 'universal_checker':
            // Universal Checkers are sent to their universal checking dashboard.
            return <Navigate to="/universal-checker/dashboard" replace />;

        case 'line_supervisor':
            // Sewing Managers are sent to their sewing management dashboard.
            return <Navigate to="/sewing-manager/dashboard" replace />;
        case 'garment_checker':
            // Garment Checkers are sent to their garment checking dashboard.
            return <Navigate to="/garment-checker/dashboard" replace />;

        case 'quality_manager':
            // Quality Managers are sent to the QA Portal (QC analytics + Final QC).
            return <Navigate to="/qa-portal" replace />;

        case 'validation_user':
            return <Navigate to="/validation-portal" replace />;

        case 'preparation_unloader':
            return <Navigate to="/preparation-unload-portal" replace />;

        case 'sewing_part_operator':
            return <Navigate to="/sewing-part-operator" replace />;

        case 'sales_manager':
            // No dedicated sales portal yet — sales_manager is granted access
            // to /accounts (see SalesAccessProtectedRoute's allowedRoles).
            return <Navigate to="/accounts" replace />;

        case 'numbering_user':
            // No dedicated numbering portal exists yet — numbering_user is one
            // of the roles allowed into the QA Portal (see QaPortalProtectedRoute).
            return <Navigate to="/qa-portal" replace />;

        case 'accountant':
            // Accountants are sent to their accounting dashboard.
            return <Navigate to="/accounts/sales/orders" replace />;

         

        case 'mechanic':
            // Mechanics are sent to their mechanic dashboard.
            return <Navigate to="/mechanics-portal/dashboard" replace />;
        
        case 'dispatch_officer':
            // Dispatch Officers are sent to their dispatch dashboard.
            return <Navigate to="/dispatch-portal/dashboard" replace />;    
        case 'hr_manager':
            // HR Managers are sent to their HR dashboard.
            return <Navigate to="/hr-portal/dashboard" replace />;

        case 'merchandiser':
            return <Navigate to="/merchandiser/bom" replace />;

        case 'purchase_manager':
            return <Navigate to="/purchase-department/orders" replace />;

        case 'job_work_receiver':
            return <Navigate to="/receiver/dashboard" replace />;

        case 'fabric_store_manager':
            // Fabric Store Managers are sent to their fabric rolls dashboard.
            return <Navigate to="/fabric-store-portal/rolls" replace />;

        default:
            // If a user has a valid login but their role is not recognized
            // by the application's portals, they are sent to an unauthorized page.
           return <Navigate to="/unauthorized" replace />;
    }
};

export default InitialRedirect;

