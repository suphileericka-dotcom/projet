// =====================
// IMPORTS
// =====================

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/changement.css";
import { socket } from "../lib/socket";
import { useTranslation } from "react-i18next";

/* =====================
   API BASE
===================== */
const API =
  import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : "http://localhost:8000/api";

type Message = {
  id: string;
  type: "text" | "voice";
  text?: string;
  createdAt: number;
  editedAt?: number;
  translatedText?: string;
};

type ChangementProps = {
  isAuth: boolean;
};

/* =====================
   CONSTANTES
===================== */
const ROOM = "changement";
const EDIT_WINDOW = 20 * 60 * 1000;

/* =====================
   COMPONENT
===================== */
export default function Changement({ isAuth }: ChangementProps) {
  const navigate = useNavigate();
  useTranslation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [activeMessage, setActiveMessage] = useState<string | null>(null);

  const userId = isAuth ? localStorage.getItem("userId") : null;
  const streamRef = useRef<HTMLDivElement>(null);

  /* =====================
     SOCKET
  ===================== */
  useEffect(() => {
    if (!isAuth || !userId) return;

    if (!socket.connected) socket.connect();

    socket.emit("join-room", { room: ROOM, userId });

    socket.on("online-count", ({ room, count }) => {
      if (room === ROOM) setOnlineCount(count);
    });

    return () => {
      socket.off("online-count");
      socket.emit("leave-room", { room: ROOM, userId });
      socket.disconnect();
    };
  }, [isAuth, userId]);

  /* =====================
     LOAD MESSAGES
  ===================== */
  useEffect(() => {
    fetch(`${API}/messages?room=${ROOM}`)
      .then((res) => res.json())
      .then((data) => {
        setMessages(
          data.map((m: any) => ({
            id: m.id,
            type: m.audio_path ? "voice" : "text",
            text: m.content ?? (m.audio_path ? "Ancien message vocal non disponible." : ""),
            createdAt: m.created_at,
          }))
        );
      });
  }, []);

  /* =====================
     AUTOSCROLL
  ===================== */
  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  /* =====================
     HELPERS
  ===================== */
  function canEdit(m: Message) {
    return (
      isAuth &&
      m.type === "text" &&
      Date.now() - m.createdAt <= EDIT_WINDOW
    );
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /* =====================
     SEND TEXT
  ===================== */
  async function handleSend() {
    if (!isAuth || !userId || !input.trim()) return;

    if (editingId) {
      setMessages((msgs) =>
        msgs.map((m) =>
          m.id === editingId
            ? { ...m, text: input, editedAt: Date.now() }
            : m
        )
      );
      setEditingId(null);
      setInput("");
      return;
    }

    const res = await fetch(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: ROOM, userId, content: input }),
    });

    const saved = await res.json();

    setMessages((msgs) => [
      ...msgs,
      {
        id: saved.id,
        type: "text",
        text: saved.content,
        createdAt: saved.createdAt ?? Date.now(),
      },
    ]);

    setInput("");
  }

  /* =====================
     DELETE MESSAGE
  ===================== */
  async function handleDelete(id: string) {
    if (!userId) return;

    await fetch(`${API}/messages/${id}?userId=${userId}`, {
      method: "DELETE",
    });

    setMessages((msgs) => msgs.filter((m) => m.id !== id));
  }

  /* =====================
     TRANSLATION
  ===================== */
  async function translateMessage(m: Message) {
    if (!m.text || m.translatedText) return;

    const lang = localStorage.getItem("language") || "fr";

    const res = await fetch(`${API}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: m.text,
        target: lang,
      }),
    });

    if (!res.ok) return;

    const data = await res.json();

    setMessages((msgs) =>
      msgs.map((msg) =>
        msg.id === m.id
          ? { ...msg, translatedText: data.translatedText }
          : msg
      )
    );
  }

  /* =====================
     RENDER
   ===================== */
  return (
    <div className="chat-root changement">
      <button
        className="back-button-global"
        onClick={() => navigate("/")}
      >
        ←
      </button>

      <header className="chat-header">
        <h1>Changement de vie</h1>
        <span className="online">
          <span className="dot" /> {onlineCount} en ligne
        </span>
      </header>

      <main className="chat-stream" ref={streamRef}>
        <div className="secure-banner">
          Un espace pour traverser le changement a ton rythme.
        </div>

        {messages.map((m) => (
          <div key={m.id} className="message-row">
            <div
              className="bubble-wrapper"
              onClick={() =>
                setActiveMessage(activeMessage === m.id ? null : m.id)
              }
            >
              {m.type === "text" && (
                <>
                  <div className="bubble">{m.text}</div>
                  {m.translatedText && (
                    <div className="bubble translated">
                      {m.translatedText}
                    </div>
                  )}
                </>
              )}

              {m.type === "voice" && (
                <div className="bubble">
                  {m.text || "Ancien message vocal non disponible."}
                </div>
              )}

              <div className="meta">
                <span>{formatTime(m.createdAt)}</span>
                {m.editedAt && <span> (modifié)</span>}
              </div>

              {canEdit(m) && activeMessage === m.id && (
                <div className="actions">
                  <button
                    onClick={() => {
                      setInput(m.text ?? "");
                      setEditingId(m.id);
                    }}
                  >
                    ✏️
                  </button>
                  <button onClick={() => handleDelete(m.id)}>
                    🗑
                  </button>
                  <button onClick={() => translateMessage(m)}>
                    🌍
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </main>

      <footer className="chat-footer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={
            isAuth ? "Exprime ton changement…" : "Connexion requise"
          }
          disabled={!isAuth}
        />

        <button
          className="send-icon"
          onClick={handleSend}
          disabled={!isAuth}
        >
          ➤
        </button>
      </footer>
    </div>
  );
}
