import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isValidLang, useLang } from "../hooks/useLang";
import "../style/register.css";
import {
  ALLOWED_COUNTRIES,
  buildCountryAccessError,
  isAllowedCountry,
  persistCountry,
} from "../config/countryAccess";

const API = import.meta.env.VITE_API_URL || "https://ameya-production.up.railway.app";

type RegisterProps = {
  setIsAuth: (value: boolean) => void;
};

type RegisterResponse = {
  token: string;
  user: {
    id: string;
    username: string;
    email?: string;
    country?: string;
  };
  error?: string;
};

export default function Register({ setIsAuth }: RegisterProps) {
  const navigate = useNavigate();
  const { t, setLang } = useLang();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    city: "",
    country: "FR",
    situation: "",
    language: localStorage.getItem("language") || "fr",
    terms: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = e.target;

    setForm((current) => ({
      ...current,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  }

  function changeLanguage(e: React.ChangeEvent<HTMLSelectElement>) {
    const lang = e.target.value;

    setForm((current) => ({
      ...current,
      language: lang,
    }));

    if (isValidLang(lang)) {
      setLang(lang);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    if (!form.terms) {
      setError(t("acceptConditionsError"));
      return;
    }

    if (!isAllowedCountry(form.country)) {
      setError(buildCountryAccessError(form.country));
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      let data: RegisterResponse;

      try {
        data = await res.json();
      } catch {
        throw new Error(t("invalidServerResponse"));
      }

      if (!res.ok) {
        setError(data?.error || t("registerError"));
        return;
      }

      if (!data?.token || !data?.user?.id) {
        setError(t("invalidServerResponse"));
        return;
      }

      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userId", data.user.id);
      localStorage.setItem("username", data.user.username);
      if (isValidLang(form.language)) {
        setLang(form.language);
      }
      persistCountry(data.user.country ?? form.country);

      setIsAuth(true);
      navigate("/");
    } catch {
      setError(t("cannotReachServer"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="register-page">
      <div className="register-container">
        <button className="back-btn" onClick={() => navigate(-1)}>
          {"<"}
        </button>

        <h1>{t("register")}</h1>
        <p className="subtitle">{t("welcome")}</p>

        {error && <div className="register-error">{error}</div>}

        <form onSubmit={submit}>
          <input
            name="username"
            placeholder={t("username")}
            value={form.username}
            onChange={update}
            required
          />

          <input
            name="email"
            type="email"
            placeholder={t("email")}
            value={form.email}
            onChange={update}
            required
          />

          <input
            name="password"
            type="password"
            placeholder={t("password")}
            value={form.password}
            onChange={update}
            required
          />

          <input
            name="confirmPassword"
            type="password"
            placeholder={t("confirmPassword")}
            value={form.confirmPassword}
            onChange={update}
            required
          />

          <input
            name="city"
            placeholder={t("city")}
            value={form.city}
            onChange={update}
          />

          <select name="country" value={form.country} onChange={update}>
            {ALLOWED_COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label}
              </option>
            ))}
          </select>

          <select name="language" value={form.language} onChange={changeLanguage}>
            <option value="fr">{t("french")}</option>
            <option value="en">{t("english")}</option>
            <option value="es">{t("spanish")}</option>
            <option value="de">{t("german")}</option>
            <option value="it">{t("italian")}</option>
          </select>

          <select
            name="situation"
            value={form.situation}
            onChange={update}
            required
          >
            <option value="">{t("chooseSituation")}</option>
            <option value="burnout">{t("burnoutTitle")}</option>
            <option value="rupture">{t("ruptureTitle")}</option>
            <option value="solitude">{t("solitudeTitle")}</option>
            <option value="expatriation">{t("expatriationTitle")}</option>
            <option value="changement">{t("changementTitle")}</option>
          </select>

          <label className="checkbox">
            <input
              type="checkbox"
              name="terms"
              checked={form.terms}
              onChange={update}
            />
            {t("acceptTerms")}
          </label>

          <button type="submit" disabled={loading}>
            {loading ? t("registerLoading") : t("register")}
          </button>
        </form>

        <p className="footer">
          {t("alreadyHaveAccount")} <Link to="/login">{t("login")}</Link>
        </p>
      </div>
    </div>
  );
}
