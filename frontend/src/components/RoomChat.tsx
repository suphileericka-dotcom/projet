import { useEffect, useRef, useState } from "react";
import { useLang } from "../hooks/useLang";

const API = import.meta.env.VITE_API_URL
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

export default function RoomChat({
  room,
  title,
  subtitle,
  isAuth,
}: RoomChatProps) {
  const { t } = useLang();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);

  const userId = isAuth ? localStorage.getItem("userId") : null;

  useEffect(() => {
    fetch(`${API}/messages?room=${room}`)
      .then((res) => res.json())
      .then((data) => {
        setMessages(
          data.map((message: any) => ({
            id: message.id,
            type: message.audio_path ? "voice" : "text",
            text:
              message.content ??
              (message.audio_path ? t("privateChatNoVisibleMessages") : ""),
            createdAt: message.created_at,
          }))
        );
      })
      .catch(() => {});
  }, [room, t]);

  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSendText() {
    if (!isAuth || !userId || !input.trim()) return;

    try {
      const res = await fetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, userId, content: input }),
      });

      if (!res.ok) throw new Error(t("groupMessageSendError"));

      const saved = await res.json();

      setMessages((current) => [
        ...current,
        {
          id: saved.id,
          type: "text",
          text: saved.content,
          createdAt: saved.createdAt ?? Date.now(),
        },
      ]);

      setInput("");
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div className="chat-root">
      <header className="chat-header">
        <h1>{title}</h1>
        {subtitle && <span className="sub">{subtitle}</span>}
      </header>

      <main className="chat-stream" ref={streamRef}>
        <div className="secure-banner">{t("burnoutBanner")}</div>

        {messages.map((message) => (
          <div key={message.id} className="message-row">
            {message.type === "text" && <div className="bubble">{message.text}</div>}

            {message.type === "voice" && (
              <div className="bubble">
                {message.text || t("privateChatNoVisibleMessages")}
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
          placeholder={isAuth ? t("chatPlaceholder") : t("typingDisabled")}
          disabled={!isAuth}
        />

        <button className="send-icon" onClick={handleSendText} disabled={!isAuth}>
          {">"}
        </button>
      </footer>
    </div>
  );
}
