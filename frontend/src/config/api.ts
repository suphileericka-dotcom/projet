// src/config/api.ts

export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

export const API = `${API_URL}/api`;
export const UPLOADS = `${API_URL}/uploads`;