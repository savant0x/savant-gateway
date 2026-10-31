import "server-only";

import type {
  AdminModelSummary,
  AdminUsageSummary,
  KeySummary,
  ModelAccess,
  ModelRouteSummary,
  ModelSummary,
  ProviderStatus,
  UsageSummary,
} from "../types";

import { canonicalModelKey } from "../model-identity";
import {
  accessFromGroup,
  legacyAccessFor,
  SYSTEM_GROUP_LABELS,
} from "../model-groups";
import { blendedProfitMicros, marginBps, microsToPrice } from "../pricing";

export type ModelRow = {
  id: string;
  upstream_id: string;
  upstream_slug: string;
  name: string;
  provider: string;
  family: string | null;
  protocol: "chat" | "messages";
  route_group: string | null;
  is_primary: number;
  served_provider_slug: string | null;
  served_upstream_id: string | null;
  served_protocol: "chat" | "messages" | null;
  served_cost_input_micros: number | null;
  served_cost_output_micros: number | null;
  cost_source: "synced" | "manual" | "unknown";
  context_window: string;
  token_weight: number;
  input_price_micros: number;
  output_price_micros: number;
  sell_input_micros: number;
  sell_output_micros: number;
  price_source: "auto" | "manual";
  in_catalog: number;
  allow_free: number;
  group_slug: string | null;
  group_source: "auto" | "manual";
  group_label: string | null;
  group_billing_mode: ModelAccess | null;
  supports_tools: number;
  supports_vision: number;
  health: string | null;
  status: string;
  sort_order: number;
  synced_at: string;
};

export type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  status: string;
  created_at: string;
  last_used_at: string | null;
};

export type UsageRow = {
  id: string;
  model_id: string | null;
  model_name: string | null;
  key_prefix: string | null;
  input_tokens: number;
  output_tokens: number;
  weighted_tokens: number;
  charged_micros: number;
  cached_input_tokens: number | null;
  cache_write_input_tokens: number | null;
  reasoning_output_tokens: number | null;
  usage_source: string | null;
  cost_micros: number;
  status: string;
  latency_ms: number;
  error: string | null;
  created_at: string;
};

export type GatewayModel = {
  id: string;
  upstreamId: string;
  upstreamSlug: string;
  name: string;
  family: string;
  protocol: "chat" | "messages";
  costSource: "synced" | "manual" | "unknown";
  contextWindow: string;
  tokenWeight: number;
  costInputMicros: number;
  costOutputMicros: number;
  sellInputMicros: number;
  sellOutputMicros: number;
  allowFree: boolean;
  groupSlug: string;
  groupLabel: string;
  groupSource: "auto" | "manual";
  billingMode: ModelAccess;
  status: string;
  inCatalog: boolean;
};

export type AuthenticatedKey = {
  keyId: string;
  userId: string;
  keyPrefix: string;
};

export type FreePoolReservation = {
  id: string;
  day: string;
  weightedTokens: number;
};

export type ProviderStatusInput = {
  status: ProviderStatus["status"];
  balanceUsd: number | null;
  rpm: number | null;
  rpmPlan: string | null;
  subscriptionMode: string | null;
  subscriptionPlan: string | null;
  subscriptionTokenLimit: number | null;
  subscriptionTokensUsed: number | null;
  subscriptionTokensRemaining: number | null;
  subscriptionAllowed: boolean | null;
  subscriptionExpiresAt: string | null;
  error: string | null;
};

export function accessFor(
  row: Pick<
    ModelRow,
    | "allow_free"
    | "token_weight"
    | "upstream_id"
    | "group_slug"
    | "group_billing_mode"
  >,
): ModelAccess {
  // The `free/` scope belongs to the upstream id; a non-default provider's
  // public id is namespaced and must not change the fallback group.
  return accessFromGroup(
    row.group_billing_mode,
    legacyAccessFor({
      allowFree: row.allow_free === 1,
      tokenWeight: row.token_weight,
      upstreamId: row.upstream_id,
    }),
  );
}

