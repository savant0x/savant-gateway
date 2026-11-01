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

export function completionText(data: unknown) {
  if (!data || typeof data !== "object") return "";

  const choices = (data as Record<string, unknown>).choices;

  if (!Array.isArray(choices)) return "";

  return choices
    .map((choice) => {
      if (!choice || typeof choice !== "object") return "";

      const message = (choice as Record<string, unknown>).message;

      if (!message || typeof message !== "object") return "";

      return contentText((message as Record<string, unknown>).content);
    })
    .join("");
}

/** Counts streamed output characters for the no-usage fallback. */
export function streamDeltaChars(data: unknown) {
  if (!data || typeof data !== "object") return 0;

  const choices = (data as Record<string, unknown>).choices;

  if (!Array.isArray(choices)) return 0;

  return choices.reduce((total, choice) => {
    if (!choice || typeof choice !== "object") return total;

    const delta = (choice as Record<string, unknown>).delta;

    if (!delta || typeof delta !== "object") return total;

    const record = delta as Record<string, unknown>;

    return (
      total +
      contentText(record.content).length +
      contentText(record.reasoning_content).length
    );
  }, 0);
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
