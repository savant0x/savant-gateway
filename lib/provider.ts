import "server-only";

import type { SyncedModel } from "./types";

import { replaceModels } from "./store/models";
import { saveProviderStatus } from "./store/provider";
import { getMarkupBps } from "./store/settings";

const DEFAULT_BASE_URL = "https://api.apinex.bond/v1";
const DEFAULT_PUBLIC_MODELS_URL = "https://apinex.bond/api/public/models";

export class ProviderConfigError extends Error {}

type ProviderModel = {
  id?: unknown;
  name?: unknown;
  context_window?: unknown;
};

type PublicModel = {
  id?: unknown;
  name?: unknown;
  provider?: unknown;
  contextWindow?: unknown;
  weight?: unknown;
  allowFree?: unknown;
  dollarsPer1M?: unknown;
  outputDollarsPer1M?: unknown;
  supportsTools?: unknown;
  supportsVision?: unknown;
  health?: unknown;
};

type BalancePayload = {
  balance_usd?: number;
  rpm?: number;
  rpm_plan?: string | null;
  api_key?: {
    spend_limit_usd?: number | null;
    spent_usd?: number;
    remaining_usd?: number | null;
    limit_reached?: boolean;
  };
};

type SubscriptionPayload = {
  mode?: string;
  plan?: string | null;
  plan_label?: string | null;
  unlimited?: boolean;
  token_limit?: number | null;
  tokens_used?: number;
  tokens_remaining?: number | null;
  expires_at_utc?: string | null;
  allowed?: boolean;
};

export type ProviderBalance = {
  balanceUsd: number;
  rpm: number | null;
  rpmPlan: string | null;
  spendLimitUsd: number | null;
  spentUsd: number | null;
  remainingUsd: number | null;
  limitReached: boolean;
};

export type ProviderSubscription = {
  mode: string | null;
  plan: string | null;
  unlimited: boolean;
  tokenLimit: number | null;
  tokensUsed: number | null;
  tokensRemaining: number | null;
  expiresAt: string | null;
  allowed: boolean | null;
};

