// =====================
// IMPORTS
// =====================
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "../hooks/useLang";
import "../style/login.css";

/* =====================
   API BASE (robuste)
   - En prod: VITE_API_URL doit être "https://ameya-production.up.railway.app"
   - Le code ajoute /api automatiquement
===================== */
function normalizeBaseUrl(raw?: string) {
  if (!raw) return null;

  // Trim + retire les trailing slashes
  const cleaned = raw.trim().replace(/\/+$/, "");

  // Optionnel : sécurise si quelqu'un met par erreur "https://vercel.app/https://railway.app"
  // ou "https://vercel.app/railway.app" (double domaine collé)
  // On détecte un pattern "vercel.app/<quelquechose>.railway.app"
  const badPattern = /vercel\.app\/.*railway\.app/i;
  if (badPattern.test(cleaned)) {
    // On essaie d'extraire le domaine railway si présent
    const match = cleaned.match(/(https?:\/\/)?([a-z0-9-]+\.up\.railway\.app)/i);
    if (match?.[2]) {
      return `https://${match[2]}`;
    }

    // Sinon on force null pour utiliser localhost (et afficher une erreur utile)
    return null;
  }

  // Si l'utilisateur n'a pas mis le protocole, on le rajoute
  if (!/^https?:\/\//i.test(cleaned)) {
    return `https://${cleaned}`;
  }

  return cleaned;
}

const RAW_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_URL);
const API_BASE = RAW_BASE_URL ? `${RAW_BASE_URL}/api` : "http://localhost:8000/api";

/* =====================
   TYPES
===================== */
type LoginProps = {
  setIsAuth: (value: boolean) => void;
};

type LoginResponse =
  | {
      token: string;
      user: { id: string | number; language?: string };
    }
  | { error?: string };

/* =====================
   COMPONENT
===================== */
export default function Login({ setIsAuth }: LoginProps) {
  const navigate = useNavigate();
  const { t } = useLang();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  async function safeJson(res: Response) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setErrorGlobal(null);

    const cleanIdentifier = identifier.trim();

    if (!cleanIdentifier || !password) {
      setErrorGlobal("Email / Nom d'utilisateur et mot de passe requis");
      return;
    }

    // Petit message utile si la variable d'env est manifestement mauvaise
    if (!RAW_BASE_URL && import.meta.env.VITE_API_URL) {
      setErrorGlobal(
        "Configuration API invalide (VITE_API_URL). Mets par exemple : https://ameya-production.up.railway.app"
      );
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: cleanIdentifier,
          password,
        }),
      });

      const data = (await safeJson(res)) as LoginResponse | null;

      if (!res.ok) {
        const msg =
          (data && "error" in data && data.error) ||
          `Erreur de connexion (${res.status})`;
        throw new Error(msg);
      }

      if (!data || !("token" in data) || !data.token || !data.user?.id) {
        throw new Error("Réponse serveur invalide");
      }

      // SESSION
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userId", String(data.user.id));

      if (data.user.language) {
        localStorage.setItem("language", data.user.language);
      }

      if (remember) {
        localStorage.setItem("rememberMe", "true");
      } else {
        localStorage.removeItem("rememberMe");
      }

      setIsAuth(true);
      navigate("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur serveur";
      setErrorGlobal(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <button type="button" onClick={() => navigate(-1)} disabled={loading}>
            ←
          </button>
          <h1>{t("login")}</h1>
        </div>

        <h2>{t("welcome")}</h2>

        {errorGlobal && <div className="login-error">{errorGlobal}</div>}

        {/* FORM */}
        <form onSubmit={handleLogin}>
          <input
            placeholder={t("emailOrUsername")}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={loading}
            autoComplete="username"
          />

          <input
            type="password"
            placeholder={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoComplete="current-password"
          />

          <label className="remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={loading}
            />
            {t("rememberMe")}
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Connexion..." : t("login")}
          </button>

          {/* (Optionnel) aide debug en prod — enlève si tu veux */}
          {/* <small style={{ display: "block", marginTop: 8, opacity: 0.7 }}>
            API: {API_BASE}
          </small> */}
        </form>
      </div>
    </div>
  );
}
