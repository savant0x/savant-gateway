import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  AuthenticatedKey,
  FreePoolReservation,
  GatewayModel,
} from "../../projections.ts";
import type { CreditHold } from "../store/credit.ts";

import { computeHoldMicros } from "../../pricing.ts";
import { estimateWeightedTokens } from "../../free-pool.ts";
import { jsonError } from "../../http.ts";
import { readTrialConfig } from "../../trials.ts";
import { reserveCredit } from "../store/credit.ts";
import { reserveFreeCall } from "../store/free-pool.ts";
import { trialBalance } from "../ledger/trials.ts";
import { getModelForGateway } from "../store/models.ts";
import { refreshProviderRuntime } from "../providers/runtime.ts";

export type TrialRouteResult =
  | { blocked: Response }
  | {
      blocked: null;
      model: GatewayModel;
      hold: CreditHold | null;
      freeReservation: FreePoolReservation | null;
    };

/**
 * Trial routing on the async handle (FID-086, gateway port).
 *
 * Three behaviors are carried over exactly, because each one is a rule and not
 * an implementation detail:
 *
 * 1. **An enabled trial with no usable paid pair refuses.** Falling back to the
 *    free model would serve calls nobody can be upgraded from, which is the
 *    opposite of what the trial exists to prove.
 * 2. **The provider is refreshed only when the allowance is not already
 *    exhausted.** A customer out of trial budget should not cause an upstream
 *    account read on every request.
 * 3. **An exhausted trial continues on credit at the paired model's rates.** The
 *    paired model id is rewritten back to the public id the customer asked for,
 *    so the response names the model they requested.
 */
export async function reserveTrialRoute(
  db: PostgresDatabase,
  input: {
    auth: AuthenticatedKey;
    model: GatewayModel;
    promptTokens: number;
    outputBudget: number;
  },
): Promise<TrialRouteResult> {
  const config = readTrialConfig();
  const pairId = config.pairs[input.model.id];
  const paired = pairId ? await getModelForGateway(db, pairId) : undefined;

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

  const balance = await trialBalance(
    db,
    input.auth.userId,
    new Date().toISOString(),
  );
  const estimate = estimateWeightedTokens(
    input.promptTokens,
    input.outputBudget,
    input.model.tokenWeight,
  );
  const exhausted =
    config.enabled && balance.granted > 0 && balance.remaining < estimate;

  if (!exhausted) {
    await refreshProviderRuntime(db, input.model.upstreamSlug);
  }

  const admission = exhausted ? null : await reserveFreeCall(db, input);

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

  const hold = await reserveCredit(db, {
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

  if (!hold) {
    return {
      blocked: jsonError(
        402,
        "Trial allowance insufficient. Add prepaid credit to continue at the published paid rates.",
        "trial_exhausted",
      ),
    };
  }

  return {
    blocked: null,
    model: { ...paired, id: input.model.id },
    hold,
    freeReservation: null,
  };
}
