import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/match.css";
import { API } from "../config/api";
import { buildAvatarUrl } from "../lib/avatar";

type MatchProfile = {
  id: string;
  summary: string;
  common_tags: string[];
  avatar?: string;
  username?: string;
};

type MatchUsage = {
  remaining: number | null;
  limit: number | null;
  used: number | null;
  resetAt: string | null;
  code: string | null;
};

type MatchPayload = {
  match_date?: string;
  matchDate?: string;
  generated?: boolean;
  items?: MatchProfile[];
  matches?: MatchProfile[];
  usage?: Record<string, unknown>;
  rate_limit?: Record<string, unknown>;
  rateLimit?: Record<string, unknown>;
  remaining?: number;
  remaining_matches?: number;
  remainingMatches?: number;
  limit?: number;
  daily_limit?: number;
  dailyLimit?: number;
  used?: number;
  count?: number;
  reset_at?: string;
  resetAt?: string;
  next_at?: string;
  nextAt?: string;
  code?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }

  return null;
}

function readNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") continue;

    const normalized = Number(value);
    if (Number.isFinite(normalized)) return normalized;
  }

  return null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function formatResetAt(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString();
}

function extractUsage(payload: MatchPayload): MatchUsage | null {
  const nestedUsage =
    asRecord(payload.usage) ??
    asRecord(payload.rate_limit) ??
    asRecord(payload.rateLimit);
  const source = nestedUsage ?? payload;

  const remaining = readNumber(
    source.remaining,
    source.remaining_matches,
    source.remainingMatches,
  );
  const limit = readNumber(source.limit, source.daily_limit, source.dailyLimit);
  const used = readNumber(source.used, source.count);
  const resetAt = readString(
    source.reset_at,
    source.resetAt,
    source.next_at,
    source.nextAt,
  );
  const code = readString(source.code);

  if (
    remaining === null &&
    limit === null &&
    used === null &&
    resetAt === null &&
    code === null
  ) {
    return null;
  }

  return {
    remaining,
    limit,
    used,
    resetAt,
    code,
  };
}

function buildUsageSummary(usage: MatchUsage | null, totalMatches: number) {
  if (usage !== null && usage.remaining !== null && usage.limit !== null) {
    return `${usage.remaining} proposition${
      usage.remaining > 1 ? "s" : ""
    } restante${usage.remaining > 1 ? "s" : ""} aujourd'hui sur ${usage.limit}.`;
  }

  if (usage !== null && usage.used !== null && usage.limit !== null) {
    return `${usage.used} proposition${
      usage.used > 1 ? "s" : ""
    } utilisee${usage.used > 1 ? "s" : ""} aujourd'hui sur ${usage.limit}.`;
  }

  if (totalMatches > 0) {
    return `${totalMatches} profil${totalMatches > 1 ? "s" : ""} disponible${
      totalMatches > 1 ? "s" : ""
    } pour aujourd'hui.`;
  }

  return null;
}

