import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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
import { useLang } from "../hooks/useLang";
import { buildPrivateChatPath } from "../lib/dmCheckout";
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

const MESSAGE_FETCH_LIMIT = 40;
const MESSAGE_RENDER_BATCH = 30;
const MESSAGE_RECENT_CAP = 200;

type TypingUser = {
  key: string;
  name: string;
  expiresAt: number;
};

type ChatProfile = {
  id: string;
  name: string;
  avatar: string;
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

function keepRecentMessages(
  messages: ChatMessage[],
  limit = MESSAGE_RECENT_CAP
): ChatMessage[] {
  return messages.length > limit ? messages.slice(-limit) : messages;
}

function buildMessagesUrl(
  room: string,
  options: {
    before?: ChatMessage | null;
    limit?: number;
  } = {}
): string {
  const params = new URLSearchParams({
    room,
    limit: String(options.limit ?? MESSAGE_FETCH_LIMIT),
  });

  if (options.before) {
    params.set("before", String(options.before.createdAt));
    params.set("beforeId", options.before.id);
  }

  return `${API}/messages?${params}`;
}

export default function GroupChatRoom({
  isAuth,
  config,
}: GroupChatRoomProps) {
  const navigate = useNavigate();
  const { t } = useLang();
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
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [visibleMessageCount, setVisibleMessageCount] = useState(
    MESSAGE_RENDER_BATCH
  );
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ChatProfile | null>(null);
  const [isProfileActionLoading, setIsProfileActionLoading] = useState(false);
  const [currentUsername, setCurrentUsername] = useState(() => {
    const storedUsername = localStorage.getItem("username")?.trim();
    return storedUsername && storedUsername.toLowerCase() !== "moi"
      ? storedUsername
      : "";
  });

  const streamRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const pendingScrollRestoreRef = useRef<{
    height: number;
    top: number;
  } | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);
  const effectiveUsername = currentUsername || t("member");

  const editingMessage =
    (editingId && messages.find((message) => message.id === editingId)) || null;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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

  const visibleMessages = useMemo(
    () => messages.slice(Math.max(0, messages.length - visibleMessageCount)),
    [messages, visibleMessageCount]
  );

  const hiddenLoadedMessageCount = Math.max(
    0,
    messages.length - visibleMessageCount
  );

  useLayoutEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const pendingScrollRestore = pendingScrollRestoreRef.current;
    if (pendingScrollRestore) {
      stream.scrollTop =
        pendingScrollRestore.top +
        (stream.scrollHeight - pendingScrollRestore.height);
      pendingScrollRestoreRef.current = null;
      return;
    }

    stream.scrollTo({
      top: stream.scrollHeight,
      behavior: "smooth",
    });
  }, [typingUsers.length, visibleMessages.length]);

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
    (payload: unknown, options?: { appendOlder?: boolean }) => {
      const normalized = normalizeMessageList(payload, config.room, {
        currentUserId: userId,
        currentUsername: effectiveUsername,
        currentAvatar,
      });

      let didAddOlderMessages = false;
      let nextHasOlderMessages = false;

      setMessages((current) => {
        const merged = options?.appendOlder
          ? mergeLocalMessageState([...normalized, ...current], current)
          : mergeLocalMessageState([...current, ...normalized], current);
        const next = options?.appendOlder ? merged : keepRecentMessages(merged);

        if (options?.appendOlder) {
          const oldestBefore = current[0]?.createdAt ?? Number.POSITIVE_INFINITY;
          const oldestAfter = next[0]?.createdAt ?? oldestBefore;
          didAddOlderMessages =
            next.length > current.length || oldestAfter < oldestBefore;
          nextHasOlderMessages =
            didAddOlderMessages && normalized.length >= MESSAGE_FETCH_LIMIT;
        } else {
          nextHasOlderMessages = normalized.length >= MESSAGE_FETCH_LIMIT;
        }

        return areMessageListsEqual(current, next) ? current : next;
      });

      setHasOlderMessages(nextHasOlderMessages);
      return options?.appendOlder ? didAddOlderMessages : normalized.length > 0;
    },
    [config.room, currentAvatar, effectiveUsername, userId]
  );

  const refreshMessages = useCallback(
    async (options?: { before?: ChatMessage | null }) => {
      try {
        const response = await fetch(
          buildMessagesUrl(config.room, {
            before: options?.before ?? null,
          }),
          {
            headers: buildAuthHeaders(token),
          }
        );

        if (!response.ok) return false;

        const payload = await safeJson(response);
        return applyServerMessages(payload, {
          appendOlder: Boolean(options?.before),
        });
      } catch {
        return false;
      }
    },
    [applyServerMessages, config.room, token]
  );

  useEffect(() => {
    void refreshMessages();
  }, [refreshMessages]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void refreshMessages();
    };

    const handleOnline = () => {
      void refreshMessages();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
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
        try {
        void refreshMessages();
        } catch {
          // ignore socket fallback refresh issues
        }
        return;
      }

      setMessages((current) => {
        const existing = current.find((message) => message.id === normalized.id);
        const next = keepRecentMessages(
          upsertMessage(current, {
            ...normalized,
            translatedText: existing?.translatedText,
          })
        );

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
          : knownAuthorName || t("member");

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

    const connectAndRefresh = () => {
      joinRoom();
      void refreshMessages();
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

    socket.on("connect", connectAndRefresh);
    socket.on("online-count", syncOnlineCount);
    messageEvents.forEach((eventName) => socket.on(eventName, handleSocketMessage));
    updateEvents.forEach((eventName) => socket.on(eventName, handleSocketMessage));
    deleteEvents.forEach((eventName) => socket.on(eventName, handleSocketDelete));
    typingEvents.forEach((eventName) => socket.on(eventName, handleSocketTyping));

    if (socket.connected) {
      connectAndRefresh();
    }

    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }

      typingSentRef.current = false;
      stopTyping();

      socket.off("connect", connectAndRefresh);
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
    refreshMessages,
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

  function preserveScrollPosition() {
    const stream = streamRef.current;
    if (!stream) return;

    pendingScrollRestoreRef.current = {
      height: stream.scrollHeight,
      top: stream.scrollTop,
    };
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

      setMessages((current) =>
        keepRecentMessages(upsertMessage(current, optimisticMessage))
      );
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
          setFlashMessage(t("groupMessageEditError"));
          return;
        }

        const normalized = normalizeMessage(successPayload, config.room, {
          currentUserId: userId,
          currentUsername: effectiveUsername,
          currentAvatar,
        });

        if (normalized) {
          setMessages((current) =>
            keepRecentMessages(
              upsertMessage(current, {
                ...normalized,
                translatedText: previous.translatedText,
              })
            )
          );
        } else {
          await refreshMessages();
        }
      } catch {
        setMessages((current) => upsertMessage(current, previous));
        setInput(trimmedInput);
        setEditingId(editingId);
        setFlashMessage(t("groupMessageEditError"));
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
        setMessages((current) =>
          keepRecentMessages(upsertMessage(current, normalized))
        );
      } else {
        await refreshMessages();
      }

      setInput("");
      setActiveMessageId(null);
    } catch {
      setFlashMessage(t("groupMessageSendError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(message: ChatMessage) {
    if (!userId) return;
    if (!window.confirm(t("groupMessageDeleteConfirm"))) return;

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
      setFlashMessage(t("groupMessageDeleteError"));
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
      setFlashMessage(t("groupTranslateError"));
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  async function handleLoadOlderMessages() {
    if (isLoadingHistory) return;

    if (hiddenLoadedMessageCount > 0) {
      preserveScrollPosition();
      setVisibleMessageCount((current) =>
        Math.min(messages.length, current + MESSAGE_RENDER_BATCH)
      );
      return;
    }

    if (!hasOlderMessages || messages.length === 0) return;

    preserveScrollPosition();
    setIsLoadingHistory(true);

    try {
      const loadedOlderMessages = await refreshMessages({
        before: messages[0],
      });

      if (!loadedOlderMessages) {
        setHasOlderMessages(false);
        return;
      }

      setVisibleMessageCount((current) => current + MESSAGE_RENDER_BATCH);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  function toggleMessageActions(messageId: string) {
    setActiveMessageId((current) => (current === messageId ? null : messageId));
  }

  function handleBubbleCardKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    messageId: string
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleMessageActions(messageId);
  }

  function openProfileCard(message: ChatMessage) {
    if (!message.sender.id) return;
    if (message.sender.id === userId) return;

    setSelectedProfile({
      id: message.sender.id,
      name: message.sender.name || t("member"),
      avatar: message.sender.avatar,
    });
    setActiveMessageId(null);
    setFlashMessage(null);
  }

  function closeProfileCard() {
    setSelectedProfile(null);
    setIsProfileActionLoading(false);
  }

  function openPrivateChatFromProfile(profile: ChatProfile) {
    if (isProfileActionLoading) return;

    closeProfileCard();

    if (!token) {
      navigate("/login");
      return;
    }

    navigate(buildPrivateChatPath(profile.id));
  }

  async function addFriendFromProfile(profile: ChatProfile) {
    if (!token || isProfileActionLoading) return;

    const requestBody = JSON.stringify({
      targetUserId: profile.id,
      friendId: profile.id,
    });

    const candidates = [
      `${API}/friends`,
      `${API}/friends/request`,
      `${API}/friends/requests`,
      `${API}/friends/add`,
    ];

    setIsProfileActionLoading(true);

    try {
      for (const endpoint of candidates) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: buildJsonHeaders(token),
          body: requestBody,
        });

        if (response.ok) {
          closeProfileCard();
          setFlashMessage(t("groupFriendRequestSent", { name: profile.name }));
          return;
        }

        if (response.status === 409) {
          closeProfileCard();
          setFlashMessage(t("groupFriendRequestExists", { name: profile.name }));
          return;
        }

        if (response.status !== 404 && response.status !== 405) {
          const payload = await safeJson(response);
          const message =
            payload !== null &&
            typeof payload === "object" &&
            typeof (payload as Record<string, unknown>).error === "string"
              ? String((payload as Record<string, unknown>).error)
              : null;

          throw new Error(message || t("groupFriendRequestUnavailable"));
        }
      }

      throw new Error(t("groupFriendRequestUnavailable"));
    } catch (error) {
      closeProfileCard();
      setFlashMessage(
        error instanceof Error && error.message
          ? error.message
          : t("groupFriendRequestUnavailable")
      );
    }
  }

  function readStoriesFromProfile(profile: ChatProfile) {
    closeProfileCard();
    navigate(
      `/stories?author=${encodeURIComponent(profile.id)}&authorName=${encodeURIComponent(
        profile.name
      )}`
    );
  }

  const visibleTypingUsers = typingUsers.filter(
    (entry) => entry.expiresAt > Date.now()
  );

  const typingLabel =
    visibleTypingUsers.length === 0
      ? null
      : visibleTypingUsers.length === 1
        ? t("groupTypingOne", { name: visibleTypingUsers[0].name })
        : visibleTypingUsers.length === 2
          ? t("groupTypingTwo", {
              name1: visibleTypingUsers[0].name,
              name2: visibleTypingUsers[1].name,
            })
          : t("groupTypingMany", { count: visibleTypingUsers.length });

  return (
    <div className="group-chat" style={config.theme}>
      <div className="group-chat__shell">
        <header className="group-chat__header">
          <button
            type="button"
            className="group-chat__back"
            onClick={() => navigate("/")}
            aria-label={t("groupBackHomeAria")}
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

          {(hiddenLoadedMessageCount > 0 || hasOlderMessages) && (
            <div className="group-chat__history-controls">
              <button
                type="button"
                onClick={() => void handleLoadOlderMessages()}
                disabled={isLoadingHistory}
              >
                {isLoadingHistory
                  ? t("loading")
                  : hiddenLoadedMessageCount > 0
                    ? t("groupShowOlder")
                    : t("groupLoadOlder")}
              </button>
              <span>
                {visibleMessages.length === 1
                  ? t("groupVisibleMessagesSingular", {
                      count: visibleMessages.length,
                    })
                  : t("groupVisibleMessagesPlural", {
                      count: visibleMessages.length,
                    })}
              </span>
            </div>
          )}

          {note ? (
            <section className="group-chat__note">
              <strong>{config.noteLabel || t("groupEphemeralNote")}</strong>
              <p>{note.text}</p>
            </section>
          ) : null}

          {messages.length === 0 ? (
            <div className="group-chat__empty">
              {t("groupEmpty")}
            </div>
          ) : null}

          {visibleMessages.map((message) => {
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
                  <button
                    type="button"
                    className="group-chat__profile-trigger"
                    onClick={() => openProfileCard(message)}
                    disabled={!message.sender.id}
                    aria-label={t("groupViewProfileOf", { name: authorLabel })}
                  >
                    <img
                      className="group-chat__avatar"
                      src={message.sender.avatar}
                      alt={message.sender.name}
                    />
                  </button>
                ) : null}

                <div className="group-chat__message-main">
                  <div
                    role="button"
                    tabIndex={0}
                    className={`group-chat__bubble-card ${
                      isOwnMessage ? "is-own" : "is-other"
                    } ${showActions ? "is-active" : ""}`}
                    onClick={() => toggleMessageActions(message.id)}
                    onKeyDown={(event) => handleBubbleCardKeyDown(event, message.id)}
                  >
                    <div className="group-chat__message-head">
                      {!isOwnMessage && message.sender.id ? (
                        <button
                          type="button"
                          className="group-chat__author-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openProfileCard(message);
                          }}
                        >
                          {authorLabel}
                        </button>
                      ) : (
                        <span className="group-chat__author">{authorLabel}</span>
                      )}
                    </div>

                    <div className="group-chat__bubble">{message.text}</div>

                    {message.translatedText ? (
                      <div className="group-chat__translated">
                        {message.translatedText}
                      </div>
                    ) : null}

                    <div className="group-chat__meta">
                      {messageTime ? <span>{messageTime}</span> : null}
                      {message.editedAt ? <span>{t("groupEdited")}</span> : null}
                    </div>
                  </div>

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
                          {t("edit")}
                        </button>
                      ) : null}

                      {canManage ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleDelete(message)}
                        >
                          {t("deleteAction")}
                        </button>
                      ) : null}

                      {!message.translatedText && message.type === "text" ? (
                        <button
                          type="button"
                          onClick={() => handleTranslate(message)}
                        >
                          {t("translateAction")}
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

        {selectedProfile ? (
          <div className="group-chat__profile-backdrop" onClick={closeProfileCard}>
            <div
              className="group-chat__profile-card"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="group-chat__profile-close"
                onClick={closeProfileCard}
                aria-label={t("groupCloseProfileAria")}
              >
                ×
              </button>

              <img
                className="group-chat__profile-avatar"
                src={selectedProfile.avatar}
                alt={selectedProfile.name}
              />
              <h3>{selectedProfile.name}</h3>
              <p>{t("groupProfilePrompt")}</p>

              <div className="group-chat__profile-actions">
                <button
                  type="button"
                  onClick={() => void openPrivateChatFromProfile(selectedProfile)}
                  disabled={isProfileActionLoading}
                >
                  {t("groupWritePrivate")}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void addFriendFromProfile(selectedProfile)}
                  disabled={isProfileActionLoading}
                >
                  {t("groupAddFriend")}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => readStoriesFromProfile(selectedProfile)}
                  disabled={isProfileActionLoading}
                >
                  {t("groupReadStories")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <footer className="group-chat__footer">
          {editingMessage ? (
            <div className="group-chat__editing">
              <span>{t("groupEditing")}</span>
              <button type="button" onClick={cancelEditing}>
                {t("cancel")}
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
                isAuth ? config.placeholder : t("typingDisabled")
              }
              disabled={!isAuth || isSubmitting}
            />

            <button
              type="button"
              className="group-chat__send"
              onClick={() => void handleSend()}
              disabled={!isAuth || !input.trim() || isSubmitting}
            >
              {editingId ? t("ok") : t("send")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
