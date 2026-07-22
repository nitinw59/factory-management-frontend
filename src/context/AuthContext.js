import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import api, { SESSION_EXPIRED_EVENT } from '../utils/api';

const AuthContext = createContext(null);

// setTimeout is capped at 2^31-1 ms (~24.8 days); clamp longer expiries.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('factory_token'));
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      try {
        const decodedUser = jwtDecode(token);
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

  // ── Centralized session-expiry handling ────────────────────────────────────
  // Fired when: the axios interceptor sees a 401/403, the proactive expiry
  // timer hits the JWT's exp, or another tab logs out. One code path for all.
  const handleSessionExpired = useCallback(() => {
    logout();
    navigate('/login', { replace: true, state: { reason: 'session_expired' } });
  }, [logout, navigate]);

  // 1. Backend rejected our credentials (401/403 broadcast by src/utils/api.js)
  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [handleSessionExpired]);

  // 2. Proactive expiry: log out the moment the JWT's exp passes, even if the
  //    user never triggers another API call. The visibilitychange recheck
  //    covers laptops waking from sleep, where timers are suspended.
  useEffect(() => {
    if (!token) return undefined;

    let expMs;
    try {
      expMs = jwtDecode(token).exp * 1000;
    } catch {
      return undefined; // invalid token — mount effect above already clears it
    }

    const fire = () => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    const msLeft = expMs - Date.now();
    if (msLeft <= 0) {
      fire();
      return undefined;
    }

    const timerId = setTimeout(fire, Math.min(msLeft, MAX_TIMEOUT_MS));
    const recheckOnVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() >= expMs) fire();
    };
    document.addEventListener('visibilitychange', recheckOnVisible);

    return () => {
      clearTimeout(timerId);
      document.removeEventListener('visibilitychange', recheckOnVisible);
    };
  }, [token]);

  // 3. Cross-tab sync: logging out (or in) in one tab propagates to all tabs.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== 'factory_token') return;
      if (!e.newValue) {
        handleSessionExpired();
      } else if (e.newValue !== token) {
        setToken(e.newValue); // another tab logged in / refreshed the token
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [token, handleSessionExpired]);

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
