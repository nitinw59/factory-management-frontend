import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// This is the security guard for the ADMIN wing.
const AdminProtectedRoute = () => {
  const { user } = useAuth();
  // It only allows users with the 'factory_admin' role to pass.
  if (user && user.role === 'factory_admin') {
    return <Outlet />;
  }
  return <Navigate to="/unauthorized" replace />;
};

export default AdminProtectedRoute;
