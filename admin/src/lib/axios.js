import axios from "axios";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

let getToken = null;

// called once from App with Clerk's getToken
export const setTokenGetter = (fn) => {
  getToken = fn;
};

axiosInstance.interceptors.request.use(async (config) => {
  // window.Clerk is ready as soon as ClerkProvider has loaded; the hook-provided getter is the fallback
  const token = (await window.Clerk?.session?.getToken()) ?? (getToken ? await getToken() : null);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default axiosInstance;
