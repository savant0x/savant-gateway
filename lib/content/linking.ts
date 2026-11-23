/**
 * Content-to-model matching (FID-2026-1102-089, FID-2026-1123-001).
 *
 * This is a product-claim boundary, so the matcher is deliberate rather than
 * clever: a model links only when a phrase derived from it appears as a
 * contiguous token sequence in the title, an exact tag, the excerpt or a bounded
 * body window. There is no fuzzy score, no family-only match and no embedding.
 * `GPT is useful` must not link every GPT model, and `GPT-4o` must not satisfy an
 * alias for `GPT-4`.
 *
 * Tokens rather than substrings are the load-bearing choice: `gpt-6.1-sol`
 * becomes `gpt 6 1 sol`, which matches `GPT 6.1 Sol` but not `gpt-61-sol`.
 *
 * Alias generation lives in `model-aliases.ts` and the positional precision rules
 * in `link-scan.ts`; both are covered by `tests/content-link-eval.test.mjs`.
 */

import type {
  ContentKind,
  ContentRelation,
  LinkSuggestion,
  LinkableModel,
} from "./types.ts";
import type { Evidence, Hit } from "./link-scan.ts";

import { matchForms, tokenize } from "./model-aliases.ts";
import { scanText } from "./link-scan.ts";
import { normalizeTag } from "./taxonomy.ts";

export { modelAliases } from "./model-aliases.ts";

const EVIDENCE_CONFIDENCE: Record<Evidence, number> = {
  title: 1,
  tag: 0.85,
  excerpt: 0.7,
  description: 0.7,
};

const EVIDENCE_REASON: Record<Evidence, string> = {
  title: "Title matches",
  tag: "Tag matches",
  excerpt: "Excerpt matches",
  description: "Description matches",
};

/** Order in which evidence is preferred when a model matches more than once. */
const EVIDENCE_RANK: Record<Evidence, number> = {
  title: 0,
  tag: 1,
  excerpt: 2,
  description: 3,
};

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
  sourceKind?: string;
  /** Visible body text; the stored matcher passes it for every kind. */
  description?: string;
  /** Publisher summary, which is usually the first place a model is named. */
  excerpt?: string;
};

export type LinkOptions = {
  aliases?: Record<string, string[]>;
  autoPublish?: boolean;
  matchYouTubeDescriptions?: boolean;
  /** Off only when the operator wants title and tag matching alone. */
  matchBodyText?: boolean;
};

/**
 * Returns at most one suggestion per model.
 *
 * Evidence is ranked title, tag, excerpt, description; a title match outranks a
 * tag match, and a tag match is exact because tags are normalized at ingest.
 */
export function suggestModelLinks(
  input: LinkInput,
  models: LinkableModel[],
  options: LinkOptions = {},
): LinkSuggestion[] {
  const forms = new Map(
    models.map((model) => [
      model.id,
      matchForms(model, options.aliases?.[model.id] ?? []),
    ]),
  );
  const relation = inferRelation(input.kind, input.title, input.tags);
  const tagKeys = new Set(
    input.tags.map((tag) => tokenize(normalizeTag(tag)).join(" ")),
  );
  const bodyAllowed =
    options.matchBodyText !== false &&
    !(
      input.sourceKind === "youtube" &&
      options.matchYouTubeDescriptions === false
    );

  const hits: Hit[] = [
    ...scanText(tokenize(input.title), models, forms, "title"),
  ];

  for (const model of models) {
    const alias = (forms.get(model.id) ?? []).find((entry) =>
      tagKeys.has(entry.tokens.join(" ")),
    );

    if (!alias) continue;

    hits.push({
      model,
      key: model.id,
      family: model.family.trim().toLowerCase(),
      alias,
      evidence: "tag",
      start: 0,
    });
  }

  if (bodyAllowed) {
    hits.push(
      ...scanText(tokenize(input.excerpt ?? ""), models, forms, "excerpt"),
      ...scanText(
        tokenize(input.description ?? ""),
        models,
        forms,
        "description",
      ),
    );
  }

  const best = new Map<string, Hit>();

  for (const hit of hits) {
    const current = best.get(hit.model.id);

    if (!current || outranks(hit, current)) best.set(hit.model.id, hit);
  }

  const suggestions: LinkSuggestion[] = [];

  for (const hit of Array.from(best.values())) {
    suggestions.push({
      modelId: hit.model.id,
      relation,
      confidence: EVIDENCE_CONFIDENCE[hit.evidence],
      reason: `${EVIDENCE_REASON[hit.evidence]} “${hit.alias.label}”`,
      reviewed:
        (options.autoPublish ?? false) &&
        hit.alias.versioned &&
        !hit.alias.weak &&
        hit.evidence === "title",
    });
  }

  return suggestions.sort(
    (left, right) =>
      right.confidence - left.confidence ||
      left.modelId.localeCompare(right.modelId),
  );
}

function outranks(candidate: Hit, current: Hit): boolean {
  if (candidate.evidence !== current.evidence) {
    return EVIDENCE_RANK[candidate.evidence] < EVIDENCE_RANK[current.evidence];
  }

  if (candidate.alias.weak !== current.alias.weak) return !candidate.alias.weak;

  if (candidate.alias.tokens.length !== current.alias.tokens.length) {
    return candidate.alias.tokens.length > current.alias.tokens.length;
  }

  return candidate.start < current.start;
}
