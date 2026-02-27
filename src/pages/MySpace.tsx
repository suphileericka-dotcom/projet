import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "../style/mySpace.css";

/* =====================
   API BASE (SAFE)
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

type Recommendation = {
  tag: string;
  reason: string;
};

type Me = {
  id: string;
  username: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  situation: string | null;
  language: string;
  dark_mode: boolean;
  show_chats: boolean;
  avatar: string | null;
  created_at: number | null;
};

export default function MySpace() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");
  const { i18n } = useTranslation();

  const [me, setMe] = useState<Me | null>(null);
  const [myStory, setMyStory] = useState<Story | null>(null);
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState("fr");
  const [darkMode, setDarkMode] = useState(false);

  const [saving, setSaving] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  /* =====================
     APPLY THEME
  ===================== */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  /* =====================
     LOAD DATA
  ===================== */
  useEffect(() => {
    if (!token) return;

    async function load() {
      try {
        const [meRes, storyRes, matchRes, recoRes] =
          await Promise.all([
            fetch(`${API}/user/me`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch(`${API}/stories/me`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch(`${API}/match`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch(`${API}/recommendations`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
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

        if (storyRes.ok) setMyStory(await storyRes.json());
        if (matchRes.ok) setMatches(await matchRes.json());
        if (recoRes.ok) setRecommendations(await recoRes.json());
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token, i18n]);

  const createdLabel = useMemo(() => {
    if (!me?.created_at) return "—";
    return new Date(me.created_at).toLocaleDateString();
  }, [me?.created_at]);

  if (loading)
    return <div className="page myspace-page">Chargement…</div>;

  /* =====================
     SAVE PROFILE
  ===================== */
  async function saveProfile() {
    if (!token) return;
    setSaving(true);

    try {
      const res = await fetch(`${API}/user/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username, email }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || "Erreur sauvegarde profil");
        return;
      }

      setMe(data);
      alert("Profil mis à jour ");
    } finally {
      setSaving(false);
    }
  }

  /* =====================
     SAVE LANGUAGE
  ===================== */
  async function saveLanguage(next: string) {
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
    i18n.changeLanguage(next);
  }

  /* =====================
     SAVE THEME
  ===================== */
  async function saveTheme(nextDark: boolean) {
    if (!token) return;

    setDarkMode(nextDark);

    await fetch(`${API}/user/me/theme`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ dark_mode: nextDark }),
    });
  }

  /* =====================
     CHANGE PASSWORD
  ===================== */
  async function submitPassword() {
    if (!token) return;

    setPwSaving(true);
    setPwError(null);

    try {
      const res = await fetch(`${API}/user/me/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setPwError(data?.error || "Erreur mot de passe");
        return;
      }

      setPwOpen(false);
      setOldPassword("");
      setNewPassword("");
      alert("Mot de passe modifié ");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="page myspace-page">
      <button
        className="back-button-global"
        onClick={() => navigate("/")}
      >
        ←
      </button>

      <header className="page-header">
        <h1>Mon espace</h1>
        <p>Profil, préférences et connexions.</p>
      </header>

      {/* PROFIL */}
      {/* PROFIL */}
<section className="block">
  <div className="block-head">
    <h2>Profil</h2>

    <button
      className="btn ghost"
      onClick={saveProfile}
      disabled={saving}
    >
      {saving ? "Sauvegarde..." : "Sauvegarder"}
    </button>
  </div>

  <div className="muted small">
    Inscrit le : {createdLabel}
  </div>

  <div className="field">
    <label>Nom d’utilisateur</label>
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

  <button
    className="btn primary"
    onClick={() => setPwOpen(true)}
  >
    Modifier le mot de passe
  </button>
</section>

      {/* PRÉFÉRENCES */}
      <section className="block">
        <h2>⚙️ Préférences</h2>

        <select
          value={language}
          onChange={(e) => saveLanguage(e.target.value)}
        >
            <option value="fr">FR</option>
  <option value="en">EN</option>
  <option value="es">ES</option>
  <option value="de">DE</option>
  <option value="it">IT</option>
        </select>

        <label>
          <input
            type="checkbox"
            checked={darkMode}
            onChange={(e) => saveTheme(e.target.checked)}
          />
          {darkMode ? "Mode sombre" : "Mode clair"}
        </label>
      </section>

      {/* TON VÉCU */}
      <section className="block">
        <h2>Ton vécu</h2>

        {!myStory ? (
          <button
            className="btn primary"
            onClick={() => navigate("/story")}
          >
            Écrire mon histoire
          </button>
        ) : (
          <>
            <h3>{myStory.title}</h3>
            <p>{myStory.body}</p>
          </>
        )}
      </section>

      {/* MATCHS */}
      <section className="block">
        <h2>Personnes similaires</h2>
        {matches.map((m) => (
          <div key={m.story_id}>
            <strong>{m.title}</strong>
            <p>{m.common_tags.join(", ")}</p>
          </div>
        ))}
      </section>

      {/* RECOMMANDATIONS */}
      <section className="block">
        <h2>Discussions recommandées</h2>
        {recommendations.map((r) => (
          <div key={r.tag}>
            <strong>{r.tag}</strong>
            <p>{r.reason}</p>
          </div>
        ))}
      </section>

      {/* PASSWORD MODAL */}
      {pwOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Modifier le mot de passe</h3>

            {pwError && <div>{pwError}</div>}

            <input
              type="password"
              placeholder="Ancien mot de passe"
              value={oldPassword}
              onChange={(e) =>
                setOldPassword(e.target.value)
              }
            />

            <input
              type="password"
              placeholder="Nouveau mot de passe"
              value={newPassword}
              onChange={(e) =>
                setNewPassword(e.target.value)
              }
            />

            <button onClick={submitPassword}>
              Sauvegarder
            </button>

            <button onClick={() => setPwOpen(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
