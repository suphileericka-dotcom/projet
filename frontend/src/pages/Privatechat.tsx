import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import "../style/privateChat.css";
import { API } from "../config/api";
import { buildCountryAccessError } from "../config/countryAccess";
import { buildAvatarUrl } from "../lib/avatar";
import {
  clearAuthSession,
  clearAuthSessionForCountry,
  rememberPostLoginRedirect,
} from "../lib/authSession";
import {
  buildDmCheckoutUrls,
  buildPrivateChatPath,
} from "../lib/dmCheckout";

const MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000;
const EDIT_WINDOW_MS = 20 * 60 * 1000;
const AUTH_SESSION_INVALID_ERROR = "AUTH_SESSION_INVALID";
const COUNTRY_NOT_ALLOWED = "COUNTRY_NOT_ALLOWED";
const DM_ACCESS_REQUIRED = "DM_ACCESS_REQUIRED";

type Thread = {
  id: string;
  otherUserId: string;
  otherName: string;
  otherAvatar?: string | null;
  online: boolean;
  lastMessage: string | null;
  lastAt: number | string | null;
};

type Msg = {
  id: string;
  senderId: string | null;
  body: string;
  createdAt: number;
  updatedAt?: number;
  editedAt?: number;
  translatedText?: string;
};

type ThreadNormalizationOptions = {
  currentUserId?: string | null;
  fallbackTargetUserId?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }

  return undefined;
}

function readBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }

  return undefined;
}

function toTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;

    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) return asDate;
  }

  return null;
}

function isRecent(value: unknown, now = Date.now()) {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return false;
  return now - timestamp <= MESSAGE_RETENTION_MS;
}

function formatThreadTime(value: unknown) {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return "";

  const date = new Date(timestamp);
  const now = new Date();
  const isSameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  return isSameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString();
}

function formatMessageTime(value?: number | null) {
  if (!value || !Number.isFinite(value)) return "";

  return new Date(value).toLocaleString([], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortThreads(items: Thread[]) {
  return [...items].sort((left, right) => {
    const leftAt = toTimestamp(left.lastAt) ?? 0;
    const rightAt = toTimestamp(right.lastAt) ?? 0;
    return rightAt - leftAt;
  });
}

function buildThreadPreview(thread: Thread) {
  if (!isRecent(thread.lastAt)) {
    return "Les messages s'effacent apres 24h.";
  }

  const trimmedMessage = thread.lastMessage?.trim();
  return trimmedMessage || "Commencez votre discussion.";
}

function findThreadByTargetUserId(items: Thread[], targetUserId: string) {
  return items.find((thread) => thread.otherUserId === targetUserId) ?? null;
}

function getDisplayThreadName(thread: Thread) {
  return thread.otherName.trim() || "Conversation privee";
}

function getPayloadRecord(payload: unknown) {
  return Array.isArray(payload) ? null : asRecord(payload);
}

function getThreadIdFromPayload(payload: unknown) {
  const record = getPayloadRecord(payload);
  if (!record) return null;

  return readString(record.id, record.threadId, record.thread_id, record._id) ?? null;
}

function getErrorCode(payload: unknown) {
  const record = getPayloadRecord(payload);
  if (!record) return null;

  if (typeof record.code === "string" && record.code.trim()) {
    return record.code.trim().toUpperCase();
  }

  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim().toUpperCase();
  }

  return null;
}

function getErrorMessage(payload: unknown, fallback: string) {
  const record = getPayloadRecord(payload);
  if (!record) return fallback;

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }

  return fallback;
}

function buildBackendErrorMessage(payload: unknown, fallback: string) {
  const code = getErrorCode(payload);
  const message = getErrorMessage(payload, fallback);

  if (!code) return message;
  if (message.toUpperCase().includes(code)) return message;
  return `${code}: ${message}`;
}

function getPaymentUrl(payload: unknown) {
  const record = getPayloadRecord(payload);
  if (!record) return null;

  return typeof record.url === "string" && record.url.trim() ? record.url.trim() : null;
}

function isAuthSessionInvalidResponse(status: number, payload: unknown) {
  if (status !== 401) return false;

  const code = getErrorCode(payload);
  return (
    !code ||
    code === "TOKEN_EXPIRED" ||
    code === "INVALID_TOKEN" ||
    code === "AUTH_REQUIRED" ||
    code === "UNAUTHORIZED"
  );
}

function isCountryAccessDeniedResponse(status: number, payload: unknown) {
  return status === 403 && getErrorCode(payload) === COUNTRY_NOT_ALLOWED;
}

function isDmAccessRequiredResponse(status: number, payload: unknown) {
  return status === 403 && getErrorCode(payload) === DM_ACCESS_REQUIRED;
}

