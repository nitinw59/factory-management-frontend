import axios from 'axios';

// 1. Define the baseURLs as constants
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5002';

// ✅ FIX: 'baseURLImage' is not a valid Axios setting. 
// Instead, export it as a separate constant so your React components can use it for <img src={...} /> tags.
export const IMAGE_BASE_URL = `${API_BASE_URL}/uploads`; 

console.log('API is configured to use base URL:', API_BASE_URL);

// 2. Create the Axios instance
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  // We leave Content-Type out here so Axios can automatically switch 
  // between 'application/json' and 'multipart/form-data' when we upload files.
});

// 3. ✅ ADDED: Global Request Interceptor
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

// Optional: Global Response Interceptor (Great for handling expired tokens)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If the backend says "Unauthorized", automatically log the user out
      console.warn("Token expired or unauthorized. Logging out...");
      localStorage.removeItem('factory_token');
      window.location.href = '/'; // Redirect to login page
    }
    return Promise.reject(error);
  }
);

export default api;