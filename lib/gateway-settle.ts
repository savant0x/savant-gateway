import "server-only";

import type { CreditHold } from "./store/billing";
import type {
  AuthenticatedKey,
  FreePoolReservation,
  GatewayModel,
} from "./store/shared";

import { usagePrices } from "./gateway-usage";
import { subscriptionWeightedTokens } from "./plans";
import { redactSecrets } from "./redaction";
import { recordUsage } from "./store/usage";
import { usageSource, type ResolvedUsage } from "./usage";

export { estimatedUsage } from "./usage";
export { completionText, streamDeltaChars, usagePrices } from "./gateway-usage";

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
  /** Durable admitted-call identity written before dispatch. */
  settlementId: string;
  /** Serving-account concurrency slot; idempotent, called on every exit. */
  releaseAdmission?: (() => void) | null;
};

export function settleCall(
  context: GatewayCallContext,
  usage: ResolvedUsage,
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
  // A failed call with no provider counts has no usage to label. A successful
  // call without them is an estimate, and says so.
  const source = status === "ok" || usage.reported ? usageSource(usage) : null;
  const estimated =
    options.estimated ?? (source === "partial" || source === "estimated");

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
    estimated,
    cachedInputTokens: usage.cachedInputTokens,
    cacheWriteInputTokens: usage.cacheWriteInputTokens,
    reasoningOutputTokens: usage.reasoningOutputTokens,
    usageSource: source,
    settlementId: context.settlementId,
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

export function hasUsage(value: ResolvedUsage | null): value is ResolvedUsage {
  return value !== null;
}
