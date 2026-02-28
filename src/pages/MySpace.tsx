import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
type Story = {
  id: string;
  title: string;
  body: string;
  tags: string[];
};

type MatchProfile = {
  story_id: string;
  title: string;
  common_tags: string[];
};

type Me = {
  id: string;
  username: string | null;
  email: string | null;
  language: string;
  dark_mode: boolean;
  created_at: number | null;
};

export default function MySpace() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");
  const { i18n } = useTranslation();

  const [me, setMe] = useState<Me | null>(null);
  const [myStory, setMyStory] = useState<Story | null>(null);
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Profil
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  // Préférences
  const [language, setLanguage] = useState("fr");
  const [darkMode, setDarkMode] = useState(false);

  // Password
  const [pwOpen, setPwOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  /* =====================
     THEME AUTO APPLY
  ===================== */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  /* =====================
     LOAD DATA
  ===================== */
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const headers = { Authorization: `Bearer ${token}` };

        const [meRes, storyRes, matchRes] = await Promise.all([
          fetch(`${API}/user/me`, { headers }),
          fetch(`${API}/mystory/me`, { headers }),
          fetch(`${API}/match`, { headers }),
        ]);

        if (meRes.ok) {
          const data: Me = await meRes.json();
          setMe(data);

          setUsername(data.username ?? "");
          setEmail(data.email ?? "");
          setLanguage(data.language ?? "fr");
          setDarkMode(Boolean(data.dark_mode));

          if (data.language) {
            i18n.changeLanguage(data.language);
          }
        }

        if (storyRes.ok) {
          const s = await storyRes.json().catch(() => null);
          setMyStory(s);
        }

        if (matchRes.ok) {
          setMatches(await matchRes.json());
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token]);

  const createdLabel = useMemo(() => {
    if (!me?.created_at) return "—";
    return new Date(me.created_at).toLocaleDateString();
  }, [me?.created_at]);

  if (loading) return <div className="page myspace-page">Chargement…</div>;

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

    if (!res.ok) {
      alert("Erreur sauvegarde");
      return;
    }

    alert("Profil mis à jour ✅");
  }

  /* =====================
     SAVE LANGUAGE FIX
  ===================== */
  async function saveLanguage(next: string) {
    if (!token) return;

    setLanguage(next);
    i18n.changeLanguage(next); // change direct frontend

    await fetch(`${API}/user/me/language`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ language: next }),
    });
  }

  /* =====================
     SAVE THEME FIX
  ===================== */
  async function saveTheme(next: boolean) {
    if (!token) return;

    setDarkMode(next);

    await fetch(`${API}/user/me/theme`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ dark_mode: next }),
    });
  }

  /* =====================
     CHANGE PASSWORD
  ===================== */
  async function submitPassword() {
    if (!token) return;

    if (!oldPassword || !newPassword) {
      alert("Remplis les 2 champs");
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

  return (
    <div className="page myspace-page">
      <button className="back-button-global" onClick={() => navigate("/")}>
        ←
      </button>

      <header className="page-header">
        <h1>Mon espace</h1>
        <p>Profil et préférences</p>
      </header>

      {/* PROFIL */}
      <section className="block modern-card">
        <h2>Profil</h2>

        <div className="muted small">Inscrit le : {createdLabel}</div>

        <div className="field">
          <label>Nom d’utilisateur</label>
          <input
            className="modern-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Email</label>
          <input
            className="modern-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <button className="btn primary" onClick={saveProfile}>
          Sauvegarder
        </button>

        <button className="btn ghost" onClick={() => setPwOpen(true)}>
          Modifier mot de passe
        </button>
      </section>

      {/* PRÉFÉRENCES */}
      <section className="block modern-card">
        <h2> Préférences</h2>

        <select
          className="modern-select"
          value={language}
          onChange={(e) => saveLanguage(e.target.value)}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="de">Deutsch</option>
          <option value="it">Italiano</option>
        </select>

        <label className="toggle-modern">
          <input
            type="checkbox"
            checked={darkMode}
            onChange={(e) => saveTheme(e.target.checked)}
          />
          <span>{darkMode ? "Mode sombre" : "Mode clair"}</span>
        </label>
      </section>

      {/* TON VÉCU */}
      <section className="block modern-card">
        <h2>Ton vécu</h2>

        {!myStory ? (
          <button className="btn primary" onClick={() => navigate("/story")}>
            Écrire mon histoire
          </button>
        ) : (
          <>
            <h3>{myStory.title}</h3>
            <p>{myStory.body}</p>
          </>
        )}
      </section>

      {/* MATCHES */}
      <section className="block modern-card">
        <h2>Personnes similaires</h2>

        {matches.length === 0 ? (
          <p className="muted">Aucune correspondance.</p>
        ) : (
          matches.map((m) => (
            <div key={m.story_id} className="modern-list-item">
              <strong>{m.title}</strong>
              <p>{m.common_tags.join(", ")}</p>
            </div>
          ))
        )}
      </section>

      {/* PASSWORD MODAL */}
      {pwOpen && (
        <div className="modal-backdrop" onClick={() => setPwOpen(false)}>
          <div className="modal modern-card" onClick={(e) => e.stopPropagation()}>
            <h3>Modifier le mot de passe</h3>

            <input
              className="modern-input"
              type="password"
              placeholder="Ancien mot de passe"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />

            <input
              className="modern-input"
              type="password"
              placeholder="Nouveau mot de passe"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <div className="modal-actions">
              <button className="btn primary" onClick={submitPassword}>
                Sauvegarder
              </button>

              <button className="btn ghost" onClick={() => setPwOpen(false)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}