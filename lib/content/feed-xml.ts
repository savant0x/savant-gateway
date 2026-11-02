/**
 * Feed XML and sanitization helpers (FID-2026-1102-088).
 *
 * Both feed dialects share these. They live here so `feeds.ts` (RSS/Atom) and
 * `feed-youtube.ts` (YouTube media:group) stay under the file ceiling and the
 * sanitization policy has exactly one definition.
 */

import sanitizeHtml from "sanitize-html";

import { CONTENT_LIMITS } from "./policy.ts";
import { normalizeTags } from "./taxonomy.ts";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "a",
  "img",
  "h2",
  "h3",
  "h4",
  "figure",
  "figcaption",
  "hr",
];

export const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "loading"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: "noreferrer noopener" },
    }),
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: "lazy" },
    }),
  },
};

export type ParseOptions = {
  baseUrl: string;
  sourceKind: "rss" | "youtube";
  tags: string[];
  maxItems?: number;
  now?: string;
};

export function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];

  return Array.isArray(value) ? value : [value];
}

export function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);

  if (Array.isArray(value)) {
    return value
      .map((entry) => textOf(entry))
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.__cdata === "string") return record.__cdata.trim();
    if (typeof record["#text"] === "string") return record["#text"].trim();

    return "";
  }

  return "";
}

export function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = textOf(value);

    if (text) return text;
  }

  return "";
}

export function attr(value: unknown, name: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";

  const found = (value as Record<string, unknown>)[`@_${name}`];

  return typeof found === "string" ? found.trim() : "";
}

export function firstObject(value: unknown): Record<string, unknown> | null {
  for (const candidate of asArray(value)) {
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      return candidate as Record<string, unknown>;
    }
  }

  return null;
}

/** YouTube attrs are strings; an absent or malformed count stays unreported. */
export function numberAttr(value: unknown, name: string): number | null {
  const raw = attr(value, name);

  if (!raw) return null;

  const number = Number(raw);

  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function entryLink(entry: Record<string, unknown>): string {
  for (const candidate of asArray(entry.link)) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (!candidate || typeof candidate !== "object") continue;

    const record = candidate as Record<string, unknown>;
    const rel = attr(record, "rel");

    if (!rel || rel === "alternate") {
      const href = attr(record, "href");

      if (href) return href;
    }
  }

  return firstText(entry.id, entry.guid);
}

export function mediaUrl(entry: Record<string, unknown>): string | null {
  const group = firstObject(entry["media:group"]);

  for (const source of [group, entry]) {
    if (!source) continue;

    for (const key of ["media:thumbnail", "media:content", "enclosure"]) {
      for (const candidate of asArray(source[key])) {
        const url = attr(candidate, "url");

        if (url) return url;
      }
    }
  }

  return null;
}

export function entryTags(
  entry: Record<string, unknown>,
  extra: string[],
): string[] {
  const categories: unknown[] = [];

  for (const key of ["category", "media:keywords"]) {
    for (const candidate of asArray(entry[key])) {
      if (typeof candidate === "string") {
        categories.push(candidate);
      } else if (candidate && typeof candidate === "object") {
        const record = candidate as Record<string, unknown>;

        categories.push(attr(record, "term"), textOf(record));
      }
    }
  }

  return normalizeTags([...extra, ...categories]);
}

export function stripHtml(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanBody(value: string): string | null {
  const clean = sanitizeHtml(value, SANITIZE_OPTIONS).trim();

  if (!clean) return null;

  return clean.slice(0, CONTENT_LIMITS.maxBodyChars);
}

/**
 * YouTube descriptions are plain text. Escape first, then preserve paragraphs
 * and single line breaks, so a description that mentions `<script>` renders as
 * text rather than markup.
 */
export function plainTextBody(value: string): string | null {
  const plain = sanitizeHtml(value.replace(/\r\n/g, "\n"), {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();

  if (!plain) return null;

  const paragraphs = plain
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${part.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return paragraphs.slice(0, CONTENT_LIMITS.maxBodyChars) || null;
}

export function publishedAt(value: unknown, fallback: string): string {
  const text = textOf(value);

  if (!text) return fallback;

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}
