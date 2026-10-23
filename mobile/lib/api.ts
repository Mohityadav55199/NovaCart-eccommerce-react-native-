import { useAuth } from "@clerk/clerk-expo";
import axios from "axios";

// set EXPO_PUBLIC_API_URL in mobile/.env (local) or as an EAS env var (builds).
// localhost only works in an emulator; use your LAN IP or the deployed backend on a real device
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

if (!process.env.EXPO_PUBLIC_API_URL && !__DEV__) {
  console.warn("EXPO_PUBLIC_API_URL is not set: requests will go to localhost and fail on a device");
}

// the latest Clerk getToken; one interceptor reads it so every request is authenticated exactly once
let getAuthToken: (() => Promise<string | null>) | null = null;

api.interceptors.request.use(async (config) => {
  const token = getAuthToken ? await getAuthToken() : null;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const useApi = () => {
  const { getToken } = useAuth();

  // assigned during render (not in an effect) so requests fired by the first effects are authenticated
  getAuthToken = getToken;

  return api;
};

// on every single req, we would like have an auth token so that our backend knows that we're authenticated
// we're including the auth token under the auth headers