function buildOptimisticThread(threadId: string, targetUserId: string): Thread {
  return {
    id: threadId,
    otherUserId: targetUserId,
    otherName: "Conversation privee",
    otherAvatar: null,
    online: false,
    lastMessage: null,
    lastAt: Date.now(),
  };
}

function normalizeThread(
  rawThread: unknown,
  options: ThreadNormalizationOptions = {}
): Thread | null {
  const record = asRecord(rawThread);
  if (!record) return null;

  const threadId = readString(record.id, record.threadId, record.thread_id, record._id);
  if (!threadId) return null;

  const nestedOther =
    asRecord(record.otherUser) ??
    asRecord(record.other_user) ??
    asRecord(record.targetUser) ??
    asRecord(record.target_user) ??
    asRecord(record.user) ??
    asRecord(record.profile);

  const participants = [
    ...asArray(record.participants),
    ...asArray(record.members),
    ...asArray(record.users),
    ...asArray(record.profiles),
  ]
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);

  const otherParticipant =
    participants.find((participant) => {
      const participantId = readString(
        participant.id,
        participant.userId,
        participant.user_id,
        participant.targetUserId,
        participant.target_user_id
      );

      return !!participantId && participantId !== options.currentUserId;
    }) ?? participants[0] ?? null;

  const participantUserId = readString(
    otherParticipant?.id,
    otherParticipant?.userId,
    otherParticipant?.user_id
  );

  const directOtherUserId = readString(
    record.otherUserId,
    record.other_user_id,
    record.targetUserId,
    record.target_user_id,
    record.other_id,
    nestedOther?.id,
    nestedOther?.userId,
    nestedOther?.user_id
  );

  const otherUserId =
    (directOtherUserId && directOtherUserId !== options.currentUserId
      ? directOtherUserId
      : participantUserId) ||
    options.fallbackTargetUserId ||
    "";

  const otherName =
    readString(
      record.otherName,
      record.other_name,
      record.targetName,
      record.target_name,
      record.targetUsername,
      record.target_username,
      nestedOther?.username,
      nestedOther?.name,
      nestedOther?.displayName,
      nestedOther?.display_name,
      otherParticipant?.username,
      otherParticipant?.name,
      otherParticipant?.displayName,
      otherParticipant?.display_name,
      record.username,
      record.displayName,
      record.display_name
    ) || "";

  const otherAvatar =
    readString(
      record.otherAvatar,
      record.other_avatar,
      record.targetAvatar,
      record.target_avatar,
      nestedOther?.avatar,
      nestedOther?.avatar_url,
      nestedOther?.avatarUrl,
      otherParticipant?.avatar,
      otherParticipant?.avatar_url,
      otherParticipant?.avatarUrl
    ) || null;

  const lastMessage =
    readString(
      record.lastMessage,
      record.last_message,
      record.preview,
      record.body,
      record.content,
      record.message
    ) || null;

  const lastAt =
    record.lastAt ??
    record.last_at ??
    record.updatedAt ??
    record.updated_at ??
    record.createdAt ??
    record.created_at ??
    null;

  const online =
    readBoolean(
      record.online,
      record.isOnline,
      record.is_online,
      nestedOther?.online,
      nestedOther?.isOnline,
      otherParticipant?.online,
      otherParticipant?.isOnline
    ) ?? false;

  return {
    id: threadId,
    otherUserId,
    otherName,
    otherAvatar,
    online,
    lastMessage,
    lastAt,
  };
}

function normalizeThreadList(
  payload: unknown,
  options: ThreadNormalizationOptions = {}
) {
  const record = getPayloadRecord(payload);
  const rawThreads = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.threads)
      ? record.threads
      : Array.isArray(record?.items)
        ? record.items
        : [];

  const normalizedById = new Map<string, Thread>();

  for (const entry of rawThreads) {
    const normalized = normalizeThread(entry, options);
    if (!normalized) continue;

    const previous = normalizedById.get(normalized.id);
    normalizedById.set(normalized.id, {
      ...previous,
      ...normalized,
      otherUserId: normalized.otherUserId || previous?.otherUserId || "",
      otherName: normalized.otherName || previous?.otherName || "",
      otherAvatar: normalized.otherAvatar ?? previous?.otherAvatar ?? null,
      online: normalized.online ?? previous?.online ?? false,
      lastMessage: normalized.lastMessage ?? previous?.lastMessage ?? null,
      lastAt: normalized.lastAt ?? previous?.lastAt ?? null,
    });
  }

  return sortThreads([...normalizedById.values()]);
}

