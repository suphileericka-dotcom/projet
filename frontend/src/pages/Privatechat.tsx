import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import "../style/privateChat.css";
import { API } from "../config/api";
import { buildAvatarUrl } from "../lib/avatar";
import {
  buildDmCheckoutUrls,
  buildPrivateChatPath,
} from "../lib/dmCheckout";

const MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000;
const POST_LOGIN_REDIRECT_KEY = "postLoginRedirect";

type Thread = {
  id: string;
  otherUserId: string;
  lastMessage?: string | null;
  lastAt?: number | string | null;
  otherName?: string;
  otherAvatar?: string;
  online?: boolean;
};

type Msg = {
  id: string;
  sender_id: string | null;
  body: string;
  created_at: number | string | null;
};

function toTimestamp(value?: number | string | null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;

    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) return asDate;
  }

  return null;
}

function isRecent(value?: number | string | null, now = Date.now()) {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return false;
  return now - timestamp <= MESSAGE_RETENTION_MS;
}

function formatThreadTime(value?: number | string | null) {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return "";

  const date = new Date(timestamp);
  const now = new Date();
  const isSameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  return isSameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString();
}

function formatMessageTime(value?: number | string | null) {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return "";

  return new Date(timestamp).toLocaleString([], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortThreads(items: Thread[]) {
  return [...items].sort((left, right) => {
    const leftAt = toTimestamp(left.lastAt) ?? 0;
    const rightAt = toTimestamp(right.lastAt) ?? 0;
    return rightAt - leftAt;
  });
}

function pruneMessages(items: Msg[]) {
  return [...items]
    .filter((message) => isRecent(message.created_at))
    .sort((left, right) => {
      const leftAt = toTimestamp(left.created_at) ?? 0;
      const rightAt = toTimestamp(right.created_at) ?? 0;
      return leftAt - rightAt;
    });
}

function buildThreadPreview(thread: Thread) {
  if (!isRecent(thread.lastAt)) {
    return "Les messages s'effacent apres 24h.";
  }

  const trimmedMessage = thread.lastMessage?.trim();
  return trimmedMessage || "Commencez votre discussion.";
}

function findThreadByTargetUserId(items: Thread[], targetUserId: string) {
  return items.find((thread) => thread.otherUserId === targetUserId) ?? null;
}

function getPayloadRecord(payload: unknown) {
  return payload !== null && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : null;
}

function getThreadIdFromPayload(payload: unknown) {
  const record = getPayloadRecord(payload);
  if (!record) return null;

  const threadId = record.id ?? record.threadId ?? record.thread_id;
  return typeof threadId === "string" && threadId.trim() ? threadId.trim() : null;
}

function getErrorCode(payload: unknown) {
  const record = getPayloadRecord(payload);
  if (!record) return null;

  if (typeof record.code === "string" && record.code.trim()) {
    return record.code.trim().toUpperCase();
  }

  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim().toUpperCase();
  }

  return null;
}

function getErrorMessage(payload: unknown, fallback: string) {
  const record = getPayloadRecord(payload);
  if (!record) return fallback;

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }

  return fallback;
}

function getPaymentUrl(payload: unknown) {
  const record = getPayloadRecord(payload);
  if (!record) return null;

  return typeof record.url === "string" && record.url.trim() ? record.url.trim() : null;
}

function isTokenExpiredResponse(status: number, payload: unknown) {
  return status === 401 && getErrorCode(payload) === "TOKEN_EXPIRED";
}

