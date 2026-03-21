import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import "../style/journal.css";
import { API } from "../config/api";

type JournalRole = "user" | "assistant" | "system";

type JournalMessage = {
  id: string;
  role: JournalRole;
  text: string;
  createdAt?: number | string | null;
};

type RateLimitState = {
  retryAt?: number | string | null;
  remaining?: number | null;
  limit?: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toTimestamp(value?: number | string | null): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }

    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function formatDateTime(value?: number | string | null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "--";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getConversationId(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  const directValue =
    payload.conversationId ?? payload.conversation_id ?? payload.id ?? null;
  if (typeof directValue === "string" && directValue.trim()) return directValue;
  if (typeof directValue === "number" && Number.isFinite(directValue)) {
    return String(directValue);
  }

  const nestedConversation = payload.conversation;
  if (typeof nestedConversation === "string" && nestedConversation.trim()) {
    return nestedConversation;
  }

  if (!isRecord(nestedConversation)) return null;

  const nestedValue =
    nestedConversation.id ??
    nestedConversation.conversationId ??
    nestedConversation.conversation_id ??
    null;
  if (typeof nestedValue === "string" && nestedValue.trim()) return nestedValue;
  if (typeof nestedValue === "number" && Number.isFinite(nestedValue)) {
    return String(nestedValue);
  }

  return null;
}

function normalizeRole(value: unknown, fallbackRole: JournalRole): JournalRole {
  if (typeof value !== "string") return fallbackRole;

  const normalized = value.toLowerCase();
  if (
    normalized.includes("assistant") ||
    normalized.includes("bot") ||
    normalized.includes("ia") ||
    normalized.includes("ai")
  ) {
    return "assistant";
  }

  if (
    normalized.includes("user") ||
    normalized.includes("human") ||
    normalized.includes("client") ||
    normalized.includes("member") ||
    normalized.includes("me")
  ) {
    return "user";
  }

  if (normalized.includes("system")) {
    return "system";
  }

  return fallbackRole;
}

function normalizeMessage(
  payload: unknown,
  fallbackRole: JournalRole
): JournalMessage | null {
  if (typeof payload === "string" || typeof payload === "number") {
    const text = readText(payload);
    if (!text) return null;

    return {
      id: `${fallbackRole}-${Date.now()}-${text.slice(0, 16)}`,
      role: fallbackRole,
      text,
      createdAt: Date.now(),
    };
  }

  if (!isRecord(payload)) return null;

  const text =
    readText(payload.text) ||
    readText(payload.body) ||
    readText(payload.content) ||
    readText(payload.message) ||
    readText(payload.reply) ||
    readText(payload.insight);

  if (!text) return null;

  const createdAt =
    payload.created_at ??
    payload.createdAt ??
    payload.sent_at ??
    payload.timestamp ??
    payload.at ??
    null;

  const idCandidate =
    payload.id ??
    payload.messageId ??
    payload.message_id ??
    payload.entry_id ??
    null;

  return {
    id:
      typeof idCandidate === "string" || typeof idCandidate === "number"
        ? String(idCandidate)
        : `${fallbackRole}-${String(createdAt ?? Date.now())}-${text.slice(0, 16)}`,
    role: normalizeRole(
      payload.role ??
        payload.sender ??
        payload.sender_role ??
        payload.senderType ??
        payload.type,
      fallbackRole
    ),
    text,
    createdAt:
      typeof createdAt === "string" || typeof createdAt === "number"
        ? createdAt
        : null,
  };
}

function mergeMessages(messages: JournalMessage[]): JournalMessage[] {
  const seen = new Set<string>();
  const merged: JournalMessage[] = [];

  for (const message of messages) {
    const signature = `${message.id}|${message.role}|${message.text}|${String(
      message.createdAt ?? ""
    )}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    merged.push(message);
  }

  return merged;
}

function extractMessages(payload: unknown): JournalMessage[] {
  const candidates: unknown[] = [];

  if (Array.isArray(payload)) {
    candidates.push(payload);
  } else if (isRecord(payload)) {
    candidates.push(payload.messages, payload.items, payload.history);

    if (isRecord(payload.conversation)) {
      candidates.push(
        payload.conversation.messages,
        payload.conversation.items,
        payload.conversation.history
      );
    }
  }

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;

    const normalized = candidate
      .map((message) => normalizeMessage(message, "assistant"))
      .filter((message): message is JournalMessage => message !== null);

    if (normalized.length > 0) {
      return mergeMessages(normalized);
    }
  }

  return [];
}

function extractNamedMessage(
  payload: unknown,
  keys: string[],
  fallbackRole: JournalRole
): JournalMessage | null {
  if (!isRecord(payload)) return null;

  for (const key of keys) {
    if (!(key in payload)) continue;
    const normalized = normalizeMessage(payload[key], fallbackRole);
    if (normalized) return normalized;
  }

  return null;
}

function extractRateLimit(payload: unknown): RateLimitState | null {
  if (!isRecord(payload)) return null;

  const candidates = [
    payload.rate_limit,
    payload.rateLimit,
    payload,
    isRecord(payload.conversation) ? payload.conversation.rate_limit : null,
  ];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;

    const retryAt =
      candidate.retry_at ??
      candidate.retryAt ??
      candidate.reset_at ??
      candidate.resetAt ??
      null;

    const remaining =
      readNumber(candidate.remaining) ??
      readNumber(candidate.remaining_requests) ??
      readNumber(candidate.left);

    const limit =
      readNumber(candidate.limit) ??
      readNumber(candidate.max) ??
      readNumber(candidate.total);

    if (retryAt !== null || remaining !== null || limit !== null) {
      return {
        retryAt:
          typeof retryAt === "string" || typeof retryAt === "number"
            ? retryAt
            : null,
        remaining,
        limit,
      };
    }
  }

  return null;
}

function extractErrorMessage(payload: unknown, fallbackMessage: string): string {
  if (!isRecord(payload)) return fallbackMessage;

  return (
    readText(payload.error) ||
    readText(payload.message) ||
    readText(payload.detail) ||
    fallbackMessage
  );
}

export default function Journal() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<JournalMessage[]>([]);
  const [input, setInput] = useState("");
  const [compatInsight, setCompatInsight] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [rateLimit, setRateLimit] = useState<RateLimitState | null>(null);

  const streamRef = useRef<HTMLDivElement>(null);

  const retryAtTimestamp = toTimestamp(rateLimit?.retryAt ?? null);
  const isRateLimited =
    retryAtTimestamp !== null && retryAtTimestamp > Date.now();
  const rateLimitLabel =
    rateLimit?.remaining !== null && rateLimit?.remaining !== undefined
      ? rateLimit.limit !== null && rateLimit.limit !== undefined
        ? `${Math.max(rateLimit.remaining, 0)} / ${rateLimit.limit} envois restants`
        : `${Math.max(rateLimit.remaining, 0)} envois restants`
      : "";

  useEffect(() => {
    let cancelled = false;

    async function loadConversation() {
      if (!token) {
        setLoading(false);
        setErrorMessage("Session introuvable. Reconnecte-toi pour ouvrir le journal.");
        return;
      }

      setLoading(true);

      try {
        const res = await fetch(`${API}/journal/conversation`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (!res.ok) {
          setMessages([]);
          setConversationId(getConversationId(data));
          setRateLimit(extractRateLimit(data));
          setErrorMessage(
            extractErrorMessage(data, "Impossible de charger la conversation.")
          );
          return;
        }

        setConversationId(getConversationId(data));
        setMessages(extractMessages(data));
        setRateLimit(extractRateLimit(data));
        setErrorMessage("");
      } catch (error) {
        if (cancelled) return;
        console.error("Erreur conversation journal:", error);
        setMessages([]);
        setErrorMessage("Impossible de joindre le journal pour le moment.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    if (!retryAtTimestamp || retryAtTimestamp <= Date.now()) return;

    const timeoutId = window.setTimeout(() => {
      setRateLimit((current) => {
        const currentRetryAt = toTimestamp(current?.retryAt ?? null);
        if (!currentRetryAt || currentRetryAt <= Date.now()) {
          if (!current) return null;
          return { ...current, retryAt: null };
        }

        return current;
      });
    }, retryAtTimestamp - Date.now() + 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [retryAtTimestamp]);

  async function sendMessage() {
    if (!token) {
      setErrorMessage("Session introuvable. Reconnecte-toi pour continuer.");
      return;
    }

    const text = input.trim();
    if (!text) {
      setErrorMessage("Ecris un message avant d'envoyer.");
      return;
    }

    if (isRateLimited) return;

    const optimisticMessage: JournalMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      text,
      createdAt: Date.now(),
    };

    setSending(true);
    setErrorMessage("");
    setCompatInsight("");
    setMessages((current) => mergeMessages([...current, optimisticMessage]));
    setInput("");

    try {
      const res = await fetch(`${API}/journal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          conversationId,
        }),
      });

      const data = await res.json().catch(() => null);
      const nextRateLimit = extractRateLimit(data);
      const nextConversationId = getConversationId(data);

      if (nextRateLimit) {
        setRateLimit(nextRateLimit);
      }

      if (nextConversationId) {
        setConversationId(nextConversationId);
      }

      if (res.status === 429) {
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticMessage.id)
        );
        setInput(text);
        setErrorMessage(
          extractErrorMessage(data, "Le journal est en pause pour le moment.")
        );
        return;
      }

      if (!res.ok) {
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticMessage.id)
        );
        setInput(text);
        setErrorMessage(
          extractErrorMessage(data, "Impossible d'envoyer le message.")
        );
        return;
      }

      const returnedMessages = extractMessages(data);
      if (returnedMessages.length > 1) {
        setMessages(returnedMessages);
        return;
      }

      const persistedUser =
        extractNamedMessage(data, ["user_message", "userMessage"], "user") ??
        optimisticMessage;
      const assistantMessage = extractNamedMessage(
        data,
        ["assistant_message", "assistantMessage", "reply"],
        "assistant"
      );

      setMessages((current) => {
        const withoutOptimistic = current.filter(
          (message) => message.id !== optimisticMessage.id
        );

        return mergeMessages([
          ...withoutOptimistic,
          persistedUser,
          ...(assistantMessage ? [assistantMessage] : []),
        ]);
      });
    } catch (error) {
      console.error("Erreur envoi journal:", error);
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id)
      );
      setInput(text);
      setErrorMessage("Impossible d'envoyer le message pour le moment.");
    } finally {
      setSending(false);
    }
  }

  async function generateCompatibilityInsight() {
    if (!token) {
      setErrorMessage("Session introuvable. Reconnecte-toi pour continuer.");
      return;
    }

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    const sourceText = input.trim() || latestUserMessage?.text || "";

    if (!sourceText) {
      setErrorMessage(
        "Ecris un brouillon ou envoie deja un message avant de demander un insight."
      );
      return;
    }

    setInsightLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch(`${API}/journal/insight`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: sourceText }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setErrorMessage(
          extractErrorMessage(data, "Impossible de generer l'insight rapide.")
        );
        return;
      }

      const nextInsight =
        readText(isRecord(data) ? data.insight : null) ||
        readText(isRecord(data) ? data.message : null);

      setCompatInsight(nextInsight || "Aucun insight supplementaire n'a ete renvoye.");
    } catch (error) {
      console.error("Erreur insight journal:", error);
      setErrorMessage("Impossible de joindre l'insight rapide pour le moment.");
    } finally {
      setInsightLoading(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void sendMessage();
  }

  return (
    <div className="journal-page">
      <button className="journal-back" onClick={() => navigate("/")}>
        Retour
      </button>

      <header className="journal-hero">
        <div>
          <h1>Journal guide</h1>
          <p>
            Envoie ce que tu traverses et laisse l'IA te repondre dans un vrai
            fil de conversation.
          </p>
        </div>

        <div className="journal-hero-chip">
          {isRateLimited
            ? `Pause jusqu'a ${formatDateTime(rateLimit?.retryAt ?? null)}`
            : `${messages.length} messages`}
        </div>
      </header>

      <div className="journal-layout">
        <section className="journal-feed">
          <div className="editor-top">
            <h2>Conversation</h2>
            <span>{messages.length}</span>
          </div>

          <div className="journal-stream" ref={streamRef}>
            {loading && <p className="journal-empty">Chargement...</p>}

            {!loading && messages.length === 0 && (
              <div className="journal-empty-card">
                <strong>La conversation est vide.</strong>
                <p>
                  Ecris ton premier message a l'IA pour lancer l'echange dans ce
                  journal.
                </p>
              </div>
            )}

            {messages.map((message) => (
              <article
                key={message.id}
                className={`journal-message ${message.role}`}
              >
                <div className="journal-message-head">
                  <strong className="journal-message-label">
                    {message.role === "user"
                      ? "Toi"
                      : message.role === "assistant"
                        ? "IA"
                        : "Systeme"}
                  </strong>
                  <small className="journal-message-time">
                    {formatDateTime(message.createdAt)}
                  </small>
                </div>

                <div className="journal-message-bubble">{message.text}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="journal-editor">
          <div className="editor-top">
            <h2>Ton message</h2>
            <span>{isRateLimited ? "En pause" : sending ? "Envoi..." : "Pret"}</span>
          </div>

          <p className="journal-side-copy">
            Le bouton principal envoie maintenant ton message a l'IA et ajoute la
            reponse directement dans le fil.
          </p>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ecris ici ce que tu ressens, ce que tu veux comprendre, ou la question a poser..."
            disabled={!token || sending || isRateLimited}
          />

          <div className="journal-actions">
            <button
              className="primary"
              onClick={() => {
                void sendMessage();
              }}
              disabled={!token || sending || isRateLimited || !input.trim()}
            >
              {sending ? "Envoi..." : "Envoyer"}
            </button>

            <button
              className="ghost"
              onClick={() => {
                void generateCompatibilityInsight();
              }}
              disabled={!token || insightLoading}
            >
              {insightLoading ? "Analyse..." : "Insight rapide"}
            </button>
          </div>

          {errorMessage && <div className="journal-alert error">{errorMessage}</div>}

          {isRateLimited && (
            <div className="journal-alert warning">
              Reviens apres {formatDateTime(rateLimit?.retryAt ?? null)} pour
              reprendre l'echange avec l'IA.
            </div>
          )}

          {rateLimitLabel && !isRateLimited && (
            <div className="journal-meta">{rateLimitLabel}</div>
          )}

          <p className="journal-note">
            Appuie sur Entree pour envoyer, ou Shift + Entree pour passer a la
            ligne.
          </p>

          {compatInsight && (
            <div className="journal-insight">
              <strong>Insight rapide</strong>
              <p>{compatInsight}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
