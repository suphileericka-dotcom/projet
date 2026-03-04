// src/lib/storyUtils.ts
// Utilitaires partagés pour tags / stockage / formats

export type Tag =
  | "burnout"
  | "solitude"
  | "rupture"
  | "expatriation"
  | "changement";

export const TAGS: Tag[] = [
  "burnout",
  "solitude",
  "rupture",
  "expatriation",
  "changement",
];

export type Story = {
  id: string;
  authorId: string; // userId localStorage (anonyme)
  title: string;
  body: string;
  tags: Tag[];
  createdAt: number;
  shared: boolean; // visible dans /stories ou non
};

export type StoryComment = {
  id: string;
  storyId: string;
  body: string;
  createdAt: number;
};

// Clés localStorage
export const LS_MAIN_STORY = "main_story";
export const LS_PUBLIC_STORIES = "public_stories";
export const LS_STORY_COMMENTS = "story_comments"; // { [storyId]: StoryComment[] }

// Extraction simple de tags par mots-clés (améliorable plus tard)
export function extractTags(text: string): Tag[] {
  const t = text.toLowerCase();

  const hits: Tag[] = [];
  const add = (tag: Tag) => !hits.includes(tag) && hits.push(tag);

  // burnout
  if (
    t.includes("burnout") ||
    t.includes("épuis") ||
    t.includes("epuis") ||
    t.includes("fatigu") ||
    t.includes("trop de travail") ||
    t.includes("pression")
  ) add("burnout");

  // solitude
  if (
    t.includes("seul") ||
    t.includes("solitude") ||
    t.includes("isol") ||
    t.includes("personne") ||
    t.includes("vide")
  ) add("solitude");

  // rupture
  if (
    t.includes("rupture") ||
    t.includes("séparation") ||
    t.includes("separation") ||
    t.includes("ex") ||
    t.includes("quitt") ||
    t.includes("divorce")
  ) add("rupture");

  // expatriation
  if (
    t.includes("expatri") ||
    t.includes("pays") ||
    t.includes("étranger") ||
    t.includes("etranger") ||
    t.includes("visa") ||
    t.includes("culture")
  ) add("expatriation");

  // changement
  if (
    t.includes("changement") ||
    t.includes("nouvelle vie") ||
    t.includes("démén") ||
    t.includes("demen") ||
    t.includes("transition") ||
    t.includes("reconversion")
  ) add("changement");

  // Si rien détecté, on laisse vide (l’utilisateur peut sélectionner)
  return hits;
}

export function nowId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}
