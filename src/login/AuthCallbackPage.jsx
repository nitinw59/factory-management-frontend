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
      console.log("AuthCallbackPage: Token saved to global state.");
      console.log("Login successful, token saved.");
      // 2. Every successful login first chooses Version 2.0 or 3.0
      // (/choose-version). 2.0 goes on to /init, where <InitialRedirect />
      // applies the role-based logic as before.
      navigate('/choose-version', { replace: true });

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