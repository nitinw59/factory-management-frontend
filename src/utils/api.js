import axios from 'axios';

// 1. Define the baseURL as a constant
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5002';

// --- DEBUGGING LOG ---
// This will show up in the browser's developer console.
// On your live Vercel site, it should print your Render backend URL.
// Locally, it will print http://localhost:5001.
console.log('API is configured to use base URL:', API_BASE_URL);
// --- END DEBUGGING LOG ---

// 2. Create the Axios instance using the constant
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  baseURLImage: `${API_BASE_URL}/uploads`,
   // Append /api for Axios requests
  // headers: {
  //   'Content-Type': 'application/json',
  // },
});

export default api;