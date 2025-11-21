import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // Removed problematic import
import { jwtDecode } from 'jwt-decode'; // Removed problematic import


const SewingManagerProtectedRoute = ({ children }) => {
  const { token } = useAuth();

  if (!token) {
    return <Navigate to="/login" />;
  }

  try {
    const user = jwtDecode(token);
    // This gatekeeper allows 'sewing_manager' or 'factory_admin'
    if (user.role !== 'sewing_manager' && user.role !== 'factory_admin') {
      return <Navigate to="/unauthorized" />;
    }
  } catch (error) {
    console.error("Invalid token:", error);
    return <Navigate to="/login" />;
  }

  return children;
};

export default SewingManagerProtectedRoute;