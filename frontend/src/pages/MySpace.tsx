import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "../style/mySpace.css";
import { API } from "../config/api";

/* =====================
   TYPES
===================== */

type SpaceProfile = {
  id: string;
  username?: string | null;
  email?: string | null;
  avatar?: string | null;
  dark_mode?: boolean;
  created_at?: number | string | null;
};

type SpaceStats = {
  stories?: number;
  friends?: number;
  journal_entries?: number;
  dm_threads?: number;
  matches_today?: number;
};

type FriendLike = {
  id: string;
  username?: string | null;
  avatar?: string | null;
  common_tags?: string[];
};

type StoryPreview = {
  id: string;
  title?: string | null;
  body?: string | null;
  created_at?: number | string | null;
};

type JournalPreview = {
  id: string;
  body?: string | null;
  created_at?: number | string | null;
};

type MatchPreview = {
  id: string;
  summary?: string | null;
  common_tags?: string[];
  avatar?: string | null;
};

type SpacePayload = {
  profile?: SpaceProfile;
  stats?: SpaceStats;
  friends?: FriendLike[];
  recent_stories?: StoryPreview[];
  recent_journal_entries?: JournalPreview[];
  daily_matches?: MatchPreview[];
  dm_subscription?: {
    status?: string;
    active?: boolean;
  } | null;
};

/* =====================
   HELPERS
===================== */

function formatDateTime(value?: number | string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function resolveUpload(path?: string | null) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const base = API.replace("/api", "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/* =====================
   COMPOSANT
===================== */

export default function MySpace() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [space, setSpace] = useState<SpacePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/user/me/space`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: SpacePayload = await res.json();
        setSpace(data);
        setUsername(data.profile?.username ?? "");
        setEmail(data.profile?.email ?? "");
        setAvatarPreview(resolveUpload(data.profile?.avatar));
      }
    } catch (err) {
      console.error("Erreur dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function saveProfile() {
    if (!token) return;
    setSavingProfile(true);

    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("email", email);
      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      const res = await fetch(`${API}/user/me`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setAvatarPreview(resolveUpload(data.avatar));
        alert("Profil mis à jour !");
      } else {
        const errData = await res.json();
        alert(errData.error || "Erreur de sauvegarde");
      }
    } catch {
      alert("Erreur réseau");
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitPassword() {
    if (!token || !oldPassword || !newPassword) return;
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

      if (res.ok) {
        setPwOpen(false);
        setOldPassword("");
        setNewPassword("");
        alert("Mot de passe modifié");
      } else {
        const data = await res.json();
        setPwError(data.error || "Erreur mot de passe");
      }
    } catch {
      setPwError("Erreur lors de la modification");
    } finally {
      setPwSaving(false);
    }
  }

  if (loading) return <div className="page myspace-page">Chargement…</div>;

  return (
    <div className="page myspace-page">
      <button className="back-button-global" onClick={() => navigate("/")}>←</button>

      <header className="page-header">
        <h1>Mon espace</h1>
        <p>Gère ton profil et ton activité.</p>
      </header>

      <section className="block profile-block">
        <div className="block-head">
          <h2>Profil</h2>
          <button className="btn ghost" onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>

        <div className="avatar-section">
          <label className="avatar-upload">
            <img
              src={avatarPreview || `https://ui-avatars.com/api/?name=${username || "U"}`}
              className="avatar-xl"
              alt="Avatar"
            />
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setAvatarFile(file);
                  setAvatarPreview(URL.createObjectURL(file));
                }
              }}
            />
            <span>Changer la photo</span>
          </label>
        </div>

        <div className="profile-grid">
          <div className="field">
            <label>Nom d'utilisateur</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>

        <button className="btn primary" onClick={() => setPwOpen(true)}>Modifier le mot de passe</button>
      </section>

      <section className="stats-grid">
        <article className="stat-card"><span>Stories</span><strong>{space?.stats?.stories ?? 0}</strong></article>
        <article className="stat-card"><span>Amis</span><strong>{space?.stats?.friends ?? 0}</strong></article>
        <article className="stat-card"><span>Journal</span><strong>{space?.stats?.journal_entries ?? 0}</strong></article>
        <article className="stat-card"><span>Matchs</span><strong>{space?.stats?.matches_today ?? 0}</strong></article>
      </section>

      <section className="dashboard-grid">
        <article className="dash-card">
          <div className="block-head"><h3>Stories récentes</h3></div>
          {space?.recent_stories?.map((s) => (
            <div key={s.id} className="list-row stacked">
              <strong>{s.title}</strong>
              <p>{s.body}</p>
              <small>{formatDateTime(s.created_at)}</small>
            </div>
          ))}
        </article>

        <article className="dash-card">
          <div className="block-head"><h3>Journal récent</h3></div>
          {space?.recent_journal_entries?.map((j) => (
            <div key={j.id} className="list-row stacked">
              <p>{j.body}</p>
              <small>{formatDateTime(j.created_at)}</small>
            </div>
          ))}
        </article>

        <article className="dash-card">
          <div className="block-head"><h3>Amis</h3></div>
          {space?.friends?.map((f) => (
            <div key={f.id} className="list-row">
              <img src={resolveUpload(f.avatar) || `https://ui-avatars.com/api/?name=${f.username}`} className="avatar-sm" alt="Ami" />
              <strong>{f.username}</strong>
            </div>
          ))}
        </article>
      </section>

      {pwOpen && (
        <div className="modal-backdrop" onClick={() => setPwOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Modifier le mot de passe</h3>
            {pwError && <div className="error-msg" style={{color: 'red'}}>{pwError}</div>}
            <input className="modern-input" type="password" placeholder="Ancien" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
            <input className="modern-input" type="password" placeholder="Nouveau" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <div className="modal-actions">
              <button className="btn primary" onClick={submitPassword} disabled={pwSaving}>Sauver</button>
              <button className="btn ghost" onClick={() => setPwOpen(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}