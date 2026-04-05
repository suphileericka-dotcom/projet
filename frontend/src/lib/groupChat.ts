import { buildAvatarUrl as buildSharedAvatarUrl } from "./avatar";

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

function getPayloadRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return null;

  const record = asRecord(value);
  if (!record) return null;

  const nestedData = asRecord(record.data);

  return (
    asRecord(record.message) ??
    asRecord(record.item) ??
    asRecord(nestedData?.message) ??
    asRecord(nestedData?.item) ??
    record
  );
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

export function buildAvatarUrl(name: string, avatarPath?: string | null): string {
  return buildSharedAvatarUrl({
    name: name || "Membre",
    avatarPath,
    seed: `${name || "Membre"}-${avatarPath || ""}`,
    size: 96,
  });
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

function buildMessageSenderKey(message: ChatMessage): string {
  return (
    message.sender.id ||
    message.sender.name.trim().toLowerCase() ||
    "unknown"
  );
}

function buildMessageSignature(message: ChatMessage): string {
  return [
    message.room,
    message.type,
    buildMessageSenderKey(message),
    message.text.trim(),
    message.createdAt,
  ].join("::");
}

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    if (a.createdAt === b.createdAt) {
      return a.id.localeCompare(b.id);
    }

    return a.createdAt - b.createdAt;
  });
}

function mergeMessageEntries(
  current: ChatMessage,
  incoming: ChatMessage
): ChatMessage {
  const incomingName = incoming.sender.name.trim();
  const currentName = current.sender.name.trim();

  return {
    ...current,
    ...incoming,
    id: current.id,
    translatedText: current.translatedText ?? incoming.translatedText,
    sender: {
      id: current.sender.id ?? incoming.sender.id,
      name:
        incomingName && incomingName.toLowerCase() !== "membre"
          ? incoming.sender.name
          : currentName
            ? current.sender.name
            : incoming.sender.name,
      avatar: incoming.sender.avatar || current.sender.avatar,
    },
  };
}

function dedupeMessages(messages: ChatMessage[]): ChatMessage[] {
  const deduped: ChatMessage[] = [];

  for (const message of sortMessages(messages)) {
    const signature = buildMessageSignature(message);
    const existingIndex = deduped.findIndex(
      (entry) =>
        entry.id === message.id ||
        buildMessageSignature(entry) === signature
    );

    if (existingIndex === -1) {
      deduped.push(message);
      continue;
    }

    deduped[existingIndex] = mergeMessageEntries(
      deduped[existingIndex],
      message
    );
  }

  return sortMessages(deduped);
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
  const currentBySignature = new Map(
    current.map((message) => [buildMessageSignature(message), message])
  );

  return pruneExpiredMessages(
    dedupeMessages(
      incoming.map((message) => {
        const previous =
          currentById.get(message.id) ??
          currentBySignature.get(buildMessageSignature(message));

        if (!previous) return message;
        return mergeMessageEntries(previous, message);
      })
    )
  );
}

