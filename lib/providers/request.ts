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

/**
 * Headers for a read that is allowed to run without a credential. A provider
 * whose catalog is public can be previewed before the operator buys a key, so
 * the account headers are omitted when this runtime has no key — the provider's
 * own headers and the wire version stay. Nothing here reports whether a key
 * exists beyond that omission, and no value is ever read into a response.
 */
export function providerPreviewHeaders(
  provider: ProviderRecord,
): Record<string, string> {
  const key = process.env[provider.keyEnvVar]?.trim() || null;

  return authHeaders(provider.kind, key, provider.defaultHeaders);
}

/** One fetch for both transports: only the header set differs. */
function providerRequest(
  provider: ProviderRecord,
  headers: Record<string, string>,
  path: string,
  init: RequestInit = {},
) {
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

export function providerFetch(
  provider: ProviderRecord,
  path: string,
  init: RequestInit = {},
) {
  return providerRequest(provider, providerHeaders(provider), path, init);
}

/** The keyless-capable transport; used by the catalog preview only. */
export function providerPreviewFetch(
  provider: ProviderRecord,
  path: string,
  init: RequestInit = {},
) {
  return providerRequest(
    provider,
    providerPreviewHeaders(provider),
    path,
    init,
  );
}

export async function fetchProviderBalance(
  provider: ProviderRecord,
): Promise<ProviderBalance> {
  const response = provider.balanceUrl
    ? await fetchProviderUrl(provider, provider.balanceUrl)
    : await providerFetch(provider, "/balance", { cache: "no-store" });

  if (!response.ok) throw new Error(await readProviderError(response));

  return parseProviderBalance(await response.json());
}

/**
 * A provider document beside the catalog (`balanceUrl`, `catalogUrl`) is absolute
 * and may sit on another host, so it is fetched directly rather than appended to
 * the base URL. The credential and headers are the provider's own, and a redirect
 * is still a configuration error to report.
 */
export function fetchProviderUrl(provider: ProviderRecord, url: string) {
  return fetch(url, {
    cache: "no-store",
    headers: providerHeaders(provider),
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
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
