// =====================
// IMPORTS
// =====================

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLang } from "../hooks/useLang";
import "../style/register.css";

/* =====================
   API BASE
===================== */
const API = import.meta.env.VITE_API_URL;

/* =====================
   TYPES
===================== */
type RegisterProps = {
  setIsAuth: (value: boolean) => void;
};

/* =====================
   COMPONENT
===================== */
export default function Register({ setIsAuth }: RegisterProps) {
  const navigate = useNavigate();
  const { t } = useLang();

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

  /* =====================
     UPDATE FORM
  ===================== */
  function update(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value, type } = e.target;

    setForm((f) => ({
      ...f,
      [name]:
        type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : value,
    }));
  }

  /* =====================
     CHANGE LANGUAGE LIVE
  ===================== */
  function changeLanguage(e: React.ChangeEvent<HTMLSelectElement>) {
    const lang = e.target.value;

    setForm((f) => ({
      ...f,
      language: lang,
    }));

    localStorage.setItem("language", lang);
    window.dispatchEvent(new Event("storage"));
  }

  /* =====================
     SUBMIT
  ===================== */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    if (!form.terms) {
      setError("Vous devez accepter les conditions");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de l’inscription");
        return;
      }

      // SESSION
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userId", data.user.id);
      localStorage.setItem("language", form.language);

      setIsAuth(true);
      navigate("/");
    } catch {
      setError("Impossible de contacter le serveur");
    } finally {
      setLoading(false);
    }
  }

  /* =====================
     RENDER
  ===================== */
  return (
    <div className="register-page">
      <div className="register-container">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ←
        </button>

        <h1>{t("register")}</h1>
        <p className="subtitle">{t("welcome")}</p>

        {error && <div className="register-error">{error}</div>}

        <form onSubmit={submit}>
          {/*  NOM D’UTILISATEUR CLAIR */}
          <input
            name="username"
            placeholder="Nom d’utilisateur"
            value={form.username}
            onChange={update}
            required
          />

          <input
            name="email"
            type="email"
            placeholder="Email"
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
            placeholder="Confirmer le mot de passe"
            value={form.confirmPassword}
            onChange={update}
            required
          />

          <input
            name="city"
            placeholder="Ville"
            value={form.city}
            onChange={update}
          />

          <select name="country" value={form.country} onChange={update}>
            <option value="FR">France</option>
            <option value="BE">Belgique</option>
            <option value="CH">Suisse</option>
            <option value="CA">Canada</option>
          </select>

          {/* LANGUE LIVE */}
          <select
            name="language"
            value={form.language}
            onChange={changeLanguage}
          >
            <option value="fr">🇫🇷 Français</option>
            <option value="en">🇬🇧 English</option>
            <option value="es">🇪🇸 Español</option>
            <option value="de">🇩🇪 Deutsch</option>
            <option value="it">🇮🇹 Italiano</option>
          </select>

          <select
            name="situation"
            value={form.situation}
            onChange={update}
            required
          >
            <option value="">Choisir une situation</option>
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
            J’accepte les conditions
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "…" : t("register")}
          </button>
        </form>

        <p className="footer">
          Déjà un compte ? <Link to="/login">{t("login")}</Link>
        </p>
      </div>
    </div>
  );
}