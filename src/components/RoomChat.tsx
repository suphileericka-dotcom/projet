import { useEffect, useRef, useState } from "react";
import MicButton from "./MicButton";
import { useVoiceAnonymizer } from "../hooks/useVoiceAnonymizer";

/* =====================
   API BASE
===================== */
const API =
  import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : "http://localhost:8000/api";

const UPLOADS =
  import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/uploads`
    : "http://localhost:8000/uploads";

/* =====================
   TYPES
===================== */
type Message = {
  id: string;
  type: "text" | "voice";
  text?: string;
  audioUrl?: string;
  createdAt: number;
  pending?: boolean;
  isAI?: boolean;
  transcript?: string;
};

type RoomChatProps = {
  room: string;
  title: string;
  subtitle?: string;
  isAuth: boolean;
};

/* =====================
   COMPONENT
===================== */
export default function RoomChat({
  room,
  title,
  subtitle,
  isAuth,
}: RoomChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);
  const { anonymize } = useVoiceAnonymizer();

  const userId = isAuth ? localStorage.getItem("userId") : null;

  /* =====================
     LOAD MESSAGES
  ===================== */
  useEffect(() => {
    fetch(`${API}/messages?room=${room}`)
      .then((res) => res.json())
      .then((data) => {
        setMessages(
          data.map((m: any) => ({
            id: m.id,
            type: m.audio_path ? "voice" : "text",
            text: m.content ?? "",
            audioUrl: m.audio_path
              ? `${UPLOADS}/audio/${m.audio_path}`
              : undefined,
            createdAt: m.created_at,
          }))
        );
      })
      .catch(() => {});
  }, [room]);

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
     SEND TEXT
  ===================== */
  async function handleSendText() {
    if (!isAuth || !userId || !input.trim()) return;

    try {
      const res = await fetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, userId, content: input }),
      });

      if (!res.ok) throw new Error("Erreur envoi");

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
    } catch (e) {
      console.error(e);
    }
  }

  /* =====================
     VOICE (ANONYMISATION)
  ===================== */
  async function onVoiceRecorded(audioUrlLocal: string) {
    if (!isAuth) return;

    const tempId = `pending-${Date.now()}`;

    setMessages((msgs) => [
      ...msgs,
      {
        id: tempId,
        type: "voice",
        createdAt: Date.now(),
        pending: true,
        isAI: true,
        transcript: "Anonymisation en cours…",
      },
    ]);

    try {
      const data = await anonymize(audioUrlLocal);

      URL.revokeObjectURL(audioUrlLocal);

      setMessages((msgs) =>
        msgs.map((m) =>
          m.id === tempId
            ? {
                ...m,
                pending: false,
                audioUrl: data.audioUrl,
                transcript: data.transcript,
              }
            : m
        )
      );

      // 🔥 OPTIONNEL : sauvegarde backend
      /*
      await fetch(`${API}/messages/audio-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room,
          userId,
          transcript: data.transcript,
          audioUrl: data.audioUrl,
        }),
      });
      */
    } catch (e) {
      console.error(e);

      setMessages((msgs) =>
        msgs.map((m) =>
          m.id === tempId
            ? {
                ...m,
                pending: false,
                transcript: "Erreur d’anonymisation",
              }
            : m
        )
      );
    }
  }

  /* =====================
     RENDER
  ===================== */
  return (
    <div className="chat-root">
      <header className="chat-header">
        <h1>{title}</h1>
        {subtitle && <span className="sub">{subtitle}</span>}
      </header>

      <main className="chat-stream" ref={streamRef}>
        <div className="secure-banner">
          🔒 Pour garantir l’anonymat, les messages vocaux sont transformés en voix IA.
        </div>

        {messages.map((m) => (
          <div key={m.id} className="message-row">
            {m.type === "text" && (
              <div className="bubble">{m.text}</div>
            )}

            {m.type === "voice" && (
              <div className="bubble">
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                  🤖 Voix IA {m.pending ? "(en cours…)" : ""}
                </div>

                {m.transcript && (
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                    {m.transcript}
                  </div>
                )}

                {m.audioUrl ? (
                  <audio controls src={m.audioUrl} />
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Préparation audio…
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </main>

      <footer className="chat-footer">
        <MicButton onVoiceRecorded={onVoiceRecorded} />

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendText()}
          placeholder={
            isAuth ? "Écris ton message…" : "Connexion requise"
          }
          disabled={!isAuth}
        />

        <button
          className="send-icon"
          onClick={handleSendText}
          disabled={!isAuth}
        >
          ➤
        </button>
      </footer>
    </div>
  );
}
