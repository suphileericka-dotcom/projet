// src/services/auth.ts

import { API } from "../config/api";

export async function login(identifier: string, password: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Erreur de connexion");
  }

  return res.json();
}