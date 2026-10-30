import type { QuotaObservation } from "./provider-quota";

export type ModelAccess = "free" | "subscription" | "paid";

export type ModelGroupSummary = {
  slug: string;
  label: string;
  billingMode: ModelAccess;
  description: string | null;
  sortOrder: number;
  isSystem: boolean;
  hidden: boolean;
  modelCount: number;
};

export type ProviderStatus = {
  quota: QuotaObservation;
  balanceObservedAt: string | null;
  admissionRemainingTokens: number | null;
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
  groupSlug: string;
  groupLabel: string;
  groupBillingMode: ModelAccess;
  groupSource: "auto" | "manual";
  requiresSubscription: boolean;
  inputPricePer1M: number;
  outputPricePer1M: number;
  supportsTools: boolean;
  supportsVision: boolean;
  health: string | null;
  status: string;
  syncedAt: string;
};

export type AdminModelSummary = ModelSummary & {
  upstreamSlug: string;
  protocol: "chat" | "messages";
  costSource: "synced" | "manual" | "unknown";
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
  cachedInputTokens: number | null;
  cacheWriteInputTokens: number | null;
  reasoningOutputTokens: number | null;
  usageSource: string | null;
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

// The benchmark row and status shapes live with their domain module so this
// shared file stays inside the 400-line ceiling.
export type { BenchmarkStatus, BenchmarkSummary } from "./benchmarks";

export type AnalyticsPoint = {
  date: string;
  requests: number;
  tokens: number;
  chargedMicros: number;
  planRevenueMicros: number;
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
  planRevenueMicros: number;
  totalRevenueMicros: number;
  paidInvoiceCount: number;
  costMicros: number;
  marginMicros: number;
  totalMarginMicros: number;
  activeSubscribers: number;
  pastDueSubscribers: number;
  cancelingSubscribers: number;
  manualSubscribers: number;
  mrrMicros: number;
  averageLatencyMs: number;
  maxLatencyMs: number;
  errorRateBps: number;
};

export type AnalyticsPlan = {
  planId: string;
  planName: string;
  interval: PlanInterval;
  activeSubscribers: number;
  pastDueSubscribers: number;
  mrrMicros: number;
  paidInvoiceCount: number;
  planRevenueMicros: number;
};

export type AnalyticsData = {
  rangeDays: number;
  totals: AnalyticsTotals;
  series: AnalyticsPoint[];
  models: AnalyticsModel[];
  byPlan: AnalyticsPlan[];
};

export type SyncedModel = {
  id: string;
  upstreamId: string;
  upstreamSlug: string;
  name: string;
  family: string;
  protocol: "chat" | "messages";
  costSource: "synced" | "unknown";
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

export type PlanInterval = "month" | "year";
export type PlanStatus = "draft" | "active" | "archived";
export type PlanOverageMode = "block" | "credit";

export type PlanGroupInclusion = {
  slug: string;
  label: string;
};

export type PlanSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: PlanStatus;
  priceMicros: number;
  currency: string;
  interval: PlanInterval;
  includedWeightedTokens: number;
  overageMode: PlanOverageMode;
  overageMarkupBps: number;
  sortOrder: number;
  groups: PlanGroupInclusion[];
  modelIds: string[];
  modelCount: number;
  costBearingModelCount: number;
  subscriberCount: number;
  activeSubscriberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionPlanSnapshot = {
  name: string;
  priceMicros: number;
  currency: string;
  interval: PlanInterval;
  includedWeightedTokens: number;
  overageMode: PlanOverageMode;
  overageMarkupBps: number;
};

export type SubscriptionAllowance = {
  includedWeightedTokens: number;
  usedWeightedTokens: number;
  heldWeightedTokens: number;
  remainingWeightedTokens: number;
  usedBps: number;
};

export type SubscriptionInvoiceSummary = {
  id: string;
  amountMicros: number;
  currency: string;
  status: "paid" | "failed" | "open" | "void";
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type SubscriptionSummary = {
  id: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  planId: string;
  planSlug: string | null;
  plan: SubscriptionPlanSnapshot;
  status: "incomplete" | "active" | "past_due" | "canceled" | "expired";
  source: "stripe" | "manual";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  entitlementCount: number;
  allowance: SubscriptionAllowance;
  invoices: SubscriptionInvoiceSummary[];
  createdAt: string;
  updatedAt: string;
};

export type Customer = {
  id: string;
  email: string;
  name: string;
  status: string;
  createdAt: string;
};

export type CustomerAccount = {
  customer: Customer;
  account: AccountSummary;
  totalPurchasedMicros: number;
  totalRequests: number;
  totalTokens: number;
  keys: KeySummary[];
  usage: UsageSummary[];
  ledger: CreditLedgerEntry[];
  topups: TopupSummary[];
};

export type CustomerSummary = Customer & {
  creditMicros: number;
  heldMicros: number;
  keyCount: number;
  requestCount: number;
  chargedMicros: number;
  lastTopupAt: string | null;
};

export type TopupSummary = {
  id: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  provider: string;
  providerRef: string;
  amountMicros: number;
  currency: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
};