function baseUrl() {
  return (process.env.PROVIDER_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
}

export function getProviderKey() {
  const key = process.env.PROVIDER_KEY?.trim();

  if (!key) {
    throw new ProviderConfigError(
      "PROVIDER_KEY is not configured. Add it to .env.local and restart the server.",
    );
  }

  return key;
}

function providerFetch(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getProviderKey()}`,
    Accept: "application/json",
    src: "gate",
  };

  if (
    init.headers &&
    !(init.headers instanceof Headers) &&
    !Array.isArray(init.headers)
  ) {
    Object.assign(headers, init.headers);
  }

  return fetch(`${baseUrl()}${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export async function readProviderError(response: Response) {
  const text = await response.text().catch(() => "");

  try {
    const payload = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const nested =
      typeof payload.error === "object"
        ? payload.error?.message
        : payload.error;

    return String(
      nested || payload.message || text || `HTTP ${response.status}`,
    ).slice(0, 400);
  } catch {
    return (text || `HTTP ${response.status}`).slice(0, 400);
  }
}

export async function fetchProviderBalance(): Promise<ProviderBalance> {
  const response = await providerFetch("/balance");

  if (!response.ok) {
    throw new Error(await readProviderError(response));
  }

  const data = (await response.json()) as BalancePayload;
  const balanceUsd = numberOrNull(data.balance_usd) ?? 0;

  return {
    balanceUsd,
    rpm: numberOrNull(data.rpm),
    rpmPlan: data.rpm_plan ?? null,
    spendLimitUsd: numberOrNull(data.api_key?.spend_limit_usd),
    spentUsd: numberOrNull(data.api_key?.spent_usd),
    remainingUsd: numberOrNull(data.api_key?.remaining_usd),
    limitReached: Boolean(data.api_key?.limit_reached),
  };
}

export async function fetchProviderSubscription(): Promise<ProviderSubscription> {
  const response = await providerFetch("/subscription");

  if (!response.ok) {
    throw new Error(await readProviderError(response));
  }

  const data = (await response.json()) as SubscriptionPayload;

  return {
    mode: data.mode ?? null,
    plan: data.plan_label || data.plan || null,
    unlimited: Boolean(data.unlimited),
    tokenLimit: numberOrNull(data.token_limit),
    tokensUsed: numberOrNull(data.tokens_used),
    tokensRemaining: numberOrNull(data.tokens_remaining),
    expiresAt: data.expires_at_utc ?? null,
    allowed: typeof data.allowed === "boolean" ? data.allowed : null,
  };
}

export async function fetchProviderModels(): Promise<ProviderModel[]> {
  const response = await providerFetch("/models");

  if (!response.ok) {
    throw new Error(await readProviderError(response));
  }

  const payload = (await response.json()) as { data?: ProviderModel[] };

  return Array.isArray(payload.data) ? payload.data : [];
}

export async function fetchPublicModels(): Promise<Map<string, PublicModel>> {
  const url =
    process.env.PROVIDER_PUBLIC_MODELS_URL?.trim() || DEFAULT_PUBLIC_MODELS_URL;
  const response = await fetch(url, {
    headers: { Accept: "application/json", src: "gate" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return new Map();

  const payload = (await response.json()) as { models?: PublicModel[] };
  const map = new Map<string, PublicModel>();

  for (const item of payload.models ?? []) {
    const id = String(item.id ?? "").trim();

    if (id) map.set(id, item);
  }

  return map;
}

function displayNameFromId(modelId: string) {
  const leaf = modelId.includes("/")
    ? modelId.slice(modelId.lastIndexOf("/") + 1)
    : modelId;

  return leaf
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferProvider(modelId: string) {
  const prefix = modelId.includes("/")
    ? modelId.slice(0, modelId.indexOf("/"))
    : modelId.split("-")[0];

  return prefix ? displayNameFromId(prefix) : "Other";
}

function buildSyncedModels(
  models: ProviderModel[],
  metadata: Map<string, PublicModel>,
): SyncedModel[] {
  const seen = new Set<string>();
  const rows: Omit<SyncedModel, "sortOrder">[] = [];

  for (const item of models) {
    const id = String(item.id ?? "").trim();

    if (!id || seen.has(id)) continue;
    seen.add(id);
    const spec = metadata.get(id);
    const provider =
      String(spec?.provider ?? "").trim() ||
      (id.startsWith("free/") ? "Free" : inferProvider(id));
    // `allowFree` is set on paid models too, but only the `free/*` pool is usable
    // on a zero-balance account. Treat everything else as paid/subscription.
    const isFreePool =
      (id.startsWith("free/") || provider.toLowerCase() === "free") &&
      (typeof spec?.allowFree === "boolean" ? spec.allowFree : true);
    const weight = isFreePool
      ? Math.max(1, Math.round(numberOrNull(spec?.weight) ?? 1))
      : 0;
    const inputCost = isFreePool
      ? 0
      : Math.max(0, numberOrNull(spec?.dollarsPer1M) ?? 0);
    const outputCost = isFreePool
      ? 0
      : Math.max(0, numberOrNull(spec?.outputDollarsPer1M) ?? inputCost);

    rows.push({
      id,
      upstreamId: id,
      name:
        String(spec?.name ?? item.name ?? "").trim() || displayNameFromId(id),
      provider,
      contextWindow:
        String(spec?.contextWindow ?? item.context_window ?? "").trim() || "—",
      tokenWeight: weight,
      costInputMicros: Math.round(inputCost * 1_000_000),
      costOutputMicros: Math.round(outputCost * 1_000_000),
      allowFree: isFreePool,
      supportsTools: Boolean(spec?.supportsTools),
      supportsVision: Boolean(spec?.supportsVision),
      health: String(spec?.health ?? "").trim() || null,
    });
  }

  rows.sort((a, b) => {
    if (a.allowFree !== b.allowFree) return a.allowFree ? -1 : 1;

    return a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name);
  });

  return rows.map((row, index) => ({ ...row, sortOrder: (index + 1) * 10 }));
}

export type SyncSummary = {
  imported: number;
  free: number;
  paid: number;
  subscriptionOnly: number;
  balance: ProviderBalance | null;
  subscription: ProviderSubscription | null;
  warnings: string[];
};

export async function syncProvider(): Promise<SyncSummary> {
  getProviderKey();

  const [balanceResult, subscriptionResult, modelsResult] =
    await Promise.allSettled([
      fetchProviderBalance(),
      fetchProviderSubscription(),
      fetchProviderModels(),
    ]);

  const warnings: string[] = [];
  const balance =
    balanceResult.status === "fulfilled" ? balanceResult.value : null;
  const subscription =
    subscriptionResult.status === "fulfilled" ? subscriptionResult.value : null;

  if (balanceResult.status === "rejected") {
    warnings.push(`Balance: ${String(balanceResult.reason)}`);
  }
  if (subscriptionResult.status === "rejected") {
    warnings.push(`Subscription: ${String(subscriptionResult.reason)}`);
  }

  saveProviderStatus({
    status:
      !balance && !subscription
        ? "error"
        : balance?.limitReached
          ? "exhausted"
          : "active",
    balanceUsd: balance?.balanceUsd ?? null,
    rpm: balance?.rpm ?? null,
    rpmPlan: balance?.rpmPlan ?? null,
    subscriptionMode: subscription?.mode ?? null,
    subscriptionPlan: subscription?.plan ?? null,
    subscriptionTokenLimit: subscription?.tokenLimit ?? null,
    subscriptionTokensUsed: subscription?.tokensUsed ?? null,
    subscriptionTokensRemaining: subscription?.tokensRemaining ?? null,
    subscriptionAllowed: subscription?.allowed ?? null,
    subscriptionExpiresAt: subscription?.expiresAt ?? null,
    error: warnings.length > 0 ? warnings.join("; ") : null,
  });

  if (modelsResult.status === "rejected") {
    throw new Error(
      `Could not load the model catalog: ${String(modelsResult.reason)}`,
    );
  }

  const metadata = await fetchPublicModels().catch(
    () => new Map<string, PublicModel>(),
  );
  const synced = buildSyncedModels(modelsResult.value, metadata);

  replaceModels(synced, getMarkupBps());

  const free = synced.filter(
    (model) => model.allowFree && model.tokenWeight > 0,
  ).length;
  const paid = synced.filter(
    (model) =>
      !(model.allowFree && model.tokenWeight > 0) && model.costInputMicros > 0,
  ).length;

  return {
    imported: synced.length,
    free,
    paid,
    subscriptionOnly: synced.length - free - paid,
    balance,
    subscription,
    warnings,
  };
}

export function providerChatCompletion(
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  return providerFetch("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}
