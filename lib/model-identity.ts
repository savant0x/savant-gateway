import type { ModelAccess } from "./types.ts";

/**
 * Provider-neutral model identity.
 *
 * Two providers resell the same model under different strings: `free/gpt-6-luna`
 * on the default provider, `gpt-6-luna` on another, `deepseek-v4-pro-0813`
 * where the other sells `deepseek-v4.1-flash`. Routing one public model to the
 * cheapest provider needs one key for "the same model", and that key must not
 * merge genuinely different models: a version bump, an `abliterated` variant or
 * a `-pro` suffix stays distinct.
 *
 * The identity is deliberately conservative. It lowercases, drops the
 * `family/` path, folds separators and strips a build stamp or vendor backup
 * suffix. Anything it cannot prove identical stays separate; an operator can
 * still publish both ids.
 */
const BUILD_TAIL = /-(?:backup|v?\d{4,8})$/;
const DATE_TAIL = /-(?:19|20)\d{2}-\d{2}-\d{2}$/;

export function canonicalModelKey(upstreamId: string) {
  const trimmed = upstreamId.trim().toLowerCase();
  const leaf = trimmed.includes("/")
    ? trimmed.slice(trimmed.lastIndexOf("/") + 1)
    : trimmed;
  let key = leaf.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  // A release stamp (`-0813`, `-20241022`) or an ISO date is not part of the
  // identity: the same weights are served under `deepseek-v4-pro` and
  // `deepseek-v4-pro-0813`.
  key = key.replace(DATE_TAIL, "");

  while (BUILD_TAIL.test(key)) key = key.replace(BUILD_TAIL, "");

  return key || leaf;
}

/**
 * The route identity of one catalog row: the model identity plus the billing
 * tier it is sold under.
 *
 * A provider publishes some weights twice — a `free/` allocation with a daily
 * weighted allowance, and the metered id billed per token. Those are two
 * products, not two providers of one product. Folding them into one group let
 * route planning elect a single published row, so the paid counterpart was
 * imported and then withheld from the public catalog whenever a free allocation
 * existed. Rows of the same tier still merge across providers, which is what
 * keeps takeover and the stable published id working.
 */
export function routeGroupKey(input: {
  routeGroup: string | null;
  upstreamId: string;
  billingMode: ModelAccess;
}) {
  const group = input.routeGroup?.trim() || canonicalModelKey(input.upstreamId);

  return `${input.billingMode}:${group}`;
}

/** True when a public id carries a provider namespace (`apixo/gpt-6-astra`). */
export function isNamespacedModelId(id: string, providerSlug: string) {
  return id.startsWith(`${providerSlug}/`);
}
