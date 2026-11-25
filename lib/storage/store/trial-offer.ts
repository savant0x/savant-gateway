import type { PostgresDatabase } from "../pg-adapter.ts";
import type { GatewayModel } from "../../projections.ts";

import { microsToPrice } from "../../pricing.ts";
import { readTrialConfig } from "../../trials.ts";

import { getModelsForGateway } from "./models.ts";

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
export type TrialOffer = {
  paid_model_id: string;
  input_price_per_1m: number;
  output_price_per_1m: number;
};

function offerFor(
  source: GatewayModel | undefined,
  paid: GatewayModel | undefined,
): TrialOffer | null {
  if (
    !source ||
    !paid ||
    source.upstreamSlug !== paid.upstreamSlug ||
    !paid.inCatalog ||
    paid.status !== "active" ||
    paid.billingMode !== "paid" ||
    paid.costSource === "unknown" ||
    paid.sellInputMicros + paid.sellOutputMicros <= 0
  )
    return null;

  return {
    paid_model_id: paid.id,
    input_price_per_1m: microsToPrice(paid.sellInputMicros),
    output_price_per_1m: microsToPrice(paid.sellOutputMicros),
  };
}

/**
 * One model's offer, read in one statement.
 *
 * The refusal order matters as much as the answer: a disabled trial and an
 * unpaired id return before any I/O, so the common model costs no query at all
 * (FID-2026-1124-005).
 */
export async function trialOffer(db: PostgresDatabase, modelId: string) {
  const config = readTrialConfig();

  if (!config.enabled) return null;

  const paidId = config.pairs[modelId];

  if (!paidId) return null;

  const models = await getModelsForGateway(db, [modelId, paidId]);

  return offerFor(models.get(modelId), models.get(paidId));
}

/**
 * A whole page's offers in one statement.
 *
 * `/v1/models` publishes an offer beside every row. Asking per row made the
 * public catalog issue one query per model — two per paired model — from a
 * single request against a ten-connection pool. The ids the page needs are
 * known up front, so they are read together and the per-row decision stays the
 * same pure check (FID-2026-1124-005).
 */
export async function trialOffers(
  db: PostgresDatabase,
  modelIds: string[],
): Promise<Map<string, TrialOffer | null>> {
  const config = readTrialConfig();
  const offers = new Map<string, TrialOffer | null>();

  if (!config.enabled) {
    for (const id of modelIds) offers.set(id, null);

    return offers;
  }

  const paired = modelIds
    .map((id) => config.pairs[id])
    .filter((id): id is string => Boolean(id));
  const models = await getModelsForGateway(db, [...modelIds, ...paired]);

  for (const id of modelIds) {
    const paidId = config.pairs[id];

    offers.set(
      id,
      offerFor(models.get(id), paidId ? models.get(paidId) : undefined),
    );
  }

  return offers;
}
