import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/mySpace.css";
import { API } from "../config/api";

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

type ThreadPreview = {
  id: string;
  otherUserId?: string;
  otherName?: string | null;
  otherAvatar?: string | null;
  lastMessage?: string | null;
  lastAt?: number | string | null;
};

type StoryPreview = {
  id: string;
  title?: string | null;
  body?: string | null;
  tags?: string[];
  created_at?: number | string | null;
};

type JournalPreview = {
  id: string;
  body?: string | null;
  mood?: string | null;
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
  friend_requests_received?: FriendLike[];
  friend_requests_sent?: FriendLike[];
  recent_dm_threads?: ThreadPreview[];
  recent_stories?: StoryPreview[];
  recent_journal_entries?: JournalPreview[];
  daily_matches?: MatchPreview[];
};

type PaymentState = {
  dm_subscription?: {
    active?: boolean;
    status?: string | null;
    renews_at?: number | string | null;
    canceled_at?: number | string | null;
  };
  unlocked_dms?: Array<{
    targetUserId?: string;
    target_user_id?: string;
    expires_at?: number | string | null;
  }>;
};

function formatDate(value?: number | string | null) {
  if (!value) return "—";

  const date =
    typeof value === "number" ? new Date(value) : new Date(String(value));

  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function formatDateTime(value?: number | string | null) {
  if (!value) return "—";

  const date =
    typeof value === "number" ? new Date(value) : new Date(String(value));

  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function resolveUpload(path?: string | null) {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const base = API.replace("/api", "");
  return `${base}/uploads/${path}`;
}

export default function MySpace() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [space, setSpace] = useState<SpacePayload | null>(null);
  const [payments, setPayments] = useState<PaymentState | null>(null);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [pwOpen, setPwOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [relationBusyId, setRelationBusyId] = useState<string | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  async function loadDashboard() {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const [spaceRes, paymentsRes] = await Promise.all([
        fetch(`${API}/user/me/space`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API}/payments/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (spaceRes.ok) {
        const data: SpacePayload = await spaceRes.json();
        setSpace(data);
        setUsername(data.profile?.username ?? "");
        setEmail(data.profile?.email ?? "");
        setAvatarPreview(resolveUpload(data.profile?.avatar));
      }

      if (paymentsRes.ok) {
        setPayments(await paymentsRes.json());
      }
    } catch (err) {
      console.error("Erreur dashboard:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, [token]);

  const profile = space?.profile ?? null;
  const createdLabel = useMemo(
    () => formatDate(profile?.created_at),
    [profile?.created_at]
  );

  const stats = [
    { label: "Stories", value: space?.stats?.stories ?? 0 },
    { label: "Amis", value: space?.stats?.friends ?? 0 },
    { label: "Journal", value: space?.stats?.journal_entries ?? 0 },
    { label: "DM", value: space?.stats?.dm_threads ?? 0 },
    { label: "Matchs du jour", value: space?.stats?.matches_today ?? 0 },
  ];

  const friends = space?.friends ?? [];
  const receivedRequests = space?.friend_requests_received ?? [];
  const sentRequests = space?.friend_requests_sent ?? [];
  const recentThreads = space?.recent_dm_threads ?? [];
  const recentStories = space?.recent_stories ?? [];
  const recentJournal = space?.recent_journal_entries ?? [];
  const dailyMatches = space?.daily_matches ?? [];
  const subscription = payments?.dm_subscription;
  const unlockedDms = payments?.unlocked_dms ?? [];

  if (loading) {
    return <div className="page myspace-page">Chargement…</div>;
  }

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
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erreur sauvegarde profil");
        return;
      }

      setSpace((prev) => ({
        ...prev,
        profile: {
          ...(prev?.profile ?? { id: data.id }),
          ...data,
        },
      }));
      setAvatarPreview(resolveUpload(data.avatar) || avatarPreview);
      alert("Profil mis à jour");
    } finally {
      setSavingProfile(false);
    }
  }

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

      const data = await res.json();

      if (!res.ok) {
        setPwError(data?.error || "Erreur mot de passe");
        return;
      }

      setPwOpen(false);
      setOldPassword("");
      setNewPassword("");
      alert("Mot de passe modifié");
    } finally {
      setPwSaving(false);
    }
  }

  async function runRelationAction(
    id: string,
    method: "POST" | "DELETE",
    suffix = ""
  ) {
    if (!token) return;

    setRelationBusyId(id + suffix);

    try {
      const res = await fetch(`${API}/friends/${id}${suffix}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        alert("Action impossible");
        return;
      }

      await loadDashboard();
    } finally {
      setRelationBusyId(null);
    }
  }

  async function cancelSubscription() {
    if (!token) return;

    setSubscriptionLoading(true);

    try {
      const res = await fetch(`${API}/payments/dm/subscription/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        alert("Impossible d'annuler l'abonnement");
        return;
      }

      await loadDashboard();
    } finally {
      setSubscriptionLoading(false);
    }
  }

  return (
    <div className="page myspace-page">
      <button className="back-button-global" onClick={() => navigate("/")}>
        ←
      </button>

      <header className="page-header">
        <h1>Mon espace</h1>
        <p>Vue d’ensemble de ton profil, de tes liens et de ton activité.</p>
      </header>

      <section className="block profile-block">
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

        <div className="avatar-section">
          <label className="avatar-upload">
            <img
              src={
                avatarPreview ||
                `https://ui-avatars.com/api/?name=${username || "U"}`
              }
              className="avatar-xl"
            />
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setAvatarFile(file);
                setAvatarPreview(URL.createObjectURL(file));
              }}
            />
            <span>Changer la photo</span>
          </label>
        </div>

        <div className="profile-grid">
          <div className="field">
            <label>Nom d'utilisateur</label>
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
        </div>

        <button className="btn primary" onClick={() => setPwOpen(true)}>
          Modifier le mot de passe
        </button>
      </section>

      <section className="stats-grid">
        {stats.map((item) => (
          <article key={item.label} className="stat-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="block dashboard-grid">
        <article className="dash-card">
          <div className="block-head">
            <h2>Amis</h2>
            <span className="muted">{friends.length}</span>
          </div>
          {friends.length === 0 && <p className="muted">Aucun ami pour le moment.</p>}
          {friends.map((friend) => (
            <div key={friend.id} className="list-row">
              <div>
                <strong>{friend.username || "Profil anonyme"}</strong>
                <p>{(friend.common_tags ?? []).map((t) => `#${t}`).join(" ") || "Aucun tag commun"}</p>
              </div>
              <button
                className="btn ghost"
                disabled={relationBusyId === `${friend.id}`}
                onClick={() => runRelationAction(friend.id, "DELETE")}
              >
                Retirer
              </button>
            </div>
          ))}
        </article>

        <article className="dash-card">
          <div className="block-head">
            <h2>Demandes reçues</h2>
            <span className="muted">{receivedRequests.length}</span>
          </div>
          {receivedRequests.length === 0 && (
            <p className="muted">Aucune demande reçue.</p>
          )}
          {receivedRequests.map((friend) => (
            <div key={friend.id} className="list-row">
              <strong>{friend.username || "Profil anonyme"}</strong>
              <div className="inline-actions">
                <button
                  className="btn primary"
                  disabled={relationBusyId === `${friend.id}/accept`}
                  onClick={() =>
                    runRelationAction(friend.id, "POST", "/accept")
                  }
                >
                  Accepter
                </button>
                <button
                  className="btn ghost"
                  disabled={relationBusyId === `${friend.id}/request`}
                  onClick={() =>
                    runRelationAction(friend.id, "DELETE", "/request")
                  }
                >
                  Refuser
                </button>
              </div>
            </div>
          ))}
        </article>

        <article className="dash-card">
          <div className="block-head">
            <h2>Demandes envoyées</h2>
            <span className="muted">{sentRequests.length}</span>
          </div>
          {sentRequests.length === 0 && <p className="muted">Aucune demande envoyée.</p>}
          {sentRequests.map((friend) => (
            <div key={friend.id} className="list-row">
              <strong>{friend.username || "Profil anonyme"}</strong>
              <button
                className="btn ghost"
                disabled={relationBusyId === `${friend.id}/request`}
                onClick={() => runRelationAction(friend.id, "DELETE", "/request")}
              >
                Annuler
              </button>
            </div>
          ))}
        </article>

        <article className="dash-card">
          <div className="block-head">
            <h2>DM récents</h2>
            <button className="btn ghost" onClick={() => navigate("/private-chat")}>
              Ouvrir
            </button>
          </div>
          {recentThreads.length === 0 && <p className="muted">Aucune conversation récente.</p>}
          {recentThreads.map((thread) => (
            <button
              key={thread.id}
              className="list-link"
              onClick={() => navigate(`/private-chat?thread=${thread.id}`)}
            >
              <strong>{thread.otherName || thread.otherUserId || "Conversation"}</strong>
              <span>{thread.lastMessage || "Aucun message"}</span>
              <small>{formatDateTime(thread.lastAt)}</small>
            </button>
          ))}
        </article>

        <article className="dash-card">
          <div className="block-head">
            <h2>Stories récentes</h2>
            <button className="btn ghost" onClick={() => navigate("/stories")}>
              Voir tout
            </button>
          </div>
          {recentStories.length === 0 && <p className="muted">Aucune story récente.</p>}
          {recentStories.map((story) => (
            <div key={story.id} className="list-row stacked">
              <div>
                <strong>{story.title || "Sans titre"}</strong>
                <p>{story.body || "Pas de contenu"}</p>
                <small>{formatDateTime(story.created_at)}</small>
              </div>
            </div>
          ))}
        </article>

        <article className="dash-card">
          <div className="block-head">
            <h2>Journal récent</h2>
          </div>
          {recentJournal.length === 0 && <p className="muted">Aucune entrée récente.</p>}
          {recentJournal.map((entry) => (
            <div key={entry.id} className="list-row stacked">
              <div>
                <strong>{entry.mood || "Entrée"}</strong>
                <p>{entry.body || "Sans contenu"}</p>
                <small>{formatDateTime(entry.created_at)}</small>
              </div>
            </div>
          ))}
        </article>

        <article className="dash-card">
          <div className="block-head">
            <h2>Matchs du jour</h2>
            <button className="btn ghost" onClick={() => navigate("/match")}>
              Voir
            </button>
          </div>
          {dailyMatches.length === 0 && <p className="muted">Aucun match aujourd’hui.</p>}
          {dailyMatches.map((match) => (
            <div key={match.id} className="list-row">
              <div>
                <strong>{match.summary || "Connexion suggérée"}</strong>
                <p>{(match.common_tags ?? []).map((t) => `#${t}`).join(" ") || "Aucun tag commun"}</p>
              </div>
              <button
                className="btn primary"
                onClick={() => navigate("/match")}
              >
                Ouvrir
              </button>
            </div>
          ))}
        </article>

        <article className="dash-card">
          <div className="block-head">
            <h2>Abonnement / déblocages</h2>
          </div>
          <div className="subscription-box">
            <strong>
              {subscription?.active ? "Abonnement actif" : "Pas d'abonnement actif"}
            </strong>
            <p>
              Statut : {subscription?.status || "aucun"} • Renouvellement :{" "}
              {formatDate(subscription?.renews_at)}
            </p>
            {subscription?.active && (
              <button
                className="btn ghost"
                onClick={cancelSubscription}
                disabled={subscriptionLoading}
              >
                {subscriptionLoading ? "Annulation..." : "Annuler l'abonnement"}
              </button>
            )}
          </div>

          <div className="unlock-list">
            <strong>DM débloqués</strong>
            {unlockedDms.length === 0 && <p className="muted">Aucun déblocage actif.</p>}
            {unlockedDms.map((item, index) => (
              <div key={`${item.targetUserId || item.target_user_id}-${index}`} className="list-row">
                <span>
                  Utilisateur {item.targetUserId || item.target_user_id || "inconnu"}
                </span>
                <small>{formatDate(item.expires_at)}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      {pwOpen && (
        <div className="modal-backdrop" onClick={() => setPwOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Modifier le mot de passe</h3>

            {pwError && <div className="pay-error">{pwError}</div>}

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
              <button
                className="btn primary"
                onClick={submitPassword}
                disabled={pwSaving}
              >
                {pwSaving ? "..." : "Sauvegarder"}
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
