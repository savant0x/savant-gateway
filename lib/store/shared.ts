import "server-only";

import type {
  AdminModelSummary,
  AdminUsageSummary,
  KeySummary,
  ModelAccess,
  ModelSummary,
  ProviderStatus,
  UsageSummary,
} from "../types";

import { blendedProfitMicros, marginBps, microsToPrice } from "../pricing";

export type ModelRow = {
  id: string;
  upstream_id: string;
  name: string;
  provider: string;
  context_window: string;
  token_weight: number;
  input_price_micros: number;
  output_price_micros: number;
  sell_input_micros: number;
  sell_output_micros: number;
  price_source: "auto" | "manual";
  in_catalog: number;
  allow_free: number;
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
  cost_micros: number;
  status: string;
  latency_ms: number;
  error: string | null;
  created_at: string;
};

export type GatewayModel = {
  id: string;
  upstreamId: string;
  name: string;
  family: string;
  contextWindow: string;
  tokenWeight: number;
  costInputMicros: number;
  costOutputMicros: number;
  sellInputMicros: number;
  sellOutputMicros: number;
  allowFree: boolean;
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
  row: Pick<ModelRow, "allow_free" | "token_weight" | "provider" | "id">,
): ModelAccess {
  if (row.allow_free === 1 && row.token_weight > 0) return "free";

  return row.id.startsWith("free/") ? "subscription" : "paid";
}

export function toModelSummary(row: ModelRow): ModelSummary {
  return {
    id: row.id,
    upstreamId: row.upstream_id,
    name: row.name,
    family: row.provider,
    contextWindow: row.context_window,
    tokenWeight: row.token_weight,
    allowFree: row.allow_free === 1,
    access: accessFor(row),
    inputPricePer1M: microsToPrice(row.sell_input_micros),
    outputPricePer1M: microsToPrice(row.sell_output_micros),
    supportsTools: row.supports_tools === 1,
    supportsVision: row.supports_vision === 1,
    health: row.health,
    status: row.status,
    syncedAt: row.synced_at,
  };
}

export function toAdminModelSummary(row: ModelRow): AdminModelSummary {
  const summary = toModelSummary(row);

  return {
    ...summary,
    costInputPer1M: microsToPrice(row.input_price_micros),
    costOutputPer1M: microsToPrice(row.output_price_micros),
    priceSource: row.price_source,
    inputMarginBps: marginBps(row.input_price_micros, row.sell_input_micros),
    outputMarginBps: marginBps(row.output_price_micros, row.sell_output_micros),
    blendedProfitMicros: blendedProfitMicros({
      costInputMicros: row.input_price_micros,
      costOutputMicros: row.output_price_micros,
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
