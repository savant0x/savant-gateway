/**
 * The OpenAI-compatible model object (FID-2026-1103-124).
 *
 * The list and retrieve routes share one projection so a model can never be
 * shaped differently depending on how the client asked for it. `listModels()`
 * already scopes the query to published rows behind an enabled provider; this
 * module only formats what that read returned.
 */

import type { ModelSummary } from "./types.ts";

import { siteConfig } from "../config/site.ts";

import { extractApiKey, jsonError } from "./http.ts";
import { authenticateApiKey } from "./store-facade/access.ts";
import { listModels, trialOffer } from "./store-facade/catalog.ts";

export async function openAiModelObject(model: ModelSummary) {
  return {
    id: model.id,
    trial_paid_transition: await trialOffer(model.id),
    object: "model",
    owned_by: siteConfig.provider.slug,
    name: model.name,
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

/** Only a row the list endpoint would publish can be retrieved. */
export async function findPublishedModel(id: string) {
  return (await listModels()).find((model) => model.id === id) ?? null;
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
