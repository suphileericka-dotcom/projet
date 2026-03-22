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

type JournalArchive = {
  localId: string;
  conversationId: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: JournalMessage[];
  rateLimit: RateLimitState | null;
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
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function getConversationId(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const direct = payload.conversationId ?? payload.conversation_id ?? payload.id ?? null;
  if (typeof direct === "string" && direct.trim()) return direct;
  if (typeof direct === "number" && Number.isFinite(direct)) return String(direct);
  const nested = payload.conversation;
  if (typeof nested === "string" && nested.trim()) return nested;
  if (!isRecord(nested)) return null;
  const nestedValue = nested.id ?? nested.conversationId ?? nested.conversation_id ?? null;
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
  if (normalized.includes("system")) return "system";
  return fallbackRole;
}

function normalizeMessage(payload: unknown, fallbackRole: JournalRole): JournalMessage | null {
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
    payload.id ?? payload.messageId ?? payload.message_id ?? payload.entry_id ?? null;
  return {
    id:
      typeof idCandidate === "string" || typeof idCandidate === "number"
        ? String(idCandidate)
        : `${fallbackRole}-${String(createdAt ?? Date.now())}-${text.slice(0, 16)}`,
    role: normalizeRole(
      payload.role ?? payload.sender ?? payload.sender_role ?? payload.senderType ?? payload.type,
      fallbackRole
    ),
    text,
    createdAt: typeof createdAt === "string" || typeof createdAt === "number" ? createdAt : null,
  };
}

function mergeMessages(messages: JournalMessage[]): JournalMessage[] {
  const seen = new Set<string>();
  const merged: JournalMessage[] = [];
  for (const message of messages) {
    const signature = `${message.id}|${message.role}|${message.text}|${String(message.createdAt ?? "")}`;
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
    if (normalized.length > 0) return mergeMessages(normalized);
  }
  return [];
}

function extractNamedMessage(payload: unknown, keys: string[], fallbackRole: JournalRole): JournalMessage | null {
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
      candidate.retry_at ?? candidate.retryAt ?? candidate.reset_at ?? candidate.resetAt ?? null;
    const remaining =
      readNumber(candidate.remaining) ??
      readNumber(candidate.remaining_requests) ??
      readNumber(candidate.left);
    const limit =
      readNumber(candidate.limit) ?? readNumber(candidate.max) ?? readNumber(candidate.total);
    if (retryAt !== null || remaining !== null || limit !== null) {
      return {
        retryAt: typeof retryAt === "string" || typeof retryAt === "number" ? retryAt : null,
        remaining,
        limit,
      };
    }
  }
  return null;
}

function extractErrorMessage(payload: unknown, fallbackMessage: string): string {
  if (!isRecord(payload)) return fallbackMessage;
  return readText(payload.error) || readText(payload.message) || readText(payload.detail) || fallbackMessage;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shortenText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(maxLength - 3, 1)).trim()}...`;
}

function buildConversationTitle(messages: JournalMessage[], fallbackTitle = "Nouvelle discussion"): string {
  const source =
    messages.find((message) => message.role === "user" && compactText(message.text).length > 0) ??
    messages.find((message) => compactText(message.text).length > 0);
  const candidate = compactText(source?.text ?? "");
  if (!candidate) return fallbackTitle;
  const firstLine = candidate.split(/[\n.!?]/)[0]?.trim() || candidate;
  return shortenText(firstLine, 54);
}

function buildConversationPreview(messages: JournalMessage[]): string {
  const source = [...messages].reverse().find((message) => compactText(message.text).length > 0);
  if (!source) return "Aucun message enregistre.";
  return shortenText(compactText(source.text), 90);
}

function makeArchiveLocalId(): string {
  return `journal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getArchiveStorageKey(userKey: string): string {
  return `journal-archives:v1:${userKey}`;
}

function getArchiveSelectionKey(userKey: string): string {
  return `journal-active:v1:${userKey}`;
}

