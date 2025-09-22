import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { jwtDecode } from 'jwt-decode';

const ReceiverProtectedRoute = ({ children }) => {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" />;
  const user = jwtDecode(token);
  if (user.role !== 'receiver') return <Navigate to="/unauthorized" />;
  return children;
};
export default ReceiverProtectedRoute;