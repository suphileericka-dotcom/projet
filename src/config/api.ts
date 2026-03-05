const API_URL =
  import.meta.env.VITE_API_URL ??
  "VITE_API_URL=https://ameya-production.up.railway.app"; // ton backend

export const API = `${API_URL}/api`;