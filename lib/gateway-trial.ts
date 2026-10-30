import "server-only";

import type { AuthenticatedKey, GatewayModel } from "./store/shared";

import { db } from "./db";
import { estimateWeightedTokens } from "./free-pool";
import { jsonError } from "./http";
import { computeHoldMicros } from "./pricing";
import { reserveCreditHold } from "./store/billing";
import { reserveFreeCall } from "./store/free-pool";
import { getModelForGateway } from "./store/models";
import { trialBalance } from "./trial-ledger";
import { readTrialConfig } from "./trials";
import { refreshProviderRuntime } from "./providers/runtime";

export async function reserveTrialRoute(input: {
  auth: AuthenticatedKey;
  model: GatewayModel;
  promptTokens: number;
  outputBudget: number;
}) {
  const config = readTrialConfig();
  const pairId = config.pairs[input.model.id];
  const paired = pairId ? getModelForGateway(pairId) : undefined;

  if (
    config.enabled &&
    (!paired ||
      paired.upstreamSlug !== input.model.upstreamSlug ||
      paired.billingMode !== "paid" ||
      paired.status !== "active" ||
      !paired.inCatalog ||
      paired.costSource === "unknown" ||
      paired.sellInputMicros + paired.sellOutputMicros <= 0)
  ) {
    return {
      blocked: jsonError(
        503,
        "This model has no configured trial-to-paid route.",
        "trial_model_unavailable",
      ),
    };
  }

  const balance = trialBalance(db, input.auth.userId, new Date().toISOString());
  const estimate = estimateWeightedTokens(
    input.promptTokens,
    input.outputBudget,
    input.model.tokenWeight,
  );
  const exhausted =
    config.enabled && balance.granted > 0 && balance.remaining < estimate;

  if (!exhausted) await refreshProviderRuntime(input.model.upstreamSlug);

  const admission = exhausted ? null : reserveFreeCall(input);

  if (admission?.ok) {
    return {
      blocked: null,
      model: input.model,
      hold: null,
      freeReservation: admission.reservation,
    };
  }

  if (admission && admission.blocked.reason !== "trial_exhausted") {
    const blocked = admission.blocked;

    return {
      blocked: jsonError(blocked.status, blocked.message, blocked.type, {
        "Retry-After": String(blocked.retryAfterSeconds),
        ...(blocked.resetAt ? { "X-RateLimit-Reset": blocked.resetAt } : {}),
      }),
    };
  }

  if (!paired) return { blocked: jsonError(503, "Paid route unavailable.") };

  const hold = reserveCreditHold({
    userId: input.auth.userId,
    keyId: input.auth.keyId,
    modelId: input.model.id,
    holdMicros: computeHoldMicros({
      inputTokens: input.promptTokens,
      outputTokens: input.outputBudget,
      sellInputMicros: paired.sellInputMicros,
      sellOutputMicros: paired.sellOutputMicros,
    }),
  });

  if (!hold)
    return {
      blocked: jsonError(
        402,
        "Trial allowance insufficient. Add prepaid credit to continue at the published paid rates.",
        "trial_exhausted",
      ),
    };

  return {
    blocked: null,
    model: { ...paired, id: input.model.id },
    hold,
    freeReservation: null,
  };
}
