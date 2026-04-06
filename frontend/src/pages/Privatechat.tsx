import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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
import { useLang } from "../hooks/useLang";
import { buildAvatarUrl } from "../lib/avatar";
import { socket } from "../lib/socket";
import {
  clearAuthSession,
  clearAuthSessionForCountry,
  rememberPostLoginRedirect,
} from "../lib/authSession";
import {
  DM_PAYMENT_OPTIONS,
  buildDmPaymentCheckoutPayload,
  buildPrivateChatPath,
  type DmPaymentOptionId,
} from "../lib/dmCheckout";

const MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000;
const EDIT_WINDOW_MS = 20 * 60 * 1000;
const AUTH_SESSION_INVALID_ERROR = "AUTH_SESSION_INVALID";
const COUNTRY_NOT_ALLOWED = "COUNTRY_NOT_ALLOWED";
const DM_ACCESS_REQUIRED = "DM_ACCESS_REQUIRED";
const DEFAULT_PAYMENT_SELECTION_MESSAGE = "";
const ACTIVE_DM_ACCESS_STATUSES = new Set([
  "active",
  "paid",
  "trialing",
  "granted",
  "allowed",
]);
const PAYMENT_SELECTION_DM_ACCESS_STATUSES = new Set([
  "inactive",
  "needs_payment_selection",
  "payment_required",
  "requires_payment",
  "restricted",
]);
const UNSUPPORTED_DM_ACCESS_ENDPOINT_STATUSES = new Set([404, 405, 501]);
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
const OPTIMISTIC_DM_MATCH_WINDOW_MS = 15_000;

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
  threadId: string | null;
  senderId: string | null;
  body: string;
  createdAt: number;
  updatedAt?: number;
  editedAt?: number;
  translatedText?: string;
  isPending?: boolean;
};

type ThreadNormalizationOptions = {
  currentUserId?: string | null;
  fallbackTargetUserId?: string;
};

type DmAccessCheckResult = {
  status: "active" | "needs_payment_selection" | "unsupported";
  message?: string;
};

