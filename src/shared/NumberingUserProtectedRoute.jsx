import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NumberingUserProtectedRoute = ({ children }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Updated role check for 'numbering_user'
  if (user.role !== 'numbering_user') {
    // You could also allow admins to access this page
    // if (user.role !== 'numbering_user' && user.role !== 'factory_admin') {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default NumberingUserProtectedRoute;