export default function PrivateChat() {
  const navigate = useNavigate();
  const { targetUserId: routeTargetUserId } = useParams();
  const [searchParams] = useSearchParams();
  const token = localStorage.getItem("authToken");
  const myUserId = localStorage.getItem("userId");

  const targetUserId = routeTargetUserId?.trim() || "";
  const checkoutSessionId = searchParams.get("session_id")?.trim() || "";
  const paid = searchParams.get("paid") === "1";

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [isOpeningTarget, setIsOpeningTarget] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"threads" | "chat">("threads");
  const [banner, setBanner] = useState<string | null>(
    paid ? "Paiement confirme. Ouverture de la conversation..." : null
  );

  const streamRef = useRef<HTMLDivElement>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || null,
    [threads, activeThreadId]
  );
  const activeThreadMatchesTarget =
    !!targetUserId && activeThread?.otherUserId === targetUserId;
  const visibleMessages = useMemo(() => pruneMessages(messages), [messages]);
  const archiveCountLabel =
    threads.length === 0
      ? "Aucune conversation"
      : `${threads.length} conversation${threads.length > 1 ? "s" : ""} archivee${
          threads.length > 1 ? "s" : ""
        }`;

  const redirectToLoginForRefresh = useCallback(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        POST_LOGIN_REDIRECT_KEY,
        `${window.location.pathname}${window.location.search}`
      );
    }

    localStorage.removeItem("authToken");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    localStorage.removeItem("avatar");
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadThreads = useCallback(
    async (preferredThreadId?: string | null) => {
      if (!token) {
        setThreadsLoading(false);
        return [];
      }

      setThreadsLoading(true);

      try {
        const res = await fetch(`${API}/dm/threads`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await res.json().catch(() => null);

        if (isTokenExpiredResponse(res.status, payload)) {
          redirectToLoginForRefresh();
          return [];
        }

        if (!res.ok || !Array.isArray(payload)) {
          return [];
        }

        const nextThreads = sortThreads(payload as Thread[]);
        setThreads(nextThreads);
        setActiveThreadId((current) => {
          if (
            preferredThreadId &&
            nextThreads.some((thread) => thread.id === preferredThreadId)
          ) {
            return preferredThreadId;
          }

          if (targetUserId) {
            const matchingThread = findThreadByTargetUserId(nextThreads, targetUserId);
            if (matchingThread) return matchingThread.id;
          }

          if (current && nextThreads.some((thread) => thread.id === current)) {
            return current;
          }

          return nextThreads[0]?.id ?? null;
        });

        return nextThreads;
      } catch {
        return [];
      } finally {
        setThreadsLoading(false);
      }
    },
    [redirectToLoginForRefresh, targetUserId, token]
  );

  const loadMessages = useCallback(
    async (threadId: string) => {
      if (!token) return;

      setMessagesLoading(true);

      try {
        const res = await fetch(`${API}/dm/threads/${threadId}/messages`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await res.json().catch(() => null);

        if (isTokenExpiredResponse(res.status, payload)) {
          redirectToLoginForRefresh();
          return;
        }

        if (!res.ok || !Array.isArray(payload)) {
          setMessages([]);
          return;
        }

        setMessages(pruneMessages(payload as Msg[]));
      } finally {
        setMessagesLoading(false);
      }
    },
    [redirectToLoginForRefresh, token]
  );

  const openPrivateChat = useCallback(
    async (nextTargetUserId: string, sessionId?: string) => {
      if (!token) {
        throw new Error("TOKEN_EXPIRED");
      }

      const res = await fetch(`${API}/dm/threads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUserId: nextTargetUserId,
          ...(sessionId ? { session_id: sessionId } : {}),
        }),
      });

      const payload = await res.json().catch(() => null);

      if (isTokenExpiredResponse(res.status, payload)) {
        throw new Error("TOKEN_EXPIRED");
      }

      if (res.ok) {
        const threadId = getThreadIdFromPayload(payload);
        if (!threadId) {
          throw new Error("Conversation privee introuvable.");
        }

        return threadId;
      }

      if (res.status === 403) {
        const { successUrl, cancelUrl } = buildDmCheckoutUrls(nextTargetUserId);
        const payRes = await fetch(`${API}/payments/dm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            targetUserId: nextTargetUserId,
            successUrl,
            cancelUrl,
          }),
        });

        const payPayload = await payRes.json().catch(() => null);

        if (isTokenExpiredResponse(payRes.status, payPayload)) {
          throw new Error("TOKEN_EXPIRED");
        }

        if (!payRes.ok) {
          throw new Error(
            getErrorMessage(
              payPayload,
              "Impossible de lancer le paiement du chat prive."
            )
          );
        }

        const paymentUrl = getPaymentUrl(payPayload);
        if (!paymentUrl) {
          throw new Error("Lien de paiement introuvable.");
        }

        setBanner("Redirection vers le paiement...");
        window.location.href = paymentUrl;
        return null;
      }

      throw new Error(getErrorMessage(payload, "Impossible d'ouvrir le chat prive."));
    },
    [token]
  );

  const openTargetConversation = useCallback(async () => {
    if (!targetUserId) return;

    setIsOpeningTarget(true);
    setBanner(
      paid
        ? "Paiement confirme. Ouverture de la conversation..."
        : "Ouverture de la conversation privee..."
    );

    try {
      const threadId = await openPrivateChat(
        targetUserId,
        checkoutSessionId || undefined
      );

      if (!threadId) return;

      setActiveThreadId(threadId);
      setMobilePanel("chat");
      await loadThreads(threadId);

      if (paid || checkoutSessionId) {
        setBanner("Paiement confirme. La conversation est ouverte.");
        navigate(buildPrivateChatPath(targetUserId), { replace: true });
      } else {
        setBanner(null);
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Impossible d'ouvrir le chat prive.";

      if (message === "TOKEN_EXPIRED") {
        redirectToLoginForRefresh();
        return;
      }

      setBanner(message);
    } finally {
      setIsOpeningTarget(false);
    }
  }, [
    checkoutSessionId,
    loadThreads,
    navigate,
    openPrivateChat,
    paid,
    redirectToLoginForRefresh,
    targetUserId,
  ]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!targetUserId) return;
    if (!paid && !checkoutSessionId && activeThreadMatchesTarget) return;

    void openTargetConversation();
  }, [
    activeThreadMatchesTarget,
    checkoutSessionId,
    openTargetConversation,
    paid,
    targetUserId,
  ]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;

    stream.scrollTo({
      top: stream.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function send() {
    if (!token || !activeThreadId || sendLoading) return;

    const text = input.trim();
    if (!text) return;

    setSendLoading(true);
    setInput("");

    try {
      const res = await fetch(`${API}/dm/threads/${activeThreadId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: text }),
      });

      const payload = await res.json().catch(() => null);

      if (isTokenExpiredResponse(res.status, payload)) {
        redirectToLoginForRefresh();
        return;
      }

      if (!res.ok) {
        throw new Error("Message non envoye");
      }

      await Promise.all([loadMessages(activeThreadId), loadThreads(activeThreadId)]);
      setMobilePanel("chat");
      setBanner(null);
    } catch (error) {
      alert(
        error instanceof Error && error.message
          ? error.message
          : "Message non envoye"
      );
      setInput(text);
    } finally {
      setSendLoading(false);
    }
  }

  return (
    <div className={`pc-root ${mobilePanel === "chat" ? "show-chat" : "show-threads"}`}>
      <header className="pc-topbar">
        <button className="pc-back" onClick={() => navigate("/my-space")}>
          {"<"} Mon espace
        </button>
        <div className="pc-title">
          <h1>Messages prives</h1>
          <span className="pc-sub">
            Archive des discussions et messages qui s'effacent apres 24h.
          </span>
        </div>
      </header>

      {banner && (
        <div className="pc-banner" role="status">
          {banner}
        </div>
      )}

      <div className="pc-layout">
        <aside className="pc-sidebar">
          <div className="pc-sidebar-head">
            <div className="pc-sidebar-title">Archive DM</div>
            <div className="pc-sidebar-actions">
              <button className="pc-home-link" onClick={() => navigate("/match")}>
                Profils
              </button>
              <button className="pc-home-link" onClick={() => navigate("/private-chat")}>
                Archive
              </button>
            </div>
          </div>

          <div className="pc-archive-card">
            <span className="pc-archive-kicker">Messages 24h</span>
            <strong>
              {isOpeningTarget ? "Ouverture du chat..." : archiveCountLabel}
            </strong>
            <span>
              Les profils restent archives ici et le texte visible des messages
              disparait apres 24h.
            </span>
          </div>

          {threadsLoading && <div className="pc-empty">Chargement des discussions...</div>}

          {!threadsLoading && threads.length === 0 && (
            <div className="pc-empty">
              Aucune conversation pour le moment. Lance un chat prive depuis un profil
              pour le retrouver ensuite ici.
            </div>
          )}

          {threads.map((thread) => (
            <button
              key={thread.id}
              className={`pc-thread ${thread.id === activeThreadId ? "active" : ""}`}
              onClick={() => {
                setActiveThreadId(thread.id);
                setMobilePanel("chat");

                if (thread.otherUserId && thread.otherUserId !== targetUserId) {
                  navigate(buildPrivateChatPath(thread.otherUserId));
                }
              }}
            >
              <div className="pc-thread-left">
                <img
                  className="pc-avatar"
                  src={buildAvatarUrl({
                    name: thread.otherName || "Membre",
                    avatarPath: thread.otherAvatar,
                    seed: thread.otherUserId || thread.id,
                    size: 96,
                  })}
                  alt={thread.otherName || "Profil"}
                />
                <div className="pc-thread-meta">
                  <div className="pc-thread-name">
                    {thread.otherName || thread.otherUserId}
                    <span className={`pc-dot ${thread.online ? "on" : "off"}`} />
                  </div>
                  <div className="pc-thread-last">{buildThreadPreview(thread)}</div>
                </div>
              </div>

              <div className="pc-thread-time">{formatThreadTime(thread.lastAt)}</div>
            </button>
          ))}
        </aside>

        <main className="pc-chat">
          {activeThread ? (
            <>
              <div className="pc-chat-head">
                <div className="pc-chat-head-main">
                  <button
                    className="pc-chat-back"
                    onClick={() => setMobilePanel("threads")}
                  >
                    {"<"} Conversations
                  </button>
                  <img
                    className="pc-avatar pc-avatar-lg"
                    src={buildAvatarUrl({
                      name: activeThread.otherName || "Membre",
                      avatarPath: activeThread.otherAvatar,
                      seed: activeThread.otherUserId || activeThread.id,
                      size: 96,
                    })}
                    alt={activeThread.otherName || "Profil"}
                  />
                  <div className="pc-chat-user">
                    <strong>{activeThread.otherName || activeThread.otherUserId}</strong>
                    <span>Messages ephemeres: suppression visuelle apres 24h.</span>
                  </div>
                </div>
              </div>

              <div className="pc-stream" ref={streamRef}>
                {messagesLoading && (
                  <div className="pc-empty">Chargement de la conversation...</div>
                )}

                {!messagesLoading && visibleMessages.length === 0 && (
                  <div className="pc-empty">
                    Il n'y a pas encore de message visible ici. Les messages de plus de
                    24h disparaissent de l'ecran.
                  </div>
                )}

                {!messagesLoading &&
                  visibleMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`pc-msg ${
                        message.sender_id === myUserId ? "me" : "them"
                      }`}
                    >
                      <div className="pc-bubble">{message.body}</div>
                      <div className="pc-time">
                        {formatMessageTime(message.created_at)}
                      </div>
                    </div>
                  ))}
              </div>

              <footer className="pc-inputbar">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Ecris un message prive..."
                />
                <button onClick={() => void send()} disabled={sendLoading}>
                  {sendLoading ? "..." : ">"}
                </button>
              </footer>
            </>
          ) : (
            <div className="pc-empty pc-empty-panel">
              <strong>
                {targetUserId && isOpeningTarget
                  ? "Ouverture de la conversation..."
                  : "Choisis une conversation dans l'archive."}
              </strong>
              <span>
                Tu retrouveras ici le profil, l'historique recent et les messages
                encore visibles pendant 24h.
              </span>
              <div className="pc-empty-actions">
                <button className="pc-home-link" onClick={() => navigate("/match")}>
                  Voir les profils
                </button>
                <button className="pc-home-link" onClick={() => navigate("/my-space")}>
                  Gerer amities
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
