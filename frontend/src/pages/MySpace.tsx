import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/mySpace.css";
import { API } from "../config/api";
import { persistCountry } from "../config/countryAccess";
import { buildAvatarUrl, resolveAvatarUpload } from "../lib/avatar";

const MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000;

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

type SpacePayload = {
  profile?: SpaceProfile;
  stats?: SpaceStats;
};

type DmThread = {
  id: string;
};

type DmMessage = {
  id: string;
  senderId: string | null;
  createdAt: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getPayloadRecord(payload: unknown) {
  return Array.isArray(payload) ? null : asRecord(payload);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }

  return undefined;
}

function toTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;

    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) return asDate;
  }

  return null;
}

function isRecentMessage(value: unknown, now = Date.now()) {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return false;
  return now - timestamp <= MESSAGE_RETENTION_MS;
}

function normalizeDmThreads(payload: unknown) {
  const record = getPayloadRecord(payload);
  const rawThreads = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.threads)
      ? record.threads
      : Array.isArray(record?.items)
        ? record.items
        : [];

  const normalizedById = new Map<string, DmThread>();

  for (const entry of rawThreads) {
    const thread = asRecord(entry);
    const id = readString(thread?.id, thread?.threadId, thread?.thread_id, thread?._id);
    if (!id) continue;
    normalizedById.set(id, { id });
  }

  return [...normalizedById.values()];
}

function normalizeDmMessages(payload: unknown) {
  const record = getPayloadRecord(payload);
  const rawMessages = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.messages)
      ? record.messages
      : Array.isArray(record?.items)
        ? record.items
        : [];

  const messages: DmMessage[] = [];

  for (const entry of rawMessages) {
    const message = asRecord(entry);
    if (!message) continue;

    const nestedSender =
      asRecord(message.sender) ?? asRecord(message.user) ?? asRecord(message.author);

    const id = readString(message.id, message.messageId, message.message_id, message._id);
    const senderId =
      readString(
        message.senderId,
        message.sender_id,
        message.userId,
        message.user_id,
        message.authorId,
        message.author_id,
        nestedSender?.id,
        nestedSender?.userId,
        nestedSender?.user_id
      ) || null;
    const createdAt =
      toTimestamp(
        message.createdAt ??
          message.created_at ??
          message.sentAt ??
          message.sent_at ??
          message.updatedAt ??
          message.updated_at
      ) ?? null;

    if (!id || createdAt === null || !isRecentMessage(createdAt)) continue;

    messages.push({ id, senderId, createdAt });
  }

  return messages.sort((left, right) => left.createdAt - right.createdAt);
}

function countPendingIncomingMessages(messages: DmMessage[], currentUserId: string) {
  let pending = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.senderId === currentUserId) {
      break;
    }

    if (message.senderId && message.senderId !== currentUserId) {
      pending += 1;
    }
  }

  return pending;
}

export default function MySpace() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");
  const myUserId = localStorage.getItem("userId");

  const [space, setSpace] = useState<SpacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDmCount, setPendingDmCount] = useState(0);

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

  const loadPendingDmMessages = useCallback(async () => {
    if (!token || !myUserId) {
      setPendingDmCount(0);
      return;
    }

    try {
      const res = await fetch(`${API}/dm/threads`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setPendingDmCount(0);
        return;
      }

      const payload = await res.json().catch(() => null);
      const threads = normalizeDmThreads(payload);

      if (threads.length === 0) {
        setPendingDmCount(0);
        return;
      }

      const counts = await Promise.all(
        threads.map(async (thread) => {
          try {
            const messagesRes = await fetch(
              `${API}/dm/threads/${encodeURIComponent(thread.id)}/messages`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );

            if (!messagesRes.ok) return 0;

            const messagesPayload = await messagesRes.json().catch(() => null);
            const messages = normalizeDmMessages(messagesPayload);
            return countPendingIncomingMessages(messages, myUserId);
          } catch {
            return 0;
          }
        })
      );

      setPendingDmCount(counts.reduce((sum, count) => sum + count, 0));
    } catch {
      setPendingDmCount(0);
    }
  }, [myUserId, token]);

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

        await loadPendingDmMessages();
      }
    } catch (err) {
      console.error("Erreur dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [loadPendingDmMessages, token]);

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
        <button
          type="button"
          className="stat-card stat-card-action"
          onClick={() => navigate("/private-chat")}
        >
          <span>Messages</span>
          <strong>{pendingDmCount}</strong>
          <small>
            {pendingDmCount > 0
              ? `${pendingDmCount} message${pendingDmCount > 1 ? "s" : ""} recu${
                  pendingDmCount > 1 ? "s" : ""
                } en attente de reponse`
              : "Aucun message en attente. Ouvrir le chat prive"}
          </small>
        </button>
        <article className="stat-card">
          <span>Matchs du jour</span>
          <strong>{space?.stats?.matches_today ?? 0}</strong>
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