export function toGatewayModel(row: ModelRow): GatewayModel {
  const billingMode = accessFor(row);
  // The published row names the model; the serving route answers it. A model
  // whose cheapest provider changed keeps its public id and sell price while
  // the upstream identity, protocol and cost follow the winning route.
  const servedSlug = row.served_provider_slug ?? row.upstream_slug;
  const servedId = row.served_upstream_id ?? row.upstream_id;
  const servedProtocol =
    row.served_protocol === "chat" || row.served_protocol === "messages"
      ? row.served_protocol
      : row.protocol;
  const costInputMicros =
    row.served_cost_input_micros ?? row.input_price_micros;
  const costOutputMicros =
    row.served_cost_output_micros ?? row.output_price_micros;

  return {
    id: row.id,
    upstreamId: servedId,
    name: row.name,
    upstreamSlug: servedSlug,
    family: row.family ?? row.provider,
    protocol: servedProtocol,
    costSource: row.cost_source,
    contextWindow: row.context_window,
    tokenWeight: row.token_weight,
    costInputMicros,
    costOutputMicros,
    sellInputMicros: row.sell_input_micros,
    sellOutputMicros: row.sell_output_micros,
    allowFree: row.allow_free === 1,
    groupSlug: row.group_slug ?? billingMode,
    groupLabel: row.group_label ?? SYSTEM_GROUP_LABELS[billingMode],
    groupSource: row.group_source ?? "auto",
    billingMode,
    status: row.status,
    inCatalog: row.in_catalog === 1,
  };
}

export function toModelSummary(row: ModelRow): ModelSummary {
  const access = accessFor(row);

  return {
    id: row.id,
    upstreamId: row.upstream_id,
    name: row.name,
    family: row.family ?? row.provider,
    contextWindow: row.context_window,
    tokenWeight: row.token_weight,
    allowFree: row.allow_free === 1,
    access,
    groupSlug: row.group_slug ?? access,
    groupLabel: row.group_label ?? SYSTEM_GROUP_LABELS[access],
    groupBillingMode: access,
    groupSource: row.group_source ?? "auto",
    requiresSubscription: access === "subscription",
    inputPricePer1M: microsToPrice(row.sell_input_micros),
    outputPricePer1M: microsToPrice(row.sell_output_micros),
    supportsTools: row.supports_tools === 1,
    supportsVision: row.supports_vision === 1,
    health: row.health,
    status: row.status,
    syncedAt: row.synced_at,
  };
}

export function toAdminModelSummary(
  row: ModelRow,
  routes: ModelRouteSummary[] = [],
): AdminModelSummary {
  const summary = toModelSummary(row);
  // Margin and cost are the serving route's numbers, because that is what the
  // gateway records at settlement. The row's own cost stays visible so an
  // operator can see what this provider charges before it wins a route.
  const costInput = row.served_cost_input_micros ?? row.input_price_micros;
  const costOutput = row.served_cost_output_micros ?? row.output_price_micros;

  return {
    ...summary,
    upstreamSlug: row.upstream_slug,
    protocol: row.protocol,
    costSource: row.cost_source,
    costInputPer1M: microsToPrice(costInput),
    costOutputPer1M: microsToPrice(costOutput),
    ownCostInputPer1M: microsToPrice(row.input_price_micros),
    ownCostOutputPer1M: microsToPrice(row.output_price_micros),
    priceSource: row.price_source,
    routeGroup: row.route_group ?? canonicalModelKey(row.upstream_id),
    isPrimary: row.is_primary === 1,
    servedProviderSlug: row.served_provider_slug,
    routes,
    inputMarginBps: marginBps(costInput, row.sell_input_micros),
    outputMarginBps: marginBps(costOutput, row.sell_output_micros),
    blendedProfitMicros: blendedProfitMicros({
      costInputMicros: costInput,
      costOutputMicros: costOutput,
      sellInputMicros: row.sell_input_micros,
      sellOutputMicros: row.sell_output_micros,
    }),
    inCatalog: row.in_catalog === 1,
    sortOrder: row.sort_order,
  };
}

export function toKeySummary(row: KeyRow): KeySummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    status: row.status,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export function toUsageSummary(row: UsageRow): UsageSummary {
  return {
    id: row.id,
    modelId: row.model_id,
    modelName: row.model_name,
    keyPrefix: row.key_prefix,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    weightedTokens: row.weighted_tokens,
    chargedMicros: row.charged_micros,
    cachedInputTokens: row.cached_input_tokens,
    cacheWriteInputTokens: row.cache_write_input_tokens,
    reasoningOutputTokens: row.reasoning_output_tokens,
    usageSource: row.usage_source,
    status: row.status,
    latencyMs: row.latency_ms,
    error: row.error,
    createdAt: row.created_at,
  };
}

export function toAdminUsageSummary(row: UsageRow): AdminUsageSummary {
  return {
    ...toUsageSummary(row),
    costMicros: row.cost_micros,
  };
}
