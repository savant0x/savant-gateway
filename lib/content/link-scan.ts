/**
 * The positional scan behind content-to-model matching (FID-2026-1123-001).
 *
 * Two precision rules live here, and they are the reason a bigger catalog does
 * not mean worse links:
 *
 * 1. **Longest match at a position wins.** In `GLM-5.3 is now available` the
 *    alias `glm 5` matches too, but it is the previous generation. Suppression is
 *    limited to the same family and the same start index, so a headline naming
 *    both siblings (`Kimi K2.5 and Kimi K2.5 Thinking`) still links both.
 * 2. **A version must not continue.** `GLM-5` does not match `GLM-5.7`, because
 *    the numeral that follows makes it a different version.
 *
 * A third rule is in this file because it needs to see every model at once: a
 * weak phrase (family plus version) shared by two different models at the same
 * place proves neither, so both are dropped.
 */

import type { Alias } from "./model-aliases.ts";
import type { LinkableModel } from "./types.ts";

import { canonicalModelKey } from "../model-identity.ts";

import { hasDigit } from "./model-aliases.ts";

export type Evidence = "title" | "tag" | "excerpt" | "description";

export type Hit = {
  model: LinkableModel;
  /** Provider-neutral identity: two provider rows of one model share it. */
  key: string;
  family: string;
  alias: Alias;
  evidence: Evidence;
  start: number;
};

const MAX_OCCURRENCES_PER_ALIAS = 4;

function findSequences(
  haystack: string[],
  needle: string[],
  limit = MAX_OCCURRENCES_PER_ALIAS,
): number[] {
  const starts: number[] = [];

  if (needle.length === 0 || needle.length > haystack.length) return starts;

  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matched = true;

    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      starts.push(start);
      if (starts.length >= limit) break;
    }
  }

  return starts;
}

function versionContinues(
  haystack: string[],
  start: number,
  tokens: string[],
): boolean {
  const last = tokens[tokens.length - 1];
  const next = haystack[start + tokens.length];

  return hasDigit(last) && next !== undefined && hasDigit(next);
}

/** Every place a model's phrase appears in one tokenized text. */
export function scan(
  haystack: string[],
  models: LinkableModel[],
  forms: Map<string, Alias[]>,
  evidence: Evidence,
): Hit[] {
  const hits: Hit[] = [];

  if (haystack.length === 0) return hits;

  for (const model of models) {
    const family = model.family.trim().toLowerCase();
    const key = canonicalModelKey(model.upstreamId);

    for (const alias of forms.get(model.id) ?? []) {
      for (const start of findSequences(haystack, alias.tokens)) {
        if (versionContinues(haystack, start, alias.tokens)) continue;

        hits.push({ model, key, family, alias, evidence, start });
      }
    }
  }

  return hits;
}

/** Keep one reading per position: the longest alias of that family. */
function suppressShorter(hits: Hit[]): Hit[] {
  return hits.filter(
    (hit) =>
      !hits.some(
        (other) =>
          other !== hit &&
          other.start === hit.start &&
          other.family === hit.family &&
          other.alias.tokens.length > hit.alias.tokens.length,
      ),
  );
}

/** A weak phrase is dropped when any other model proves the same place. */
function suppressAmbiguous(hits: Hit[]): Hit[] {
  return hits.filter((hit) => {
    if (!hit.alias.weak) return true;

    return !hits.some(
      (other) =>
        other !== hit &&
        other.start === hit.start &&
        other.alias.tokens.length === hit.alias.tokens.length &&
        other.key !== hit.key,
    );
  });
}

/** The hits that survive both precision rules for one text. */
export function scanText(
  haystack: string[],
  models: LinkableModel[],
  forms: Map<string, Alias[]>,
  evidence: Evidence,
): Hit[] {
  return suppressAmbiguous(
    suppressShorter(scan(haystack, models, forms, evidence)),
  );
}
