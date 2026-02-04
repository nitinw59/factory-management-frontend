import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const CuttingOperatorProtectedRoute = ({ children }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'cutting_operator' && user.role !== 'cutting_manager') {
    return <Navigate to="/unauthorized" replace />;
  }

  return children; // ✅ Wraps CuttingPortalLayout and its Outlet
};

export default CuttingOperatorProtectedRoute;
