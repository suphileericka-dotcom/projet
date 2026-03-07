const API_URL: string =
  import.meta.env.VITE_API_URL ??
  "https://ameya-production.up.railway.app";

export const API = `${API_URL}/api`;