const fallbackBaseUrl = "https://ameya-production.up.railway.app";

const rawBaseUrl = import.meta.env.VITE_API_URL?.trim() || fallbackBaseUrl;

export const API_BASE = rawBaseUrl.endsWith("/api")
  ? rawBaseUrl.slice(0, -4)
  : rawBaseUrl;

export const API = `${API_BASE}/api`;

export const SOCKET_URL = API_BASE;
