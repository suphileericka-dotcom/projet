import { useEffect, useRef, useState } from "react";

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
            text: m.content ?? (m.audio_path ? "Ancien message vocal non disponible." : ""),
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
          Un espace anonyme pour partager a ton rythme, en toute simplicite.
        </div>

        {messages.map((m) => (
          <div key={m.id} className="message-row">
            {m.type === "text" && (
              <div className="bubble">{m.text}</div>
            )}

            {m.type === "voice" && (
              <div className="bubble">
                {m.text || "Ancien message vocal non disponible."}
              </div>
            )}
          </div>
        ))}
      </main>

      <footer className="chat-footer">
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
