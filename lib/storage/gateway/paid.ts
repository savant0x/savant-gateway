import type { PostgresDatabase } from "../pg-adapter.ts";
import type { AuthenticatedKey, GatewayModel } from "../../projections.ts";
import type { CreditHold } from "../store/credit.ts";

import {
  DEFAULT_OUTPUT_BUDGET,
  MAX_OUTPUT_BUDGET,
  computeHoldMicros,
  estimatePromptTokens,
  readRequestedOutputBudget,
} from "../../pricing.ts";
import { jsonError } from "../../http.ts";
import { reserveCredit } from "../store/credit.ts";

export type PaidReservation =
  | { blocked: Response }
  | {
      blocked: null;
      hold: CreditHold;
      promptTokens: number;
      outputBudget: number;
      requestedBudget: number | null;
    };

/**
 * Reserves prepaid credit for one paid call, or explains the refusal.
 *
 * The reservation itself moved from a read-compare-write in JavaScript to the
 * conditional `UPDATE ... WHERE credit_micros - held_micros >= ?` inside
 * `reserveCredit`, so two calls admitted together cannot both pass against the
 * same balance. The HTTP answer is unchanged: an uncovered hold is a 402 with
 * `insufficient_quota`, not a provider error.
 */
export async function reservePaidCall(
  db: PostgresDatabase,
  model: GatewayModel,
  auth: AuthenticatedKey,
  body: Record<string, unknown>,
  promptOverhead: number,
): Promise<PaidReservation> {
  const requestedBudget = readRequestedOutputBudget(body);

  if (requestedBudget !== null && requestedBudget > MAX_OUTPUT_BUDGET) {
    return {
      blocked: jsonError(400, `max_tokens cannot exceed ${MAX_OUTPUT_BUDGET}.`),
    };
  }

  const outputBudget = requestedBudget ?? DEFAULT_OUTPUT_BUDGET;
  const promptTokens =
    estimatePromptTokens(body.messages, body.tools) + promptOverhead;
  const holdMicros = computeHoldMicros({
    inputTokens: promptTokens,
    outputTokens: outputBudget,
    sellInputMicros: model.sellInputMicros,
    sellOutputMicros: model.sellOutputMicros,
  });
  const hold = await reserveCredit(db, {
    userId: auth.userId,
    keyId: auth.keyId,
    modelId: model.id,
    holdMicros,
  });

  if (!hold) {
    return {
      blocked: jsonError(
        402,
        "Insufficient credit balance for this request. Add credit in your account.",
        "insufficient_quota",
      ),
    };
  }

  return {
    blocked: null,
    hold,
    promptTokens,
    outputBudget,
    requestedBudget,
  };
}
