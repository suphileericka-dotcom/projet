import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/mySpace.css";
import { API } from "../config/api";
import { persistCountry } from "../config/countryAccess";
import { buildAvatarUrl, resolveAvatarUpload } from "../lib/avatar";

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

function formatDateTime(value?: number | string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function describeDmSubscription(subscription?: SpacePayload["dm_subscription"]) {
  const rawStatus =
    typeof subscription?.status === "string" ? subscription.status.trim() : "";
  const normalizedStatus = rawStatus.toLowerCase();
  const isActive =
    subscription?.active === true ||
    normalizedStatus === "active" ||
    normalizedStatus === "trialing" ||
    normalizedStatus === "paid";

  if (isActive) {
    return {
      tone: "active",
      badge: "Illimite",
      label: "Abonnement DM actif",
      detail:
        "Tu peux ecrire en prive a tout le monde tant que Stripe confirme le renouvellement mensuel.",
      statusLabel: rawStatus || "active",
    } as const;
  }

  if (
    normalizedStatus === "inactive" ||
    normalizedStatus === "past_due" ||
    normalizedStatus === "unpaid" ||
    normalizedStatus === "canceled" ||
    normalizedStatus === "cancelled"
  ) {
    return {
      tone: "inactive",
      badge: "A verifier",
      label: "Abonnement DM inactif",
      detail:
        "Les conversations deja ouvertes restent dans ton archive. Pour de nouveaux DM, le statut de paiement devra etre confirme par le backend.",
      statusLabel: rawStatus,
    } as const;
  }

  return {
    tone: "neutral",
    badge: "A la carte",
    label: "Paiements unitaires ou abonnement",
    detail:
      "Chaque paiement unique debloque un seul profil. L'abonnement donne un acces prive illimite tant qu'il est actif.",
    statusLabel: rawStatus || null,
  } as const;
}

export default function MySpace() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [space, setSpace] = useState<SpacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const dmSubscriptionSummary = describeDmSubscription(space?.dm_subscription);

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
        setAvatarPreview(resolveAvatarUpload(data.profile?.avatar));
        localStorage.setItem("username", data.profile?.username ?? "");
        localStorage.setItem(
          "avatar",
          resolveAvatarUpload(data.profile?.avatar) ?? ""
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
    void loadDashboard();
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
        setAvatarPreview(resolveAvatarUpload(data.avatar));
        localStorage.setItem("username", username);
        localStorage.setItem("avatar", resolveAvatarUpload(data.avatar) ?? "");
        if (data.country ?? data.profile?.country) {
          persistCountry(data.country ?? data.profile?.country);
        }
        alert("Profil mis a jour !");
      } else {
        const errData = await res.json();
        alert(errData.error || "Erreur de sauvegarde");
      }
    } catch {
      alert("Erreur reseau");
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
        alert("Mot de passe modifie avec succes");
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

  if (loading) {
    return <div className="page myspace-page">Chargement du dashboard...</div>;
  }

  return (
    <div className="page myspace-page">
      <button className="back-button-global" onClick={() => navigate("/")}>
        {"<"}
      </button>

      <header className="page-header">
        <h1>Mon espace</h1>
        <p>Gere tes publications et tes informations personnelles.</p>
      </header>

      <section className="block profile-block">
        <div className="block-head">
          <h2>Mon profil</h2>
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
              onChange={(event) => {
                const file = event.target.files?.[0];
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
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </div>
          <div className="field">
            <label>Adresse email</label>
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
        </div>

        <div className="profile-actions">
          <button className="btn primary" onClick={() => setPwOpen(true)}>
            Changer le mot de passe
          </button>
        </div>
      </section>

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

      <section className="dashboard-grid no-journal">
        <article className="dash-card">
          <div className="block-head">
            <h3>Stories recentes</h3>
            <span className="story-counter">
              Histoires publiees:{" "}
              {space?.stats?.stories ?? space?.recent_stories?.length ?? 0}
            </span>
          </div>

          <div className="list-container">
            {(!space?.recent_stories || space.recent_stories.length === 0) && (
              <p className="muted">Tu n'as pas encore publie de story.</p>
            )}
            {space?.recent_stories?.map((story) => (
              <div key={story.id} className="list-row story-list-row">
                <strong className="story-list-title">
                  {story.title || "Sans titre"}
                </strong>
                <small>{formatDateTime(story.created_at)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="dash-card">
          <div className="friends-card-head">
            <div>
              <h3>Gerer amities</h3>
              <p className="friends-card-note">
                L'archive DM 24h est maintenant regroupee ici avec tes connexions.
              </p>
            </div>

            <div className="friends-card-actions">
              <span className={`status-pill ${dmSubscriptionSummary.tone}`}>
                {dmSubscriptionSummary.badge}
              </span>
              <button className="btn ghost" onClick={() => navigate("/private-chat")}>
                Archive DM
              </button>
              <button className="btn ghost" onClick={() => navigate("/match")}>
                Trouver un profil
              </button>
            </div>
          </div>

          <div className="subscription-box friends-card-summary">
            <strong>{dmSubscriptionSummary.label}</strong>
            <p className="muted">{dmSubscriptionSummary.detail}</p>
            {dmSubscriptionSummary.statusLabel && (
              <span className="small muted">
                Statut Stripe actuel : {dmSubscriptionSummary.statusLabel}
              </span>
            )}
            <span className="small muted">
              Les profils restent dans l'archive et le texte visible des messages
              disparait apres 24h.
            </span>
          </div>

          <div className="list-container">
            {(!space?.friends || space.friends.length === 0) && (
              <p className="muted">Aucun ami pour le moment.</p>
            )}
            {space?.friends?.map((friend) => (
              <div key={friend.id} className="list-row">
                <img
                  src={buildAvatarUrl({
                    name: friend.username || "Ami",
                    avatarPath: friend.avatar,
                    seed: friend.id,
                    size: 96,
                  })}
                  className="avatar-sm"
                  alt={friend.username || "Ami"}
                />
                <strong>{friend.username}</strong>
                <div className="status-indicator online" />
              </div>
            ))}
          </div>
        </article>
      </section>

      {pwOpen && (
        <div className="modal-backdrop" onClick={() => setPwOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3>Securite du compte</h3>
            <p className="muted">
              Saisis ton ancien mot de passe pour definir le nouveau.
            </p>

            {pwError && (
              <div
                className="error-msg"
                style={{ color: "var(--danger)", marginBottom: "10px" }}
              >
                {pwError}
              </div>
            )}

            <input
              className="modern-input"
              type="password"
              placeholder="Ancien mot de passe"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
            <input
              className="modern-input"
              type="password"
              placeholder="Nouveau mot de passe"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />

            <div className="modal-actions">
              <button className="btn primary" onClick={submitPassword} disabled={pwSaving}>
                {pwSaving ? "Mise a jour..." : "Mettre a jour"}
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
