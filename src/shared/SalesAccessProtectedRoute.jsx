// src/shared/SalesAccessProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const SalesAccessProtectedRoute = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div>Loading...</div>; // Or your Spinner component
  }

  // DEFINITION: Who can access Sales Orders?
  // We include 'accountant' and 'sales_manager' for future proofing, 
  // plus 'admin' and 'production_manager' as requested.
  const allowedRoles = [
    'admin', 
    'production_manager', 
    'accountant', 
    'sales_manager'
  ];

  if (!user || !allowedRoles.includes(user.role)) {
    // Redirect to unauthorized page if role doesn't match
    return <Navigate to="/unauthorized" state={{ from: location }} replace />;
  }

  return children ? children : <Outlet />;
};

export default SalesAccessProtectedRoute;