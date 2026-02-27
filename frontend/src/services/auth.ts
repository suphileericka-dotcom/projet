import { API } from "../config/api";

type LoginResponse = {
  token: string;
  user: { id: string | number; language?: string };
};

export async function login(
  identifier: string,
  password: string
): Promise<LoginResponse> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: identifier.trim(), password }),
  });

  const text = await res.text();

  // Si réponse vide
  if (!text) {
    if (!res.ok) {
      throw new Error(`Erreur serveur (${res.status})`);
    }
    throw new Error("Réponse vide du serveur");
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Réponse invalide du serveur");
  }

  if (!res.ok) {
    throw new Error(data?.error || `Erreur (${res.status})`);
  }

  return data as LoginResponse;
}
