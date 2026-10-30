/**
 * Provider usage, parsed once.
 *
 * Providers report overlapping categories: cached input is part of the prompt,
 * reasoning is part of the completion, and an Anthropic cache read is not part
 * of `input_tokens` at all. Charging every category separately double-counts;
 * dropping the categories hides real billing. This module keeps the totals and
 * the subsets apart, and keeps "absent" distinct from a real zero.
 *
 * A count is valid only as a finite non-negative safe integer. Booleans, blank
 * strings, fractions and negatives are absent, never zero, so a malformed
 * payload cannot silently become a free request.
 */

export type ProviderUsage = {
  /** Total prompt tokens, provider semantics (includes cached tokens). */
  inputTokens: number | null;
  /** Total completion tokens, provider semantics (includes reasoning). */
  outputTokens: number | null;
  /** Subset of `inputTokens` served from a prompt cache. */
  cachedInputTokens: number | null;
  /** Prompt tokens written to a prompt cache; not a subset of input. */
  cacheWriteInputTokens: number | null;
  /** Subset of `outputTokens` spent on reasoning. */
  reasoningOutputTokens: number | null;
};

export type ResolvedUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number | null;
  cacheWriteInputTokens: number | null;
  reasoningOutputTokens: number | null;
  /** Both totals came from the provider. */
  complete: boolean;
  /** The provider reported something, but one total had to be estimated. */
  partial: boolean;
  /** The provider reported no usable usage at all. */
  reported: boolean;
};

export type UsageSource = "reported" | "partial" | "estimated";

function count(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  if (typeof value !== "string" || !value.trim()) return null;

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A subset larger than its total is out of domain and is not stored. */
function subset(value: number | null, total: number | null) {
  if (value === null) return null;
  if (total === null) return value;

  return value <= total ? value : null;
}

export function readProviderUsage(value: unknown): ProviderUsage | null {
  const root = record(value);
  const usage = root ? record(root.usage) : null;

  if (!usage) return null;

  const inputTokens = count(usage.prompt_tokens) ?? count(usage.input_tokens);
  const outputTokens =
    count(usage.completion_tokens) ?? count(usage.output_tokens);

  if (inputTokens === null && outputTokens === null) return null;

  const promptDetails = record(usage.prompt_tokens_details);
  const completionDetails = record(usage.completion_tokens_details);

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: subset(
      count(promptDetails?.cached_tokens) ??
        count(usage.cache_read_input_tokens),
      inputTokens,
    ),
    cacheWriteInputTokens: count(usage.cache_creation_input_tokens),
    reasoningOutputTokens: subset(
      count(completionDetails?.reasoning_tokens),
      outputTokens,
    ),
  };
}

/**
 * Later frames carry cumulative snapshots. A component the later frame omits
 * is retained from the earlier one, so a split usage frame cannot erase the
 * other half.
 */
export function mergeProviderUsage(
  previous: ProviderUsage | null,
  next: ProviderUsage | null,
): ProviderUsage | null {
  if (!previous) return next;
  if (!next) return previous;

  return {
    inputTokens: next.inputTokens ?? previous.inputTokens,
    outputTokens: next.outputTokens ?? previous.outputTokens,
    cachedInputTokens: next.cachedInputTokens ?? previous.cachedInputTokens,
    cacheWriteInputTokens:
      next.cacheWriteInputTokens ?? previous.cacheWriteInputTokens,
    reasoningOutputTokens:
      next.reasoningOutputTokens ?? previous.reasoningOutputTokens,
  };
}

function fallbackCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Fills a missing side from a local estimate and records that it is an
 * estimate. A provider-reported side is never overwritten.
 */
export function resolveUsage(input: {
  usage: ProviderUsage | null;
  fallbackInputTokens: number;
  fallbackOutputTokens: number;
}): ResolvedUsage {
  const usage = input.usage;
  const inputTokens =
    usage?.inputTokens ?? fallbackCount(input.fallbackInputTokens);
  const outputTokens =
    usage?.outputTokens ?? fallbackCount(input.fallbackOutputTokens);
  const complete =
    usage !== null && usage.inputTokens !== null && usage.outputTokens !== null;

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: usage?.cachedInputTokens ?? null,
    cacheWriteInputTokens: usage?.cacheWriteInputTokens ?? null,
    reasoningOutputTokens: usage?.reasoningOutputTokens ?? null,
    complete,
    partial: usage !== null && !complete,
    reported: usage !== null,
  };
}

/** A wholly estimated record, for calls with no usable provider counts. */
export function estimatedUsage(
  inputTokens: number,
  outputTokens: number,
): ResolvedUsage {
  return resolveUsage({
    usage: null,
    fallbackInputTokens: inputTokens,
    fallbackOutputTokens: outputTokens,
  });
}

export function usageSource(usage: ResolvedUsage): UsageSource {
  if (usage.complete) return "reported";
  if (usage.reported) return "partial";

  return "estimated";
}
