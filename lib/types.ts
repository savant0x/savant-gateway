export type ModelAccess = "free" | "subscription" | "paid";

export type ProviderStatus = {
  configured: boolean;
  status: "active" | "exhausted" | "error" | "unconfigured";
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
  syncedAt: string | null;
  error: string | null;
};

export type ModelSummary = {
  id: string;
  upstreamId: string;
  name: string;
  provider: string;
  contextWindow: string;
  tokenWeight: number;
  allowFree: boolean;
  access: ModelAccess;
  inputPricePer1M: number;
  outputPricePer1M: number;
  supportsTools: boolean;
  supportsVision: boolean;
  health: string | null;
  status: string;
  syncedAt: string;
};

export type KeySummary = {
  id: string;
  name: string;
  prefix: string;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type UsageSummary = {
  id: string;
  modelId: string | null;
  modelName: string | null;
  keyPrefix: string | null;
  inputTokens: number;
  outputTokens: number;
  weightedTokens: number;
  costMicros: number;
  status: string;
  latencyMs: number;
  error: string | null;
  createdAt: string;
};

export type OverviewStats = {
  modelCount: number;
  freeModelCount: number;
  keyCount: number;
  requestCount: number;
  totalTokens: number;
};

export type Overview = {
  provider: ProviderStatus;
  models: ModelSummary[];
  keys: KeySummary[];
  usage: UsageSummary[];
  stats: OverviewStats;
};

export type PublicProviderStatus = Pick<
  ProviderStatus,
  | "configured"
  | "status"
  | "subscriptionMode"
  | "subscriptionTokenLimit"
  | "subscriptionTokensUsed"
  | "subscriptionTokensRemaining"
  | "syncedAt"
>;

export type LandingData = {
  provider: PublicProviderStatus;
  freeModels: ModelSummary[];
  stats: OverviewStats;
};

export type AdminOverview = Overview & {
  allModels: ModelSummary[];
};

export type SyncedModel = {
  id: string;
  upstreamId: string;
  name: string;
  provider: string;
  contextWindow: string;
  tokenWeight: number;
  inputPriceMicros: number;
  outputPriceMicros: number;
  allowFree: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  health: string | null;
  sortOrder: number;
};
