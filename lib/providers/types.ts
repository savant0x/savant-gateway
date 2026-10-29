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
  enabled: boolean;
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
  free: number;
  paid: number;
  subscriptionOnly: number;
  warnings: string[];
  balance: unknown;
  subscription: unknown;
};

export type SyncAllSummary = {
  imported: number;
  free: number;
  paid: number;
  subscriptionOnly: number;
  warnings: string[];
  providers: ProviderSyncSummary[];
};
