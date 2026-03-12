import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "../hooks/useLang";
import "../style/login.css";

/* =====================
   API BASE
===================== */

const API =
  import.meta.env.VITE_API_URL ||
  "https://ameya-production.up.railway.app";

/* =====================
   TYPES
===================== */

type LoginProps = {
  setIsAuth: (value: boolean) => void;
};

type LoginResponse = {
  token: string;
  user: {
    id: string;
    username: string;
    email?: string;
    language?: string;
  };
  error?: string;
};

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

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setErrorGlobal(null);

    if (!identifier || !password) {
      setErrorGlobal("Email / Nom d'utilisateur et mot de passe requis");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          password,
        }),
      });

      let data: LoginResponse;

      try {
        data = await res.json();
      } catch {
        throw new Error("Réponse serveur invalide");
      }

      console.log("LOGIN RESPONSE:", data);

      if (!res.ok) {
        throw new Error(data?.error || "Erreur de connexion");
      }

      if (!data?.token || !data?.user?.id) {
        throw new Error("Réponse serveur invalide");
      }

      /* SESSION */

      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userId", data.user.id);

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

    } catch (err) {
      console.error("LOGIN ERROR:", err);

      if (err instanceof Error) {
        setErrorGlobal(err.message);
      } else {
        setErrorGlobal("Erreur serveur");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">

        <div className="login-header">
          <button onClick={() => navigate(-1)}>←</button>
          <h1>{t("login")}</h1>
        </div>

        <h2>{t("welcome")}</h2>

        {errorGlobal && (
          <div className="login-error">
            {errorGlobal}
          </div>
        )}

        <form onSubmit={handleLogin}>

          <input
            placeholder={t("emailOrUsername")}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={loading}
          />

          <input
            type="password"
            placeholder={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
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

        </form>

      </div>
    </div>
  );
}