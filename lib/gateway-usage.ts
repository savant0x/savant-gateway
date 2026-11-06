import type { GatewayModel } from "./projections.ts";

import { computeTokenCostMicros } from "./pricing.ts";

/**
 * Pure usage helpers shared by the synchronous gateway and its async port.
 *
 * These functions were exported from `lib/gateway-settle.ts`, which imports
 * `server-only`. Anything that reads them from outside a React server — the test
 * runner, the scheduler — could therefore not load them at all. Moving the pure
 * part here keeps one implementation of the SSE parsing and the price
 * arithmetic, and the live module re-exports the same names so every existing
 * caller is unchanged.
 *
 * Fallback output accounting counts generated strings only: text, reasoning,
 * function names and argument fragments. Transport fields (ids, indices, roles,
 * types) are not model output and are never counted.
 */

function contentText(content: unknown) {
  if (typeof content === "string") return content;

  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";

      const text = (part as Record<string, unknown>).text;

      return typeof text === "string" ? text : "";
    })
    .join("");
}

/** A generated function name plus its argument text, never its id or index. */
function functionText(value: unknown) {
  if (!value || typeof value !== "object") return "";

  const call = value as Record<string, unknown>;
  const name = typeof call.name === "string" ? call.name : "";
  const args = typeof call.arguments === "string" ? call.arguments : "";

  return name + args;
}

function functionChars(value: unknown) {
  return functionText(value).length;
}

function modernToolChars(value: unknown) {
  return modernToolText(value).length;
}

export function completionText(data: unknown) {
  if (!data || typeof data !== "object") return "";

  const choices = (data as Record<string, unknown>).choices;

  if (!Array.isArray(choices)) return "";

  return choices
    .map((choice) => {
      if (!choice || typeof choice !== "object") return "";

      const message = (choice as Record<string, unknown>).message;

      if (!message || typeof message !== "object") return "";

      const record = message as Record<string, unknown>;
      const text =
        contentText(record.content) + contentText(record.reasoning_content);
      const modern = modernToolText(record.tool_calls);

      if (modern) return text + modern;

      return text + functionText(record.function_call);
    })
    .join("");
}

function modernToolText(value: unknown) {
  if (!Array.isArray(value)) return "";

  let output = "";

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;

    output += functionText((entry as Record<string, unknown>).function);
  }

  return output;
}

/**
 * Streamed characters by representation. The caller accumulates these scalars
 * and chooses modern over legacy only at finalization, so a legacy fragment
 * arriving before a modern fragment cannot be counted twice.
 */
export type StreamDeltaChars = {
  text: number;
  modern: number;
  legacy: number;
};

export function streamDeltaCounts(data: unknown): StreamDeltaChars {
  const empty = { text: 0, modern: 0, legacy: 0 };

  if (!data || typeof data !== "object") return empty;

  const choices = (data as Record<string, unknown>).choices;

  if (!Array.isArray(choices)) return empty;

  return choices.reduce((total, choice) => {
    if (!choice || typeof choice !== "object") return total;

    const delta = (choice as Record<string, unknown>).delta;

    if (!delta || typeof delta !== "object") return total;

    const record = delta as Record<string, unknown>;

    return {
      text:
        total.text +
        contentText(record.content).length +
        contentText(record.reasoning_content).length,
      modern: total.modern + modernToolChars(record.tool_calls),
      legacy: total.legacy + functionChars(record.function_call),
    };
  }, empty);
}

/** One-frame total; live streaming uses `streamDeltaCounts` at finalization. */
export function streamDeltaChars(data: unknown) {
  const counts = streamDeltaCounts(data);

  return counts.text + (counts.modern > 0 ? counts.modern : counts.legacy);
}

export function usagePrices(
  model: GatewayModel,
  inputTokens: number,
  outputTokens: number,
) {
  const listPrice =
    computeTokenCostMicros(inputTokens, model.sellInputMicros) +
    computeTokenCostMicros(outputTokens, model.sellOutputMicros);

  return {
    costMicros:
      computeTokenCostMicros(inputTokens, model.costInputMicros) +
      computeTokenCostMicros(outputTokens, model.costOutputMicros),
    chargedMicros: model.billingMode === "free" ? 0 : listPrice,
  };
}
