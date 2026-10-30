import "server-only";

import type { CreditHold } from "./store/billing";
import type {
  AuthenticatedKey,
  FreePoolReservation,
  GatewayModel,
} from "./store/shared";

import { computeTokenCostMicros } from "./pricing";
import { redactSecrets } from "./redaction";
import { subscriptionWeightedTokens } from "./plans";
import { recordUsage } from "./store/usage";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type SubscriptionCallContext =
  | {
      kind: "included";
      subscriptionId: string;
      periodId: string;
      holdId: string;
      markupBps: 0;
    }
  | {
      kind: "overage";
      subscriptionId: string;
      periodId: string;
      markupBps: number;
    };

export type GatewayCallContext = {
  auth: AuthenticatedKey;
  model: GatewayModel;
  hold: CreditHold | null;
  freeReservation: FreePoolReservation | null;
  subscription: SubscriptionCallContext | null;
  startedAt: number;
  promptTokens: number;
  /** Serving-account concurrency slot; idempotent, called on every exit. */
  releaseAdmission?: (() => void) | null;
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
  const includedWeightedTokens =
    context.subscription?.kind === "included"
      ? subscriptionWeightedTokens(
          context.model.tokenWeight,
          usage.inputTokens,
          usage.outputTokens,
        )
      : 0;
  const billingSource =
    context.subscription?.kind === "included"
      ? ("subscription" as const)
      : context.model.billingMode === "free"
        ? ("free" as const)
        : ("credit" as const);

  return recordUsage({
    auth: context.auth,
    model: context.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    status,
    latencyMs: Date.now() - context.startedAt,
    // Persisted usage errors are shown to the customer and the operator. The
    // provider boundary redacts its own text, and this shared policy covers
    // every other caller that supplies an exception message.
    error: options.error ? redactSecrets(options.error) : null,
    chargedMicros:
      context.subscription?.kind === "included" ? 0 : prices.chargedMicros,
    costMicros: prices.costMicros,
    estimated: options.estimated ?? false,
    hold: context.hold,
    freeReservation: context.freeReservation,
    subscriptionHold:
      context.subscription?.kind === "included"
        ? { holdId: context.subscription.holdId }
        : null,
    subscriptionId: context.subscription?.subscriptionId ?? null,
    subscriptionPeriodId: context.subscription?.periodId ?? null,
    includedWeightedTokens,
    billingSource,
  });
}

export function hasUsage(value: TokenUsage | null): value is TokenUsage {
  return value !== null;
}
