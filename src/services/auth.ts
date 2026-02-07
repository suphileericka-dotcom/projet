const API_URL = "http://localhost:8000/api/auth";

export async function login(identifier: string, password: string) {
  const res = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });

  if (!res.ok) {
    const text = await res.text(); // ⚠️ pas json()
    throw new Error(text || "Erreur de connexion");
  }

  return res.json();
}
