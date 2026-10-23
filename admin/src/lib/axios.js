import axios from "axios";
import { readMode } from "./mode";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

let getToken = null;

// which view THIS tab is in. Kept per tab (not read from shared storage), so switching one tab to the
// customer view cannot break the admin calls of another tab.
let activeMode = readMode() || "vendor";
export const setActiveMode = (mode) => {
  activeMode = mode;
};

// called once from App with Clerk's getToken
export const setTokenGetter = (fn) => {
  getToken = fn;
};

axiosInstance.interceptors.request.use(async (config) => {
  // window.Clerk is ready as soon as ClerkProvider has loaded; the hook-provided getter is the fallback
  const token = (await window.Clerk?.session?.getToken()) ?? (getToken ? await getToken() : null);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // the server enforces this: a request from the customer view cannot use staff powers
  config.headers["X-Active-Mode"] = activeMode;
  return config;
});

export default axiosInstance;
