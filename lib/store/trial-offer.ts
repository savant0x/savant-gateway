import "server-only";

import { microsToPrice } from "../pricing";
import { readTrialConfig } from "../trials";

import { getModelForGateway } from "./models";

export function trialOffer(modelId: string) {
  const config = readTrialConfig();
  const id = config.pairs[modelId];
  const model = id ? getModelForGateway(id) : undefined;
  const source = config.enabled ? getModelForGateway(modelId) : undefined;

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