type TypingUser = {
  key: string;
  name: string;
  expiresAt: number;
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

function findThreadByTargetUserId(items: Thread[], targetUserId: string) {
  return items.find((thread) => thread.otherUserId === targetUserId) ?? null;
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

function getDmAccessStatus(payload: unknown) {
  const record = getPayloadRecord(payload);
  if (!record) return null;

  const nestedAccess = asRecord(record.access);

  return (
    readString(
      record.status,
      record.accessStatus,
      record.access_status,
      record.state,
      nestedAccess?.status,
      nestedAccess?.accessStatus,
      nestedAccess?.access_status
    )?.toLowerCase() ?? null
  );
}

function hasDmAccess(payload: unknown) {
  const record = getPayloadRecord(payload);
  if (!record) return false;

  const nestedAccess = asRecord(record.access);
  const explicitAccess = readBoolean(
    record.hasAccess,
    record.has_access,
    record.allowed,
    record.canChat,
    record.can_chat,
    record.paid,
    nestedAccess?.hasAccess,
    nestedAccess?.has_access,
    nestedAccess?.allowed,
    nestedAccess?.canChat,
    nestedAccess?.can_chat
  );

  if (typeof explicitAccess === "boolean") {
    return explicitAccess;
  }

  const accessStatus = getDmAccessStatus(payload);
  return !!accessStatus && ACTIVE_DM_ACCESS_STATUSES.has(accessStatus);
}

function shouldOpenPaymentSelection(status: number, payload: unknown) {
  if (isDmAccessRequiredResponse(status, payload)) return true;

  const record = getPayloadRecord(payload);
  const nestedAccess = record ? asRecord(record.access) : null;
  const explicitSelection = readBoolean(
    record?.needsPaymentSelection,
    record?.needs_payment_selection,
    record?.requiresPayment,
    record?.requires_payment,
    nestedAccess?.needsPaymentSelection,
    nestedAccess?.needs_payment_selection
  );

  if (typeof explicitSelection === "boolean") {
    return explicitSelection;
  }

  const accessStatus = getDmAccessStatus(payload);
  return !!accessStatus && PAYMENT_SELECTION_DM_ACCESS_STATUSES.has(accessStatus);
}

function getPaymentSelectionMessage(payload?: unknown) {
  const record = getPayloadRecord(payload);
  if (!record) return DEFAULT_PAYMENT_SELECTION_MESSAGE;

  const nestedAccess = asRecord(record.access);
  const rawMessage =
    readString(
      record.paymentMessage,
      record.payment_message,
      record.notice,
      record.message,
      nestedAccess?.paymentMessage,
      nestedAccess?.payment_message,
      nestedAccess?.notice,
      nestedAccess?.message
    ) || DEFAULT_PAYMENT_SELECTION_MESSAGE;

  if (rawMessage.toUpperCase().includes(DM_ACCESS_REQUIRED)) {
    return DEFAULT_PAYMENT_SELECTION_MESSAGE;
  }

  return rawMessage;
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

function extractThreadId(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;

  const nestedThread =
    asRecord(record.thread) ??
    asRecord(record.conversation) ??
    asRecord(record.chat);

  return (
    readString(
      record.threadId,
      record.thread_id,
      record.conversationId,
      record.conversation_id,
      record.room,
      record.room_id,
      record.roomId,
      record.channel,
      nestedThread?.id,
      nestedThread?.threadId,
      nestedThread?.thread_id,
      nestedThread?.conversationId,
      nestedThread?.conversation_id,
      nestedThread?.room,
      nestedThread?.room_id,
      nestedThread?.roomId
    ) ?? null
  );
}

function getMessagePayloadRecord(payload: unknown) {
  const record = getPayloadRecord(payload);
  if (!record) return null;

  const nestedData = asRecord(record.data);

  return (
    asRecord(record.message) ??
    asRecord(record.item) ??
    asRecord(nestedData?.message) ??
    record
  );
}

function extractMessageIdFromPayload(payload: unknown) {
  const record = getMessagePayloadRecord(payload);
  if (!record) return null;

  return readString(record.id, record.messageId, record.message_id, record._id) ?? null;
}

function collectParticipantIds(value: unknown) {
  const record = asRecord(value);
  if (!record) return [];

  const nestedSender =
    asRecord(record.sender) ?? asRecord(record.user) ?? asRecord(record.author);
  const nestedRecipient =
    asRecord(record.recipient) ??
    asRecord(record.targetUser) ??
    asRecord(record.target_user) ??
    asRecord(record.otherUser) ??
    asRecord(record.other_user);

  return [
    readString(
      record.userId,
      record.user_id,
      record.senderId,
      record.sender_id,
      record.authorId,
      record.author_id,
      nestedSender?.id,
      nestedSender?.userId,
      nestedSender?.user_id
    ),
    readString(
      record.targetUserId,
      record.target_user_id,
      record.recipientId,
      record.recipient_id,
      record.otherUserId,
      record.other_user_id,
      nestedRecipient?.id,
      nestedRecipient?.userId,
      nestedRecipient?.user_id
    ),
  ].filter((entry): entry is string => !!entry);
}

function matchesActiveThreadPayload(
  payload: unknown,
  thread: Thread | null,
  currentUserId: string | null
) {
  if (!thread) return false;

  const topLevelThreadId = extractThreadId(payload);
  if (topLevelThreadId) return topLevelThreadId === thread.id;

  const record = getMessagePayloadRecord(payload);
  const messageThreadId = extractThreadId(record);
  if (messageThreadId) return messageThreadId === thread.id;

  if (!currentUserId || !thread.otherUserId) return false;

  const participantIds = new Set([
    ...collectParticipantIds(payload),
    ...collectParticipantIds(record),
  ]);

  return (
    participantIds.has(currentUserId) && participantIds.has(thread.otherUserId)
  );
}

function extractTypingMeta(payload: unknown) {
  const record = getMessagePayloadRecord(payload);
  if (!record) return null;

  const nestedSender =
    asRecord(record.sender) ?? asRecord(record.user) ?? asRecord(record.author);

  return {
    userId:
      readString(
        record.userId,
        record.user_id,
        record.senderId,
        record.sender_id,
        record.authorId,
        record.author_id,
        nestedSender?.id,
        nestedSender?.userId,
        nestedSender?.user_id
      ) || null,
    name:
      readString(
        record.username,
        record.name,
        record.displayName,
        record.display_name,
        record.senderName,
        record.sender_name,
        nestedSender?.username,
        nestedSender?.name,
        nestedSender?.displayName,
        nestedSender?.display_name
      ) || "Quelqu'un",
    isTyping: Boolean(record.isTyping ?? record.typing ?? record.active ?? true),
  };
}

function normalizeMessage(
  rawMessage: unknown,
  fallbackThreadId?: string | null
): Msg | null {
  const record = asRecord(rawMessage);
  if (!record) return null;

  const nestedSender =
    asRecord(record.sender) ?? asRecord(record.user) ?? asRecord(record.author);

  const id = readString(record.id, record.messageId, record.message_id, record._id);
  if (!id) return null;
  const threadId = extractThreadId(record) ?? fallbackThreadId ?? null;

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
    threadId,
    senderId,
    body,
    createdAt,
    updatedAt,
    editedAt,
  };
}

function normalizeMessageList(payload: unknown, fallbackThreadId?: string | null) {
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
    const normalized = normalizeMessage(entry, fallbackThreadId);
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

function upsertMessage(current: Msg[], incoming: Msg) {
  const directMatch = current.find((message) => message.id === incoming.id) ?? null;
  const optimisticMatch =
    directMatch || incoming.isPending
      ? null
      : current.find(
          (message) =>
            message.isPending &&
            message.senderId === incoming.senderId &&
            message.body.trim() === incoming.body.trim() &&
            Math.abs(message.createdAt - incoming.createdAt) <=
              OPTIMISTIC_DM_MATCH_WINDOW_MS
        ) ?? null;

  const previous = directMatch ?? optimisticMatch;
  const nextMessage: Msg = {
    ...previous,
    ...incoming,
    translatedText: previous?.translatedText ?? incoming.translatedText,
    isPending: incoming.isPending ?? false,
  };

  const nextCurrent = current.filter(
    (message) =>
      message.id !== nextMessage.id &&
      (!optimisticMatch || message.id !== optimisticMatch.id)
  );

  return mergeMessages(nextCurrent, [...nextCurrent, nextMessage]);
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
  const { t } = useLang();
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
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [banner, setBanner] = useState<string | null>(
    paid ? t("privateChatOpeningConversation") : null
  );
  const [paymentSelectionTargetUserId, setPaymentSelectionTargetUserId] =
    useState<string | null>(null);
  const [paymentSelectionMessage, setPaymentSelectionMessage] =
    useState<string>(t("privateChatDefaultPaymentMessage"));
  const [paymentSelectionLoadingId, setPaymentSelectionLoadingId] =
    useState<DmPaymentOptionId | null>(null);

  const streamRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const threadsRef = useRef<Thread[]>([]);
  const messagesRef = useRef<Msg[]>([]);
  const optimisticThreadRef = useRef<Thread | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);

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
  const effectiveUsername =
    localStorage.getItem("username")?.trim() || t("member");
  const isPaymentSelectionOpen = !!paymentSelectionTargetUserId;
  const archiveCountLabel =
    threads.length === 0
      ? t("privateChatNoThreads")
      : `${threads.length} ${t("privateChatConversations").toLowerCase()}`;
  const editingMessage =
    (editingId && messages.find((message) => message.id === editingId)) || null;
  const visibleTypingUsers = typingUsers.filter(
    (entry) => entry.expiresAt > Date.now()
  );
  const typingLabel =
    visibleTypingUsers.length === 0
      ? null
      : visibleTypingUsers.length === 1
        ? t("groupTypingOne", { name: visibleTypingUsers[0].name })
        : t("groupTypingMany", { count: visibleTypingUsers.length });

  function getThreadName(thread: Thread) {
    return thread.otherName.trim() || t("privateConversationFallback");
  }

  function getThreadPreviewLabel(thread: Thread) {
    if (!isRecent(thread.lastAt)) {
      return t("privateChatThreadExpiredPreview");
    }

    return thread.lastMessage?.trim() || t("privateChatThreadStartPreview");
  }

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

  const openPaymentSelection = useCallback(
    (nextTargetUserId: string, message?: string) => {
      setPaymentSelectionTargetUserId(nextTargetUserId);
      setPaymentSelectionMessage(message || t("privateChatDefaultPaymentMessage"));
      setPaymentSelectionLoadingId(null);
      setBanner(null);
    },
    [t]
  );

  const closePaymentSelection = useCallback(() => {
    if (paymentSelectionLoadingId) return;

    setPaymentSelectionTargetUserId(null);
    setPaymentSelectionMessage(t("privateChatDefaultPaymentMessage"));
  }, [paymentSelectionLoadingId, t]);

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
              t("matchConnectionUnavailable")
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
            : t("matchConnectionUnavailable")
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
              t("privateChatConversationLoading")
            )
          );
          setMessages([]);
          return;
        }

        setMessages(normalizeMessageList(payload, threadId));
      } finally {
        setMessagesLoading(false);
      }
    },
    [redirectToLoginForCountryAccess, redirectToLoginForRefresh, token]
  );

  const syncThreadActivity = useCallback(
    (threadId: string, body: string | null, timestamp: number) => {
      setThreads((current) => {
        const fallbackThread =
          current.find((thread) => thread.id === threadId) ??
          optimisticThreadRef.current;

        if (!fallbackThread || fallbackThread.id !== threadId) {
          return current;
        }

        const updatedThread: Thread = {
          ...fallbackThread,
          lastMessage: body,
          lastAt: timestamp,
        };

        return sortThreads([
          updatedThread,
          ...current.filter((thread) => thread.id !== threadId),
        ]);
      });

      setOptimisticThread((current) =>
        current && current.id === threadId
          ? {
              ...current,
              lastMessage: body,
              lastAt: timestamp,
            }
          : current
      );
    },
    []
  );

  const handleSocketMessage = useCallback(
    (payload: unknown) => {
      if (!matchesActiveThreadPayload(payload, activeThread, myUserId)) return;

      const normalized = normalizeMessage(
        getMessagePayloadRecord(payload),
        activeThread?.id ?? activeThreadId
      );

      if (!normalized) return;

      setMessages((current) => upsertMessage(current, normalized));
      syncThreadActivity(
        normalized.threadId ?? activeThread?.id ?? activeThreadId ?? "",
        normalized.body,
        normalized.createdAt
      );
    },
    [activeThread, activeThreadId, myUserId, syncThreadActivity]
  );

  const handleSocketDelete = useCallback(
    (payload: unknown) => {
      if (!matchesActiveThreadPayload(payload, activeThread, myUserId)) return;

      const messageId = extractMessageIdFromPayload(payload);
      if (!messageId) return;

      setMessages((current) =>
        current.filter((message) => message.id !== messageId)
      );
      setActiveMessageId((current) => (current === messageId ? null : current));
      setEditingId((current) => (current === messageId ? null : current));
    },
    [activeThread, myUserId]
  );

  const handleSocketTyping = useCallback(
    (payload: unknown) => {
      if (!matchesActiveThreadPayload(payload, activeThread, myUserId)) return;

      const meta = extractTypingMeta(payload);
      if (!meta) return;
      if (meta.userId && meta.userId === myUserId) return;

      const key = meta.userId || meta.name.toLowerCase();
      const resolvedName = meta.name || activeThread?.otherName || "Quelqu'un";

      setTypingUsers((current) => {
        if (!meta.isTyping) {
          return current.filter((entry) => entry.key !== key);
        }

        const next = current.filter((entry) => entry.key !== key);
        next.push({
          key,
          name: resolvedName,
          expiresAt: Date.now() + 3200,
        });
        return next;
      });
    },
    [activeThread, myUserId]
  );

  const checkDmAccess = useCallback(
    async (nextTargetUserId: string): Promise<DmAccessCheckResult> => {
      if (!token) {
        throw new Error(AUTH_SESSION_INVALID_ERROR);
      }

      const res = await fetch(`${API}/dm/access/${encodeURIComponent(nextTargetUserId)}`, {
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

      if (UNSUPPORTED_DM_ACCESS_ENDPOINT_STATUSES.has(res.status)) {
        return { status: "unsupported" };
      }

      if (res.ok) {
        if (payload === null) {
          return { status: "unsupported" };
        }

        if (hasDmAccess(payload)) {
          return { status: "active" };
        }

        return {
          status: "needs_payment_selection",
          message: getPaymentSelectionMessage(payload),
        };
      }

      if (shouldOpenPaymentSelection(res.status, payload)) {
        return {
          status: "needs_payment_selection",
          message: getPaymentSelectionMessage(payload),
        };
      }

      throw new Error(
        buildBackendErrorMessage(
          payload,
          t("matchConnectionUnavailable")
        )
      );
    },
    [token]
  );

  const startDmPaymentCheckout = useCallback(
    async (nextTargetUserId: string, optionId: DmPaymentOptionId) => {
      if (!token) {
        throw new Error(AUTH_SESSION_INVALID_ERROR);
      }

      const payRes = await fetch(`${API}/payments/dm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          buildDmPaymentCheckoutPayload(nextTargetUserId, optionId)
        ),
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
            t("matchConnectionUnavailable")
          )
        );
      }

      const paymentUrl = getPaymentUrl(payPayload);
      if (!paymentUrl) {
        throw new Error("Lien de paiement introuvable.");
      }

      setBanner(t("privateChatRedirecting"));
      window.location.href = paymentUrl;
    },
    [token]
  );

  const handlePaymentSelection = useCallback(
    async (optionId: DmPaymentOptionId) => {
      if (!paymentSelectionTargetUserId || paymentSelectionLoadingId) return;

      setPaymentSelectionLoadingId(optionId);
      setBanner(t("loading"));

      try {
        await startDmPaymentCheckout(paymentSelectionTargetUserId, optionId);
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : t("matchConnectionUnavailable");

        if (message === AUTH_SESSION_INVALID_ERROR) {
          redirectToLoginForRefresh();
          return;
        }

        if (
          message === COUNTRY_NOT_ALLOWED ||
          message.startsWith(`${COUNTRY_NOT_ALLOWED}:`)
        ) {
          redirectToLoginForCountryAccess(message);
          return;
        }

        setBanner(message);
      } finally {
        setPaymentSelectionLoadingId(null);
      }
    },
    [
      paymentSelectionLoadingId,
      paymentSelectionTargetUserId,
      redirectToLoginForCountryAccess,
      redirectToLoginForRefresh,
      startDmPaymentCheckout,
    ]
  );

  const openPrivateChat = useCallback(
    async (nextTargetUserId: string, sessionId?: string) => {
      if (!token) {
        throw new Error(AUTH_SESSION_INVALID_ERROR);
      }

      if (!sessionId) {
        const accessState = await checkDmAccess(nextTargetUserId);

        if (accessState.status === "needs_payment_selection") {
          openPaymentSelection(nextTargetUserId, accessState.message);
          return null;
        }
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

      if (shouldOpenPaymentSelection(res.status, payload)) {
        openPaymentSelection(nextTargetUserId, getPaymentSelectionMessage(payload));
        return null;
      }

      throw new Error(
        buildBackendErrorMessage(payload, t("matchConnectionUnavailable"))
      );
    },
    [checkDmAccess, myUserId, openPaymentSelection, token]
  );

  const openTargetConversation = useCallback(async () => {
    if (!targetUserId) return;

    setIsOpeningTarget(true);
    setBanner(
      paid
        ? t("privateChatOpeningConversation")
        : t("privateChatOpeningChat")
    );

    try {
      const result = await openPrivateChat(
        targetUserId,
        checkoutSessionId || undefined
      );

      if (!result) {
        setBanner(null);
        return;
      }

      const { threadId, thread } = result;
      closePaymentSelection();
      setOptimisticThread(thread);
      setThreads((current) => mergeThreads(current, thread ? [thread] : [], thread));
      setActiveThreadId(threadId);
      setMobilePanel("chat");
      await loadThreads(threadId);

      if (paid || checkoutSessionId) {
        setBanner(null);
        navigate(buildPrivateChatPath(targetUserId), { replace: true });
      } else {
        setBanner(null);
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : t("matchConnectionUnavailable");

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
    closePaymentSelection,
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
    if (targetUserId) return;
    closePaymentSelection();
  }, [closePaymentSelection, targetUserId]);

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
      setTypingUsers([]);
      return;
    }

    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  useEffect(() => {
    if (!token || !myUserId || !activeThreadId) {
      setTypingUsers([]);
      return undefined;
    }

    const threadPayload = {
      room: activeThreadId,
      threadId: activeThreadId,
      conversationId: activeThreadId,
      userId: myUserId,
      username: effectiveUsername,
      name: effectiveUsername,
      targetUserId: activeThread?.otherUserId,
      otherUserId: activeThread?.otherUserId,
    };

    const joinThread = () => {
      socket.emit("join-room", threadPayload);
      socket.emit("join-thread", threadPayload);
      socket.emit("join-dm", threadPayload);
    };

    const leaveThread = () => {
      socket.emit("leave-room", threadPayload);
      socket.emit("leave-thread", threadPayload);
      socket.emit("leave-dm", threadPayload);
    };

    const stopTyping = () => {
      const payload = {
        ...threadPayload,
        isTyping: false,
        typing: false,
      };

      socket.emit("typing", payload);
      socket.emit("typing-stop", payload);
    };

    const connectAndRefresh = () => {
      joinThread();
      void loadMessages(activeThreadId);
    };

    if (!socket.connected) {
      socket.connect();
    }

    socket.on("connect", connectAndRefresh);
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
        typingTimeoutRef.current = null;
      }

      typingSentRef.current = false;
      setTypingUsers([]);
      stopTyping();

      socket.off("connect", connectAndRefresh);
      messageEvents.forEach((eventName) => socket.off(eventName, handleSocketMessage));
      updateEvents.forEach((eventName) => socket.off(eventName, handleSocketMessage));
      deleteEvents.forEach((eventName) => socket.off(eventName, handleSocketDelete));
      typingEvents.forEach((eventName) => socket.off(eventName, handleSocketTyping));
      leaveThread();
      socket.disconnect();
    };
  }, [
    activeThread?.otherUserId,
    activeThreadId,
    effectiveUsername,
    handleSocketDelete,
    handleSocketMessage,
    handleSocketTyping,
    loadMessages,
    myUserId,
    token,
  ]);

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
    clearTypingState();
    setEditingId(null);
    setInput("");
    setActiveMessageId(null);
  }

  function emitTypingState(isTyping: boolean) {
    if (!myUserId || !activeThreadId || !socket.connected) return;

    const payload = {
      room: activeThreadId,
      threadId: activeThreadId,
      conversationId: activeThreadId,
      userId: myUserId,
      username: effectiveUsername,
      name: effectiveUsername,
      targetUserId: activeThread?.otherUserId,
      otherUserId: activeThread?.otherUserId,
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

    if (!myUserId || !activeThreadId) return;

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
          : t("groupTranslateError")
      );
    }
  }

  async function updateDmMessage(messageId: string, nextBody: string) {
    if (!token || !myUserId || !activeThreadId) {
      throw new Error(t("typingDisabled"));
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
              t("privateChatEditError")
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
      throw new Error(t("privateChatEditError"));
    }
  }

  async function deleteDmMessage(messageId: string) {
    if (!token || !myUserId || !activeThreadId) {
      throw new Error(t("typingDisabled"));
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
              t("privateChatDeleteError")
            )
          );
      }

      return;
    }

    if (unsupported) {
      throw new Error(t("privateChatDeleteError"));
    }
  }

  async function send() {
    if (!token || !myUserId || !activeThreadId || sendLoading) return;

    const text = input.trim();
    if (!text) return;

    setSendLoading(true);
    setBanner(null);
    clearTypingState();

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
            : t("privateChatEditError")
        );
      } finally {
        setSendLoading(false);
      }

      return;
    }

    setInput("");

    const optimisticMessage: Msg = {
      id: `local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      threadId: activeThreadId,
      senderId: myUserId,
      body: text,
      createdAt: Date.now(),
      isPending: true,
    };

    setMessages((current) => upsertMessage(current, optimisticMessage));
    syncThreadActivity(activeThreadId, text, optimisticMessage.createdAt);

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
          buildBackendErrorMessage(payload, t("privateChatMessageNotSent"))
        );
      }

      const normalized =
        normalizeMessage(getMessagePayloadRecord(payload), activeThreadId) ?? null;

      if (normalized) {
        setMessages((current) => upsertMessage(current, normalized));
        syncThreadActivity(
          normalized.threadId ?? activeThreadId,
          normalized.body,
          normalized.createdAt
        );
        void loadThreads(activeThreadId);
      } else {
        await Promise.all([loadMessages(activeThreadId), loadThreads(activeThreadId)]);
      }

      setMobilePanel("chat");
    } catch (error) {
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id)
      );
      setBanner(
        error instanceof Error && error.message
          ? error.message
          : t("privateChatMessageNotSent")
      );
      setInput(text);
    } finally {
      setSendLoading(false);
    }
  }

  async function handleDelete(message: Msg) {
    if (!window.confirm(t("privateChatDeleteConfirm"))) return;

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
          : t("privateChatDeleteError")
      );
    }
  }

  return (
    <div className={`pc-root ${mobilePanel === "chat" ? "show-chat" : "show-threads"}`}>
      <header className="pc-topbar">
        <button className="pc-back" onClick={() => navigate("/my-space")}>
          {"<"} {t("privateChatBackToMySpace")}
        </button>
        <div className="pc-title">
          <h1>{t("privateChatMessagesTitle")}</h1>
          <span className="pc-sub">{t("privateChatArchiveSubtitle")}</span>
        </div>
      </header>

      {banner && (
        <div className="pc-banner" role="status">
          {banner}
        </div>
      )}

      {isPaymentSelectionOpen && (
        <div
          className="pc-paywall-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pc-paywall-title"
          onClick={closePaymentSelection}
        >
          <div
            className="pc-paywall-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pc-paywall-head">
              <div>
                <span className="pc-paywall-kicker">{t("privateChatPaywallKicker")}</span>
                <h2 id="pc-paywall-title">{t("privateChatPaywallTitle")}</h2>
              </div>
              <button
                type="button"
                className="pc-paywall-close"
                onClick={closePaymentSelection}
                disabled={!!paymentSelectionLoadingId}
              >
                {t("later")}
              </button>
            </div>

            <p className="pc-paywall-message">{paymentSelectionMessage}</p>

            <div className="pc-paywall-options">
              {DM_PAYMENT_OPTIONS.map((option) => {
                const isLoading = paymentSelectionLoadingId === option.id;

                return (
                  <article
                    key={option.id}
                    className={`pc-paywall-option ${
                      option.featured ? "featured" : ""
                    }`}
                  >
                    <div className="pc-paywall-option-head">
                      <div>
                        <strong>
                          {option.id === "subscription"
                            ? t("privateChatOptionSubscriptionTitle")
                            : t("privateChatOptionOneTimeTitle")}
                        </strong>
                        <span>
                          {option.id === "subscription"
                            ? t("privateChatOptionSubscriptionBilling")
                            : t("privateChatOptionOneTimeBilling")}
                        </span>
                      </div>
                      {option.featured ? (
                        <span className="pc-paywall-badge">{t("privateChatFeaturedBadge")}</span>
                      ) : null}
                    </div>

                    <div className="pc-paywall-price">{option.priceLabel}</div>
                    <p>
                      {option.id === "subscription"
                        ? t("privateChatOptionSubscriptionDescription")
                        : t("privateChatOptionOneTimeDescription")}
                    </p>

                    <button
                      type="button"
                      className="pc-paywall-action"
                      onClick={() => void handlePaymentSelection(option.id)}
                      disabled={!!paymentSelectionLoadingId}
                    >
                      {isLoading
                        ? t("privateChatRedirecting")
                        : t("privateChatChooseOption", { price: option.priceLabel })}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="pc-layout">
        <aside className="pc-sidebar">
          <div className="pc-sidebar-head">
            <div className="pc-sidebar-title">{t("privateChatArchiveTitle")}</div>
            <div className="pc-sidebar-actions">
              <button className="pc-home-link" onClick={() => navigate("/match")}>
                {t("privateChatProfiles")}
              </button>
              <button className="pc-home-link" onClick={() => navigate("/private-chat")}>
                {t("privateChatArchiveAction")}
              </button>
            </div>
          </div>

          <div className="pc-archive-card">
            <span className="pc-archive-kicker">{t("privateChatArchiveKicker")}</span>
            <strong>
              {isOpeningTarget ? t("privateChatOpeningChat") : archiveCountLabel}
            </strong>
            <span>{t("privateChatArchiveDescription")}</span>
          </div>

          {threadsLoading && <div className="pc-empty">{t("privateChatThreadsLoading")}</div>}

          {!threadsLoading && threads.length === 0 && (
            <div className="pc-empty">{t("privateChatNoThreads")}</div>
          )}

          {threads.map((thread) => {
            const threadName = getThreadName(thread);

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
                    <div className="pc-thread-last">{getThreadPreviewLabel(thread)}</div>
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
                    {"<"} {t("privateChatConversations")}
                  </button>
                  <img
                    className="pc-avatar pc-avatar-lg"
                    src={buildAvatarUrl({
                      name: getThreadName(activeThread),
                      avatarPath: activeThread.otherAvatar,
                      seed: activeThread.otherUserId || activeThread.id,
                      size: 96,
                    })}
                    alt={getThreadName(activeThread)}
                  />
                  <div className="pc-chat-user">
                    <strong>{getThreadName(activeThread)}</strong>
                    <span>{t("privateChatEphemeralHint")}</span>
                  </div>
                </div>
              </div>

              <div className="pc-stream" ref={streamRef}>
                {messagesLoading && (
                  <div className="pc-empty">{t("privateChatConversationLoading")}</div>
                )}

                {!messagesLoading && visibleMessages.length === 0 && (
                  <div className="pc-empty">{t("privateChatNoVisibleMessages")}</div>
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
                              {message.editedAt ? <span>{t("groupEdited")}</span> : null}
                            </div>
                          </button>

                          {showActions ? (
                            <div className={`pc-actions ${isOwnMessage ? "me" : "them"}`}>
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
                                  onClick={() => void handleDelete(message)}
                                >
                                  {t("deleteAction")}
                                </button>
                              ) : null}

                              {!message.translatedText && message.body.trim() ? (
                                <button
                                  type="button"
                                  onClick={() => void translateMessage(message)}
                                >
                                  {t("translateAction")}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}

                {typingLabel ? (
                  <div className="pc-typing" aria-live="polite">
                    <span className="pc-typing-indicator" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                    <span>{typingLabel}</span>
                  </div>
                ) : null}
              </div>

              <footer className="pc-input-wrap">
                {editingMessage ? (
                  <div className="pc-editing">
                    <span>{t("privateChatEditing")}</span>
                    <button type="button" onClick={cancelEditing}>
                      {t("cancel")}
                    </button>
                  </div>
                ) : null}

                <div className="pc-inputbar">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={t("privateChatPlaceholder")}
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
                {targetUserId
                  ? isOpeningTarget
                    ? t("privateChatOpeningConversation")
                    : t("privateChatNotOpen")
                  : t("privateChatChooseConversation")}
              </strong>
              <span>
                {targetUserId
                  ? t("privateChatAccessChoiceHint")
                  : t("privateChatArchiveHint")}
              </span>
              <div className="pc-empty-actions">
                {targetUserId && !isOpeningTarget ? (
                  <button
                    className="pc-home-link"
                    onClick={() => void openTargetConversation()}
                  >
                    {t("privateChatStartThisChat")}
                  </button>
                ) : null}
                <button className="pc-home-link" onClick={() => navigate("/match")}>
                  {t("privateChatViewProfiles")}
                </button>
                <button className="pc-home-link" onClick={() => navigate("/my-space")}>
                  {t("privateChatManageFriends")}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
