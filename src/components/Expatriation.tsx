// =====================
// IMPORTS
// =====================

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MicButton from "./MicButton";
import "../style/expatriation.css";
import { socket } from "../lib/socket";
import { useTranslation } from "react-i18next";

// =====================
// TYPES
// =====================

type Message = {
  id: string;
  type: "text" | "voice";
  text?: string;
  audioUrl?: string;
  createdAt: number;
  editedAt?: number;
  translatedText?: string;
  pending?: boolean;
};

type ExpatriationProps = {
  isAuth: boolean;
};

// =====================
// CONSTANTES
// =====================

const ROOM = "expatriation";
const EDIT_WINDOW = 20 * 60 * 1000;

// =====================
// COMPONENT
// =====================

export default function Expatriation({ isAuth }: ExpatriationProps) {
  const navigate = useNavigate();

  // ✅ TS6133 FIX
  useTranslation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [activeMessage, setActiveMessage] = useState<string | null>(null);

  const userId = isAuth ? localStorage.getItem("userId") : null;
  const streamRef = useRef<HTMLDivElement>(null);

  // =====================
  // SOCKET
  // =====================

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

  // =====================
  // LOAD MESSAGES
  // =====================

  useEffect(() => {
    fetch(`http://localhost:8000/api/messages?room=${ROOM}`)
      .then((res) => res.json())
      .then((data) => {
        setMessages(
          data.map((m: any) => ({
            id: m.id,
            type: m.audio_path ? "voice" : "text",
            text: m.content ?? "",
            audioUrl: m.audio_path
              ? `http://localhost:8000/uploads/audio/${m.audio_path}`
              : undefined,
            createdAt: m.created_at,
          }))
        );
      });
  }, []);

  // =====================
  // AUTOSCROLL
  // =====================

  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // =====================
  // HELPERS
  // =====================

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

  // =====================
  // ACTIONS
  // =====================

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

    const res = await fetch("http://localhost:8000/api/messages", {
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

  async function handleDelete(id: string) {
    if (!userId) return;

    await fetch(
      `http://localhost:8000/api/messages/${id}?userId=${userId}`,
      { method: "DELETE" }
    );

    setMessages((msgs) => msgs.filter((m) => m.id !== id));
  }

  async function translateMessage(m: Message) {
    if (!m.text || m.translatedText) return;

    try {
      const lang = localStorage.getItem("lang") || "fr";

      const res = await fetch("http://localhost:8000/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: m.text,
          target: lang,
        }),
      });

      if (!res.ok) throw new Error("Backend translation failed");

      const data = await res.json();

      setMessages((msgs) =>
        msgs.map((msg) =>
          msg.id === m.id
            ? { ...msg, translatedText: data.translatedText }
            : msg
        )
      );
    } catch (err) {
      console.error("TRANSLATION ERROR:", err);
    }
  }

  // =====================
  // VOICE
  // =====================

  function onVoiceRecorded(audioUrl: string) {
    if (!isAuth) return;

    setMessages((msgs) => [
      ...msgs,
      {
        id: `local-${Date.now()}`,
        type: "voice",
        audioUrl,
        createdAt: Date.now(),
        pending: true,
      },
    ]);
  }

  function deleteLocalVoice(id: string) {
    setMessages((msgs) => msgs.filter((m) => m.id !== id));
  }

  async function sendVoice(m: Message) {
    if (!m.audioUrl || !userId) return;

    const blob = await fetch(m.audioUrl).then((r) => r.blob());

    const formData = new FormData();
    formData.append("audio", blob);
    formData.append("room", ROOM);
    formData.append("userId", userId);

    const res = await fetch("http://localhost:8000/api/messages/audio", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    setMessages((msgs) =>
      msgs.map((msg) =>
        msg.id === m.id
          ? {
              ...msg,
              id: data.id,
              audioUrl: data.audioUrl,
              createdAt: data.createdAt,
              pending: false,
            }
          : msg
      )
    );
  }

  // =====================
  // RENDER
  // =====================

  return (
    <div className="chat-root expatriation">
      <button className="back-button-global" onClick={() => navigate("/")}>
        ←
      </button>

      <header className="chat-header">
        <h1>Expatriation</h1>
        <span className="online">
          <span className="dot" /> {onlineCount} en ligne
        </span>
        <span className="sub">
          Un espace pour partager l’expérience de l’expatriation
        </span>
      </header>

      <main className="chat-stream" ref={streamRef}>
        <div className="secure-banner">
          Espace anonyme et bienveillant.
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
                  <audio controls src={m.audioUrl} />
                  {m.pending && (
                    <div className="actions">
                      <button onClick={() => sendVoice(m)}>Envoyer</button>
                      <button onClick={() => deleteLocalVoice(m.id)}>
                        Supprimer
                      </button>
                    </div>
                  )}
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
                  <button onClick={() => handleDelete(m.id)}>🗑</button>
                  <button onClick={() => translateMessage(m)}>🌍</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </main>

      <footer className="chat-footer">
        <MicButton onVoiceRecorded={onVoiceRecorded} />

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isAuth
              ? "Exprime ton ressenti d’expatriation…"
              : "Connexion requise"
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
