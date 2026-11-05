/**
 * Content-to-model matching (FID-2026-1102-089).
 *
 * This is a product-claim boundary, so the matcher is deliberately literal:
 * a model is linked only when its alias appears as a contiguous token sequence
 * in the title or in an exact publisher tag. There is no fuzzy score, no family
 * match, and no excerpt-only link. `GPT is useful` must not link to every GPT
 * model, and `GPT-4o` must not satisfy an alias for `GPT-4`.
 *
 * Tokens rather than substrings are the load-bearing choice: `gpt-6.1-sol`
 * becomes `gpt 6 1 sol`, which matches `GPT 6.1 Sol` but not `gpt-61-sol`.
 */

import type {
  ContentKind,
  ContentRelation,
  LinkSuggestion,
  LinkableModel,
} from "./types.ts";

import { normalizeTag } from "./taxonomy.ts";

type Alias = {
  label: string;
  tokens: string[];
  versioned: boolean;
};

const MIN_ALIAS_TOKENS = 2;

const GENERIC_LAST_SEGMENTS = new Set([
  "latest",
  "default",
  "chat",
  "instruct",
  "base",
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function hasVersion(tokens: string[]): boolean {
  return tokens.some((token) => /\d/.test(token));
}

function aliasFrom(value: string, requireVersion = true): Alias | null {
  const tokens = tokenize(value);

  if (tokens.length < MIN_ALIAS_TOKENS) return null;
  if (requireVersion && !hasVersion(tokens)) return null;
  if (tokens.every((token) => !/[a-z]/.test(token))) return null;

  return { label: value.trim(), tokens, versioned: hasVersion(tokens) };
}

function lastSegment(value: string): string {
  const parts = value.split("/").filter(Boolean);

  return parts.at(-1) ?? value;
}

/** Public and operator aliases, deduplicated and precision-filtered. */
export function modelAliases(
  model: LinkableModel,
  extraAliases: string[] = [],
): Alias[] {
  const candidates = [
    ...extraAliases.map((alias) => ({ value: alias, operator: true })),
    { value: lastSegment(model.id), operator: false },
    { value: model.name, operator: false },
    { value: lastSegment(model.upstreamId), operator: false },
  ];
  const seen = new Set<string>();
  const aliases: Alias[] = [];

  for (const candidate of candidates) {
    const alias = aliasFrom(candidate.value, !candidate.operator);

    if (!alias) continue;

    const key = alias.tokens.join(" ");

    if (seen.has(key) || GENERIC_LAST_SEGMENTS.has(key)) continue;

    seen.add(key);
    aliases.push(alias);
  }

  return aliases;
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;

  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matched = true;

    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }

    if (matched) return true;
  }

  return false;
}

export function inferRelation(
  kind: ContentKind,
  title: string,
  tags: string[],
): ContentRelation {
  if (kind === "repo") return "repository";
  if (kind === "paper") return "paper";
  if (kind === "discussion") return "discussion";

  const text = `${title} ${tags.join(" ")}`.toLowerCase();

  if (/release|launch|announc|introduc|now available|ships?\b/.test(text)) {
    return "release";
  }

  if (/benchmark|eval|leaderboard|score|mmlu|swe-bench|arena/.test(text)) {
    return "benchmark";
  }

  if (
    /tutorial|guide|how to|hands-on|walkthrough|build with|getting started/.test(
      text,
    )
  ) {
    return "hands_on";
  }

  return "mention";
}

export type LinkInput = {
  title: string;
  tags: string[];
  kind: ContentKind;
};

export type LinkOptions = {
  aliases?: Record<string, string[]>;
  autoPublish?: boolean;
};

/**
 * Returns at most one suggestion per model. A title match outranks a tag match;
 * a tag match is exact because tags are normalized at ingest.
 */
export function suggestModelLinks(
  input: LinkInput,
  models: LinkableModel[],
  options: LinkOptions = {},
): LinkSuggestion[] {
  const titleTokens = tokenize(input.title);
  const tagKeys = new Set(
    input.tags.map((tag) => tokenize(normalizeTag(tag)).join(" ")),
  );
  const relation = inferRelation(input.kind, input.title, input.tags);
  const suggestions = new Map<string, LinkSuggestion>();

  for (const model of models) {
    let best: LinkSuggestion | null = null;
    let bestVersioned = false;

    for (const alias of modelAliases(
      model,
      options.aliases?.[model.id] ?? [],
    )) {
      const key = alias.tokens.join(" ");
      const titleMatch = containsSequence(titleTokens, alias.tokens);
      const tagMatch = tagKeys.has(key);

      if (!titleMatch && !tagMatch) continue;

      const confidence = titleMatch ? 1 : 0.85;
      const reason = titleMatch
        ? `Title matches “${alias.label}”`
        : `Tag matches “${alias.label}”`;

      if (
        !best ||
        confidence > best.confidence ||
        (!bestVersioned && alias.versioned && confidence === best.confidence)
      ) {
        bestVersioned = alias.versioned;
        best = {
          modelId: model.id,
          relation,
          confidence,
          reason,
          reviewed: (options.autoPublish ?? false) && bestVersioned,
        };
      }

      if (titleMatch && alias.versioned) break;
    }

    if (best) suggestions.set(model.id, best);
  }

  return Array.from(suggestions.values()).sort(
    (left, right) =>
      right.confidence - left.confidence ||
      left.modelId.localeCompare(right.modelId),
  );
}
