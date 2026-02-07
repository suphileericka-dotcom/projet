// =====================
// IMPORTS
// =====================

import { useState } from "react";
import { useNavigate } from "react-router-dom";

// Services
import { login } from "../services/auth";

// Hooks
import { useLang } from "../hooks/useLang";

// Styles
import "../style/login.css";

// =====================
// TYPES
// =====================

type LoginProps = {
  setIsAuth: (value: boolean) => void;
};

// =====================
// COMPONENT
// =====================

export default function Login({ setIsAuth }: LoginProps) {
  const navigate = useNavigate();
  const { t } = useLang();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  async function handleLogin() {
    setErrorGlobal(null);

    if (!identifier || !password) {
      setErrorGlobal(t("emailOrUsername") + " / " + t("password"));
      return;
    }

    try {
      setLoading(true);

      const data = await login(identifier, password);

      // SESSION
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userId", data.user.id);

      // Langue utilisateur (depuis backend)
      if (data.user.language) {
        localStorage.setItem("language", data.user.language);
      }

      if (remember) {
        localStorage.setItem("rememberMe", "true");
      }

      setIsAuth(true);
      navigate("/");
    } catch (err: any) {
      setErrorGlobal(
        err?.message || "Erreur de connexion"
      );
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

        {errorGlobal && <div className="login-error">{errorGlobal}</div>}

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

        <label>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={loading}
          />
          {t("rememberMe")}
        </label>

        <button onClick={handleLogin} disabled={loading}>
          {loading ? "…" : t("login")}
        </button>
      </div>
    </div>
  );
}
