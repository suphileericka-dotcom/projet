import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../style/privateChat.css";

type Thread = {
  id: string;
  otherUserId: string;
  lastMessage: string;
  lastAt: number;
  otherName?: string;
  otherAvatar?: string;
  online?: boolean;
};

type Msg = {
  id: string;
  sender_id: string;
  body: string;
  created_at: number;
};

export default function PrivateChat() {
  const navigate = useNavigate();

  const token = localStorage.getItem("authToken");
  const myUserId = localStorage.getItem("userId");

  const [params] = useSearchParams();
  const initialThread = params.get("thread");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThread);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");

  const streamRef = useRef<HTMLDivElement>(null);

  // =====================
  // LOAD THREADS
  // =====================
  const loadThreads = useCallback(async () => {
    if (!token) return;

    const res = await fetch("http://localhost:8000/api/dm/threads", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) return;

    const data: Thread[] = await res.json();
    setThreads(data);

    if (!activeThreadId && data.length > 0) {
      setActiveThreadId(data[0].id);
    }
  }, [token, activeThreadId]);

  // =====================
  // LOAD MESSAGES
  // =====================
  const loadMessages = useCallback(
    async (threadId: string) => {
      if (!token) return;

      const res = await fetch(
        `http://localhost:8000/api/dm/threads/${threadId}/messages`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) return;

      const data: Msg[] = await res.json();
      setMessages(data);
    },
    [token]
  );

  // =====================
  // EFFECTS
  // =====================
  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!activeThreadId) return;
    loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  // autoscroll
  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // =====================
  // SEND MESSAGE
  // =====================
  async function send() {
    if (!token || !activeThreadId) return;

    const text = input.trim();
    if (!text) return;

    setInput("");

    const res = await fetch(
      `http://localhost:8000/api/dm/threads/${activeThreadId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: text }),
      }
    );

    if (!res.ok) {
      alert("Message non envoyé");
      return;
    }

    await loadMessages(activeThreadId);
    await loadThreads();
  }

  // =====================
  // DERIVED STATE
  // =====================
  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) || null,
    [threads, activeThreadId]
  );

  // =====================
  // RENDER
  // =====================
  return (
    <div className="pc-root">
      <header className="pc-topbar">
        <button className="pc-back" onClick={() => navigate("/")}>
          ← Accueil
        </button>
        <div className="pc-title">
          <h1>Messages privés</h1>
          {activeThread && (
            <span className="pc-sub">
              Conversation avec{" "}
              <b>{activeThread.otherName || activeThread.otherUserId}</b>
            </span>
          )}
        </div>
      </header>

      <div className="pc-layout">
        {/* SIDEBAR */}
        <aside className="pc-sidebar">
          <div className="pc-sidebar-title">Conversations</div>

          {threads.length === 0 && (
            <div className="pc-empty">Aucune conversation.</div>
          )}

          {threads.map((t) => (
            <button
              key={t.id}
              className={`pc-thread ${t.id === activeThreadId ? "active" : ""}`}
              onClick={() => setActiveThreadId(t.id)}
            >
              <div className="pc-thread-left">
                <img
                  className="pc-avatar"
                  src={t.otherAvatar || "/avatar.png"}
                  alt=""
                />
                <div className="pc-thread-meta">
                  <div className="pc-thread-name">
                    {t.otherName || t.otherUserId}
                    <span className={`pc-dot ${t.online ? "on" : "off"}`} />
                  </div>
                  <div className="pc-thread-last">
                    {t.lastMessage || "—"}
                  </div>
                </div>
              </div>

              <div className="pc-thread-time">
                {new Date(t.lastAt).toLocaleDateString()}
              </div>
            </button>
          ))}
        </aside>

        {/* CHAT */}
        <main className="pc-chat">
          {!activeThreadId ? (
            <div className="pc-empty">Choisis une conversation.</div>
          ) : (
            <>
              <div className="pc-stream" ref={streamRef}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`pc-msg ${
                      m.sender_id === myUserId ? "me" : "them"
                    }`}
                  >
                    <div className="pc-bubble">{m.body}</div>
                    <div className="pc-time">
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <footer className="pc-inputbar">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Écris un message…"
                />
                <button onClick={send}>➤</button>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
