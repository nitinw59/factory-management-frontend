import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { jwtDecode } from 'jwt-decode';

const PackerProtectedRoute = ({ children }) => {
  const { token } = useAuth();

  if (!token) {
    return <Navigate to="/login" />;
  }

  const user = jwtDecode(token);

  // This is the key check for the 'packer' role
  if (user.role !== 'packer') {
    return <Navigate to="/unauthorized" />;
  }

  return children;
};

export default PackerProtectedRoute;