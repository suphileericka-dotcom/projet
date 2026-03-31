import { API_BASE } from "../config/api";

export const EDIT_WINDOW_MS = 20 * 60 * 1000;
export const MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000;

export type ChatAuthor = {
  id: string | null;
  name: string;
  avatar: string;
};

export type ChatMessage = {
  id: string;
  room: string;
  type: "text" | "voice";
  text: string;
  createdAt: number;
  updatedAt?: number;
  editedAt?: number;
  sender: ChatAuthor;
  translatedText?: string;
};

export type EphemeralNote = {
  id: string;
  text: string;
  createdAt: number;
};

type NormalizationOptions = {
  currentUserId?: string | null;
  currentUsername?: string | null;
  currentAvatar?: string | null;
};

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized.length > 0) return normalized;
    }
  }

  return undefined;
}

function readNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const normalized = Number(value);
      if (Number.isFinite(normalized)) return normalized;
    }
  }

  return undefined;
}

function toTimestamp(value: unknown): number | undefined {
  const numeric = readNumber(value);
  if (numeric !== undefined) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return undefined;
}

function resolveUpload(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
}

export function buildAvatarUrl(name: string, avatarPath?: string | null): string {
  const resolved = resolveUpload(avatarPath);
  if (resolved) return resolved;

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name || "M"
  )}&background=0f172a&color=ffffff&size=96`;
}

export function formatMessageTime(value?: number | null): string {
  if (!value || !Number.isFinite(value)) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return timeFormatter.format(date);
}

export function formatOnlineCount(value: number): string {
  return value > 1 ? `${value} personnes en ligne` : `${value} personne en ligne`;
}

export function canManageMessage(
  message: ChatMessage,
  currentUserId: string | null,
  now = Date.now()
): boolean {
  return (
    message.type === "text" &&
    !!currentUserId &&
    message.sender.id === currentUserId &&
    now - message.createdAt <= EDIT_WINDOW_MS
  );
}

export function isExpiredMessage(message: ChatMessage, now = Date.now()): boolean {
  return now - message.createdAt >= MESSAGE_RETENTION_MS;
}

export function pruneExpiredMessages(
  messages: ChatMessage[],
  now = Date.now()
): ChatMessage[] {
  return messages.filter((message) => !isExpiredMessage(message, now));
}

export function areMessageListsEqual(
  left: ChatMessage[],
  right: ChatMessage[]
): boolean {
  if (left.length !== right.length) return false;

  return left.every((message, index) => {
    const other = right[index];
    return (
      message.id === other.id &&
      message.text === other.text &&
      message.createdAt === other.createdAt &&
      message.editedAt === other.editedAt &&
      message.translatedText === other.translatedText &&
      message.sender.id === other.sender.id &&
      message.sender.name === other.sender.name &&
      message.sender.avatar === other.sender.avatar
    );
  });
}

export function mergeLocalMessageState(
  incoming: ChatMessage[],
  current: ChatMessage[]
): ChatMessage[] {
  const currentById = new Map(current.map((message) => [message.id, message]));

  return pruneExpiredMessages(
    incoming
      .map((message) => {
        const previous = currentById.get(message.id);
        if (!previous) return message;

        return {
          ...message,
          translatedText: previous.translatedText ?? message.translatedText,
        };
      })
      .sort((a, b) => {
        if (a.createdAt === b.createdAt) {
          return a.id.localeCompare(b.id);
        }

        return a.createdAt - b.createdAt;
      })
  );
}

export function upsertMessage(
  current: ChatMessage[],
  incoming: ChatMessage
): ChatMessage[] {
  const next = current.filter((message) => message.id !== incoming.id);
  next.push(incoming);

  return pruneExpiredMessages(
    next.sort((a, b) => {
      if (a.createdAt === b.createdAt) {
        return a.id.localeCompare(b.id);
      }

      return a.createdAt - b.createdAt;
    })
  );
}

export function removeMessageById(
  current: ChatMessage[],
  messageId: string
): ChatMessage[] {
  return current.filter((message) => message.id !== messageId);
}

export function normalizeMessage(
  rawMessage: unknown,
  fallbackRoom: string,
  options: NormalizationOptions = {}
): ChatMessage | null {
  const record = asRecord(rawMessage);
  if (!record) return null;

  const nestedUser = asRecord(record.user);
  const nestedAuthor = asRecord(record.author);
  const nestedSender = asRecord(record.sender);

  const id = readString(
    record.id,
    record.message_id,
    record.messageId,
    record._id
  );

  if (!id) return null;

  const room = readString(
    record.room,
    record.room_id,
    record.roomId,
    record.channel
  ) || fallbackRoom;

  if (room !== fallbackRoom) return null;

  const senderId =
    readString(
      record.user_id,
      record.userId,
      record.author_id,
      record.authorId,
      record.sender_id,
      record.senderId,
      nestedUser?.id,
      nestedAuthor?.id,
      nestedSender?.id
    ) || null;

  const isOwnMessage = !!options.currentUserId && senderId === options.currentUserId;

  const senderName =
    readString(
      record.username,
      record.name,
      record.display_name,
      record.displayName,
      nestedUser?.username,
      nestedUser?.name,
      nestedAuthor?.username,
      nestedAuthor?.name,
      nestedSender?.username,
      nestedSender?.name
    ) ||
    (isOwnMessage ? options.currentUsername?.trim() || "Moi" : "Membre");

  const senderAvatar =
    readString(
      record.avatar,
      record.avatar_url,
      record.avatarUrl,
      nestedUser?.avatar,
      nestedUser?.avatar_url,
      nestedUser?.avatarUrl,
      nestedAuthor?.avatar,
      nestedAuthor?.avatar_url,
      nestedAuthor?.avatarUrl,
      nestedSender?.avatar,
      nestedSender?.avatar_url,
      nestedSender?.avatarUrl
    ) || (isOwnMessage ? options.currentAvatar || undefined : undefined);

  const type = record.audio_path ? "voice" : "text";
  const text =
    readString(record.content, record.text, record.body, record.message) ||
    (type === "voice" ? "Ancien message vocal indisponible." : "");

  const createdAt =
    toTimestamp(
      record.created_at ??
        record.createdAt ??
        record.sent_at ??
        record.sentAt ??
        record.timestamp
    ) || Date.now();

  const updatedAt = toTimestamp(record.updated_at ?? record.updatedAt);
  const editedAt =
    toTimestamp(record.edited_at ?? record.editedAt) ||
    (updatedAt && updatedAt > createdAt ? updatedAt : undefined);

  return {
    id,
    room,
    type,
    text,
    createdAt,
    updatedAt,
    editedAt,
    sender: {
      id: senderId,
      name: senderName,
      avatar: buildAvatarUrl(senderName, senderAvatar),
    },
  };
}

export function normalizeMessageList(
  payload: unknown,
  fallbackRoom: string,
  options: NormalizationOptions = {}
): ChatMessage[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload)?.messages)
      ? (asRecord(payload)?.messages as unknown[])
      : [];

  return pruneExpiredMessages(
    list
      .map((entry) => normalizeMessage(entry, fallbackRoom, options))
      .filter((message): message is ChatMessage => message !== null)
      .sort((a, b) => {
        if (a.createdAt === b.createdAt) {
          return a.id.localeCompare(b.id);
        }

        return a.createdAt - b.createdAt;
      })
  );
}

export function matchesRoomPayload(payload: unknown, room: string): boolean {
  const record = asRecord(payload);
  if (!record) return true;

  const payloadRoom = readString(
    record.room,
    record.room_id,
    record.roomId,
    record.channel
  );

  return !payloadRoom || payloadRoom === room;
}

export function extractMessageId(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) return null;

  return (
    readString(record.id, record.message_id, record.messageId, record._id) ||
    null
  );
}

export function extractTypingMeta(payload: unknown): {
  userId: string | null;
  name: string;
  isTyping: boolean;
} | null {
  const record = asRecord(payload);
  if (!record) return null;

  return {
    userId:
      readString(
        record.userId,
        record.user_id,
        record.senderId,
        record.sender_id,
        record.authorId,
        record.author_id
      ) || null,
    name:
      readString(
        record.username,
        record.name,
        record.displayName,
        record.display_name
      ) || "Quelqu'un",
    isTyping:
      Boolean(record.isTyping ?? record.typing ?? record.active ?? true),
  };
}