function mergeThreads(
  current: Thread[],
  incoming: Thread[],
  optimisticThread?: Thread | null
) {
  const mergedById = new Map<string, Thread>();

  for (const thread of current) {
    mergedById.set(thread.id, thread);
  }

  for (const thread of incoming) {
    const previous = mergedById.get(thread.id);
    mergedById.set(thread.id, {
      ...previous,
      ...thread,
      otherUserId: thread.otherUserId || previous?.otherUserId || "",
      otherName: thread.otherName || previous?.otherName || "",
      otherAvatar: thread.otherAvatar ?? previous?.otherAvatar ?? null,
      online: thread.online ?? previous?.online ?? false,
      lastMessage: thread.lastMessage ?? previous?.lastMessage ?? null,
      lastAt: thread.lastAt ?? previous?.lastAt ?? null,
    });
  }

  if (optimisticThread && !mergedById.has(optimisticThread.id)) {
    mergedById.set(optimisticThread.id, optimisticThread);
  }

  return sortThreads([...mergedById.values()]);
}

function normalizeMessage(rawMessage: unknown): Msg | null {
  const record = asRecord(rawMessage);
  if (!record) return null;

  const nestedSender =
    asRecord(record.sender) ?? asRecord(record.user) ?? asRecord(record.author);

  const id = readString(record.id, record.messageId, record.message_id, record._id);
  if (!id) return null;

  const senderId =
    readString(
      record.sender_id,
      record.senderId,
      record.user_id,
      record.userId,
      record.author_id,
      record.authorId,
      nestedSender?.id,
      nestedSender?.userId,
      nestedSender?.user_id
    ) || null;

  const body =
    readString(record.body, record.text, record.content, record.message) || "";

  const createdAt =
    toTimestamp(
      record.created_at ??
        record.createdAt ??
        record.sent_at ??
        record.sentAt ??
        record.timestamp
    ) || Date.now();

  const updatedAt = toTimestamp(record.updated_at ?? record.updatedAt) ?? undefined;
  const editedAt =
    toTimestamp(record.edited_at ?? record.editedAt) ||
    (updatedAt && updatedAt > createdAt ? updatedAt : undefined);

  return {
    id,
    senderId,
    body,
    createdAt,
    updatedAt,
    editedAt,
  };
}

function normalizeMessageList(payload: unknown) {
  const record = getPayloadRecord(payload);
  const rawMessages = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.messages)
      ? record.messages
      : Array.isArray(record?.items)
        ? record.items
        : [];

  const normalizedById = new Map<string, Msg>();

  for (const entry of rawMessages) {
    const normalized = normalizeMessage(entry);
    if (!normalized) continue;
    normalizedById.set(normalized.id, normalized);
  }

  return [...normalizedById.values()]
    .filter((message) => isRecent(message.createdAt))
    .sort((left, right) => {
      if (left.createdAt === right.createdAt) {
        return left.id.localeCompare(right.id);
      }

      return left.createdAt - right.createdAt;
    });
}

function mergeMessages(current: Msg[], incoming: Msg[]) {
  const currentById = new Map(current.map((message) => [message.id, message]));

  return incoming
    .map((message) => {
      const previous = currentById.get(message.id);
      if (!previous) return message;

      return {
        ...previous,
        ...message,
        translatedText: previous.translatedText ?? message.translatedText,
      };
    })
    .filter((message) => isRecent(message.createdAt))
    .sort((left, right) => {
      if (left.createdAt === right.createdAt) {
        return left.id.localeCompare(right.id);
      }

      return left.createdAt - right.createdAt;
    });
}

function canManageDmMessage(
  message: Msg,
  currentUserId: string | null,
  now = Date.now()
) {
  return !!currentUserId && message.senderId === currentUserId && now - message.createdAt <= EDIT_WINDOW_MS;
}

function buildDmMessageCandidates(threadId: string, messageId: string) {
  const safeThreadId = encodeURIComponent(threadId);
  const safeMessageId = encodeURIComponent(messageId);

  return [
    `${API}/dm/threads/${safeThreadId}/messages/${safeMessageId}`,
    `${API}/dm/messages/${safeMessageId}`,
  ];
}

