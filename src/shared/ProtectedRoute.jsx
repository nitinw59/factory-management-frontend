import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = () => {
  // Grab 'user' and 'isLoading' directly from context.
  // AuthContext has ALREADY safely decoded the token and bypassed dev mode!
  const { user, isLoading } = useAuth();

  // 1. Wait for AuthContext to finish its checks
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // 2. If no user exists (no token, or invalid token), redirect to login.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3. Your centralized role check
  const allowedRoles = [
                'factory_admin',
                'store_manager',
                'line_supervisor',
                'supplier',
                'production_manager',
                'accountant',
                'hr_manager',
                'universal_checker',
                'garment_checker',
                'cutting_operator',
                'line_loader',
                'cutting_manager',
                'mechanic',
                'dispatch_officer'
  ];

  if (!user.role || !allowedRoles.includes(user.role)) {
    // If the user's role is not recognized for this app, they are unauthorized.
    return <Navigate to="/unauthorized" replace />;
  }

  // 4. If the token is valid and the role is recognized, render the protected pages.
  return <Outlet />;
};

export default ProtectedRoute;