export function upsertMessage(
  current: ChatMessage[],
  incoming: ChatMessage
): ChatMessage[] {
  const incomingSignature = buildMessageSignature(incoming);
  const previous =
    current.find((message) => message.id === incoming.id) ??
    current.find(
      (message) => buildMessageSignature(message) === incomingSignature
    );
  const next = current.filter(
    (message) =>
      message.id !== incoming.id &&
      buildMessageSignature(message) !== incomingSignature
  );
  next.push(previous ? mergeMessageEntries(previous, incoming) : incoming);

  return pruneExpiredMessages(dedupeMessages(next));
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
  const record = getPayloadRecord(rawMessage);
  const originalRecord = asRecord(rawMessage);
  if (!record || !originalRecord) return null;

  const nestedUser = asRecord(record.user) ?? asRecord(originalRecord.user);
  const nestedAuthor = asRecord(record.author) ?? asRecord(originalRecord.author);
  const nestedSender = asRecord(record.sender) ?? asRecord(originalRecord.sender);

  const id = readString(
    record.id,
    record.message_id,
    record.messageId,
    record._id,
    originalRecord.id,
    originalRecord.message_id,
    originalRecord.messageId,
    originalRecord._id
  );

  if (!id) return null;

  const room = readString(
    record.room,
    record.room_id,
    record.roomId,
    record.channel,
    originalRecord.room,
    originalRecord.room_id,
    originalRecord.roomId,
    originalRecord.channel
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
      originalRecord.user_id,
      originalRecord.userId,
      originalRecord.author_id,
      originalRecord.authorId,
      originalRecord.sender_id,
      originalRecord.senderId,
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
      originalRecord.username,
      originalRecord.name,
      originalRecord.display_name,
      originalRecord.displayName,
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
      originalRecord.avatar,
      originalRecord.avatar_url,
      originalRecord.avatarUrl,
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

  const type = record.audio_path || originalRecord.audio_path ? "voice" : "text";
  const text =
    readString(
      record.content,
      record.text,
      record.body,
      originalRecord.content,
      originalRecord.text,
      originalRecord.body,
      originalRecord.message
    ) ||
    (type === "voice" ? "Ancien message vocal indisponible." : "");

  const createdAt =
    toTimestamp(
      record.created_at ??
        record.createdAt ??
        record.sent_at ??
        record.sentAt ??
        record.timestamp ??
        originalRecord.created_at ??
        originalRecord.createdAt ??
        originalRecord.sent_at ??
        originalRecord.sentAt ??
        originalRecord.timestamp
    ) || Date.now();

  const updatedAt = toTimestamp(
    record.updated_at ??
      record.updatedAt ??
      originalRecord.updated_at ??
      originalRecord.updatedAt
  );
  const editedAt =
    toTimestamp(
      record.edited_at ??
        record.editedAt ??
        originalRecord.edited_at ??
        originalRecord.editedAt
    ) ||
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
  const record = asRecord(payload);
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.messages)
      ? (record.messages as unknown[])
      : Array.isArray(record?.items)
        ? (record.items as unknown[])
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
  const record = getPayloadRecord(payload);
  const originalRecord = asRecord(payload);
  if (!record) return true;

  const payloadRoom = readString(
    record.room,
    record.room_id,
    record.roomId,
    record.channel,
    originalRecord?.room,
    originalRecord?.room_id,
    originalRecord?.roomId,
    originalRecord?.channel
  );

  return !payloadRoom || payloadRoom === room;
}

export function extractMessageId(payload: unknown): string | null {
  const record = getPayloadRecord(payload);
  const originalRecord = asRecord(payload);
  if (!record) return null;

  return (
    readString(
      record.id,
      record.message_id,
      record.messageId,
      record._id,
      originalRecord?.id,
      originalRecord?.message_id,
      originalRecord?.messageId,
      originalRecord?._id
    ) ||
    null
  );
}

export function extractTypingMeta(payload: unknown): {
  userId: string | null;
  name: string;
  isTyping: boolean;
} | null {
  const record = getPayloadRecord(payload);
  const originalRecord = asRecord(payload);
  if (!record) return null;

  const nestedSender =
    asRecord(record.sender) ??
    asRecord(record.user) ??
    asRecord(record.author) ??
    asRecord(originalRecord?.sender) ??
    asRecord(originalRecord?.user) ??
    asRecord(originalRecord?.author);

  return {
    userId:
      readString(
        record.userId,
        record.user_id,
        record.senderId,
        record.sender_id,
        record.authorId,
        record.author_id,
        originalRecord?.userId,
        originalRecord?.user_id,
        originalRecord?.senderId,
        originalRecord?.sender_id,
        originalRecord?.authorId,
        originalRecord?.author_id,
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
        originalRecord?.username,
        originalRecord?.name,
        originalRecord?.displayName,
        originalRecord?.display_name,
        nestedSender?.username,
        nestedSender?.name,
        nestedSender?.displayName,
        nestedSender?.display_name
      ) || "Quelqu'un",
    isTyping:
      Boolean(
        record.isTyping ??
          record.typing ??
          record.active ??
          originalRecord?.isTyping ??
          originalRecord?.typing ??
          originalRecord?.active ??
          true
      ),
  };
}
