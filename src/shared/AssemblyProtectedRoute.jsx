import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // Assuming this is your auth context
import { jwtDecode } from 'jwt-decode'; // Assuming you use this

const AssemblyProtectedRoute = ({ children }) => {
  const { token } = useAuth();

  if (!token) {
    return <Navigate to="/login" />;
  }

  try {
    const user = jwtDecode(token);
    // This gatekeeper allows admins or users with the 'assembly_operator' role.
    if (user.role !== 'assembly_operator' && user.role !== 'factory_admin') {
      return <Navigate to="/unauthorized" />;
    }
  } catch (error) {
    console.error("Invalid token:", error);
    return <Navigate to="/login" />;
  }

  return children;
};

export default AssemblyProtectedRoute;