import "server-only";

import type { CreditHold } from "./store/billing";
import type {
  AuthenticatedKey,
  FreePoolReservation,
  GatewayModel,
} from "./store/shared";

import { computeTokenCostMicros } from "./pricing";
import { recordUsage } from "./store/usage";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type GatewayCallContext = {
  auth: AuthenticatedKey;
  model: GatewayModel;
  hold: CreditHold | null;
  freeReservation: FreePoolReservation | null;
  startedAt: number;
  promptTokens: number;
};

function toTokenCount(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function readUsage(value: unknown): TokenUsage | null {
  if (!value || typeof value !== "object") return null;

  const usage = (value as Record<string, unknown>).usage;

  if (!usage || typeof usage !== "object") return null;

  const record = usage as Record<string, unknown>;
  const promptRaw = record.prompt_tokens ?? record.input_tokens;
  const completionRaw = record.completion_tokens ?? record.output_tokens;

  if (promptRaw == null && completionRaw == null) return null;

  return {
    inputTokens: toTokenCount(promptRaw),
    outputTokens: toTokenCount(completionRaw),
  };
}

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
  return {
    costMicros:
      computeTokenCostMicros(inputTokens, model.costInputMicros) +
      computeTokenCostMicros(outputTokens, model.costOutputMicros),
    chargedMicros:
      computeTokenCostMicros(inputTokens, model.sellInputMicros) +
      computeTokenCostMicros(outputTokens, model.sellOutputMicros),
  };
}

export function settleCall(
  context: GatewayCallContext,
  usage: TokenUsage,
  status: "ok" | "error" | "cancelled",
  options: { error?: string | null; estimated?: boolean } = {},
) {
  const prices = usagePrices(
    context.model,
    usage.inputTokens,
    usage.outputTokens,
  );

  return recordUsage({
    auth: context.auth,
    model: context.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    status,
    latencyMs: Date.now() - context.startedAt,
    error: options.error ?? null,
    chargedMicros: prices.chargedMicros,
    costMicros: prices.costMicros,
    estimated: options.estimated ?? false,
    hold: context.hold,
    freeReservation: context.freeReservation,
  });
}

export function hasUsage(value: TokenUsage | null): value is TokenUsage {
  return value !== null;
}
