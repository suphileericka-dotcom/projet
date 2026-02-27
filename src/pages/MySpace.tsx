import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "../hooks/useLang";
import type { Lang } from "../hooks/useLang";
import "../style/mySpace.css";

/* =====================
   API BASE
===================== */
const API =
  import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : "http://localhost:8000/api";

/* =====================
   TYPES
===================== */
type Me = {
  id: string;
  username: string | null;
  email: string | null;
  language: Lang;
  dark_mode: boolean;
  created_at: number | null;
};

export default function MySpace() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");
  const { t, setLang } = useLang();

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<Lang>("fr");
  const [darkMode, setDarkMode] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  /* =====================
     APPLY THEME
  ===================== */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  /* =====================
     LOAD PROFILE
  ===================== */
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(`${API}/user/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) return;

        const data: Me = await res.json();

        setMe(data);
        setUsername(data.username ?? "");
        setEmail(data.email ?? "");
        setLanguage(data.language ?? "fr");
        setDarkMode(Boolean(data.dark_mode));

        setLang(data.language ?? "fr");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token, setLang]);

  const createdLabel = useMemo(() => {
    if (!me?.created_at) return "—";
    return new Date(me.created_at).toLocaleDateString();
  }, [me]);

  if (loading) {
    return <div className="page myspace-page">Chargement…</div>;
  }

  /* =====================
     SAVE PROFILE
  ===================== */
  async function saveProfile() {
    if (!token) return;

    const res = await fetch(`${API}/user/me`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username, email }),
    });

    if (res.ok) {
      alert("Profil mis à jour ✅");
    } else {
      alert("Erreur sauvegarde profil");
    }
  }

  /* =====================
     SAVE LANGUAGE
  ===================== */
  async function saveLanguage(next: Lang) {
    if (!token) return;

    const res = await fetch(`${API}/user/me/language`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ language: next }),
    });

    if (!res.ok) {
      alert("Erreur langue");
      return;
    }

    setLanguage(next);
    setLang(next);
  }

  /* =====================
     CHANGE PASSWORD
  ===================== */
  async function submitPassword() {
    if (!token) return;

    if (!oldPassword || !newPassword) {
      alert("Remplis les 2 champs.");
      return;
    }

    const res = await fetch(`${API}/user/me/password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ oldPassword, newPassword }),
    });

    if (!res.ok) {
      alert("Erreur mot de passe");
      return;
    }

    setPwOpen(false);
    setOldPassword("");
    setNewPassword("");
    alert("Mot de passe modifié ✅");
  }

  /* =====================
     RENDER
  ===================== */
  return (
    <div className="page myspace-page">
      <button className="back-button-global" onClick={() => navigate("/")}>
        ←
      </button>

      <header className="page-header">
        <h1>{t("mySpace")}</h1>
        <p>{t("profilePreferences")}</p>
      </header>

      {/* PROFIL */}
      <section className="block">
        <div className="block-head">
          <h2>{t("profile")}</h2>
          <button className="btn primary" onClick={saveProfile}>
            {t("save")}
          </button>
        </div>

        <div className="muted small">
          {t("memberSince")} : {createdLabel}
        </div>

        <div className="field">
          <label>{t("username")}</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <button className="btn ghost" onClick={() => setPwOpen(true)}>
          {t("changePassword")}
        </button>
      </section>

      {/* PRÉFÉRENCES */}
      <section className="block">
        <h2>⚙️ {t("preferences")}</h2>

        <select
          className="modern-select"
          value={language}
          onChange={(e) => saveLanguage(e.target.value as Lang)}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="de">Deutsch</option>
          <option value="it">Italiano</option>
        </select>

        <label className="toggle">
          <input
            type="checkbox"
            checked={darkMode}
            onChange={(e) => setDarkMode(e.target.checked)}
          />
          <span>
            {darkMode ? t("darkMode") : t("lightMode")}
          </span>
        </label>
      </section>

      {/* PASSWORD MODAL */}
      {pwOpen && (
        <div className="modal-backdrop" onClick={() => setPwOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t("changePassword")}</h3>

            <input
              className="modern-input"
              type="password"
              placeholder={t("oldPassword")}
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />

            <input
              className="modern-input"
              type="password"
              placeholder={t("newPassword")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <div className="modal-actions">
              <button className="btn primary" onClick={submitPassword}>
                {t("save")}
              </button>

              <button
                className="btn ghost"
                onClick={() => setPwOpen(false)}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}