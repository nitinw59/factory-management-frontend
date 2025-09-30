import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AuthCallbackPage = () => {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
      console.log("AuthCallbackPage: Retrieved token from URL params:", token);
    if (token) {
      // 1. Save the token to the global state.
      login(token);
      console.log("Login successful, token saved.");
      // 2. Redirect ALL successful logins to the root of the protected app.
      // The <InitialRedirect /> component will then handle the role-based logic.
      navigate('/init', { replace: true });

    } else {
      // If no token is found, redirect back to the login page.
      navigate('/login', { replace: true });
    }
  }, [location, login, navigate]);

  return (
    <div className="flex justify-center items-center h-screen bg-gray-100">
      <p className="text-gray-600">Processing login, please wait...</p>
    </div>
  );
};

export default AuthCallbackPage;

