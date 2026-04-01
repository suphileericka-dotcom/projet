import { API_BASE } from "../config/api";

const AVATAR_BACKGROUNDS = [
  "1d4ed8",
  "0f766e",
  "7c3aed",
  "b91c1c",
  "c2410c",
  "0369a1",
  "4338ca",
  "be123c",
  "047857",
  "334155",
];

type AvatarOptions = {
  name?: string | null;
  avatarPath?: string | null;
  seed?: string | null;
  size?: number;
};

function hashSeed(value: string) {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash;
}

export function resolveAvatarUpload(path?: string | null): string | null {
  if (!path) return null;
  if (/^[a-z]+:/i.test(path)) return path;

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
}

export function buildGeneratedAvatarUrl(
  name?: string | null,
  seed?: string | null,
  size = 96,
): string {
  const label = name?.trim() || "Membre";
  const background =
    AVATAR_BACKGROUNDS[
      hashSeed((seed || label).trim() || "membre") % AVATAR_BACKGROUNDS.length
    ];

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    label,
  )}&background=${background}&color=ffffff&size=${size}&bold=true`;
}

export function buildAvatarUrl({
  name,
  avatarPath,
  seed,
  size = 96,
}: AvatarOptions): string {
  const uploadedAvatar = resolveAvatarUpload(avatarPath);
  if (uploadedAvatar) return uploadedAvatar;

  return buildGeneratedAvatarUrl(name, seed, size);
}
