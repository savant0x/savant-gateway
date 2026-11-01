import type { AdminModelSummary } from "../types.ts";
import type { GatewayModel } from "../projections.ts";
import type { ProviderRecord } from "../providers/types.ts";
import type {
  IdentityControlSnapshot,
  IdentityProviderSnapshot,
  IdentityTarget,
} from "./types.ts";

import { canonicalModelKey } from "../model-identity.ts";

/**
 * Pure target builders for FID-087.
 *
 * The create route and the admin page must describe a run the same way, so the
 * snapshot lives here instead of in either one. Nothing here reads the
 * environment or opens a connection.
 */

export function targetFromModel(
  model: GatewayModel,
  supportsTools: boolean,
): IdentityTarget {
  return {
    modelId: model.id,
    name: model.name,
    canonicalKey: canonicalModelKey(model.upstreamId),
    providerSlug: model.upstreamSlug,
    upstreamId: model.upstreamId,
    protocol: model.protocol,
    family: model.family,
    contextWindow: model.contextWindow,
    access: model.billingMode,
    supportsTools,
    costInputMicros: Math.max(0, Math.round(model.costInputMicros)),
    costOutputMicros: Math.max(0, Math.round(model.costOutputMicros)),
    tokenWeight: Math.max(1, Math.round(model.tokenWeight)),
  };
}

export function providerSnapshot(
  provider: ProviderRecord,
): IdentityProviderSnapshot {
  return {
    slug: provider.slug,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    keyEnvVar: provider.keyEnvVar,
  };
}

export function controlSnapshot(
  model: GatewayModel,
  supportsTools: boolean,
  provider: ProviderRecord,
): IdentityControlSnapshot {
  return {
    target: targetFromModel(model, supportsTools),
    provider: providerSnapshot(provider),
  };
}

/**
 * A control must be a different free model on the same wire protocol, with an
 * enabled provider whose key is present. The admin rows already carry the
 * provider and the access mode, so no network call is needed to pick one.
 */
export function pickControlCandidate(
  rows: AdminModelSummary[],
  input: {
    excludeModelId: string;
    excludeCanonicalKey: string;
    protocol: "chat" | "messages";
    enabledProvider: (slug: string) => boolean;
  },
): AdminModelSummary | null {
  const candidates = rows.filter(
    (row) =>
      row.id !== input.excludeModelId &&
      canonicalModelKey(row.upstreamId) !== input.excludeCanonicalKey &&
      row.access === "free" &&
      row.status === "active" &&
      row.inCatalog &&
      row.protocol === input.protocol &&
      row.servedProviderSlug !== null &&
      input.enabledProvider(row.servedProviderSlug),
  );

  return candidates[0] ?? null;
}
