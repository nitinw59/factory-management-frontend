import axios from 'axios';

// 1. Define the baseURLs as constants
export const API_BASE_URL = process.env.REACT_APP_API_URL || `http://${window.location.hostname}:5002`;

// ✅ FIX: 'baseURLImage' is not a valid Axios setting.
// Instead, export it as a separate constant so your React components can use it for <img src={...} /> tags.
export const IMAGE_BASE_URL = `${API_BASE_URL}/uploads`;

console.log('API is configured to use base URL:', API_BASE_URL);

// Event name broadcast when the backend rejects our credentials.
// AuthContext listens for this and performs a clean logout + redirect to /login.
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

// 2. Create the Axios instance
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  // We leave Content-Type out here so Axios can automatically switch
  // between 'application/json' and 'multipart/form-data' when we upload files.
});

// 3. ✅ Global Request Interceptor
// This automatically attaches your login token to EVERY single API request.
// You no longer have to type headers: { Authorization: 'Bearer ...' } in your other files!
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('factory_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 4. ✅ Global Response Interceptor — session expiry handling.
// The backend returns 401 when there's no/expired token, and 403 for TWO very
// different reasons that share a status code: an invalid token (authMiddleware's
// jwt.verify failure — a real dead session), or a valid token whose role just
// isn't allowed on this one endpoint (checkRole's "Access denied. Requires one
// of these roles: ..." — the user is fine, this specific resource isn't for them).
// Only the former should nuke the whole session; a mis-scoped/stale role list on
// one endpoint (this has happened more than once — see /api/product,
// /api/shared/product_piece_parts) must not force-logout every page that happens
// to call it. AuthContext owns the actual logout + redirect so React state stays
// in sync (no hard window.location redirects that bypass the router).
let sessionExpiryNotified = false;
const ROLE_DENIED_PREFIX = 'Access denied. Requires one of these roles';

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url || '';
    const hasToken = !!localStorage.getItem('factory_token');
    const message = error.response?.data?.message || '';

    const isRoleDenied  = status === 403 && message.startsWith(ROLE_DENIED_PREFIX);
    const isAuthFailure = (status === 401 || status === 403) && !isRoleDenied;
    // Only treat it as an expired session if we thought we were logged in,
    // never for the auth endpoints themselves (avoids redirect loops), and never
    // for a request explicitly opted out (role-gated lookups a lower-privileged
    // user may legitimately 403 on without their whole session being invalid —
    // e.g. a background company-profile fetch used only for optional PDF branding).
    if (isAuthFailure && hasToken && !requestUrl.includes('/auth/') && !error.config?.skipSessionExpiry) {
      if (!sessionExpiryNotified) {
        sessionExpiryNotified = true;
        // Collapse bursts: a page firing 10 parallel requests that all fail
        // should trigger exactly one logout, not ten.
        setTimeout(() => { sessionExpiryNotified = false; }, 3000);
        console.warn(`Session invalid (HTTP ${status}). Logging out...`);
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
