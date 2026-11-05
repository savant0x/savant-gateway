import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  AuthenticatedKey,
  FreePoolReservation,
  GatewayModel,
} from "../../projections.ts";
import type { CreditHold } from "../store/credit.ts";
import type { ResolvedUsage } from "../../usage.ts";

import { usagePrices } from "../../gateway-usage.ts";
import { subscriptionWeightedTokens } from "../../plans.ts";
import { redactSecrets } from "../../redaction.ts";
import { usageSource } from "../../usage.ts";
import { recordFirstCompletion } from "../store/activity.ts";
import { recordUsage } from "../store/usage.ts";

/**
 * Gateway settlement, ported to the async handle (FID-086, Batch B).
 *
 * `settleCall` is the only place that decides what one completed or failed call
 * costs, and it is deliberately thin: price the tokens, decide the billing
 * source, redact the error, hand the whole thing to `recordUsage` in one
 * transaction. Every accounting guarantee lives there, not here.
 *
 * The pure helpers (`usagePrices`, `completionText`, `streamDeltaChars`) moved to
 * `lib/gateway-usage.ts` for this port. They used to live in
 * `lib/gateway-settle.ts`, which imports `server-only`; a ported module that
 * imported them would be unloadable by the test runner, and copying them would
 * have created a second implementation of the price arithmetic.
 *
 * `SubscriptionCallContext` lives here rather than in the deleted synchronous
 * gateway module, so the ported entry and the ported settlement cannot disagree
 * about the shape of an included or overage call.
 */

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

export type GatewaySettlementContext = {
  auth: AuthenticatedKey;
  model: GatewayModel;
  hold: CreditHold | null;
  freeReservation: FreePoolReservation | null;
  subscription: SubscriptionCallContext | null;
  startedAt: number;
  promptTokens: number;
  /** Durable admitted-call identity written before dispatch. */
  settlementId: string;
};

export async function settleCall(
  db: PostgresDatabase,
  context: GatewaySettlementContext,
  usage: ResolvedUsage,
  status: "ok" | "error" | "cancelled",
  options: { error?: string | null; estimated?: boolean } = {},
): Promise<number> {
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

  const charged = await recordUsage(db, {
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

  if (status === "ok") {
    await recordFirstCompletion(db, {
      userId: context.auth.userId,
      modelId: context.model.id,
      groupSlug: context.model.groupSlug,
    });
  }

  return charged;
}
