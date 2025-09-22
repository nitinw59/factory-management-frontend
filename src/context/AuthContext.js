import React, { createContext, useState, useContext, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import api from '../utils/api'; // Your centralized Axios instance

// Create the context object
const AuthContext = createContext(null);

// This is the provider component that will wrap your entire application
export const AuthProvider = ({ children }) => {
  // State to hold the authentication token from localStorage
  const [token, setToken] = useState(localStorage.getItem('factory_token'));
  // State to hold the decoded user information from the token
  const [user, setUser] = useState(null);
  // State to prevent rendering until the initial token check is complete
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // This effect runs once on application startup
    if (token) {
      try {
        // Decode the token to get user details (id, role, etc.)
        const decodedUser = jwtDecode(token);
        
        // Check if the token is expired
        if (decodedUser.exp * 1000 < Date.now()) {
          // If expired, clear the token and user
          localStorage.removeItem('factory_token');
          setToken(null);
          setUser(null);
        } else {
          // If valid, set the user state and the default Authorization header for all future API calls
          setUser(decodedUser);
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
      } catch (error) {
        console.error("Invalid token found in storage.", error);
        localStorage.removeItem('factory_token');
        setToken(null);
        setUser(null);
      }
    }
    setIsLoading(false); // Finished initial check
  }, [token]);

  // Function to handle user login
  const login = (jwt) => {
    localStorage.setItem('factory_token', jwt);
    setToken(jwt);
    const decodedUser = jwtDecode(jwt);
    setUser(decodedUser);
    api.defaults.headers.common['Authorization'] = `Bearer ${jwt}`;
  };

  // Function to handle user logout
  const logout = () => {
    localStorage.removeItem('factory_token');
    setToken(null);
    setUser(null);
    delete api.defaults.headers.common['Authorization'];
  };

  // The value provided to all consuming components
  const authContextValue = { token, user, login, logout, isLoading };

  return (
    <AuthContext.Provider value={authContextValue}>
      {/* Only render the application once the initial token check is complete */}
      {!isLoading && children}
    </AuthContext.Provider>
  );
};

// Custom hook to easily access the auth context from any component
export const useAuth = () => {
  return useContext(AuthContext);
};
