import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import "../index.css";
import "../style/groupChat.css";
import { API } from "../config/api";
import { socket } from "../lib/socket";
import {
  type ChatMessage,
  type EphemeralNote,
  areMessageListsEqual,
  canManageMessage,
  extractMessageId,
  extractTypingMeta,
  formatMessageTime,
  formatOnlineCount,
  matchesRoomPayload,
  mergeLocalMessageState,
  normalizeMessage,
  normalizeMessageList,
  pruneExpiredMessages,
  removeMessageById,
  upsertMessage,
} from "../lib/groupChat";

const messageEvents = [
  "message-created",
  "new-message",
  "room-message",
  "chat-message",
  "message",
] as const;

const updateEvents = [
  "message-updated",
  "edited-message",
  "update-message",
] as const;

const deleteEvents = [
  "message-deleted",
  "removed-message",
  "delete-message",
] as const;

const typingEvents = [
  "typing",
  "typing-start",
  "typing-stop",
  "typing-status",
  "user-typing",
] as const;

type TypingUser = {
  key: string;
  name: string;
  expiresAt: number;
};

type GroupRoomTheme = CSSProperties & Record<`--${string}`, string>;

export type GroupRoomConfig = {
  room: string;
  title: string;
  subtitle?: string;
  banner: string;
  placeholder: string;
  theme: GroupRoomTheme;
  noteStorageKey?: string;
  noteLabel?: string;
};

type GroupChatRoomProps = {
  isAuth: boolean;
  config: GroupRoomConfig;
};

function buildJsonHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function buildAuthHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export default function GroupChatRoom({
  isAuth,
  config,
}: GroupChatRoomProps) {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");
  const userId = isAuth ? localStorage.getItem("userId") : null;
  const currentAvatar = localStorage.getItem("avatar");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [note, setNote] = useState<EphemeralNote | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Math.round(window.visualViewport?.height || window.innerHeight);
  });
  const [currentUsername, setCurrentUsername] = useState(() => {
    const storedUsername = localStorage.getItem("username")?.trim();
    return storedUsername && storedUsername.toLowerCase() !== "moi"
      ? storedUsername
      : "";
  });

  const streamRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);
  const effectiveUsername = currentUsername || "Utilisateur";

  const editingMessage =
    (editingId && messages.find((message) => message.id === editingId)) || null;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncViewportHeight = () => {
      setViewportHeight(
        Math.round(window.visualViewport?.height || window.innerHeight)
      );
    };

    syncViewportHeight();

    window.addEventListener("resize", syncViewportHeight);
    window.visualViewport?.addEventListener("resize", syncViewportHeight);
    window.visualViewport?.addEventListener("scroll", syncViewportHeight);

    return () => {
      window.removeEventListener("resize", syncViewportHeight);
      window.visualViewport?.removeEventListener("resize", syncViewportHeight);
      window.visualViewport?.removeEventListener("scroll", syncViewportHeight);
    };
  }, []);

  useEffect(() => {
    if (!userId || currentUsername) return;

    const ownMessage = messages.find(
      (message) =>
        message.sender.id === userId &&
        message.sender.name.trim().length > 0 &&
        message.sender.name.toLowerCase() !== "moi" &&
        message.sender.name.toLowerCase() !== "utilisateur"
    );

    if (!ownMessage) return;

    setCurrentUsername(ownMessage.sender.name);
    localStorage.setItem("username", ownMessage.sender.name);
  }, [currentUsername, messages, userId]);

  useEffect(() => {
    if (!flashMessage) return undefined;

    const timeoutId = window.setTimeout(() => {
      setFlashMessage(null);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [flashMessage]);

  useEffect(() => {
    if (!config.noteStorageKey) return;

    const saved = localStorage.getItem(config.noteStorageKey);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as EphemeralNote;
      if (Date.now() - parsed.createdAt < 24 * 60 * 60 * 1000) {
        setNote(parsed);
      } else {
        localStorage.removeItem(config.noteStorageKey);
      }
    } catch {
      localStorage.removeItem(config.noteStorageKey);
    }
  }, [config.noteStorageKey]);

  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typingUsers.length]);

  useEffect(() => {
    const pruneTimer = window.setInterval(() => {
      setMessages((current) => pruneExpiredMessages(current));
      setTypingUsers((current) =>
        current.filter((entry) => entry.expiresAt > Date.now())
      );

      if (note && Date.now() - note.createdAt >= 24 * 60 * 60 * 1000) {
        setNote(null);
        if (config.noteStorageKey) {
          localStorage.removeItem(config.noteStorageKey);
        }
      }
    }, 30_000);

    return () => window.clearInterval(pruneTimer);
  }, [config.noteStorageKey, note]);

  useEffect(() => {
    if (!activeMessageId) return;
    if (messages.some((message) => message.id === activeMessageId)) return;
    setActiveMessageId(null);
  }, [activeMessageId, messages]);

  const applyServerMessages = useCallback(
    (payload: unknown) => {
      const normalized = normalizeMessageList(payload, config.room, {
        currentUserId: userId,
        currentUsername: effectiveUsername,
        currentAvatar,
      });

      setMessages((current) => {
        const next = mergeLocalMessageState(normalized, current);
        return areMessageListsEqual(current, next) ? current : next;
      });
    },
    [config.room, currentAvatar, effectiveUsername, userId]
  );

  const refreshMessages = useCallback(async () => {
    try {
      const response = await fetch(
        `${API}/messages?room=${encodeURIComponent(config.room)}`,
        {
          headers: buildAuthHeaders(token),
        }
      );

      if (!response.ok) return;

      const payload = await safeJson(response);
      applyServerMessages(payload);
    } catch {
      // ignore network spikes during polling
    }
  }, [applyServerMessages, config.room, token]);

  useEffect(() => {
    void refreshMessages();
  }, [refreshMessages]);

  useEffect(() => {
    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshMessages();
      }
    }, 4000);

    return () => window.clearInterval(pollId);
  }, [refreshMessages]);

  const syncOnlineCount = useCallback(
    (payload: unknown) => {
      if (!matchesRoomPayload(payload, config.room)) return;

      const record =
        payload !== null && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : null;

      const countValue =
        typeof record?.count === "number"
          ? record.count
          : typeof record?.onlineCount === "number"
            ? record.onlineCount
            : typeof record?.participants === "number"
              ? record.participants
              : typeof record?.total === "number"
                ? record.total
                : null;

      if (typeof countValue === "number") {
        setOnlineCount(countValue);
      }
    },
    [config.room]
  );

  const handleSocketMessage = useCallback(
    (payload: unknown) => {
      if (!matchesRoomPayload(payload, config.room)) return;

      const normalized = normalizeMessage(payload, config.room, {
        currentUserId: userId,
        currentUsername: effectiveUsername,
        currentAvatar,
      });

      if (!normalized) {
        void refreshMessages();
        return;
      }

      setMessages((current) => {
        const existing = current.find((message) => message.id === normalized.id);
        const next = upsertMessage(current, {
          ...normalized,
          translatedText: existing?.translatedText,
        });

        return areMessageListsEqual(current, next) ? current : next;
      });
    },
    [config.room, currentAvatar, effectiveUsername, refreshMessages, userId]
  );

  const handleSocketDelete = useCallback(
    (payload: unknown) => {
      if (!matchesRoomPayload(payload, config.room)) return;

      const messageId = extractMessageId(payload);
      if (!messageId) {
        void refreshMessages();
        return;
      }

      setMessages((current) => removeMessageById(current, messageId));
    },
    [config.room, refreshMessages]
  );

  const handleSocketTyping = useCallback(
    (payload: unknown) => {
      if (!matchesRoomPayload(payload, config.room)) return;

      const meta = extractTypingMeta(payload);
      if (!meta) return;
      if (meta.userId && meta.userId === userId) return;

      const key = meta.userId || meta.name;
      const knownAuthorName =
        messagesRef.current.find((message) => message.sender.id === meta.userId)
          ?.sender.name || "";
      const resolvedTypingName =
        meta.name.trim().length > 0 &&
        meta.name.toLowerCase() !== "moi" &&
        meta.name.toLowerCase() !== "utilisateur"
          ? meta.name
          : knownAuthorName || "Utilisateur";

      if (!meta.isTyping) {
        setTypingUsers((current) => current.filter((entry) => entry.key !== key));
        return;
      }

      setTypingUsers((current) => {
        const next = current.filter((entry) => entry.key !== key);
        next.push({
          key,
          name: resolvedTypingName,
          expiresAt: Date.now() + 3200,
        });
        return next;
      });
    },
    [config.room, userId]
  );

  useEffect(() => {
    if (!isAuth || !userId) return undefined;

    const joinRoom = () => {
      socket.emit("join-room", {
        room: config.room,
        userId,
        username: effectiveUsername,
      });
    };

    const stopTyping = () => {
      const payload = {
        room: config.room,
        userId,
        username: effectiveUsername,
        isTyping: false,
        typing: false,
      };

      socket.emit("typing", payload);
      socket.emit("typing-stop", payload);
    };

    if (!socket.connected) {
      socket.connect();
    }

    socket.on("connect", joinRoom);
    socket.on("online-count", syncOnlineCount);
    messageEvents.forEach((eventName) => socket.on(eventName, handleSocketMessage));
    updateEvents.forEach((eventName) => socket.on(eventName, handleSocketMessage));
    deleteEvents.forEach((eventName) => socket.on(eventName, handleSocketDelete));
    typingEvents.forEach((eventName) => socket.on(eventName, handleSocketTyping));

    if (socket.connected) {
      joinRoom();
    }

    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }

      typingSentRef.current = false;
      stopTyping();

      socket.off("connect", joinRoom);
      socket.off("online-count", syncOnlineCount);
      messageEvents.forEach((eventName) => socket.off(eventName, handleSocketMessage));
      updateEvents.forEach((eventName) => socket.off(eventName, handleSocketMessage));
      deleteEvents.forEach((eventName) => socket.off(eventName, handleSocketDelete));
      typingEvents.forEach((eventName) => socket.off(eventName, handleSocketTyping));
      socket.emit("leave-room", { room: config.room, userId });
      socket.disconnect();
    };
  }, [
    config.room,
    effectiveUsername,
    handleSocketDelete,
    handleSocketMessage,
    handleSocketTyping,
    isAuth,
    syncOnlineCount,
    userId,
  ]);

  function emitTypingState(isTyping: boolean) {
    if (!isAuth || !userId || !socket.connected) return;

    const payload = {
      room: config.room,
      userId,
      username: effectiveUsername,
      isTyping,
      typing: isTyping,
    };

    socket.emit("typing", payload);
    socket.emit(isTyping ? "typing-start" : "typing-stop", payload);
  }

  function clearTypingState() {
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (typingSentRef.current) {
      emitTypingState(false);
      typingSentRef.current = false;
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setInput(nextValue);

    if (!isAuth || !userId) return;

    if (!nextValue.trim()) {
      clearTypingState();
      return;
    }

    if (!typingSentRef.current) {
      emitTypingState(true);
      typingSentRef.current = true;
    }

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      emitTypingState(false);
      typingSentRef.current = false;
      typingTimeoutRef.current = null;
    }, 1600);
  }

  function startEditingMessage(message: ChatMessage) {
    setInput(message.text);
    setEditingId(message.id);
    setActiveMessageId(null);
    setFlashMessage(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelEditing() {
    setEditingId(null);
    setInput("");
    setFlashMessage(null);
  }

  async function handleSend() {
    const trimmedInput = input.trim();
    if (!trimmedInput || !isAuth || !userId || isSubmitting) return;

    clearTypingState();
    setIsSubmitting(true);
    setFlashMessage(null);

    if (editingId) {
      const previous = messages.find((message) => message.id === editingId);
      if (!previous) {
        cancelEditing();
        setIsSubmitting(false);
        return;
      }

      const optimisticMessage: ChatMessage = {
        ...previous,
        text: trimmedInput,
        editedAt: Date.now(),
        updatedAt: Date.now(),
      };

      setMessages((current) => upsertMessage(current, optimisticMessage));
      setInput("");
      setEditingId(null);

      try {
        let successPayload: unknown = null;
        let isSaved = false;

        for (const method of ["PATCH", "PUT"]) {
          const response = await fetch(
            `${API}/messages/${editingId}?userId=${encodeURIComponent(userId)}`,
            {
              method,
              headers: buildJsonHeaders(token),
              body: JSON.stringify({
                room: config.room,
                userId,
                content: trimmedInput,
                text: trimmedInput,
              }),
            }
          );

          if (response.ok) {
            successPayload = await safeJson(response);
            isSaved = true;
            break;
          }
        }

        if (!isSaved) {
          setMessages((current) => upsertMessage(current, previous));
          setInput(trimmedInput);
          setEditingId(editingId);
          setFlashMessage("Impossible de modifier ce message pour le moment.");
          return;
        }

        const normalized = normalizeMessage(successPayload, config.room, {
          currentUserId: userId,
          currentUsername: effectiveUsername,
          currentAvatar,
        });

        if (normalized) {
          setMessages((current) =>
            upsertMessage(current, {
              ...normalized,
              translatedText: previous.translatedText,
            })
          );
        } else {
          await refreshMessages();
        }
      } catch {
        setMessages((current) => upsertMessage(current, previous));
        setInput(trimmedInput);
        setEditingId(editingId);
        setFlashMessage("Impossible de modifier ce message pour le moment.");
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    try {
      const response = await fetch(`${API}/messages`, {
        method: "POST",
        headers: buildJsonHeaders(token),
        body: JSON.stringify({
          room: config.room,
          userId,
          username: effectiveUsername,
          content: trimmedInput,
        }),
      });

      if (!response.ok) {
        throw new Error("send_failed");
      }

      const payload = await safeJson(response);
      const normalized = normalizeMessage(payload, config.room, {
        currentUserId: userId,
        currentUsername: effectiveUsername,
        currentAvatar,
      });

      if (normalized) {
        setMessages((current) => upsertMessage(current, normalized));
      } else {
        await refreshMessages();
      }

      setInput("");
      setActiveMessageId(null);
    } catch {
      setFlashMessage("Impossible d'envoyer le message pour le moment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(message: ChatMessage) {
    if (!userId) return;
    if (!window.confirm("Supprimer ce message pour tout le monde ?")) return;

    const snapshot = message;

    setMessages((current) => removeMessageById(current, message.id));
    setActiveMessageId(null);

    if (editingId === message.id) {
      cancelEditing();
    }

    try {
      const response = await fetch(
        `${API}/messages/${message.id}?userId=${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers: buildAuthHeaders(token),
        }
      );

      if (!response.ok) {
        throw new Error("delete_failed");
      }
    } catch {
      setMessages((current) => upsertMessage(current, snapshot));
      setFlashMessage("Impossible de supprimer ce message pour le moment.");
    }
  }

  async function handleTranslate(message: ChatMessage) {
    if (message.type !== "text" || message.translatedText || !message.text) return;

    try {
      const target = localStorage.getItem("language") || "fr";
      const response = await fetch(`${API}/translate`, {
        method: "POST",
        headers: buildJsonHeaders(token),
        body: JSON.stringify({
          text: message.text,
          target,
        }),
      });

      if (!response.ok) {
        throw new Error("translate_failed");
      }

      const payload = await safeJson(response);
      const translatedText =
        payload !== null &&
        typeof payload === "object" &&
        typeof (payload as Record<string, unknown>).translatedText === "string"
          ? String((payload as Record<string, unknown>).translatedText)
          : null;

      if (!translatedText) return;

      setMessages((current) =>
        current.map((entry) =>
          entry.id === message.id
            ? {
                ...entry,
                translatedText,
              }
            : entry
        )
      );
      setActiveMessageId(null);
    } catch {
      setFlashMessage("Traduction indisponible pour le moment.");
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  const visibleTypingUsers = typingUsers.filter(
    (entry) => entry.expiresAt > Date.now()
  );

  const typingLabel =
    visibleTypingUsers.length === 0
      ? null
      : visibleTypingUsers.length === 1
        ? `${visibleTypingUsers[0].name} ecrit...`
        : visibleTypingUsers.length === 2
          ? `${visibleTypingUsers[0].name} et ${visibleTypingUsers[1].name} ecrivent...`
          : `${visibleTypingUsers.length} personnes ecrivent...`;

  const groupChatStyle: GroupRoomTheme = {
    ...config.theme,
    "--chat-viewport-height": `${viewportHeight}px`,
  };

  return (
    <div className="group-chat" style={groupChatStyle}>
      <div className="group-chat__shell">
        <header className="group-chat__header">
          <button
            type="button"
            className="group-chat__back"
            onClick={() => navigate("/")}
            aria-label="Retour a l'accueil"
          >
            {"<"}
          </button>

          <div className="group-chat__heading">
            <h1>{config.title}</h1>
            <div className="group-chat__presence">
              <span className="group-chat__presence-dot" aria-hidden="true" />
              <span>{formatOnlineCount(onlineCount)}</span>
            </div>
            {config.subtitle ? (
              <p className="group-chat__subtitle">{config.subtitle}</p>
            ) : null}
          </div>
        </header>

        {flashMessage ? (
          <div className="group-chat__flash" role="status">
            {flashMessage}
          </div>
        ) : null}

        <main className="group-chat__stream" ref={streamRef}>
          <div className="group-chat__banner">{config.banner}</div>

          {note ? (
            <section className="group-chat__note">
              <strong>{config.noteLabel || "Note ephemere"}</strong>
              <p>{note.text}</p>
            </section>
          ) : null}

          {messages.length === 0 ? (
            <div className="group-chat__empty">
              Les messages s'effacent de l'ecran apres 24h. Lance la discussion.
            </div>
          ) : null}

          {messages.map((message) => {
            const isOwnMessage = !!userId && message.sender.id === userId;
            const canManage = canManageMessage(message, userId);
            const showActions =
              activeMessageId === message.id &&
              ((canManage && message.type === "text") ||
                (!!message.text && message.type === "text"));
            const messageTime = formatMessageTime(message.createdAt);
            const authorLabel =
              message.sender.name.trim().length > 0
                ? message.sender.name
                : effectiveUsername;

            return (
              <article
                key={message.id}
                className={`group-chat__message ${
                  isOwnMessage ? "is-own" : "is-other"
                }`}
              >
                {!isOwnMessage ? (
                  <img
                    className="group-chat__avatar"
                    src={message.sender.avatar}
                    alt={message.sender.name}
                  />
                ) : null}

                <div className="group-chat__message-main">
                  <button
                    type="button"
                    className={`group-chat__bubble-card ${
                      isOwnMessage ? "is-own" : "is-other"
                    } ${showActions ? "is-active" : ""}`}
                    onClick={() =>
                      setActiveMessageId((current) =>
                        current === message.id ? null : message.id
                      )
                    }
                    >
                    <div className="group-chat__message-head">
                      <span className="group-chat__author">{authorLabel}</span>
                    </div>

                    <div className="group-chat__bubble">{message.text}</div>

                    {message.translatedText ? (
                      <div className="group-chat__translated">
                        {message.translatedText}
                      </div>
                    ) : null}

                    <div className="group-chat__meta">
                      {messageTime ? <span>{messageTime}</span> : null}
                      {message.editedAt ? <span>modifie</span> : null}
                    </div>
                  </button>

                  {showActions ? (
                    <div
                      className={`group-chat__actions ${
                        isOwnMessage ? "is-own" : "is-other"
                      }`}
                    >
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => startEditingMessage(message)}
                        >
                          Modifier
                        </button>
                      ) : null}

                      {canManage ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleDelete(message)}
                        >
                          Supprimer
                        </button>
                      ) : null}

                      {!message.translatedText && message.type === "text" ? (
                        <button
                          type="button"
                          onClick={() => handleTranslate(message)}
                        >
                          Traduire
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {isOwnMessage ? (
                  <img
                    className="group-chat__avatar"
                    src={message.sender.avatar}
                    alt={authorLabel}
                  />
                ) : null}
              </article>
            );
          })}

          {typingLabel ? (
            <div className="group-chat__typing" aria-live="polite">
              <span className="group-chat__typing-indicator" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span>{typingLabel}</span>
            </div>
          ) : null}
        </main>

        <footer className="group-chat__footer">
          {editingMessage ? (
            <div className="group-chat__editing">
              <span>Modification du message en cours.</span>
              <button type="button" onClick={cancelEditing}>
                Annuler
              </button>
            </div>
          ) : null}

          <div className="group-chat__composer">
            <input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              placeholder={
                isAuth ? config.placeholder : "Connexion requise pour participer"
              }
              disabled={!isAuth || isSubmitting}
            />

            <button
              type="button"
              className="group-chat__send"
              onClick={() => void handleSend()}
              disabled={!isAuth || !input.trim() || isSubmitting}
            >
              {editingId ? "OK" : "Envoyer"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
