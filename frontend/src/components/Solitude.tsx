// =====================
// IMPORTS
// =====================

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../lib/socket";
import { useTranslation } from "react-i18next";

import "../index.css";
import "../style/solitude.css";

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

type Note = {
  id: string;
  text: string;
  createdAt: number;
};

type SolitudeProps = {
  isAuth: boolean;
};

/* =====================
   CONSTANTES
===================== */

const ROOM = "solitude";
const EDIT_WINDOW = 20 * 60 * 1000;
const NOTE_DURATION = 24 * 60 * 60 * 1000;
const NOTE_KEY = "solitude_note";

/* =====================
   COMPONENT
===================== */

export default function Solitude({ isAuth }: SolitudeProps) {
  const navigate = useNavigate();
  useTranslation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
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
      })
      .catch(() => {});
  }, []);

  /* =====================
     LOAD NOTE
  ===================== */

  useEffect(() => {
    const saved = localStorage.getItem(NOTE_KEY);
    if (!saved) return;

    const parsed: Note = JSON.parse(saved);

    if (Date.now() - parsed.createdAt < NOTE_DURATION) {
      setNote(parsed);
    } else {
      localStorage.removeItem(NOTE_KEY);
    }
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
     DELETE
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
      body: JSON.stringify({ text: m.text, target: lang }),
    });

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
    <div className="chat-root solitude">
      <button
        className="back-button-global solitude"
        onClick={() => navigate("/")}
      >
        ←
      </button>

      <header className="chat-header">
        <h1>Solitude</h1>
        <div className="online">
          <span className="dot" /> {onlineCount} en ligne
        </div>
        <span className="sub">Un espace pour ne plus rester seul·e</span>
      </header>

      <main className="chat-stream" ref={streamRef}>
        <div className="secure-banner">
          Un espace pour parler sans rester seul face au silence.
        </div>

        {note && (
          <div className="pinned-note">
            <strong>Ma note (24h)</strong>
            <p>{note.text}</p>
          </div>
        )}

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
                    Modifier
                  </button>
                  <button
                    className="danger"
                    onClick={() => handleDelete(m.id)}
                  >
                    Supprimer
                  </button>
                  <button onClick={() => translateMessage(m)}>
                    Traduire
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
            isAuth
              ? "Exprimez ce que vous ressentez…"
              : "Connectez-vous pour participer"
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