function readStoredArchives(storageKey: string): JournalArchive[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry): JournalArchive | null => {
        if (!isRecord(entry)) return null;
        const messages = Array.isArray(entry.messages)
          ? entry.messages
              .map((message) => normalizeMessage(message, "assistant"))
              .filter((message): message is JournalMessage => message !== null)
          : [];
        const conversationId = getConversationId(entry);
        const localId =
          readText(entry.localId) ||
          readText(entry.archiveId) ||
          conversationId ||
          readText(entry.id) ||
          "";
        if (!localId || (messages.length === 0 && !conversationId)) return null;
        const createdAt =
          toTimestamp(entry.createdAt ?? entry.created_at ?? null) ??
          toTimestamp(messages[0]?.createdAt ?? null) ??
          Date.now();
        const updatedAt =
          toTimestamp(entry.updatedAt ?? entry.updated_at ?? null) ??
          toTimestamp(messages[messages.length - 1]?.createdAt ?? null) ??
          createdAt;
        return {
          localId,
          conversationId,
          title: readText(entry.title) || buildConversationTitle(messages),
          createdAt,
          updatedAt,
          messages: mergeMessages(messages),
          rateLimit: extractRateLimit(entry),
        };
      })
      .filter((archive): archive is JournalArchive => archive !== null)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } catch (error) {
    console.error("Erreur lecture archives journal:", error);
    return [];
  }
}

function writeStoredArchives(storageKey: string, archives: JournalArchive[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(archives));
  } catch (error) {
    console.error("Erreur sauvegarde archives journal:", error);
  }
}