export default function Match() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [matchDate, setMatchDate] = useState<string | null>(null);
  const [generated, setGenerated] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<MatchUsage | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [payTarget, setPayTarget] = useState<MatchProfile | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    async function fetchMatches() {
      try {
        const res = await fetch(`${API}/match`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("Erreur de chargement des suggestions");

        const data: unknown = await res.json();

        if (Array.isArray(data)) {
          setMatches(data as MatchProfile[]);
          setMatchDate(null);
          setGenerated(null);
          setUsage(null);
          setCurrentIndex(0);
          return;
        }

        const payload = asRecord(data) as MatchPayload | null;
        if (!payload) {
          throw new Error("Reponse de suggestions invalide");
        }

        const items = Array.isArray(payload.items)
          ? payload.items
          : Array.isArray(payload.matches)
            ? payload.matches
            : [];

        setMatches(items);
        setMatchDate(readString(payload.match_date, payload.matchDate));
        setGenerated(readBoolean(payload.generated));
        setUsage(extractUsage(payload));
        setCurrentIndex(0);
      } catch {
        setMatches([]);
        setMatchDate(null);
        setGenerated(null);
        setUsage(null);
        setCurrentIndex(0);
      }
    }

    fetchMatches();
  }, [token]);

  async function openPrivateChat(profile: MatchProfile) {
    if (!token) return;

    try {
      const accessRes = await fetch(`${API}/dm/access/${profile.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!accessRes.ok) throw new Error("Erreur d'acces DM");

      const access = (await accessRes.json()) as { allowed?: boolean };

      if (access.allowed) {
        const threadRes = await fetch(`${API}/dm/threads`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ targetUserId: profile.id }),
        });

        if (!threadRes.ok) throw new Error("Impossible d'ouvrir la conversation");

        const thread = (await threadRes.json()) as { id: string };
        navigate(`/private-chat?thread=${thread.id}`);
        return;
      }

      setPayTarget(profile);
      setPayError(null);
    } catch (error) {
      alert(getErrorMessage(error, "Erreur d'acces DM"));
    }
  }

  async function payOnce() {
    if (!token || !payTarget) return;

    setPayLoading(true);
    setPayError(null);

    try {
      const res = await fetch(`${API}/payments/dm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUserId: payTarget.id }),
      });

      const data = (await res.json()) as {
        error?: string;
        url?: string;
        alreadyPaid?: boolean;
      };
      if (!res.ok) throw new Error(data.error || "Erreur paiement");

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      if (data.alreadyPaid) {
        await openPrivateChat(payTarget);
      }
    } catch (error) {
      setPayError(getErrorMessage(error, "Erreur paiement"));
    } finally {
      setPayLoading(false);
    }
  }

  async function subscribeDm() {
    if (!token) return;

    setSubscriptionLoading(true);
    setPayError(null);

    try {
      const res = await fetch(`${API}/payments/dm/subscription`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = (await res.json()) as { error?: string; url?: string };
      if (!res.ok) throw new Error(data.error || "Erreur abonnement");

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      if (payTarget) {
        await openPrivateChat(payTarget);
      }
    } catch (error) {
      setPayError(getErrorMessage(error, "Erreur abonnement"));
    } finally {
      setSubscriptionLoading(false);
    }
  }

  function showPreviousProfile() {
    if (matches.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }

  function showNextProfile() {
    if (matches.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % matches.length);
  }

  const activeMatch =
    matches.length > 0 ? matches[Math.min(currentIndex, matches.length - 1)] : null;
  const usageSummary = buildUsageSummary(usage, matches.length);
  const resetAtLabel = formatResetAt(usage?.resetAt ?? null);
  const dailyLimitReached =
    usage?.code === "MATCH_DAILY_LIMIT" ||
    usage?.code === "DAILY_LIMIT" ||
    (usage !== null && usage.remaining !== null && usage.remaining <= 0);

  return (
    <div className="match-root">
      <header className="match-header">
        <button className="back-home" onClick={() => navigate("/")}>
          Retour
        </button>
        <h1>Connexions humaines</h1>
        <p>Des personnes proches de ton vecu, a decouvrir une par une.</p>
        <div className="match-meta">
          <span>Date des suggestions : {matchDate || "-"}</span>
          <span>
            {generated === null
              ? "Statut inconnu"
              : generated
                ? "Genere aujourd'hui"
                : "Suggestions deja pretes"}
          </span>
        </div>
      </header>

      {usageSummary && (
        <section className="match-usage-panel">
          <strong>{usageSummary}</strong>
          {dailyLimitReached && resetAtLabel && (
            <span>Nouvelle proposition apres {resetAtLabel}.</span>
          )}
        </section>
      )}

      <main className="match-list">
        {!activeMatch && (
          <div className="match-empty-card">
            <p className="empty">Aucun profil similaire pour l'instant.</p>
            {dailyLimitReached && resetAtLabel && (
              <p className="match-empty-note">
                La limite du jour semble atteinte. Reviens apres {resetAtLabel}.
              </p>
            )}
          </div>
        )}

        {activeMatch && (
          <section className="match-viewer">
            <div className="match-progress-row">
              <span className="match-progress-pill">
                Profil {Math.min(currentIndex, matches.length - 1) + 1} sur{" "}
                {matches.length}
              </span>
              {matches.length > 1 && (
                <span className="match-progress-hint">
                  Appuie sur suivant pour voir un autre profil.
                </span>
              )}
            </div>

            <div className="match-card">
              <img
                src={buildAvatarUrl({
                  name: activeMatch.username || "Membre",
                  avatarPath: activeMatch.avatar,
                  seed: activeMatch.id,
                  size: 128,
                })}
                className="avatar-lg"
                alt={activeMatch.username || "Profil"}
              />

              <h2 className="match-name">
                {activeMatch.username || "Profil similaire"}
              </h2>
              <p className="summary">"{activeMatch.summary}"</p>

              <div className="tags">
                {activeMatch.common_tags.map((tag) => (
                  <span key={tag} className="tag">
                    #{tag}
                  </span>
                ))}
              </div>

              <div className="actions">
                <button onClick={() => openPrivateChat(activeMatch)}>
                  Message prive
                </button>

                <button
                  className="ghost"
                  onClick={() =>
                    activeMatch.common_tags[0]
                      ? navigate(`/chat/${activeMatch.common_tags[0]}`)
                      : undefined
                  }
                  disabled={!activeMatch.common_tags[0]}
                >
                  Discussion liee
                </button>
              </div>
            </div>

            {matches.length > 1 && (
              <>
                <div className="match-navigation">
                  <button className="ghost nav-btn" onClick={showPreviousProfile}>
                    Profil precedent
                  </button>
                  <button className="nav-btn primary" onClick={showNextProfile}>
                    Profil suivant
                  </button>
                </div>

                <div className="match-dots" aria-label="Liste des profils proposes">
                  {matches.map((match, index) => (
                    <button
                      key={match.id}
                      className={`match-dot ${
                        index === currentIndex ? "is-active" : ""
                      }`}
                      onClick={() => setCurrentIndex(index)}
                      aria-label={`Voir le profil ${index + 1}`}
                      type="button"
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </main>

      {payTarget && (
        <div className="modal-backdrop" onClick={() => setPayTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Acces prive requis</h3>
            <p>
              Tu peux debloquer ce DM pour 4,99 EUR ou prendre l'abonnement DM a
              9,75 EUR.
            </p>

            {payError && <div className="pay-error">{payError}</div>}

            <div className="pay-options">
              <button onClick={payOnce} disabled={payLoading}>
                {payLoading ? "Redirection..." : "Paiement unique 4,99 EUR"}
              </button>

              <button
                className="ghost"
                onClick={subscribeDm}
                disabled={subscriptionLoading}
              >
                {subscriptionLoading ? "Redirection..." : "Abonnement 9,75 EUR"}
              </button>
            </div>

            <button className="ghost subtle" onClick={() => setPayTarget(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
