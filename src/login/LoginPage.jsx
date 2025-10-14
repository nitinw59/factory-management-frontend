import React from 'react';
import { API_BASE_URL } from '../utils/api'; // 1. Import the base URL


const LoginPage = () => {
  const handleLogin = () => {
    // Redirect to the backend's Google auth route
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  };

  return (
    <div>
      <h2> Login</h2>
      <button onClick={handleLogin}>Sign in with Google</button>
    </div>
  );
};

export default LoginPage;