export default function Journal() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");
  const storageUserKey = localStorage.getItem("userId") || token || "anonymous";
  const archiveStorageKey = getArchiveStorageKey(storageUserKey);
  const archiveSelectionKey = getArchiveSelectionKey(storageUserKey);

  const [archives, setArchives] = useState<JournalArchive[]>([]);
  const [activeArchiveId, setActiveArchiveId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<JournalMessage[]>([]);
  const [input, setInput] = useState("");
  const [compatInsight, setCompatInsight] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [rateLimit, setRateLimit] = useState<RateLimitState | null>(null);
  const [showArchivePanel, setShowArchivePanel] = useState(true);

  const streamRef = useRef<HTMLDivElement>(null);
  const archivesRef = useRef<JournalArchive[]>([]);
  const activeArchiveIdRef = useRef<string | null>(null);

  const retryAtTimestamp = toTimestamp(rateLimit?.retryAt ?? null);
  const isRateLimited =
    retryAtTimestamp !== null && retryAtTimestamp > Date.now();
  const activeArchive =
    archives.find((archive) => archive.localId === activeArchiveId) ?? null;
  const currentConversationTitle =
    messages.length > 0
      ? buildConversationTitle(
          messages,
          activeArchive?.title || "Nouvelle discussion"
        )
      : activeArchive?.title || "Nouvelle discussion";
  const archiveCountLabel =
    archives.length === 1 ? "1 discussion" : `${archives.length} discussions`;
  const canCreateNewDiscussion = !sending && !insightLoading;

  function shouldClosePanelAfterAction(): boolean {
    return typeof window !== "undefined" && window.innerWidth < 1100;
  }

  function applyArchiveList(nextArchives: JournalArchive[]) {
    archivesRef.current = nextArchives;
    setArchives(nextArchives);
    writeStoredArchives(archiveStorageKey, nextArchives);
  }

  function clearActiveConversation(closePanel = false) {
    activeArchiveIdRef.current = null;
    setActiveArchiveId(null);
    localStorage.removeItem(archiveSelectionKey);
    setConversationId(null);
    setMessages([]);
    setRateLimit(null);
    setCompatInsight("");
    setErrorMessage("");
    if (closePanel) {
      setShowArchivePanel(false);
    }
  }

  function activateArchive(archive: JournalArchive, closePanel = false) {
    activeArchiveIdRef.current = archive.localId;
    setActiveArchiveId(archive.localId);
    localStorage.setItem(archiveSelectionKey, archive.localId);
    setConversationId(archive.conversationId);
    setMessages(archive.messages);
    setRateLimit(archive.rateLimit ?? null);
    setCompatInsight("");
    setErrorMessage("");
    if (closePanel) {
      setShowArchivePanel(false);
    }
  }

  function persistConversationSnapshot(
    nextMessages: JournalMessage[],
    nextConversationId: string | null,
    nextRateLimit: RateLimitState | null
  ): string | null {
    if (nextMessages.length === 0 && !nextConversationId) {
      return null;
    }

    const currentArchives = archivesRef.current;
    const matchingArchive = currentArchives.find((archive) => {
      if (nextConversationId && archive.conversationId === nextConversationId) {
        return true;
      }

      return (
        activeArchiveIdRef.current !== null &&
        archive.localId === activeArchiveIdRef.current
      );
    });

    const localId =
      matchingArchive?.localId ??
      activeArchiveIdRef.current ??
      nextConversationId ??
      makeArchiveLocalId();
    const createdAt =
      matchingArchive?.createdAt ??
      toTimestamp(nextMessages[0]?.createdAt ?? null) ??
      Date.now();
    const updatedAt =
      toTimestamp(nextMessages[nextMessages.length - 1]?.createdAt ?? null) ??
      Date.now();
    const nextArchive: JournalArchive = {
      localId,
      conversationId: nextConversationId ?? matchingArchive?.conversationId ?? null,
      title: buildConversationTitle(
        nextMessages,
        matchingArchive?.title || "Nouvelle discussion"
      ),
      createdAt,
      updatedAt,
      messages: mergeMessages(nextMessages),
      rateLimit: nextRateLimit ?? matchingArchive?.rateLimit ?? null,
    };
    const nextArchives = [
      nextArchive,
      ...currentArchives.filter((archive) => {
        if (archive.localId === localId) return false;
        if (
          nextArchive.conversationId &&
          archive.conversationId === nextArchive.conversationId
        ) {
          return false;
        }

        return true;
      }),
    ].sort((left, right) => right.updatedAt - left.updatedAt);

    applyArchiveList(nextArchives);
    activeArchiveIdRef.current = localId;
    setActiveArchiveId(localId);
    localStorage.setItem(archiveSelectionKey, localId);

    return localId;
  }

  function startFreshConversation() {
    clearActiveConversation(shouldClosePanelAfterAction());
    setInput("");
  }

  function openArchiveById(localId: string) {
    const target = archivesRef.current.find((archive) => archive.localId === localId);
    if (!target) return;
    activateArchive(target, shouldClosePanelAfterAction());
  }

  function deleteArchive(localId: string) {
    const target = archivesRef.current.find((archive) => archive.localId === localId);
    if (!target) return;

    if (!confirm("Supprimer cette discussion de tes archives ?")) {
      return;
    }

    const nextArchives = archivesRef.current.filter(
      (archive) => archive.localId !== localId
    );
    applyArchiveList(nextArchives);

    if (activeArchiveIdRef.current !== localId) {
      return;
    }

    const nextSelected = nextArchives[0] ?? null;
    if (nextSelected) {
      activateArchive(nextSelected, shouldClosePanelAfterAction());
      return;
    }

    clearActiveConversation(shouldClosePanelAfterAction());
  }

  useEffect(() => {
    archivesRef.current = archives;
  }, [archives]);

  useEffect(() => {
    activeArchiveIdRef.current = activeArchiveId;
  }, [activeArchiveId]);

  useEffect(() => {
    const storedArchives = readStoredArchives(archiveStorageKey);
    applyArchiveList(storedArchives);

    const savedActiveId = localStorage.getItem(archiveSelectionKey);
    const initialArchive =
      storedArchives.find((archive) => archive.localId === savedActiveId) ??
      storedArchives[0] ??
      null;

    if (initialArchive) {
      activeArchiveIdRef.current = initialArchive.localId;
      setActiveArchiveId(initialArchive.localId);
      setConversationId(initialArchive.conversationId);
      setMessages(initialArchive.messages);
      setRateLimit(initialArchive.rateLimit ?? null);
      return;
    }

    activeArchiveIdRef.current = null;
    setActiveArchiveId(null);
    setConversationId(null);
    setMessages([]);
    setRateLimit(null);
  }, [archiveSelectionKey, archiveStorageKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadConversation() {
      if (!token) {
        setLoading(false);
        setErrorMessage("Session introuvable. Reconnecte-toi pour ouvrir ton journal.");
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

        const nextRateLimit = extractRateLimit(data);
        const nextConversationId = getConversationId(data);
        const nextMessages = extractMessages(data);

        if (!res.ok) {
          if (!activeArchiveIdRef.current) {
            setMessages([]);
            setConversationId(nextConversationId);
          }
          setRateLimit(nextRateLimit);
          setErrorMessage(
            extractErrorMessage(data, "Impossible de charger la conversation.")
          );
          return;
        }

        if (nextMessages.length > 0 || nextConversationId) {
          setConversationId(nextConversationId);
          setMessages(nextMessages);
          setRateLimit(nextRateLimit);
          persistConversationSnapshot(
            nextMessages,
            nextConversationId,
            nextRateLimit
          );
        } else if (activeArchiveIdRef.current) {
          const selectedArchive = archivesRef.current.find(
            (archive) => archive.localId === activeArchiveIdRef.current
          );

          if (selectedArchive) {
            setConversationId(selectedArchive.conversationId);
            setMessages(selectedArchive.messages);
            setRateLimit(selectedArchive.rateLimit ?? nextRateLimit);
          }
        } else {
          setConversationId(null);
          setMessages([]);
          setRateLimit(nextRateLimit);
        }

        setErrorMessage("");
      } catch (error) {
        if (cancelled) return;
        console.error("Erreur conversation journal:", error);
        if (!activeArchiveIdRef.current) {
          setMessages([]);
          setConversationId(null);
        }
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
  }, [archiveSelectionKey, archiveStorageKey, token]);

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
      setErrorMessage("Ecris un message avant de l'envoyer.");
      return;
    }

    if (isRateLimited) return;

    const optimisticMessage: JournalMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      text,
      createdAt: Date.now(),
    };
    const baseMessages = messages;

    setSending(true);
    setErrorMessage("");
    setCompatInsight("");
    setMessages(mergeMessages([...baseMessages, optimisticMessage]));
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
      const resolvedConversationId = nextConversationId ?? conversationId;

      if (nextRateLimit) {
        setRateLimit(nextRateLimit);
      }

      if (resolvedConversationId) {
        setConversationId(resolvedConversationId);
      }

      if (res.status === 429) {
        setMessages(baseMessages);
        if (baseMessages.length > 0 || resolvedConversationId) {
          persistConversationSnapshot(
            baseMessages,
            resolvedConversationId,
            nextRateLimit ?? rateLimit
          );
        }
        setInput(text);
        setErrorMessage(
          extractErrorMessage(data, "Le journal est momentanement indisponible.")
        );
        return;
      }

      if (!res.ok) {
        setMessages(baseMessages);
        if (baseMessages.length > 0 || resolvedConversationId) {
          persistConversationSnapshot(
            baseMessages,
            resolvedConversationId,
            nextRateLimit ?? rateLimit
          );
        }
        setInput(text);
        setErrorMessage(
          extractErrorMessage(data, "Impossible d'envoyer le message.")
        );
        return;
      }

      const returnedMessages = extractMessages(data);
      const persistedUser =
        extractNamedMessage(data, ["user_message", "userMessage"], "user") ??
        optimisticMessage;
      const assistantMessage = extractNamedMessage(
        data,
        ["assistant_message", "assistantMessage", "reply"],
        "assistant"
      );
      const nextMessages =
        returnedMessages.length > 0
          ? mergeMessages([...baseMessages, ...returnedMessages])
          : mergeMessages([
              ...baseMessages,
              persistedUser,
              ...(assistantMessage ? [assistantMessage] : []),
            ]);

      setMessages(nextMessages);
      persistConversationSnapshot(
        nextMessages,
        resolvedConversationId,
        nextRateLimit ?? rateLimit
      );
    } catch (error) {
      console.error("Erreur envoi journal:", error);
      setMessages(baseMessages);
      if (baseMessages.length > 0 || conversationId) {
        persistConversationSnapshot(baseMessages, conversationId, rateLimit);
      }
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
        "Ecris un brouillon ou envoie deja un message avant de demander une analyse."
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
          extractErrorMessage(data, "Impossible de generer l'analyse pour le moment.")
        );
        return;
      }

      const nextInsight =
        readText(isRecord(data) ? data.insight : null) ||
        readText(isRecord(data) ? data.message : null);

      setCompatInsight(nextInsight || "Aucune analyse complementaire n'a ete renvoyee.");
    } catch (error) {
      console.error("Erreur insight journal:", error);
      setErrorMessage("Impossible de joindre l'analyse pour le moment.");
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
      <div className={`journal-app ${showArchivePanel ? "sidebar-open" : "sidebar-closed"}`}>
        <button
          className={`journal-sidebar-overlay ${showArchivePanel ? "open" : ""}`}
          onClick={() => setShowArchivePanel(false)}
          type="button"
          aria-label="Fermer le panneau des discussions"
        />

        <aside className={`journal-sidebar ${showArchivePanel ? "open" : ""}`}>
          <div className="journal-sidebar-topbar">
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

          <div className="journal-sidebar-head">
            <div>
              <p className="journal-sidebar-kicker">Journal IA</p>
              <h1>Discussions</h1>
              <p>{archives.length === 0 ? "Tes archives apparaissent ici." : archiveCountLabel}</p>
            </div>

            <button
              className="journal-sidebar-close"
              onClick={() => setShowArchivePanel(false)}
              type="button"
            >
              Fermer
            </button>
          </div>

          {archives.length === 0 ? (
            <div className="journal-sidebar-empty">
              <strong>Aucune discussion archivee.</strong>
              <p>
                Des que tu entames un echange, il s'enregistre ici avec un titre
                genere a partir de ton premier message.
              </p>
            </div>
          ) : (
            <div className="journal-thread-list">
              {archives.map((archive) => (
                <article
                  key={archive.localId}
                  className={`journal-thread-card ${
                    archive.localId === activeArchiveId ? "active" : ""
                  }`}
                >
                  <button
                    className="journal-thread-main"
                    onClick={() => openArchiveById(archive.localId)}
                    type="button"
                  >
                    <strong>{archive.title}</strong>
                    <p>{buildConversationPreview(archive.messages)}</p>
                    <small>{formatDateTime(archive.updatedAt)}</small>
                  </button>

                  <button
                    className="journal-thread-delete"
                    onClick={() => deleteArchive(archive.localId)}
                    type="button"
                  >
                    Supprimer
                  </button>
                </article>
              ))}
            </div>
          )}
        </aside>

        <section className="journal-main">
          <header className="journal-main-header">
            <div className="journal-main-title">
              <div className="journal-main-controls">
                <button
                  className="journal-menu-button"
                  onClick={() => setShowArchivePanel((current) => !current)}
                  type="button"
                >
                  {showArchivePanel ? "Masquer" : "Discussions"}
                </button>
                <button
                  className="journal-header-new"
                  onClick={startFreshConversation}
                  disabled={!canCreateNewDiscussion}
                  type="button"
                >
                  Nouveau
                </button>
              </div>

              <h2>{currentConversationTitle}</h2>
              <p>
                {activeArchive
                  ? "Retrouve ton echange et continue la discussion ici."
                  : "Tout se passe dans ce meme espace, comme un vrai assistant."}
              </p>
            </div>
          </header>

          <div className="journal-conversation" ref={streamRef}>
            {loading && <p className="journal-empty">Chargement...</p>}

            {!loading && messages.length === 0 && (
              <div className="journal-empty-card chat-style">
                <strong>Nouvelle discussion.</strong>
                <p>
                  Ecris ton premier message ci-dessous pour commencer, puis retrouve
                  ce fil dans la liste des discussions.
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

          <div className="journal-composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Decris ce que tu ressens, ce qui te preoccupe, ou la question que tu aimerais explorer..."
              disabled={!token || sending || isRateLimited}
            />

            <div className="journal-composer-actions">
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
                {insightLoading ? "Analyse..." : "Analyse ponctuelle"}
              </button>
            </div>

            {errorMessage && <div className="journal-alert error">{errorMessage}</div>}

            {isRateLimited && (
              <div className="journal-alert warning">
                Tu pourras reprendre l'echange a partir de{" "}
                {formatDateTime(rateLimit?.retryAt ?? null)}.
              </div>
            )}

            {compatInsight && (
              <div className="journal-insight">
                <strong>Analyse ponctuelle</strong>
                <p>{compatInsight}</p>
              </div>
            )}

            <div className="journal-composer-footer">
              <p className="journal-note">
                Appuie sur Entree pour envoyer. Utilise Maj + Entree pour revenir a
                la ligne.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