export default function PrivateChat() {
  const navigate = useNavigate();
  const { targetUserId: routeTargetUserId } = useParams();
  const [searchParams] = useSearchParams();
  const token = localStorage.getItem("authToken");
  const myUserId = localStorage.getItem("userId");

  const queryTargetUserId = searchParams.get("targetUserId")?.trim() || "";
  const targetUserId = routeTargetUserId?.trim() || queryTargetUserId;
  const checkoutSessionId = searchParams.get("session_id")?.trim() || "";
  const paid =
    searchParams.get("paid") === "1" || searchParams.get("checkout") === "success";

  const [threads, setThreads] = useState<Thread[]>([]);
  const [optimisticThread, setOptimisticThread] = useState<Thread | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [isOpeningTarget, setIsOpeningTarget] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"threads" | "chat">("threads");
  const [banner, setBanner] = useState<string | null>(
    paid ? "Paiement confirme. Ouverture de la conversation..." : null
  );

  const streamRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const threadsRef = useRef<Thread[]>([]);
  const messagesRef = useRef<Msg[]>([]);
  const optimisticThreadRef = useRef<Thread | null>(null);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    optimisticThreadRef.current = optimisticThread;
  }, [optimisticThread]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || null,
    [threads, activeThreadId]
  );
  const activeThreadMatchesTarget =
    !!targetUserId && activeThread?.otherUserId === targetUserId;
  const visibleMessages = useMemo(() => messages, [messages]);
  const archiveCountLabel =
    threads.length === 0
      ? "Aucune conversation"
      : `${threads.length} conversation${threads.length > 1 ? "s" : ""} archivee${
          threads.length > 1 ? "s" : ""
        }`;
  const editingMessage =
    (editingId && messages.find((message) => message.id === editingId)) || null;

  const redirectToLoginForRefresh = useCallback(() => {
    rememberPostLoginRedirect();
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const redirectToLoginForCountryAccess = useCallback(
    (payload?: unknown) => {
      const countryMessage =
        typeof payload === "string"
          ? payload
          : buildBackendErrorMessage(payload, buildCountryAccessError());

      clearAuthSessionForCountry(
        countryMessage
      );
      navigate("/login", { replace: true });
    },
    [navigate]
  );

  const loadThreads = useCallback(
    async (preferredThreadId?: string | null) => {
      if (!token) {
        setThreadsLoading(false);
        return [];
      }

      setThreadsLoading(true);

      try {
        const res = await fetch(`${API}/dm/threads`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await res.json().catch(() => null);

        if (isAuthSessionInvalidResponse(res.status, payload)) {
          redirectToLoginForRefresh();
          return [];
        }

        if (isCountryAccessDeniedResponse(res.status, payload)) {
          redirectToLoginForCountryAccess(payload);
          return [];
        }

        if (!res.ok) {
          setBanner(
            buildBackendErrorMessage(
              payload,
              "Impossible de charger les discussions privees."
            )
          );
          return threadsRef.current;
        }

        const normalizedThreads = normalizeThreadList(payload, {
          currentUserId: myUserId,
          fallbackTargetUserId: targetUserId || undefined,
        });

        const nextThreads = mergeThreads(
          threadsRef.current,
          normalizedThreads,
          optimisticThreadRef.current
        );

        if (
          optimisticThreadRef.current &&
          normalizedThreads.some((thread) => thread.id === optimisticThreadRef.current?.id)
        ) {
          setOptimisticThread(null);
        }

        setThreads(nextThreads);
        setActiveThreadId((current) => {
          if (
            preferredThreadId &&
            nextThreads.some((thread) => thread.id === preferredThreadId)
          ) {
            return preferredThreadId;
          }

          if (current && nextThreads.some((thread) => thread.id === current)) {
            return current;
          }

          if (targetUserId) {
            const matchingThread = findThreadByTargetUserId(nextThreads, targetUserId);
            if (matchingThread) return matchingThread.id;
          }

          return nextThreads[0]?.id ?? current ?? null;
        });

        return nextThreads;
      } catch (error) {
        setBanner(
          error instanceof Error && error.message
            ? error.message
            : "Impossible de charger les discussions privees."
        );
        return threadsRef.current;
      } finally {
        setThreadsLoading(false);
      }
    },
    [
      myUserId,
      redirectToLoginForCountryAccess,
      redirectToLoginForRefresh,
      targetUserId,
      token,
    ]
  );

  const loadMessages = useCallback(
    async (threadId: string) => {
      if (!token) return;

      setMessagesLoading(true);

      try {
        const res = await fetch(`${API}/dm/threads/${encodeURIComponent(threadId)}/messages`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await res.json().catch(() => null);

        if (isAuthSessionInvalidResponse(res.status, payload)) {
          redirectToLoginForRefresh();
          return;
        }

        if (isCountryAccessDeniedResponse(res.status, payload)) {
          redirectToLoginForCountryAccess(payload);
          return;
        }

        if (!res.ok) {
          setBanner(
            buildBackendErrorMessage(
              payload,
              "Impossible de charger les messages prives."
            )
          );
          setMessages([]);
          return;
        }

        setMessages(normalizeMessageList(payload));
      } finally {
        setMessagesLoading(false);
      }
    },
    [redirectToLoginForCountryAccess, redirectToLoginForRefresh, token]
  );

  const openPrivateChat = useCallback(
    async (nextTargetUserId: string, sessionId?: string) => {
      if (!token) {
        throw new Error(AUTH_SESSION_INVALID_ERROR);
      }

      const res = await fetch(`${API}/dm/threads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUserId: nextTargetUserId,
          ...(sessionId ? { session_id: sessionId } : {}),
        }),
      });

      const payload = await res.json().catch(() => null);

      if (isAuthSessionInvalidResponse(res.status, payload)) {
        throw new Error(AUTH_SESSION_INVALID_ERROR);
      }

      if (isCountryAccessDeniedResponse(res.status, payload)) {
        throw new Error(
          buildBackendErrorMessage(payload, buildCountryAccessError())
        );
      }

      if (res.ok) {
        const threadId = getThreadIdFromPayload(payload);
        if (!threadId) {
          throw new Error("Conversation privee introuvable.");
        }

        return {
          threadId,
          thread:
            normalizeThread(payload, {
              currentUserId: myUserId,
              fallbackTargetUserId: nextTargetUserId,
            }) || buildOptimisticThread(threadId, nextTargetUserId),
        };
      }

      if (isDmAccessRequiredResponse(res.status, payload)) {
        const { successUrl, cancelUrl } = buildDmCheckoutUrls(nextTargetUserId);
        const payRes = await fetch(`${API}/payments/dm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            targetUserId: nextTargetUserId,
            successUrl,
            cancelUrl,
          }),
        });

        const payPayload = await payRes.json().catch(() => null);

        if (isAuthSessionInvalidResponse(payRes.status, payPayload)) {
          throw new Error(AUTH_SESSION_INVALID_ERROR);
        }

        if (isCountryAccessDeniedResponse(payRes.status, payPayload)) {
          throw new Error(
            buildBackendErrorMessage(payPayload, buildCountryAccessError())
          );
        }

        if (!payRes.ok) {
          throw new Error(
            buildBackendErrorMessage(
              payPayload,
              "Impossible de lancer le paiement du chat prive."
            )
          );
        }

        const paymentUrl = getPaymentUrl(payPayload);
        if (!paymentUrl) {
          throw new Error("Lien de paiement introuvable.");
        }

        setBanner("Redirection vers le paiement...");
        window.location.href = paymentUrl;
        return null;
      }

      throw new Error(
        buildBackendErrorMessage(payload, "Impossible d'ouvrir le chat prive.")
      );
    },
    [myUserId, token]
  );

  const openTargetConversation = useCallback(async () => {
    if (!targetUserId) return;

    setIsOpeningTarget(true);
    setBanner(
      paid
        ? "Paiement confirme. Ouverture de la conversation..."
        : "Ouverture de la conversation privee..."
    );

    try {
      const result = await openPrivateChat(
        targetUserId,
        checkoutSessionId || undefined
      );

      if (!result) return;

      const { threadId, thread } = result;
      setOptimisticThread(thread);
      setThreads((current) => mergeThreads(current, thread ? [thread] : [], thread));
      setActiveThreadId(threadId);
      setMobilePanel("chat");
      await loadThreads(threadId);

      if (paid || checkoutSessionId) {
        setBanner("Paiement confirme. La conversation est ouverte.");
        navigate(buildPrivateChatPath(targetUserId), { replace: true });
      } else {
        setBanner(null);
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Impossible d'ouvrir le chat prive.";

      if (message === AUTH_SESSION_INVALID_ERROR) {
        redirectToLoginForRefresh();
        return;
      }

      if (message === COUNTRY_NOT_ALLOWED || message.startsWith(`${COUNTRY_NOT_ALLOWED}:`)) {
        redirectToLoginForCountryAccess(message);
        return;
      }

      setBanner(message);
    } finally {
      setIsOpeningTarget(false);
    }
  }, [
    checkoutSessionId,
    loadThreads,
    navigate,
    openPrivateChat,
    paid,
    redirectToLoginForCountryAccess,
    redirectToLoginForRefresh,
    targetUserId,
  ]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!targetUserId) return;
    if (!paid && !checkoutSessionId && activeThreadMatchesTarget) return;

    void openTargetConversation();
  }, [
    activeThreadMatchesTarget,
    checkoutSessionId,
    openTargetConversation,
    paid,
    targetUserId,
  ]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;

    stream.scrollTo({
      top: stream.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (!activeMessageId) return;
    if (messages.some((message) => message.id === activeMessageId)) return;
    setActiveMessageId(null);
  }, [activeMessageId, messages]);

  function toggleMessageActions(messageId: string) {
    setActiveMessageId((current) => (current === messageId ? null : messageId));
  }

  function handleBubbleCardKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    messageId: string
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleMessageActions(messageId);
  }

  function startEditingMessage(message: Msg) {
    setEditingId(message.id);
    setInput(message.body);
    setActiveMessageId(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelEditing() {
    setEditingId(null);
    setInput("");
    setActiveMessageId(null);
  }

  async function translateMessage(message: Msg) {
    if (!message.body.trim() || message.translatedText) return;

    try {
      const target = localStorage.getItem("language") || "fr";
      const res = await fetch(`${API}/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          text: message.body,
          target,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (isAuthSessionInvalidResponse(res.status, payload)) {
        redirectToLoginForRefresh();
        return;
      }

      if (isCountryAccessDeniedResponse(res.status, payload)) {
        redirectToLoginForCountryAccess(payload);
        return;
      }

      if (!res.ok) {
        throw new Error(
          buildBackendErrorMessage(payload, "Traduction indisponible pour le moment.")
        );
      }

      const translatedText =
        readString(
          getPayloadRecord(payload)?.translatedText,
          getPayloadRecord(payload)?.translation,
          getPayloadRecord(payload)?.text
        ) || null;

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
    } catch (error) {
      setBanner(
        error instanceof Error && error.message
          ? error.message
          : "Traduction indisponible pour le moment."
      );
    }
  }

  async function updateDmMessage(messageId: string, nextBody: string) {
    if (!token || !myUserId || !activeThreadId) {
      throw new Error("Connexion requise.");
    }

    let unsupported = true;

    for (const endpoint of buildDmMessageCandidates(activeThreadId, messageId)) {
      for (const method of ["PATCH", "PUT"]) {
        const res = await fetch(endpoint, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            threadId: activeThreadId,
            userId: myUserId,
            body: nextBody,
            text: nextBody,
            content: nextBody,
          }),
        });

        const payload = await res.json().catch(() => null);

        if (isAuthSessionInvalidResponse(res.status, payload)) {
          throw new Error(AUTH_SESSION_INVALID_ERROR);
        }

        if (isCountryAccessDeniedResponse(res.status, payload)) {
          throw new Error(
            buildBackendErrorMessage(payload, buildCountryAccessError())
          );
        }

        if (res.status === 404 || res.status === 405) {
          continue;
        }

        unsupported = false;

        if (!res.ok) {
          throw new Error(
            buildBackendErrorMessage(
              payload,
              "Impossible de modifier ce message prive."
            )
          );
        }

        const normalized =
          normalizeMessage(payload) ||
          normalizeMessage(getPayloadRecord(payload)?.message) ||
          null;

        if (normalized) {
          setMessages((current) =>
            mergeMessages(
              current.filter((message) => message.id !== normalized.id),
              [...current.filter((message) => message.id !== normalized.id), normalized]
            )
          );
        } else {
          await loadMessages(activeThreadId);
        }

        return;
      }
    }

    if (unsupported) {
      throw new Error(
        "Le backend DM ne supporte pas encore la modification des messages prives."
      );
    }
  }

  async function deleteDmMessage(messageId: string) {
    if (!token || !myUserId || !activeThreadId) {
      throw new Error("Connexion requise.");
    }

    let unsupported = true;

    for (const endpoint of buildDmMessageCandidates(activeThreadId, messageId)) {
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await res.json().catch(() => null);

      if (isAuthSessionInvalidResponse(res.status, payload)) {
        throw new Error(AUTH_SESSION_INVALID_ERROR);
      }

      if (isCountryAccessDeniedResponse(res.status, payload)) {
        throw new Error(
          buildBackendErrorMessage(payload, buildCountryAccessError())
        );
      }

      if (res.status === 404 || res.status === 405) {
        continue;
      }

      unsupported = false;

      if (!res.ok) {
        throw new Error(
          buildBackendErrorMessage(
            payload,
            "Impossible de supprimer ce message prive."
          )
        );
      }

      return;
    }

    if (unsupported) {
      throw new Error(
        "Le backend DM ne supporte pas encore la suppression des messages prives."
      );
    }
  }

  async function send() {
    if (!token || !activeThreadId || sendLoading) return;

    const text = input.trim();
    if (!text) return;

    setSendLoading(true);
    setBanner(null);

    if (editingId) {
      const previousMessage = messagesRef.current.find(
        (message) => message.id === editingId
      );

      if (!previousMessage) {
        cancelEditing();
        setSendLoading(false);
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === editingId
            ? {
                ...message,
                body: text,
                editedAt: Date.now(),
                updatedAt: Date.now(),
              }
            : message
        )
      );
      setInput("");
      setEditingId(null);
      setActiveMessageId(null);

      try {
        await updateDmMessage(editingId, text);
      } catch (error) {
        if (error instanceof Error && error.message === AUTH_SESSION_INVALID_ERROR) {
          redirectToLoginForRefresh();
          return;
        }

        if (
          error instanceof Error &&
          (error.message === COUNTRY_NOT_ALLOWED ||
            error.message.startsWith(`${COUNTRY_NOT_ALLOWED}:`))
        ) {
          redirectToLoginForCountryAccess(error.message);
          return;
        }

        setMessages((current) =>
          current.map((message) =>
            message.id === previousMessage.id ? previousMessage : message
          )
        );
        setInput(text);
        setEditingId(previousMessage.id);
        setBanner(
          error instanceof Error && error.message
            ? error.message
            : "Impossible de modifier ce message prive."
        );
      } finally {
        setSendLoading(false);
      }

      return;
    }

    setInput("");

    try {
      const res = await fetch(`${API}/dm/threads/${encodeURIComponent(activeThreadId)}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: text }),
      });

      const payload = await res.json().catch(() => null);

      if (isAuthSessionInvalidResponse(res.status, payload)) {
        redirectToLoginForRefresh();
        return;
      }

      if (isCountryAccessDeniedResponse(res.status, payload)) {
        redirectToLoginForCountryAccess(payload);
        return;
      }

      if (!res.ok) {
        throw new Error(
          buildBackendErrorMessage(payload, "Message non envoye.")
        );
      }

      await Promise.all([loadMessages(activeThreadId), loadThreads(activeThreadId)]);
      setMobilePanel("chat");
    } catch (error) {
      setBanner(
        error instanceof Error && error.message
          ? error.message
          : "Message non envoye"
      );
      setInput(text);
    } finally {
      setSendLoading(false);
    }
  }

  async function handleDelete(message: Msg) {
    if (!window.confirm("Supprimer ce message prive ?")) return;

    const snapshot = message;
    setMessages((current) => current.filter((entry) => entry.id !== message.id));
    setActiveMessageId(null);

    if (editingId === message.id) {
      cancelEditing();
    }

    try {
      await deleteDmMessage(message.id);
      await loadThreads(activeThreadId);
    } catch (error) {
      if (error instanceof Error && error.message === AUTH_SESSION_INVALID_ERROR) {
        redirectToLoginForRefresh();
        return;
      }

      if (
        error instanceof Error &&
        (error.message === COUNTRY_NOT_ALLOWED ||
          error.message.startsWith(`${COUNTRY_NOT_ALLOWED}:`))
      ) {
        redirectToLoginForCountryAccess(error.message);
        return;
      }

      setMessages((current) => mergeMessages(current, [...current, snapshot]));
      setBanner(
        error instanceof Error && error.message
          ? error.message
          : "Impossible de supprimer ce message prive."
      );
    }
  }

  return (
    <div className={`pc-root ${mobilePanel === "chat" ? "show-chat" : "show-threads"}`}>
      <header className="pc-topbar">
        <button className="pc-back" onClick={() => navigate("/my-space")}>
          {"<"} Mon espace
        </button>
        <div className="pc-title">
          <h1>Messages prives</h1>
          <span className="pc-sub">
            Archive des discussions et messages qui s'effacent apres 24h.
          </span>
        </div>
      </header>

      {banner && (
        <div className="pc-banner" role="status">
          {banner}
        </div>
      )}

      <div className="pc-layout">
        <aside className="pc-sidebar">
          <div className="pc-sidebar-head">
            <div className="pc-sidebar-title">Archive DM</div>
            <div className="pc-sidebar-actions">
              <button className="pc-home-link" onClick={() => navigate("/match")}>
                Profils
              </button>
              <button className="pc-home-link" onClick={() => navigate("/private-chat")}>
                Archive
              </button>
            </div>
          </div>

          <div className="pc-archive-card">
            <span className="pc-archive-kicker">Messages 24h</span>
            <strong>
              {isOpeningTarget ? "Ouverture du chat..." : archiveCountLabel}
            </strong>
            <span>
              Les profils restent archives ici et le texte visible des messages
              disparait apres 24h.
            </span>
          </div>

          {threadsLoading && <div className="pc-empty">Chargement des discussions...</div>}

          {!threadsLoading && threads.length === 0 && (
            <div className="pc-empty">
              Aucune conversation pour le moment. Lance un chat prive depuis un profil
              pour le retrouver ensuite ici.
            </div>
          )}

          {threads.map((thread) => {
            const threadName = getDisplayThreadName(thread);

            return (
              <button
                key={thread.id}
                className={`pc-thread ${thread.id === activeThreadId ? "active" : ""}`}
                onClick={() => {
                  setActiveThreadId(thread.id);
                  setMobilePanel("chat");

                  if (thread.otherUserId && thread.otherUserId !== targetUserId) {
                    navigate(buildPrivateChatPath(thread.otherUserId));
                  }
                }}
              >
                <div className="pc-thread-left">
                  <img
                    className="pc-avatar"
                    src={buildAvatarUrl({
                      name: threadName,
                      avatarPath: thread.otherAvatar,
                      seed: thread.otherUserId || thread.id,
                      size: 96,
                    })}
                    alt={threadName}
                  />
                  <div className="pc-thread-meta">
                    <div className="pc-thread-name">
                      {threadName}
                      <span className={`pc-dot ${thread.online ? "on" : "off"}`} />
                    </div>
                    <div className="pc-thread-last">{buildThreadPreview(thread)}</div>
                  </div>
                </div>

                <div className="pc-thread-time">{formatThreadTime(thread.lastAt)}</div>
              </button>
            );
          })}
        </aside>

        <main className="pc-chat">
          {activeThread ? (
            <>
              <div className="pc-chat-head">
                <div className="pc-chat-head-main">
                  <button
                    className="pc-chat-back"
                    onClick={() => setMobilePanel("threads")}
                  >
                    {"<"} Conversations
                  </button>
                  <img
                    className="pc-avatar pc-avatar-lg"
                    src={buildAvatarUrl({
                      name: getDisplayThreadName(activeThread),
                      avatarPath: activeThread.otherAvatar,
                      seed: activeThread.otherUserId || activeThread.id,
                      size: 96,
                    })}
                    alt={getDisplayThreadName(activeThread)}
                  />
                  <div className="pc-chat-user">
                    <strong>{getDisplayThreadName(activeThread)}</strong>
                    <span>Messages ephemeres: suppression visuelle apres 24h.</span>
                  </div>
                </div>
              </div>

              <div className="pc-stream" ref={streamRef}>
                {messagesLoading && (
                  <div className="pc-empty">Chargement de la conversation...</div>
                )}

                {!messagesLoading && visibleMessages.length === 0 && (
                  <div className="pc-empty">
                    Il n'y a pas encore de message visible ici. Les messages de plus de
                    24h disparaissent de l'ecran.
                  </div>
                )}

                {!messagesLoading &&
                  visibleMessages.map((message) => {
                    const isOwnMessage =
                      !!myUserId && message.senderId === myUserId;
                    const canManage = canManageDmMessage(message, myUserId);
                    const showActions =
                      activeMessageId === message.id &&
                      (canManage || (!message.translatedText && !!message.body.trim()));

                    return (
                      <article
                        key={message.id}
                        className={`pc-msg ${isOwnMessage ? "me" : "them"}`}
                      >
                        <div className="pc-msg-main">
                          <button
                            type="button"
                            className={`pc-bubble-card ${
                              isOwnMessage ? "me" : "them"
                            } ${showActions ? "is-active" : ""}`}
                            onClick={() => toggleMessageActions(message.id)}
                            onKeyDown={(event) => handleBubbleCardKeyDown(event, message.id)}
                          >
                            <div className="pc-bubble">{message.body}</div>

                            {message.translatedText ? (
                              <div className="pc-translated">{message.translatedText}</div>
                            ) : null}

                            <div className="pc-meta">
                              {formatMessageTime(message.createdAt) ? (
                                <span>{formatMessageTime(message.createdAt)}</span>
                              ) : null}
                              {message.editedAt ? <span>modifie</span> : null}
                            </div>
                          </button>

                          {showActions ? (
                            <div className={`pc-actions ${isOwnMessage ? "me" : "them"}`}>
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
                                  onClick={() => void handleDelete(message)}
                                >
                                  Supprimer
                                </button>
                              ) : null}

                              {!message.translatedText && message.body.trim() ? (
                                <button
                                  type="button"
                                  onClick={() => void translateMessage(message)}
                                >
                                  Traduire
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
              </div>

              <footer className="pc-input-wrap">
                {editingMessage ? (
                  <div className="pc-editing">
                    <span>Modification du message prive en cours.</span>
                    <button type="button" onClick={cancelEditing}>
                      Annuler
                    </button>
                  </div>
                ) : null}

                <div className="pc-inputbar">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="Ecris un message prive..."
                  />
                  <button onClick={() => void send()} disabled={sendLoading}>
                    {sendLoading ? "..." : editingId ? "OK" : ">"}
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className="pc-empty pc-empty-panel">
              <strong>
                {targetUserId && isOpeningTarget
                  ? "Ouverture de la conversation..."
                  : "Choisis une conversation dans l'archive."}
              </strong>
              <span>
                Tu retrouveras ici le profil, l'historique recent et les messages
                encore visibles pendant 24h.
              </span>
              <div className="pc-empty-actions">
                <button className="pc-home-link" onClick={() => navigate("/match")}>
                  Voir les profils
                </button>
                <button className="pc-home-link" onClick={() => navigate("/my-space")}>
                  Gerer amities
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
