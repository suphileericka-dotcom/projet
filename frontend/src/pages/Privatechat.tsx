import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../style/privateChat.css";
import { API } from "../config/api";
import { buildAvatarUrl } from "../lib/avatar";
import {
  clearPendingDmCheckout,
  readPendingDmCheckout,
} from "../lib/dmCheckout";

const MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000;

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
  return now - timestamp < MESSAGE_RETENTION_MS;
}

function formatThreadTime(value?: number | string | null) {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return "";

  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  return isToday
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString();
}

function formatMessageTime(value?: number | string | null) {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return "";

  return new Date(timestamp).toLocaleTimeString([], {
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

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function PrivateChat() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");
  const myUserId = localStorage.getItem("userId");

  const [params] = useSearchParams();
  const initialThread = params.get("thread");
  const checkoutStatus = params.get("checkout");
  const targetUserIdFromParams = params.get("targetUserId")?.trim() || "";

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    initialThread
  );
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"threads" | "chat">(
    initialThread ? "chat" : "threads"
  );
  const [banner, setBanner] = useState<string | null>(
    checkoutStatus === "success"
      ? "Paiement confirme. Ouverture de la conversation..."
      : null
  );

  const streamRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    if (!token) {
      setThreadsLoading(false);
      return [];
    }

    try {
      const res = await fetch(`${API}/dm/threads`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) return [];

      const data: Thread[] = await res.json();
      const nextThreads = sortThreads(Array.isArray(data) ? data : []);
      setThreads(nextThreads);

      setActiveThreadId((current) => {
        if (current && nextThreads.some((thread) => thread.id === current)) {
          return current;
        }

        return nextThreads[0]?.id ?? null;
      });

      return nextThreads;
    } finally {
      setThreadsLoading(false);
    }
  }, [token]);

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

        if (!res.ok) return;

        const data: Msg[] = await res.json();
        setMessages(pruneMessages(Array.isArray(data) ? data : []));
      } finally {
        setMessagesLoading(false);
      }
    },
    [token]
  );

  const restorePendingCheckout = useCallback(async () => {
    if (!token) return;

    const pendingCheckout = readPendingDmCheckout();
    const targetUserId = targetUserIdFromParams || pendingCheckout?.targetUserId || "";

    if (!targetUserId) {
      if (checkoutStatus === "success") {
        setBanner("Paiement confirme. Ouvre une conversation depuis un profil.");
      }
      return;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(`${API}/dm/threads`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ targetUserId }),
        });

        if (res.ok) {
          const thread = (await res.json()) as { id?: string };
          if (thread.id) {
            clearPendingDmCheckout();
            setActiveThreadId(thread.id);
            setMobilePanel("chat");
            setBanner(
              pendingCheckout?.mode === "subscription"
                ? "Abonnement DM actif. Tu peux maintenant ecrire en prive."
                : "Paiement confirme. La conversation est ouverte."
            );
            await loadThreads();
            return;
          }
        }
      } catch {
        // The payment webhook may still be finalizing access. Retry briefly.
      }

      await wait(1200);
    }

    clearPendingDmCheckout();
    setBanner(
      "Le paiement est revenu sur la messagerie, mais la conversation n'a pas pu s'ouvrir automatiquement."
    );
    await loadThreads();
  }, [checkoutStatus, loadThreads, targetUserIdFromParams, token]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (checkoutStatus !== "success" && !readPendingDmCheckout()) return;
    void restorePendingCheckout();
  }, [checkoutStatus, restorePendingCheckout]);

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

      if (!res.ok) {
        throw new Error("send_failed");
      }

      await Promise.all([loadMessages(activeThreadId), loadThreads()]);
      setMobilePanel("chat");
    } catch {
      alert("Message non envoye");
      setInput(text);
    } finally {
      setSendLoading(false);
    }
  }

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || null,
    [threads, activeThreadId]
  );

  const visibleMessages = useMemo(() => pruneMessages(messages), [messages]);

  return (
    <div className={`pc-root ${mobilePanel === "chat" ? "show-chat" : "show-threads"}`}>
      <header className="pc-topbar">
        <button className="pc-back" onClick={() => navigate("/")}>
          {"<"} Accueil
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
            <div className="pc-sidebar-title">Conversations</div>
            <button className="pc-home-link" onClick={() => navigate("/")}>
              Accueil
            </button>
          </div>

          {threadsLoading && <div className="pc-empty">Chargement des discussions...</div>}

          {!threadsLoading && threads.length === 0 && (
            <div className="pc-empty">
              Aucune conversation pour le moment. Quand tu ecris a quelqu'un en prive,
              l'archive apparait ici avec son profil.
            </div>
          )}

          {threads.map((thread) => (
            <button
              key={thread.id}
              className={`pc-thread ${thread.id === activeThreadId ? "active" : ""}`}
              onClick={() => {
                setActiveThreadId(thread.id);
                setMobilePanel("chat");
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
            <div className="pc-empty">
              Choisis une conversation dans l'archive pour retrouver le profil et les
              messages.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
