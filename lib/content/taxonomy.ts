/**
 * Content taxonomy (FID-2026-1102-088).
 *
 * Feeds publish categories as free text: `OpenAI`, `open-ai`, `#OpenAI`,
 * `Large Language Models`. Storing those verbatim makes a topic page a
 * different page per publisher. A single normalized slug plus a display label
 * keeps the topic stable without pretending it is a semantic classifier.
 *
 * This module is pure so the normalization contract is testable without a
 * database or a server.
 */

import type { SourceConfig } from "./types.ts";

const MAX_TAG_LENGTH = 48;
const MAX_TAGS = 12;

/** Slugs that publishers use for the same subject. Extend deliberately. */
const ALIASES: Record<string, string> = {
  "open-ai": "openai",
  "open ai": "openai",
  "openai-inc": "openai",
  "anthropic-ai": "anthropic",
  "anthropic ai": "anthropic",
  "google-deepmind": "deepmind",
  "google deepmind": "deepmind",
  "google-ai": "google",
  "meta-ai": "meta",
  "x-ai": "xai",
  "xai-grok": "xai",
  "large-language-models": "llm",
  "large language models": "llm",
  "large-language-model": "llm",
  "machine-learning": "ml",
  "machine learning": "ml",
  "artificial-intelligence": "ai",
  "artificial intelligence": "ai",
  "natural-language-processing": "nlp",
  "natural language processing": "nlp",
  "retrieval-augmented-generation": "rag",
  "retrieval augmented generation": "rag",
  "reinforcement-learning": "rl",
  "reinforcement learning": "rl",
  "mixture-of-experts": "moe",
  "mixture of experts": "moe",
};

/**
 * Normalizes one publisher tag to a stable lowercase slug.
 *
 * Dots and plus signs are meaningful in model names (`gpt-6.1`, `c++`), so they
 * are kept. Every other separator becomes a single hyphen.
 */
export function normalizeTag(raw: string): string {
  const compact = raw
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9.+]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TAG_LENGTH)
    .replace(/[-.]+$/g, "");

  if (!compact) return "";

  return ALIASES[compact] ?? compact;
}

/** Display label for a canonical slug (`hands-on` → `Hands on`). */
export function tagLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Deterministic, deduplicated, capped tag list. Empty values disappear. */
export function normalizeTags(values: unknown, limit = MAX_TAGS): string[] {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;

    const slug = normalizeTag(value);

    if (!slug || seen.has(slug)) continue;

    seen.add(slug);

    if (seen.size >= limit) break;
  }

  return Array.from(seen);
}

/** Parses the comma/line separated operator tag field. */
export function parseTagInput(value: string): string[] {
  return normalizeTags(value.split(/[,\n]/));
}

/** Source config arrives as JSON text; tolerate old or malformed rows. */
export function parseSourceConfig(value: unknown): SourceConfig {
  if (typeof value !== "string") return { tags: [] };

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const tags = normalizeTags(parsed.tags);
    const channelId =
      typeof parsed.channelId === "string" && parsed.channelId.trim()
        ? parsed.channelId.trim()
        : undefined;

    return channelId ? { tags, channelId } : { tags };
  } catch {
    return { tags: [] };
  }
}

export function serializeSourceConfig(config: SourceConfig): string {
  return JSON.stringify({
    tags: normalizeTags(config.tags),
    ...(config.channelId ? { channelId: config.channelId } : {}),
  });
}

export const TAG_LIMITS = { maxTags: MAX_TAGS, maxLength: MAX_TAG_LENGTH };
