import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

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

  const [me, setMe] = useState<Me | null>(null);
  const [myStory, setMyStory] = useState<Story | null>(null);
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  // profil
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // password modal
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

 
    async function load() {
      try {
        const [meRes, storyRes, matchRes, recoRes] = await Promise.all([
          fetch(`${API}/user/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          // IMPORTANT: chez toi c'est /api/mystory ou /api/stories/me ?
          // Tu avais dit corriger story/me côté frontend.
          // Ici je mets /mystory/me -> adapte si ton backend diffère.
          fetch(`${API}/mystory/me`, {
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
          setDarkMode(Boolean(data.dark_mode));

          
        }

        if (storyRes.ok) {
          const s = await storyRes.json().catch(() => null);
          setMyStory(s);
        } else {
          setMyStory(null);
        }

        if (matchRes.ok) setMatches(await matchRes.json());
        if (recoRes.ok) setRecommendations(await recoRes.json());
      } finally {
        setLoading(false);
      }
    }

    load();

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
    setSavingProfile(true);

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
      alert("Profil mis à jour ✅");
    } finally {
      setSavingProfile(false);
    }
  }

  

  /* =====================
     SAVE THEME
  ===================== */
  async function saveTheme(nextDark: boolean) {
    if (!token) return;

    setDarkMode(nextDark);

    const res = await fetch(`${API}/user/me/theme`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ dark_mode: nextDark }),
    });

    if (!res.ok) {
      alert("Erreur thème");
    }
  }

  /* =====================
     CHANGE PASSWORD
  ===================== */
  async function submitPassword() {
    if (!token) return;

    if (!oldPassword || !newPassword) {
      setPwError("Remplis les 2 champs.");
      return;
    }

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
      alert("Mot de passe modifié ✅");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="page myspace-page">
      <button className="back-button-global" onClick={() => navigate("/")}>
        ←
      </button>

      <header className="page-header">
        <h1>Mon espace</h1>
        <p>Profil, préférences et connexions.</p>
      </header>

      {/* PROFIL */}
      <section className="block">
        <div className="block-head">
          <h2>Profil</h2>
          <button
            className="btn ghost"
            onClick={saveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>

        <div className="muted small">Inscrit le : {createdLabel}</div>

        <div className="field">
          <label>Nom d’utilisateur</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>

        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <button className="btn primary" onClick={() => setPwOpen(true)}>
          Modifier le mot de passe
        </button>
      </section>

      {/* PRÉFÉRENCES */}
      <section className="block">
        <h2> Préférences</h2>

      

        <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
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

      {/* MATCHS */}
      <section className="block">
        <h2>Personnes similaires</h2>
        {matches.length === 0 ? (
          <p className="muted">Aucune correspondance pour le moment.</p>
        ) : (
          matches.map((m) => (
            <div key={m.story_id} style={{ marginBottom: 10 }}>
              <strong>{m.title}</strong>
              <p>{m.common_tags.join(", ")}</p>
            </div>
          ))
        )}
      </section>

      {/* RECOMMANDATIONS */}
      <section className="block">
        <h2>Discussions recommandées</h2>
        {recommendations.length === 0 ? (
          <p className="muted">Aucune recommandation.</p>
        ) : (
          recommendations.map((r) => (
            <div key={r.tag} style={{ marginBottom: 10 }}>
              <strong>{r.tag}</strong>
              <p>{r.reason}</p>
            </div>
          ))
        )}
      </section>

      {/* PASSWORD MODAL */}
      {pwOpen && (
        <div className="modal-backdrop" onClick={() => setPwOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Modifier le mot de passe</h3>

            {pwError && <div className="pay-error">{pwError}</div>}

            <input
              type="password"
              placeholder="Ancien mot de passe"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />

            <input
              type="password"
              placeholder="Nouveau mot de passe"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <button onClick={submitPassword} disabled={pwSaving}>
              {pwSaving ? "..." : "Sauvegarder"}
            </button>

            <button onClick={() => setPwOpen(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
