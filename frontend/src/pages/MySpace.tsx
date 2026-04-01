import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "../style/mySpace.css";
import { API } from "../config/api";
import { persistCountry } from "../config/countryAccess";
import { buildAvatarUrl, resolveAvatarUpload } from "../lib/avatar";

/* =====================
   TYPES
===================== */

type SpaceProfile = {
  id: string;
  username?: string | null;
  email?: string | null;
  avatar?: string | null;
  country?: string | null;
  dark_mode?: boolean;
  created_at?: number | string | null;
};

type SpaceStats = {
  stories?: number;
  friends?: number;
  dm_threads?: number;
  matches_today?: number;
};

type FriendLike = {
  id: string;
  username?: string | null;
  avatar?: string | null;
};

type StoryPreview = {
  id: string;
  title?: string | null;
  body?: string | null;
  created_at?: number | string | null;
};

type MatchPreview = {
  id: string;
  summary?: string | null;
  avatar?: string | null;
};

type SpacePayload = {
  profile?: SpaceProfile;
  stats?: SpaceStats;
  friends?: FriendLike[];
  recent_stories?: StoryPreview[];
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

/* =====================
   COMPOSANT PRINCIPAL
===================== */

export default function MySpace() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  // États des données
  const [space, setSpace] = useState<SpacePayload | null>(null);
  const [loading, setLoading] = useState(true);

  // États du formulaire profil
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // États de la modale Password
  const [pwOpen, setPwOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Chargement des données
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
        setAvatarPreview(resolveAvatarUpload(data.profile?.avatar));
        localStorage.setItem("username", data.profile?.username ?? "");
        localStorage.setItem(
          "avatar",
          resolveAvatarUpload(data.profile?.avatar) ?? "",
        );
        if (data.profile?.country) {
          persistCountry(data.profile.country);
        }
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

  // Sauvegarder le profil (Texte + Image)
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
        setAvatarPreview(resolveAvatarUpload(data.avatar));
        localStorage.setItem("username", username);
        localStorage.setItem("avatar", resolveAvatarUpload(data.avatar) ?? "");
        if (data.country ?? data.profile?.country) {
          persistCountry(data.country ?? data.profile?.country);
        }
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

  // Changer le mot de passe
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
        alert("Mot de passe modifié avec succès");
      } else {
        const data = await res.json();
        setPwError(data.error || "Erreur mot de passe");
      }
    } catch {
      setPwError("Serveur injoignable");
    } finally {
      setPwSaving(false);
    }
  }

  if (loading) return <div className="page myspace-page">Chargement du dashboard...</div>;

  return (
    <div className="page myspace-page">
      <button className="back-button-global" onClick={() => navigate("/")}>←</button>

      <header className="page-header">
        <h1>Mon espace</h1>
        <p>Gère tes publications et tes informations personnelles.</p>
      </header>

      {/* SECTION PROFIL & AVATAR */}
      <section className="block profile-block">
        <div className="block-head">
          <h2>Mon Profil</h2>
          <button className="btn ghost" onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? "Enregistrement..." : "Enregistrer les modifications"}
          </button>
        </div>

        <div className="avatar-section">
          <label className="avatar-upload">
            <img
              src={buildAvatarUrl({
                name: username || "Membre",
                avatarPath: avatarPreview,
                seed: space?.profile?.id || username,
                size: 256,
              })}
              className="avatar-xl"
              alt="Profil"
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
            <div className="overlay-text">Changer la photo</div>
          </label>
        </div>

        <div className="profile-grid">
          <div className="field">
            <label>Nom d'utilisateur</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label>Adresse Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>

        <div className="profile-actions">
           <button className="btn primary" onClick={() => setPwOpen(true)}>Changer le mot de passe</button>
        </div>
      </section>

      {/* STATS RAPIDES (JOURNAL RETIRÉ) */}
      <section className="stats-grid">
        <article className="stat-card">
          <span>Stories</span>
          <strong>{space?.stats?.stories ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span>Amis</span>
          <strong>{space?.stats?.friends ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span>Messages</span>
          <strong>{space?.stats?.dm_threads ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span>Matchs du jour</span>
          <strong>{space?.stats?.matches_today ?? 0}</strong>
        </article>
      </section>

      {/* GRILLE DE CONTENU (JOURNAL RETIRÉ) */}
      <section className="dashboard-grid no-journal">
        
        {/* COLONNE STORIES */}
        <article className="dash-card">
          <div className="block-head">
            <h3>Stories récentes</h3>
            <span className="story-counter">
              Histoires publiees: {space?.stats?.stories ?? space?.recent_stories?.length ?? 0}
            </span>
          </div>
          
          <div className="list-container">
            {(!space?.recent_stories || space.recent_stories.length === 0) && (
              <p className="muted">Tu n'as pas encore publié de story.</p>
            )}
            {space?.recent_stories?.map((s) => (
              <div key={s.id} className="list-row story-list-row">
                <strong className="story-list-title">{s.title || "Sans titre"}</strong>
                <small>{formatDateTime(s.created_at)}</small>
              </div>
            ))}
          </div>
        </article>

        {/* COLONNE AMIS */}
        <article className="dash-card">
          <div className="block-head">
            <h3>Amis connectés</h3>
            <button className="btn link" onClick={() => navigate("/friends")}>Gérer</button>
          </div>
          
          <div className="list-container">
            {(!space?.friends || space.friends.length === 0) && (
              <p className="muted">Aucun ami pour le moment.</p>
            )}
            {space?.friends?.map((f) => (
              <div key={f.id} className="list-row">
                <img
                  src={buildAvatarUrl({
                    name: f.username || "Ami",
                    avatarPath: f.avatar,
                    seed: f.id,
                    size: 96,
                  })}
                  className="avatar-sm"
                  alt={f.username || "Ami"}
                />
                <strong>{f.username}</strong>
                <div className="status-indicator online"></div>
              </div>
            ))}
          </div>
        </article>

      </section>

      {/* MODALE CHANGEMENT MOT DE PASSE */}
      {pwOpen && (
        <div className="modal-backdrop" onClick={() => setPwOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Sécurité du compte</h3>
            <p className="muted">Saisis ton ancien mot de passe pour définir le nouveau.</p>
            
            {pwError && <div className="error-msg" style={{color: 'var(--danger)', marginBottom: '10px'}}>{pwError}</div>}
            
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
              <button className="btn primary" onClick={submitPassword} disabled={pwSaving}>
                {pwSaving ? "Mise à jour..." : "Mettre à jour"}
              </button>
              <button className="btn ghost" onClick={() => setPwOpen(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
