import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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

type JournalConversation = {
  id: string;
  title: string;
  preview: string;
  updatedAt?: number | string | null;
  messageCount?: number | null;
};

type JournalUsage = {
  code?: string | null;
  resetAt?: number | string | null;
  remaining?: number | null;
  limit?: number | null;
  used?: number | null;
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

function formatDateTime(value?: number | string | null): string {
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

function extractUsage(payload: unknown): JournalUsage | null {
  if (!isRecord(payload)) return null;

  const candidates = [
    payload.usage,
    payload.rate_limit,
    payload.rateLimit,
    payload,
    isRecord(payload.conversation) ? payload.conversation.usage : null,
    isRecord(payload.conversation) ? payload.conversation.rate_limit : null,
  ];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;

    const resetAt =
      candidate.reset_at ??
      candidate.resetAt ??
      candidate.retry_at ??
      candidate.retryAt ??
      null;

    const remaining =
      readNumber(candidate.remaining) ??
      readNumber(candidate.remaining_requests) ??
      readNumber(candidate.left) ??
      readNumber(candidate.available);

    const limit =
      readNumber(candidate.limit) ??
      readNumber(candidate.max) ??
      readNumber(candidate.total) ??
      readNumber(candidate.daily_limit) ??
      readNumber(candidate.dailyLimit);

    const used =
      readNumber(candidate.used) ??
      readNumber(candidate.count) ??
      readNumber(candidate.consumed);

    const code =
      readText(candidate.code) ||
      readText(payload.code) ||
      readText(payload.error_code) ||
      readText(payload.errorCode) ||
      null;

    if (resetAt !== null || remaining !== null || limit !== null || used !== null || code) {
      return {
        code,
        resetAt:
          typeof resetAt === "string" || typeof resetAt === "number"
            ? resetAt
            : null,
        remaining,
        limit,
        used,
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

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shortenText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(maxLength - 3, 1)).trim()}...`;
}

function buildConversationPreview(messages: JournalMessage[]): string {
  const source = [...messages]
    .reverse()
    .find((message) => compactText(message.text).length > 0);

  if (!source) return "Aucun message enregistre.";
  return shortenText(compactText(source.text), 90);
}

function extractConversationTitle(
  payload: unknown,
  fallbackTitle = "Nouvelle discussion"
): string {
  if (!isRecord(payload)) return fallbackTitle;

  const directTitle =
    readText(payload.conversation_title) ||
    readText(payload.conversationTitle) ||
    readText(payload.title);
  if (directTitle) return directTitle;

  if (isRecord(payload.conversation)) {
    const nestedTitle =
      readText(payload.conversation.conversation_title) ||
      readText(payload.conversation.conversationTitle) ||
      readText(payload.conversation.title);
    if (nestedTitle) return nestedTitle;
  }

  return fallbackTitle;
}

function normalizeConversationItem(payload: unknown): JournalConversation | null {
  if (!isRecord(payload)) return null;

  const id = getConversationId(payload);
  if (!id) return null;

  const preview =
    readText(payload.preview) ||
    readText(payload.last_message) ||
    readText(payload.lastMessage) ||
    buildConversationPreview(extractMessages(payload));

  const updatedAt =
    payload.updated_at ??
    payload.updatedAt ??
    payload.last_at ??
    payload.lastAt ??
    payload.created_at ??
    payload.createdAt ??
    null;

  return {
    id,
    title: extractConversationTitle(payload),
    preview,
    updatedAt:
      typeof updatedAt === "string" || typeof updatedAt === "number"
        ? updatedAt
        : null,
    messageCount:
      readNumber(payload.message_count) ??
      readNumber(payload.messageCount) ??
      readNumber(payload.count),
  };
}

function extractConversationList(payload: unknown): JournalConversation[] {
  const candidates: unknown[] = [];

  if (Array.isArray(payload)) {
    candidates.push(payload);
  } else if (isRecord(payload)) {
    candidates.push(payload.conversations, payload.items, payload.data);
  }

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;

    const normalized = candidate
      .map((item) => normalizeConversationItem(item))
      .filter((item): item is JournalConversation => item !== null)
      .sort((left, right) => {
        const leftAt = toTimestamp(left.updatedAt ?? null) ?? 0;
        const rightAt = toTimestamp(right.updatedAt ?? null) ?? 0;
        return rightAt - leftAt;
      });

    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

function upsertConversation(
  current: JournalConversation[],
  nextConversation: JournalConversation
): JournalConversation[] {
  return [
    nextConversation,
    ...current.filter((conversation) => conversation.id !== nextConversation.id),
  ].sort((left, right) => {
    const leftAt = toTimestamp(left.updatedAt ?? null) ?? 0;
    const rightAt = toTimestamp(right.updatedAt ?? null) ?? 0;
    return rightAt - leftAt;
  });
}

function isUsageLocked(usage: JournalUsage | null): boolean {
  const resetAt = toTimestamp(usage?.resetAt ?? null);
  const remaining = usage?.remaining ?? null;

  if (!resetAt || resetAt <= Date.now()) return false;
  if (usage?.code === "JOURNAL_DAILY_LIMIT") return true;
  if (remaining !== null && remaining <= 0) return true;

  return false;
}

export default function Journal() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [conversations, setConversations] = useState<JournalConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<JournalMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [usage, setUsage] = useState<JournalUsage | null>(null);
  const [showArchivePanel, setShowArchivePanel] = useState(true);

  const streamRef = useRef<HTMLDivElement>(null);

  const usageResetAtTimestamp = toTimestamp(usage?.resetAt ?? null);
  const dailyLimitReached = isUsageLocked(usage);
  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ??
    null;
  const currentConversationTitle = activeConversation?.title || "Nouvelle discussion";
  const archiveCountLabel =
    conversations.length === 1
      ? "1 discussion"
      : `${conversations.length} discussions`;
  const canCreateNewDiscussion = !sending && !insightLoading;
  const usageSummary =
    usage?.limit !== null && usage?.limit !== undefined
      ? usage?.remaining !== null && usage?.remaining !== undefined
        ? `${usage.remaining} sur ${usage.limit} envois restants aujourd'hui`
        : usage?.used !== null && usage?.used !== undefined
          ? `${usage.used} sur ${usage.limit} envois utilises aujourd'hui`
          : null
      : null;

  const loadConversations = useCallback(async () => {
    if (!token) {
      setLoadingList(false);
      setErrorMessage("Session introuvable. Reconnecte-toi pour ouvrir ton journal.");
      return;
    }

    setLoadingList(true);

    try {
      const res = await fetch(`${API}/journal/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setErrorMessage(
          extractErrorMessage(data, "Impossible de charger les discussions.")
        );
        setConversations([]);
        return;
      }

      setConversations(extractConversationList(data));
      setErrorMessage("");
    } catch (error) {
      console.error("Erreur liste journal:", error);
      setConversations([]);
      setErrorMessage("Impossible de charger les discussions pour le moment.");
    } finally {
      setLoadingList(false);
    }
  }, [token]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loadingConversation]);

  useEffect(() => {
    if (!usageResetAtTimestamp || usageResetAtTimestamp <= Date.now()) return;

    const timeoutId = window.setTimeout(() => {
      setUsage((current) => {
        const currentResetAt = toTimestamp(current?.resetAt ?? null);
        if (!currentResetAt || currentResetAt <= Date.now()) {
          if (!current) return null;
          return { ...current, code: null, resetAt: null };
        }

        return current;
      });
    }, usageResetAtTimestamp - Date.now() + 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [usageResetAtTimestamp]);

  function applySuccessfulJournalResponse(
    data: unknown,
    baseMessages: JournalMessage[],
    optimisticMessage: JournalMessage
  ) {
    const nextUsage = extractUsage(data);
    if (nextUsage) {
      setUsage(nextUsage);
    }

    const nextConversationId = getConversationId(data) ?? activeConversationId;
    const returnedMessages = extractMessages(data);
    const persistedUser =
      extractNamedMessage(data, ["user_message", "userMessage"], "user") ??
      optimisticMessage;
    const assistantMessage = extractNamedMessage(
      data,
      ["assistant_message", "assistantMessage", "reply", "insight"],
      "assistant"
    );
    const nextMessages =
      returnedMessages.length > 0
        ? mergeMessages(returnedMessages)
        : mergeMessages([
            ...baseMessages,
            persistedUser,
            ...(assistantMessage ? [assistantMessage] : []),
          ]);
    const nextTitle = extractConversationTitle(
      data,
      activeConversation?.title || "Nouvelle discussion"
    );

    setMessages(nextMessages);

    if (nextConversationId) {
      setActiveConversationId(nextConversationId);
      setConversations((current) =>
        upsertConversation(current, {
          id: nextConversationId,
          title: nextTitle,
          preview: buildConversationPreview(nextMessages),
          updatedAt:
            nextMessages[nextMessages.length - 1]?.createdAt ?? Date.now(),
          messageCount: nextMessages.length,
        })
      );
    }
  }

  async function openConversation(id: string) {
    if (!token) return;

    setLoadingConversation(true);
    setErrorMessage("");
    setCompatInsight("");
    setShowArchivePanel(false);

    try {
      const res = await fetch(`${API}/journal/conversations/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setErrorMessage(
          extractErrorMessage(data, "Impossible de charger cette discussion.")
        );
        return;
      }

      const nextMessages = extractMessages(data);
      const nextTitle = extractConversationTitle(
        data,
        activeConversation?.title || "Nouvelle discussion"
      );
      const nextUsage = extractUsage(data);

      setActiveConversationId(id);
      setMessages(nextMessages);
      if (nextUsage) {
        setUsage(nextUsage);
      }
      setConversations((current) =>
        upsertConversation(current, {
          id,
          title: nextTitle,
          preview: buildConversationPreview(nextMessages),
          updatedAt:
            nextMessages[nextMessages.length - 1]?.createdAt ?? Date.now(),
          messageCount: nextMessages.length,
        })
      );
    } catch (error) {
      console.error("Erreur detail journal:", error);
      setErrorMessage("Impossible de charger cette discussion pour le moment.");
    } finally {
      setLoadingConversation(false);
    }
  }

  function startFreshConversation() {
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setErrorMessage("");
    setShowArchivePanel(false);
  }

  async function deleteConversation(id: string) {
    if (!token) return;

    if (!confirm("Supprimer cette discussion ?")) {
      return;
    }

    try {
      const res = await fetch(`${API}/journal/conversations/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setErrorMessage(
          extractErrorMessage(data, "Impossible de supprimer cette discussion.")
        );
        return;
      }

      setConversations((current) =>
        current.filter((conversation) => conversation.id !== id)
      );

      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }

      setShowArchivePanel(true);
      setErrorMessage("");
    } catch (error) {
      console.error("Erreur suppression journal:", error);
      setErrorMessage("Impossible de supprimer cette discussion pour le moment.");
    }
  }

  async function submitJournalMessage(mode: "journal" | "insight") {
    if (!token) {
      setErrorMessage("Session introuvable. Reconnecte-toi pour continuer.");
      return;
    }

    const text = input.trim();
    if (!text) {
      setErrorMessage("Ecris un message avant de l'envoyer.");
      return;
    }

    if (dailyLimitReached) return;

    const optimisticMessage: JournalMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      text,
      createdAt: Date.now(),
    };
    const baseMessages = messages;

    setSending(true);
    setErrorMessage("");
    setMessages(mergeMessages([...baseMessages, optimisticMessage]));
    setInput("");

    try {
      const res = await fetch(
        `${API}/${mode === "journal" ? "journal" : "journal/insight"}`,
        {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...(mode === "journal" ? { text } : { body: text }),
          conversationId: activeConversationId,
        }),
        }
      );

      const data = await res.json().catch(() => null);
      const nextUsage = extractUsage(data);

      if (nextUsage) {
        setUsage(nextUsage);
      }

      if (res.status === 429) {
        setMessages(baseMessages);
        setInput(text);

        if (nextUsage?.code === "JOURNAL_DAILY_LIMIT") {
          setErrorMessage(
            `Limite atteinte, reessaie apres ${formatDateTime(
              nextUsage.resetAt ?? null
            )}.`
          );
          return;
        }

        setErrorMessage(
          extractErrorMessage(data, "Le journal est momentanement indisponible.")
        );
        return;
      }

      if (!res.ok) {
        setMessages(baseMessages);
        setInput(text);
        setErrorMessage(
          extractErrorMessage(data, "Impossible d'envoyer le message.")
        );
        return;
      }

      applySuccessfulJournalResponse(data, baseMessages, optimisticMessage);
    } catch (error) {
      console.error(
        mode === "journal" ? "Erreur envoi journal:" : "Erreur insight journal:",
        error
      );
      setMessages(baseMessages);
      setInput(text);
      setErrorMessage(
        mode === "journal"
          ? "Impossible d'envoyer le message pour le moment."
          : "Impossible d'envoyer l'analyse pour le moment."
      );
    } finally {
      setSending(false);
    }
  }

  async function sendMessage() {
    await submitJournalMessage("journal");
  }

  async function generateCompatibilityInsight() {
    if (!token) {
      setErrorMessage("Session introuvable. Reconnecte-toi pour continuer.");
      return;
    }

    const sourceText = input.trim();

    if (!sourceText) {
      setErrorMessage(
        "Ecris ton message avant de demander une analyse."
      );
      return;
    }

    setInsightLoading(true);
    setErrorMessage("");

    try {
      await submitJournalMessage("insight");
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
      <div className="journal-app">
        {showArchivePanel ? (
          <section className="journal-list-screen">
            <div className="journal-list-topbar">
              <button className="journal-nav-button" onClick={() => navigate("/")}>
                Retour
              </button>

              <button
                className="journal-sidebar-new"
                onClick={startFreshConversation}
                disabled={!canCreateNewDiscussion}
                type="button"
              >
                Nouvelle discussion
              </button>
            </div>

            <div className="journal-list-header">
              <p className="journal-sidebar-kicker">Journal IA</p>
              <h1>Discussions</h1>
              <p>
                {loadingList
                  ? "Chargement..."
                  : conversations.length === 0
                    ? "Tes archives apparaissent ici."
                    : archiveCountLabel}
              </p>
            </div>

            {errorMessage && <div className="journal-alert error">{errorMessage}</div>}

            {!loadingList && conversations.length === 0 ? (
              <div className="journal-sidebar-empty">
                <strong>Aucune discussion archivee.</strong>
                <p>
                  Des que tu entames un echange, il s'enregistre ici avec le titre
                  fourni par le backend.
                </p>
              </div>
            ) : (
              <div className="journal-thread-list journal-thread-list-page">
                {conversations.map((conversation) => (
                  <article
                    key={conversation.id}
                    className={`journal-thread-card ${
                      conversation.id === activeConversationId ? "active" : ""
                    }`}
                  >
                    <button
                      className="journal-thread-main"
                      onClick={() => {
                        void openConversation(conversation.id);
                      }}
                      type="button"
                    >
                      <strong>{conversation.title}</strong>
                      <p>{conversation.preview || "Ouvrir la discussion"}</p>
                      <small>{formatDateTime(conversation.updatedAt)}</small>
                    </button>

                    <button
                      className="journal-thread-delete"
                      onClick={() => {
                        void deleteConversation(conversation.id);
                      }}
                      type="button"
                    >
                      Supprimer
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="journal-chat-screen">
            <header className="journal-main-header">
              <div className="journal-main-controls">
                <button
                  className="journal-menu-button"
                  onClick={() => setShowArchivePanel(true)}
                  type="button"
                >
                  Discussions
                </button>

                <button
                  className="journal-header-new"
                  onClick={startFreshConversation}
                  disabled={!canCreateNewDiscussion}
                  type="button"
                  aria-label="Nouvelle discussion"
                >
                  <span className="journal-header-new-text">Nouveau</span>
                  <span className="journal-header-new-plus" aria-hidden="true">
                    +
                  </span>
                </button>
              </div>

              <div className="journal-main-title">
                <h2>{currentConversationTitle}</h2>
                {activeConversation && (
                  <p>Retrouve ton echange et continue la discussion ici.</p>
                )}
                {usageSummary && !dailyLimitReached && (
                  <p className="journal-usage-line">{usageSummary}</p>
                )}
              </div>
            </header>

            <div className="journal-conversation" ref={streamRef}>
              {loadingConversation && <p className="journal-empty">Chargement...</p>}

              {!loadingConversation && messages.length === 0 && (
                <div className="journal-empty-card chat-style">
                  <strong>Nouvelle discussion.</strong>
                  <p>Ecris ton premier message ci-dessous pour commencer.</p>
                </div>
              )}

              {!loadingConversation &&
                messages.map((message) => (
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

            <div className="journal-composer">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  dailyLimitReached
                    ? `Limite atteinte, reessaie apres ${formatDateTime(
                        usage?.resetAt ?? null
                      )}.`
                    : "Decris ce que tu ressens, ce qui te preoccupe, ou la question que tu aimerais explorer..."
                }
                disabled={!token || sending || dailyLimitReached || loadingConversation}
              />

              <div className="journal-composer-actions">
                <button
                  className="primary"
                  onClick={() => {
                    void sendMessage();
                  }}
                  disabled={
                    !token ||
                    sending ||
                    dailyLimitReached ||
                    loadingConversation ||
                    !input.trim()
                  }
                >
                  {sending ? "Envoi..." : "Envoyer"}
                </button>

                <button
                  className="ghost"
                  onClick={() => {
                    void generateCompatibilityInsight();
                  }}
                  disabled={
                    !token ||
                    insightLoading ||
                    sending ||
                    dailyLimitReached ||
                    loadingConversation ||
                    !input.trim()
                  }
                >
                  {insightLoading ? "Analyse..." : "Analyse ponctuelle"}
                </button>
              </div>

              {errorMessage && <div className="journal-alert error">{errorMessage}</div>}

              {dailyLimitReached && (
                <div className="journal-alert warning">
                  Limite atteinte, reessaie apres{" "}
                  {formatDateTime(usage?.resetAt ?? null)}.
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
