// Dynamically determine API URL based on current hostname
// If accessing via network IP, use that IP for API too
const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  const hostname = window.location.hostname;
  
  // If accessing via network IP, use that IP for backend
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:5000/api`;
  }
  
  // Default to localhost
  return 'http://localhost:5000/api';
};

export const API_URL = getApiUrl();



