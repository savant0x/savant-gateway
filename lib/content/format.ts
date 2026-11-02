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

export function relationLabel(relation: ContentRelation): string {
  return RELATION_LABELS[relation];
}

export function kindLabel(kind: ContentKind): string {
  return KIND_LABELS[kind];
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
