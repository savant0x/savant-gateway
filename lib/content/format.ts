import type { ModelAccess } from "../types.ts";
import type { ContentKind, ContentRelation } from "./types.ts";

export const RELATION_LABELS: Record<ContentRelation, string> = {
  release: "Release",
  benchmark: "Benchmark",
  hands_on: "Hands-on",
  discussion: "Discussion",
  repository: "Repository",
  paper: "Paper",
  mention: "Mention",
};

export const KIND_LABELS: Record<ContentKind, string> = {
  article: "Article",
  video: "Video",
  paper: "Paper",
  repo: "Repository",
  discussion: "Discussion",
};

export const KIND_ICONS: Record<ContentKind, string> = {
  article: "fa-newspaper",
  video: "fa-play",
  paper: "fa-file-lines",
  repo: "fa-code-branch",
  discussion: "fa-comments",
};

export const KIND_PILL_STYLES: Record<ContentKind, string> = {
  article: "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
  video: "border-rose-300/30 bg-rose-300/10 text-rose-200",
  paper: "border-violet-300/30 bg-violet-300/10 text-violet-200",
  repo: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  discussion: "border-amber-300/30 bg-amber-300/10 text-amber-200",
};

const TAG_PILL_STYLES = [
  "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
  "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-200",
  "border-violet-300/30 bg-violet-300/10 text-violet-200",
  "border-amber-300/30 bg-amber-300/10 text-amber-200",
  "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
] as const;

export function relationLabel(relation: ContentRelation): string {
  return RELATION_LABELS[relation];
}

export function kindLabel(kind: ContentKind): string {
  return KIND_LABELS[kind];
}

export function kindPillClass(kind: ContentKind): string {
  return KIND_PILL_STYLES[kind];
}

/** Stable topic colors keep a tag's visual identity across Signal surfaces. */
export function tagPillClass(tag: string): string {
  let hash = 0;

  for (const character of tag) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return TAG_PILL_STYLES[hash % TAG_PILL_STYLES.length];
}

/** Stable UTC display; a feed date must not shift by the server timezone. */
export function contentDate(iso: string | null): string {
  if (!iso) return "Undated";

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "Undated";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export type PurchaseCta = {
  label: string;
  href: string;
};

/**
 * The content surface never invents a purchase path. Every CTA lands on an
 * existing route that already knows the customer's balance and plan state.
 */
export function purchaseCta(
  access: ModelAccess,
  signedIn: boolean,
): PurchaseCta {
  if (access === "free")
    return { label: "Open the console", href: "/dashboard" };
  if (access === "subscription") return { label: "View plans", href: "/plans" };

  return signedIn
    ? { label: "Add credit", href: "/account" }
    : { label: "Create an account", href: "/signup" };
}

const VIDEO_ID = /^[A-Za-z0-9_-]{6,32}$/;

/**
 * One embed URL for the card modal and the detail page. A malformed id returns
 * null rather than becoming an iframe source.
 */
export function videoEmbedUrl(
  videoId: string | null,
  autoplay = false,
): string | null {
  const id = videoId?.trim() ?? "";

  if (!VIDEO_ID.test(id)) return null;

  const params = new URLSearchParams({ rel: "0", modestbranding: "1" });

  if (autoplay) params.set("autoplay", "1");

  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    id,
  )}?${params.toString()}`;
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";

  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function shortExcerpt(value: string, max = 180): string {
  const clean = value.replace(/\s+/g, " ").trim();

  if (clean.length <= max) return clean;

  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
