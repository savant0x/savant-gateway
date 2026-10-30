export type JsonRecord = Record<string, unknown>;

export function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

export function finishReason(reason: unknown) {
  if (reason === "max_tokens") return "length";
  if (reason === "tool_use") return "tool_calls";

  return "stop";
}

/** Counts must be real, present integers; an absent field stays absent. */
export function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Normalizes Anthropic usage into the OpenAI shape without inventing zeros.
 *
 * Anthropic reports cache creation and cache reads outside `input_tokens`, so
 * the prompt total is their sum: the gateway bills the processed input once and
 * keeps the cache components for audit. A missing counter is omitted, which the
 * gateway treats as a partial frame rather than an authoritative zero.
 */
export function readUsage(payload: JsonRecord) {
  const usage = record(payload.usage);

  if (!usage) return undefined;

  const direct = tokenCount(usage.input_tokens);
  const cacheRead = tokenCount(usage.cache_read_input_tokens);
  const cacheWrite = tokenCount(usage.cache_creation_input_tokens);
  const output = tokenCount(usage.output_tokens);
  const prompt =
    direct === null && cacheRead === null && cacheWrite === null
      ? null
      : (direct ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0);
  const normalized: Record<string, unknown> = {};

  if (prompt !== null) normalized.prompt_tokens = prompt;
  if (output !== null) normalized.completion_tokens = output;
  if (prompt !== null && output !== null) {
    normalized.total_tokens = prompt + output;
  }
  if (cacheRead !== null) {
    normalized.prompt_tokens_details = { cached_tokens: cacheRead };
  }
  if (cacheWrite !== null) {
    normalized.cache_creation_input_tokens = cacheWrite;
  }

  return normalized;
}
