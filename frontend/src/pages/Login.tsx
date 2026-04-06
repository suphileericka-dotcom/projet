import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isValidLang, useLang } from "../hooks/useLang";
import "../style/login.css";
import {
  buildCountryAccessError,
  clearStoredCountry,
  consumeCountryAccessError,
  COUNTRY_STORAGE_KEY,
  isAllowedCountry,
  persistCountry,
} from "../config/countryAccess";
import { POST_LOGIN_REDIRECT_KEY } from "../lib/authSession";

const API = import.meta.env.VITE_API_URL || "https://ameya-production.up.railway.app";

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
    country?: string;
  };
  error?: string;
};

export default function Login({ setIsAuth }: LoginProps) {
  const navigate = useNavigate();
  const { t, setLang } = useLang();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(() =>
    consumeCountryAccessError()
  );

  async function resolveLoginCountry(token: string, responseCountry?: string | null) {
    if (responseCountry) {
      return responseCountry;
    }

    const storedCountry = localStorage.getItem(COUNTRY_STORAGE_KEY);
    if (storedCountry) {
      return storedCountry;
    }

    try {
      const profileRes = await fetch(`${API}/api/user/me/space`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!profileRes.ok) return null;

      const profileData = await profileRes.json();
      return profileData?.profile?.country ?? profileData?.country ?? null;
    } catch {
      return null;
    }
  }

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setErrorGlobal(null);

    if (!identifier || !password) {
      setErrorGlobal(t("loginRequiredFields"));
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
        throw new Error(t("invalidServerResponse"));
      }

      if (!res.ok) {
        throw new Error(data?.error || t("loginError"));
      }

      if (!data?.token || !data?.user?.id) {
        throw new Error(t("invalidServerResponse"));
      }

      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userId", data.user.id);
      localStorage.setItem("username", data.user.username);

      if (isValidLang(data.user.language)) {
        setLang(data.user.language);
      }

      const resolvedCountry = await resolveLoginCountry(data.token, data.user.country);

      if (resolvedCountry && !isAllowedCountry(resolvedCountry)) {
        localStorage.removeItem("authToken");
        localStorage.removeItem("userId");
        localStorage.removeItem("username");
        clearStoredCountry();
        throw new Error(buildCountryAccessError(resolvedCountry));
      }

      persistCountry(resolvedCountry);

      if (remember) {
        localStorage.setItem("rememberMe", "true");
      } else {
        localStorage.removeItem("rememberMe");
      }

      setIsAuth(true);
      const storedRedirect = window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
      const redirectTarget =
        storedRedirect && storedRedirect.startsWith("/") ? storedRedirect : null;

      if (redirectTarget) {
        window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
        navigate(redirectTarget);
        return;
      }

      navigate("/");
    } catch (err) {
      if (err instanceof Error) {
        setErrorGlobal(err.message);
      } else {
        setErrorGlobal(t("serverError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <button onClick={() => navigate(-1)}>{"<"}</button>
          <h1>{t("login")}</h1>
        </div>

        <h2>{t("welcome")}</h2>

        {errorGlobal && <div className="login-error">{errorGlobal}</div>}

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
            {loading ? t("loginLoading") : t("login")}
          </button>
        </form>
      </div>
    </div>
  );
}
