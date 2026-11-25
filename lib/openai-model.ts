/**
 * The OpenAI-compatible model object (FID-2026-1103-124).
 *
 * The list and retrieve routes share one projection so a model can never be
 * shaped differently depending on how the client asked for it. `listModels()`
 * already scopes the query to published rows behind an enabled provider; this
 * module only formats what that read returned.
 */

import type { ModelSummary } from "./types.ts";
import type { TrialOffer } from "./storage/store/trial-offer.ts";

import { siteConfig } from "../config/site.ts";

import { catalogSkuName } from "./catalog-skus.ts";
import { extractApiKey, jsonError } from "./http.ts";
import { displayModelId } from "./model-identity.ts";
import { authenticateApiKey } from "./store-facade/access.ts";
import { getPublishedModel, trialOffer } from "./store-facade/catalog.ts";

export async function openAiModelObject(
  model: ModelSummary,
  offer?: TrialOffer | null,
) {
  // The published id is the display id, not the storage key: the key carries the
  // upstream account and the upstream's publisher path, and this endpoint is
  // where a client copies ids from (FID-2026-1125-002). The trial offer is still
  // read by stored id, because that is what it is stored under.
  return {
    id: displayModelId(model.id, model.upstreamSlug),
    trial_paid_transition:
      offer === undefined ? await trialOffer(model.id) : offer,
    object: "model",
    owned_by: siteConfig.provider.slug,
    name: catalogSkuName(model),
    family: model.family,
    group: model.access,
    group_slug: model.groupSlug,
    group_label: model.groupLabel,
    group_billing_mode: model.groupBillingMode,
    requires_subscription: model.requiresSubscription,
    context_window: model.contextWindow,
    token_weight: model.tokenWeight,
    allow_free: model.allowFree,
    input_price_per_1m: model.inputPricePer1M,
    output_price_per_1m: model.outputPricePer1M,
    currency: "usd",
    supports_tools: model.supportsTools,
    supports_vision: model.supportsVision,
    health: model.health,
  };
}

/** Only a row the list endpoint would publish can be retrieved, in one read. */
export async function findPublishedModel(id: string) {
  return getPublishedModel(id);
}

export function modelNotFound(id: string) {
  return jsonError(
    404,
    `Model '${id}' not found`,
    "invalid_request_error",
    {},
    "model_not_found",
  );
}

/** Same credential contract the list endpoint has always enforced. */
export async function guardModelRead(request: Request) {
  const secret = extractApiKey(request);

  if (!secret) {
    return jsonError(
      401,
      "Missing API key (Bearer or x-api-key)",
      "authentication_error",
    );
  }

  if (!(await authenticateApiKey(secret))) {
    return jsonError(401, "Invalid API key", "authentication_error");
  }

  return null;
}
