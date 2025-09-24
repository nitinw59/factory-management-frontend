import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { jwtDecode } from 'jwt-decode';

const ProductionManagerProtectedRoute = () => {
  const { token } = useAuth();

  if (!token) {
    return <Navigate to="/login" />;
  }

  try {
    const user = jwtDecode(token);
    // This gatekeeper ONLY allows users with the 'production_manager' role.
    if (user.role !== 'production_manager') {
      return <Navigate to="/unauthorized" />;
    }
  } catch (error) {
    console.error("Invalid token:", error);
    return <Navigate to="/login" />;
  }

  return <Outlet />;
};

export default ProductionManagerProtectedRoute;
