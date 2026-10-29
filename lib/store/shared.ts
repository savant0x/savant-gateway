import "server-only";

import type {
  KeySummary,
  ModelAccess,
  ModelSummary,
  ProviderStatus,
  UsageSummary,
} from "../types";

export type ModelRow = {
  id: string;
  upstream_id: string;
  name: string;
  provider: string;
  context_window: string;
  token_weight: number;
  input_price_micros: number;
  output_price_micros: number;
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
  provider: string;
  contextWindow: string;
  tokenWeight: number;
  inputPriceMicros: number;
  outputPriceMicros: number;
  allowFree: boolean;
  status: string;
};

export type AuthenticatedKey = {
  keyId: string;
  userId: string;
  keyPrefix: string;
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

  const looksFree =
    row.provider.toLowerCase() === "free" || row.id.startsWith("free/");

  return looksFree ? "subscription" : "paid";
}

export function toModelSummary(row: ModelRow): ModelSummary {
  return {
    id: row.id,
    upstreamId: row.upstream_id,
    name: row.name,
    provider: row.provider,
    contextWindow: row.context_window,
    tokenWeight: row.token_weight,
    allowFree: row.allow_free === 1,
    access: accessFor(row),
    inputPricePer1M: row.input_price_micros / 1_000_000,
    outputPricePer1M: row.output_price_micros / 1_000_000,
    supportsTools: row.supports_tools === 1,
    supportsVision: row.supports_vision === 1,
    health: row.health,
    syncedAt: row.synced_at,
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
    costMicros: row.cost_micros,
    status: row.status,
    latencyMs: row.latency_ms,
    error: row.error,
    createdAt: row.created_at,
  };
}
