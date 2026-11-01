import type { PostgresDatabase } from "../pg-adapter.ts";

import { microsToPrice } from "../../pricing.ts";
import { readTrialConfig } from "../../trials.ts";

import { getModelForGateway } from "./models.ts";

/**
 * The trial-to-paid offer, ported to the async handle (FID-086).
 *
 * `/v1/models` publishes this beside every model so a client can discover the
 * paid route a free model upgrades to. Three behaviors are the reason the
 * function refuses rather than guesses:
 *
 * 1. **A disabled trial offers nothing.** Publishing prices for a trial that is
 *    off would advertise a route the gateway will not honor.
 * 2. **The pair must be the same provider.** A cross-provider pair would move a
 *    call to a different upstream mid-conversation, changing the model the
 *    customer is talking to.
 * 3. **An unpriced or unknown-cost paid model is not offered.** The published
 *    number is the price the call will be charged at; inventing it from a
 *    missing cost is how a sale becomes a loss.
 *
 * The source model only has to exist and share the provider; the price always
 * comes from the paid row, because that is the row the customer will be billed
 * against after the allowance runs out.
 */
export async function trialOffer(db: PostgresDatabase, modelId: string) {
  const config = readTrialConfig();
  const id = config.pairs[modelId];
  const model = id ? await getModelForGateway(db, id) : undefined;
  const source = config.enabled
    ? await getModelForGateway(db, modelId)
    : undefined;

  if (
    !config.enabled ||
    !source ||
    !model ||
    source.upstreamSlug !== model.upstreamSlug ||
    !model.inCatalog ||
    model.status !== "active" ||
    model.billingMode !== "paid" ||
    model.costSource === "unknown" ||
    model.sellInputMicros + model.sellOutputMicros <= 0
  )
    return null;

  return {
    paid_model_id: model.id,
    input_price_per_1m: microsToPrice(model.sellInputMicros),
    output_price_per_1m: microsToPrice(model.sellOutputMicros),
  };
}
