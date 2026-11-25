import type { ProviderStatus } from "../types";

export type ProviderKind = "openai" | "anthropic" | "both";
export type ModelProtocol = "chat" | "messages";

export type ProviderCapabilities = {
  balance: boolean;
  subscription: boolean;
  pricing: boolean;
};

export type ProviderRecord = {
  slug: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  keyEnvVar: string;
  defaultHeaders: Record<string, string>;
  capabilities: ProviderCapabilities;
  /** Only an explicit per-model `chat` decision may publish or serve. */
  requiresModelReview: boolean;
  /**
   * Absolute URL for the balance read when the provider publishes it on another
   * host or path than its inference base URL. Null means `${baseUrl}/balance`.
   */
  balanceUrl: string | null;
  /** The vendor's prefix-group document, when it publishes one. */
  catalogUrl: string | null;
  enabled: boolean;
  /**
   * Whether this provider owns the unprefixed public id namespace and the
   * published balance badge. Exactly one row holds it.
   */
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProviderSummary = ProviderRecord &
  ProviderStatus & {
    modelCount: number;
  };

export type UpstreamModel = {
  id?: unknown;
  name?: unknown;
  context_window?: unknown;
  contextWindow?: unknown;
  supported_endpoints?: unknown;
  provider?: unknown;
  weight?: unknown;
  allowFree?: unknown;
  dollarsPer1M?: unknown;
  outputDollarsPer1M?: unknown;
  supportsTools?: unknown;
  supportsVision?: unknown;
  health?: unknown;
};

export type ProviderSyncSummary = {
  slug: string;
  imported: number;
  paid: number;
  /** Imported rows with no cost: they stay disabled until an operator prices them. */
  unpriced: number;
  warnings: string[];
  balance: unknown;
  subscription: unknown;
};

export type SyncAllSummary = {
  imported: number;
  paid: number;
  unpriced: number;
  warnings: string[];
  providers: ProviderSyncSummary[];
};
