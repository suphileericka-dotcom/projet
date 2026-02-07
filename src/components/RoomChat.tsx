import { useEffect, useRef, useState } from "react";
import MicButton from "./MicButton";
import { useVoiceAnonymizer } from "../hooks/useVoiceAnonymizer";

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

export default function RoomChat({ room, title, subtitle, isAuth }: RoomChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);
  const { anonymize } = useVoiceAnonymizer();

  const userId = isAuth ? localStorage.getItem("userId") : null;

  useEffect(() => {
    // charge messages text si tu veux garder ton endpoint existant
    fetch(`http://localhost:8000/api/messages?room=${room}`)
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
      })
      .catch(() => {});
  }, [room]);

  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSendText() {
    if (!isAuth || !userId || !input.trim()) return;

    const res = await fetch("http://localhost:8000/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, userId, content: input }),
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

  // ✅ VOICE: ANONYMISATION OBLIGATOIRE
  async function onVoiceRecorded(audioUrlLocal: string) {
    if (!isAuth) return;

    // message pending (aucune lecture de voix humaine)
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

      // libère l’URL local du navigateur
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

      // (Optionnel) ici tu peux appeler TON backend /api/messages/audio-ai
      // pour sauvegarder transcript + audioPath en DB si tu veux
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
            {m.type === "text" && <div className="bubble">{m.text}</div>}

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
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Préparation audio…</div>
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
          placeholder={isAuth ? "Écris ton message…" : "Connexion requise"}
          disabled={!isAuth}
        />

        <button className="send-icon" onClick={handleSendText} disabled={!isAuth}>
          ➤
        </button>
      </footer>
    </div>
  );
}
