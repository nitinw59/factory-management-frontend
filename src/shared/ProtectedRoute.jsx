import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { jwtDecode } from 'jwt-decode';

const ProtectedRoute = () => {
  const { token } = useAuth();

  if (!token) {
    // If no token exists, the user is not logged in. Redirect to the login page.
    return <Navigate to="/login" replace />;
  }

  try {
    const user = jwtDecode(token);
    // This is the new, more generic security check. It allows access to any user
    // with a role that is valid for this application.
    const allowedRoles = ['factory_admin', 'store_manager']; 
    if (!user.role || !allowedRoles.includes(user.role)) {
      // If the user's role is not recognized for this app, they are unauthorized.
      return <Navigate to="/unauthorized" replace />;
    }
  } catch (error) {
    // If the token is invalid or expired, it's a security risk. Redirect to login.
    console.error("Invalid token:", error);
    return <Navigate to="/login" replace />;
  }

  // If the token is valid and the role is recognized, render the protected pages.
  return <Outlet />;
};

export default ProtectedRoute;

