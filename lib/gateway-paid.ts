import "server-only";

import type { GatewayModel } from "./store";

import {
  DEFAULT_OUTPUT_BUDGET,
  MAX_OUTPUT_BUDGET,
  computeHoldMicros,
  estimatePromptTokens,
  readRequestedOutputBudget,
} from "./pricing";
import { jsonError } from "./http";
import { reserveCreditHold, type CreditHold } from "./store/billing";

export type PaidReservation =
  | { blocked: Response }
  | {
      blocked: null;
      hold: CreditHold;
      promptTokens: number;
      outputBudget: number;
      requestedBudget: number | null;
    };

/** Reserves prepaid credit for one paid call, or explains the refusal. */
export function reservePaidCall(
  model: GatewayModel,
  auth: { keyId: string; userId: string },
  body: Record<string, unknown>,
  promptOverhead: number,
): PaidReservation {
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
  const hold = reserveCreditHold({
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
