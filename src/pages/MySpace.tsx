import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "../style/mySpace.css";

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

const API = "http://localhost:8000/api";

export default function MySpace() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");
  const { i18n } = useTranslation();

  const [me, setMe] = useState<Me | null>(null);

  const [myStory, setMyStory] = useState<Story | null>(null);
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  // form profil
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState("fr");
  const [darkMode, setDarkMode] = useState(false);

  const [saving, setSaving] = useState(false);

  // password modal
  const [pwOpen, setPwOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // =====================
  // Apply theme globally
  // =====================
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // =====================
  // Load all data
  // =====================
  useEffect(() => {
    if (!token) return;

    async function load() {
      try {
        const [meRes, storyRes, matchRes, recoRes] = await Promise.all([
          fetch(`${API}/user/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/story/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/match`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/recommendations`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (meRes.ok) {
          const data: Me = await meRes.json();
          setMe(data);

          setUsername(data.username ?? "");
          setEmail(data.email ?? "");
          setLanguage(data.language ?? "fr");
          setDarkMode(Boolean(data.dark_mode));

          // applique langue automatiquement
          if (data.language) i18n.changeLanguage(data.language);
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

  if (loading) return <div className="page myspace-page">Chargement…</div>;

  // =====================
  // Save profile (username/email)
  // =====================
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
      alert("Profil mis à jour ✅");
    } finally {
      setSaving(false);
    }
  }

  // =====================
  // Save language
  // =====================
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

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error || "Erreur langue");
      return;
    }

    setLanguage(next);
    i18n.changeLanguage(next);
    alert("Langue mise à jour ✅");
  }

  // =====================
  // Save theme
  // =====================
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

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error || "Erreur thème");
      return;
    }
  }

  // =====================
  // Upload avatar
  // =====================
  async function onPickAvatar(file: File | null) {
    if (!token || !file) return;

    const fd = new FormData();
    fd.append("avatar", file);

    const res = await fetch(`${API}/user/me/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error || "Erreur upload avatar");
      return;
    }

    setMe((prev) => (prev ? { ...prev, avatar: data.avatar } : prev));
    alert("Photo mise à jour ✅");
  }

  // =====================
  // Change password (modal)
  // =====================
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
      alert("Mot de passe modifié ✅");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="page myspace-page">
      <button className="back-button-global" onClick={() => navigate("/")}>←</button>

      <header className="page-header">
        <h1>Mon espace</h1>
        <p>Profil, préférences, ton vécu et tes connexions.</p>
      </header>

      {/* =====================
          PROFIL
      ===================== */}
      <section className="block">
        <div className="block-head">
          <h2>Profil</h2>
          <button className="btn ghost" onClick={saveProfile} disabled={saving}>
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>

        <div className="profile-row">
          <div className="avatar-col">
            <img
              className="avatar-xl"
              src={me?.avatar || "/avatar.png"}
              alt=""
            />
            <label className="btn tiny">
              Changer photo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => onPickAvatar(e.target.files?.[0] || null)}
              />
            </label>
            <div className="muted small">Inscrit le : {createdLabel}</div>
          </div>

          <div className="form-col">
            <div className="field">
              <label>Nom d’utilisateur</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>

            <div className="field">
              <label>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="row-actions">
              <button className="btn primary" onClick={() => setPwOpen(true)}>
                Modifier le mot de passe
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* =====================
          PRÉFÉRENCES
      ===================== */}
      <section className="block">
        <div className="block-head">
          <h2>⚙️ Préférences</h2>
        </div>

        <div className="prefs-grid">
          <div className="pref-card">
            <div className="pref-title">Langue</div>
            <select value={language} onChange={(e) => saveLanguage(e.target.value)}>
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="it">Italiano</option>
              <option value="de">Deutsch</option>
            </select>
            <div className="muted small">Modifiable à tout moment.</div>
          </div>

          <div className="pref-card">
            <div className="pref-title">Thème</div>
            <label className="switch">
              <input
                type="checkbox"
                checked={darkMode}
                onChange={(e) => saveTheme(e.target.checked)}
              />
              <span className="slider" />
              <span className="switch-label">{darkMode ? "Sombre" : "Clair"}</span>
            </label>
            <div className="muted small">Appliqué globalement.</div>
          </div>
        </div>
      </section>

      {/* =====================
          TON VÉCU
      ===================== */}
      <section className="block">
        <h2> Ton vécu</h2>

        {!myStory ? (
          <div className="empty">
            <p>Tu n’as pas encore écrit ton histoire.</p>
            <button className="btn primary" onClick={() => navigate("/story")}>
              Écrire mon histoire
            </button>
          </div>
        ) : (
          <div className="story-card">
            <h3>{myStory.title}</h3>
            <p className="story-body">{myStory.body}</p>
            <div className="tags">
              {myStory.tags.map((t) => (
                <span key={t} className="tag on">{t}</span>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <button className="btn ghost" onClick={() => navigate("/story")}>
                Ouvrir MyStory
              </button>
            </div>
          </div>
        )}
      </section>

      {/* =====================
          PERSONNES SIMILAIRES
      ===================== */}
      <section className="block">
        <h2> Personnes similaires</h2>

        {matches.length === 0 ? (
          <p className="muted">Aucune correspondance pour le moment.</p>
        ) : (
          <div className="grid">
            {matches.map((m) => (
              <div key={m.story_id} className="mini-card">
                <strong>{m.title}</strong>
                <p>Points communs : {m.common_tags.join(", ")}</p>
                <button className="btn tiny" onClick={() => navigate(`/stories?open=${m.story_id}`)}>
                  Lire
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* =====================
          DISCUSSIONS
      ===================== */}
      <section className="block">
        <h2>💬 Discussions recommandées</h2>

        <div className="grid">
          {recommendations.map((r) => (
            <div key={r.tag} className="mini-card">
              <strong>{r.tag}</strong>
              <p>{r.reason}</p>
              <button className="btn tiny" onClick={() => navigate(`/chat/${r.tag}`)}>
                Entrer
              </button>
            </div>
          ))}
        </div>

       
      </section>

      {/* =====================
          MODAL MOT DE PASSE
      ===================== */}
      {pwOpen && (
        <div className="modal-backdrop" onClick={() => setPwOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Modifier le mot de passe</h3>

            {pwError && <div className="pay-error">{pwError}</div>}

            <div className="field">
              <label>Ancien mot de passe</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Nouveau mot de passe</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="mini-actions">
              <button className="btn primary" onClick={submitPassword} disabled={pwSaving}>
                {pwSaving ? "..." : "Sauvegarder"}
              </button>
              <button className="btn ghost" onClick={() => setPwOpen(false)}>
                Annuler
              </button>
            </div>

            {/* Reset email/SMS: on le fera ensuite (Étape bonus) */}
            <div className="muted small" style={{ marginTop: 10 }}>
              “Mot de passe oublié” (email/SMS) : prochaine étape.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
