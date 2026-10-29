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

/**
 * Public catalog row. `inputPricePer1M` / `outputPricePer1M` are **our sell
 * prices**. Upstream cost never crosses this shape.
 */
export type ModelSummary = {
  id: string;
  upstreamId: string;
  name: string;
  family: string;
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

export type AdminModelSummary = ModelSummary & {
  costInputPer1M: number;
  costOutputPer1M: number;
  priceSource: "auto" | "manual";
  inputMarginBps: number | null;
  outputMarginBps: number | null;
  blendedProfitMicros: number;
  inCatalog: boolean;
  sortOrder: number;
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
  chargedMicros: number;
  status: string;
  latencyMs: number;
  error: string | null;
  createdAt: string;
};

export type AdminUsageSummary = UsageSummary & {
  costMicros: number;
};

export type OverviewStats = {
  modelCount: number;
  freeModelCount: number;
  paidModelCount: number;
  subscriptionModelCount: number;
  keyCount: number;
  requestCount: number;
  totalTokens: number;
};

export type AccountSummary = {
  creditMicros: number;
  heldMicros: number;
  availableMicros: number;
};

export type CreditLedgerEntry = {
  id: string;
  kind: string;
  amountMicros: number;
  balanceAfterMicros: number;
  note: string | null;
  createdAt: string;
};

export type Overview = {
  provider: ProviderStatus;
  account: AccountSummary;
  models: ModelSummary[];
  keys: KeySummary[];
  usage: UsageSummary[];
  stats: OverviewStats;
};

export type PricingSummary = {
  markupBps: number;
  pricedCount: number;
  unpricedCount: number;
  freeCount: number;
  averageInputMarginBps: number | null;
  averageOutputMarginBps: number | null;
};

export type PricingData = {
  models: AdminModelSummary[];
  summary: PricingSummary;
};

export type AdminOverview = {
  provider: ProviderStatus;
  account: AccountSummary;
  models: AdminModelSummary[];
  keys: KeySummary[];
  usage: AdminUsageSummary[];
  stats: OverviewStats;
  pricing: PricingSummary;
  ledger: CreditLedgerEntry[];
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
  models: ModelSummary[];
  stats: OverviewStats;
};

export type CatalogData = {
  models: ModelSummary[];
  stats: OverviewStats;
  provider: PublicProviderStatus;
};

export type AnalyticsPoint = {
  date: string;
  requests: number;
  tokens: number;
  chargedMicros: number;
  costMicros: number;
};

export type AnalyticsModel = {
  modelId: string;
  modelName: string;
  family: string;
  requests: number;
  tokens: number;
  chargedMicros: number;
  costMicros: number;
};

export type AnalyticsTotals = {
  requests: number;
  okRequests: number;
  errorRequests: number;
  inputTokens: number;
  outputTokens: number;
  chargedMicros: number;
  costMicros: number;
  marginMicros: number;
  averageLatencyMs: number;
  maxLatencyMs: number;
  errorRateBps: number;
};

export type AnalyticsData = {
  rangeDays: number;
  totals: AnalyticsTotals;
  series: AnalyticsPoint[];
  models: AnalyticsModel[];
};

export type SyncedModel = {
  id: string;
  upstreamId: string;
  name: string;
  family: string;
  contextWindow: string;
  tokenWeight: number;
  costInputMicros: number;
  costOutputMicros: number;
  allowFree: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  health: string | null;
  sortOrder: number;
};
