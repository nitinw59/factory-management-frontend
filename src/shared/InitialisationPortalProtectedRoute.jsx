import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { jwtDecode } from 'jwt-decode';

const InitialisationPortalProtectedRoute = ({ children }) => {
  const { token } = useAuth();

  if (!token) {
    return <Navigate to="/login" />;
  }

  try {
    const user = jwtDecode(token);
    // This gatekeeper ONLY allows users with the 'store_manager' role.
    if (user.role !== 'cutting_manager') {
      return <Navigate to="/unauthorized" />;
    }
  } catch (error) {
    return <Navigate to="/login" />;
  }

  return children;
};

export default InitialisationPortalProtectedRoute;
