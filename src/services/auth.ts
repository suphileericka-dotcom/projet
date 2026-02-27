import { API } from "../config/api";

type LoginResponse = {
  token: string;
  user: { id: string | number; language?: string };
};

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: identifier.trim(), password }),
  });

  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;

  if (!res.ok) {
    throw new Error(data?.error || data?.message || text || "Erreur de connexion");
  }

  return (data ?? {}) as LoginResponse;
}
