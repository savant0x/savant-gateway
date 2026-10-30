import "server-only";

import type { ProviderRecord } from "./types";
import type { ProviderBalance, ProviderSubscription } from "../provider-quota";

import {
  parseProviderBalance,
  parseProviderSubscription,
} from "../provider-quota";

import { authHeaders } from "./auth-headers";
import { readProviderError } from "./error-text.ts";

export { readProviderError };

export class ProviderConfigError extends Error {}

export type { ProviderBalance, ProviderSubscription };

export function getProviderKey(provider: ProviderRecord) {
  const key = process.env[provider.keyEnvVar]?.trim();

  if (!key) {
    throw new ProviderConfigError(
      `${provider.keyEnvVar} is not configured. Add it to .env.local and restart the server.`,
    );
  }

  return key;
}

export function providerHeaders(
  provider: ProviderRecord,
): Record<string, string> {
  return authHeaders(
    provider.kind,
    getProviderKey(provider),
    provider.defaultHeaders,
  );
}

export function providerFetch(
  provider: ProviderRecord,
  path: string,
  init: RequestInit = {},
) {
  const headers = providerHeaders(provider);

  if (
    init.headers &&
    !(init.headers instanceof Headers) &&
    !Array.isArray(init.headers)
  ) {
    Object.assign(headers, init.headers);
  }

  return fetch(`${provider.baseUrl}${path}`, {
    ...init,
    headers,
    // An operator-configured origin must not bounce the request (and the
    // credential on it) to a different host. A redirect is a configuration
    // error to report, not a hop to follow.
    redirect: init.redirect ?? "error",
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
}

export async function fetchProviderBalance(
  provider: ProviderRecord,
): Promise<ProviderBalance> {
  const response = await providerFetch(provider, "/balance", {
    cache: "no-store",
  });

  if (!response.ok) throw new Error(await readProviderError(response));

  return parseProviderBalance(await response.json());
}

export async function fetchProviderSubscription(
  provider: ProviderRecord,
): Promise<ProviderSubscription> {
  const response = await providerFetch(provider, "/subscription", {
    cache: "no-store",
  });

  if (!response.ok) throw new Error(await readProviderError(response));

  return parseProviderSubscription(await response.json());
}
