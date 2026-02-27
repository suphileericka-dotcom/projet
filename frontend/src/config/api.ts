// src/config/api.ts

/**
 * En PROD (Vercel): on appelle l'API via un chemin relatif "/api"
 * qui sera rewrité vers Railway (via vercel.json).
 *
 * En DEV: Vite proxy ou backend local selon ton besoin.
 */

const isProd = import.meta.env.PROD;

// En prod: Vercel
export const API = isProd ? "/api" : `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api`;

// Uploads: en prod, pareil via Vercel (recommandé)
export const UPLOADS = isProd
  ? "/uploads"
  : `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/uploads`;
