import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { jwtDecode } from 'jwt-decode';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('factory_token'));
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      try {
        const decodedUser = jwtDecode(token);
        console.log("Decoded user from token:", decodedUser);
        if (decodedUser.exp * 1000 < Date.now()) {
          localStorage.removeItem('factory_token');
          setToken(null);
          setUser(null);
        } else {
          setUser(decodedUser);
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
      } catch (error) {
        console.error("Invalid token found in storage.", error);
        localStorage.removeItem('factory_token');
        setToken(null);
        setUser(null);
      }
    } else {
      setUser(null); // Ensure user is null if no token
    }
    setIsLoading(false);
  }, [token]);

  // ✅ Wrap login in useCallback to give it a stable identity
  const login = useCallback((jwt) => {
    localStorage.setItem('factory_token', jwt);
    api.defaults.headers.common['Authorization'] = `Bearer ${jwt}`;
    try {
      const decodedUser = jwtDecode(jwt);
      console.log("Decoded user on login:", decodedUser); 
      setUser(decodedUser);
      setToken(jwt); // Call setToken last to avoid race conditions with useEffect
    } catch (e) {
      console.error("Invalid token provided to login:", e);
    }
  }, []); // Empty dependencies means this function is created only ONCE

  // ✅ Also wrap logout in useCallback for consistency
  const logout = useCallback(() => {
    localStorage.removeItem('factory_token');
    delete api.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  }, []);

  // ✅ Memoize the context value object to prevent unnecessary re-renders
  // in consuming components.
  const authContextValue = useMemo(() => ({
    token,
    user,
    login,
    logout,
    isLoading
  }), [token, user, isLoading, login, logout]);

  return (
    <AuthContext.Provider value={authContextValue}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};