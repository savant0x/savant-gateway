/**
 * Alias generation for content-to-model matching (FID-2026-1123-001).
 *
 * Three strings identify a model in the catalog: its id tail, its display name
 * and its upstream id. Those are literal and precise but narrow, so a model also
 * gains forms derived from its family label:
 *
 * - `opus 4 6 thinking` — the descriptor with its version, for a headline that
 *   omits the vendor: "Sonnet 4.5 is Anthropic's best".
 * - `claude 4 6 opus` — the version written before the descriptor: "Claude 4.6
 *   Opus ships".
 * - `claude 4 6` — family plus version only. This is weak evidence: two models
 *   can produce it, and the matcher then refuses both rather than guessing.
 *
 * Every form is still a contiguous token sequence. Nothing here introduces a
 * fuzzy score, which is the boundary the product claim depends on.
 */

import type { LinkableModel } from "./types.ts";

export type Alias = {
  label: string;
  tokens: string[];
  versioned: boolean;
  /** A shortened phrase: useful for recall, never proof on its own. */
  weak: boolean;
};

const MIN_ALIAS_TOKENS = 2;

/** A single-token alias is admitted only when it carries a version digit. */
const MIN_SINGLE_TOKEN_LENGTH = 2;

/** The shortest descriptor worth keeping as its own phrase. */
const MIN_DESCRIPTOR_LENGTH = 4;

const GENERIC_LAST_SEGMENTS = new Set([
  "latest",
  "default",
  "chat",
  "instruct",
  "base",
  "preview",
  "edit",
]);

export function tokenize(value: string): string[] {
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

export function hasDigit(token: string): boolean {
  return /\d/.test(token);
}

function hasVersion(tokens: string[]): boolean {
  return tokens.some(hasDigit);
}

function aliasFrom(value: string): Alias | null {
  const tokens = tokenize(value);

  if (tokens.length === 1) {
    const only = tokens[0];

    if (!hasDigit(only) || only.length < MIN_SINGLE_TOKEN_LENGTH) return null;
    if (GENERIC_LAST_SEGMENTS.has(only)) return null;

    // A bare number is a version, not a model name.
    if (!/[a-z]/.test(only)) return null;

    return { label: value.trim(), tokens, versioned: true, weak: false };
  }

  if (tokens.length < MIN_ALIAS_TOKENS) return null;
  if (tokens.every((token) => !/[a-z]/.test(token))) return null;

  return {
    label: value.trim(),
    tokens,
    versioned: hasVersion(tokens),
    weak: false,
  };
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
    ...extraAliases.map((value) => ({ value })),
    { value: lastSegment(model.id) },
    { value: model.name },
    { value: lastSegment(model.upstreamId) },
  ];
  const seen = new Set<string>();
  const aliases: Alias[] = [];

  for (const candidate of candidates) {
    const alias = aliasFrom(candidate.value);

    if (!alias) continue;

    const key = alias.tokens.join(" ");

    if (seen.has(key) || GENERIC_LAST_SEGMENTS.has(key)) continue;

    seen.add(key);
    aliases.push(alias);
  }

  return aliases;
}

/**
 * Every phrase a model may be recognised by: the direct aliases plus the forms
 * derived from its family label.
 */
export function matchForms(
  model: LinkableModel,
  extraAliases: string[] = [],
): Alias[] {
  const direct = modelAliases(model, extraAliases);
  const lead = tokenize(model.family);
  const forms = [...direct];
  const seen = new Set(direct.map((alias) => alias.tokens.join(" ")));

  const push = (tokens: string[], weak: boolean) => {
    if (tokens.length < MIN_ALIAS_TOKENS) return;

    const key = tokens.join(" ");

    if (seen.has(key) || GENERIC_LAST_SEGMENTS.has(key)) return;

    seen.add(key);
    forms.push({
      label: tokens.join(" "),
      tokens,
      versioned: hasVersion(tokens),
      weak,
    });
  };

  if (lead.length === 0) return forms;

  for (const alias of direct) {
    const leadMatches =
      alias.tokens.length > lead.length &&
      lead.every((token, index) => alias.tokens[index] === token);

    if (!leadMatches) continue;

    const middle = alias.tokens.slice(lead.length);
    const numbers = middle.filter(hasDigit);
    const words = middle.filter((token) => !hasDigit(token));
    const distinctive = words.join("").length >= MIN_DESCRIPTOR_LENGTH;

    if (
      distinctive &&
      /[a-z]/.test(middle[0]) &&
      (numbers.length > 0 || words.length > 1)
    ) {
      push(middle, false);
    }

    if (numbers.length > 0 && distinctive) {
      push([...lead, ...numbers, ...words], false);
    }

    if (numbers.length > 0) push([...lead, ...numbers], true);
  }

  return forms;
}
