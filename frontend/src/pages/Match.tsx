import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../style/match.css";
import { API } from "../config/api";
import { buildAvatarUrl } from "../lib/avatar";
import { buildPrivateChatPath } from "../lib/dmCheckout";

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
  results?: MatchProfile[];
  profiles?: MatchProfile[];
  usage?: Record<string, unknown>;
  rate_limit?: Record<string, unknown>;
  rateLimit?: Record<string, unknown>;
  data?: unknown;
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
  message?: string;
  error?: string;
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

function readBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }

  return null;
}

function formatResetAt(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString();
}

function extractUsage(payload: MatchPayload): MatchUsage | null {
  const nestedData = asRecord(payload.data);
  const nestedUsage =
    asRecord(payload.usage) ??
    asRecord(payload.rate_limit) ??
    asRecord(payload.rateLimit) ??
    asRecord(nestedData?.usage) ??
    asRecord(nestedData?.rate_limit) ??
    asRecord(nestedData?.rateLimit);
  const source = nestedUsage ?? nestedData ?? payload;

  const remaining = readNumber(
    source.remaining,
    source.remaining_matches,
    source.remainingMatches
  );
  const limit = readNumber(source.limit, source.daily_limit, source.dailyLimit);
  const used = readNumber(source.used, source.count);
  const resetAt = readString(
    source.reset_at,
    source.resetAt,
    source.next_at,
    source.nextAt
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

function normalizeMatch(rawMatch: unknown): MatchProfile | null {
  const record = asRecord(rawMatch);
  if (!record) return null;

  const id = readString(record.id, record._id, record.userId, record.user_id);
  if (!id) return null;

  const summary =
    readString(
      record.summary,
      record.description,
      record.bio,
      record.intro,
      record.text
    ) || "";

  const tagsSource = Array.isArray(record.common_tags)
    ? record.common_tags
    : Array.isArray(record.commonTags)
      ? record.commonTags
      : Array.isArray(record.tags)
        ? record.tags
        : [];

  const common_tags = tagsSource
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean);

  return {
    id,
    summary,
    common_tags,
    avatar:
      readString(record.avatar, record.avatar_url, record.avatarUrl) || undefined,
    username:
      readString(
        record.username,
        record.name,
        record.displayName,
        record.display_name
      ) || undefined,
  };
}

function extractMatchItems(payload: MatchPayload) {
  const nestedData = asRecord(payload.data);
  const rawMatches = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.matches)
      ? payload.matches
      : Array.isArray(payload.results)
        ? payload.results
        : Array.isArray(payload.profiles)
          ? payload.profiles
          : Array.isArray(payload.data)
            ? payload.data
            : Array.isArray(nestedData?.items)
              ? nestedData.items
              : Array.isArray(nestedData?.matches)
                ? nestedData.matches
                : Array.isArray(nestedData?.results)
                  ? nestedData.results
                  : Array.isArray(nestedData?.profiles)
                    ? nestedData.profiles
                    : [];

  return rawMatches
    .map((entry) => normalizeMatch(entry))
    .filter((match): match is MatchProfile => match !== null);
}

function getMatchDate(payload: MatchPayload) {
  const nestedData = asRecord(payload.data);
  return readString(
    payload.match_date,
    payload.matchDate,
    nestedData?.match_date,
    nestedData?.matchDate
  );
}

function getGeneratedFlag(payload: MatchPayload) {
  const nestedData = asRecord(payload.data);
  return readBoolean(payload.generated, nestedData?.generated);
}

function getPayloadMessage(payload: unknown, fallback: string) {
  const record = asRecord(payload);
  if (!record) return fallback;

  const nestedData = asRecord(record.data);

  return (
    readString(
      record.message,
      record.error,
      record.detail,
      record.code,
      nestedData?.message,
      nestedData?.error,
      nestedData?.detail,
      nestedData?.code
    ) || fallback
  );
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
  const [searchParams] = useSearchParams();

  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [matchDate, setMatchDate] = useState<string | null>(null);
  const [generated, setGenerated] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<MatchUsage | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("checkout") !== "cancelled") return;
    setPaymentNotice("Paiement annule. Tu peux reessayer quand tu veux.");
  }, [searchParams]);

  useEffect(() => {
    if (!token) return;

    async function fetchMatches() {
      try {
        const res = await fetch(`${API}/match`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data: unknown = await res.json().catch(() => null);

        if (Array.isArray(data)) {
          setMatches(
            data
              .map((entry) => normalizeMatch(entry))
              .filter((match): match is MatchProfile => match !== null)
          );
          setMatchDate(null);
          setGenerated(null);
          setUsage(null);
          setCurrentIndex(0);
          setLoadError(null);
          return;
        }

        const payload = asRecord(data) as MatchPayload | null;
        if (!payload) {
          throw new Error("Reponse de suggestions invalide");
        }

        if (!res.ok) {
          setMatches([]);
          setMatchDate(getMatchDate(payload));
          setGenerated(getGeneratedFlag(payload));
          setUsage(extractUsage(payload));
          setCurrentIndex(0);
          setLoadError(
            getPayloadMessage(payload, "Erreur de chargement des suggestions")
          );
          return;
        }

        const items = extractMatchItems(payload);

        setMatches(items);
        setMatchDate(getMatchDate(payload));
        setGenerated(getGeneratedFlag(payload));
        setUsage(extractUsage(payload));
        setCurrentIndex(0);
        setLoadError(null);
      } catch (error) {
        setMatches([]);
        setMatchDate(null);
        setGenerated(null);
        setUsage(null);
        setCurrentIndex(0);
        setLoadError(
          error instanceof Error && error.message
            ? error.message
            : "Impossible de charger les connexions."
        );
      }
    }

    void fetchMatches();
  }, [token]);

  function openPrivateChat(profile: MatchProfile) {
    if (!token) {
      navigate("/login");
      return;
    }

    setPaymentNotice(null);
    navigate(buildPrivateChatPath(profile.id));
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

      {paymentNotice && (
        <section className="match-usage-panel">
          <strong>Messagerie privee</strong>
          <span>{paymentNotice}</span>
        </section>
      )}

      {loadError && (
        <section className="match-usage-panel">
          <strong>Connexion indisponible</strong>
          <span>{loadError}</span>
        </section>
      )}

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
              <p
                className="summary"
                title={activeMatch.summary}
                aria-label={activeMatch.summary}
              >
                "{activeMatch.summary}"
              </p>

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
                    Precedent
                  </button>
                  <button className="nav-btn primary" onClick={showNextProfile}>
                    Suivant
                  </button>
                </div>

                <div className="match-dots" aria-label="Liste des profils proposes">
                  {matches.map((match, index) => (
                    <button
                      key={match.id}
                      className={`match-dot ${index === currentIndex ? "is-active" : ""}`}
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
    </div>
  );
}
