import "server-only";

import type { PostgresDatabase } from "./storage/pg-adapter.ts";
import type { RateLimitDecision } from "./gateway-rate-limit.ts";
import type { ProviderAdmissionRefusal } from "./provider-admission.ts";

import { jsonError } from "./http";
import { acquireSharedProviderAdmission } from "./storage/admission.ts";

export type ProviderAdmissionLease = {
  release: (() => Promise<void>) | null;
};

/**
 * A provider-wide refusal is not a customer limit: it names the serving
 * account, the ceiling that bound it and when to retry. An unknown ceiling or
 * an unreachable shared store is a 503 because no request may dispatch against
 * capacity nobody can vouch for.
 */
export function providerAdmissionError(refusal: ProviderAdmissionRefusal) {
  const unavailable =
    refusal.reason === "unknown_identity" ||
    refusal.reason === "unknown_ceiling" ||
    refusal.reason === "store_unavailable";

  return jsonError(
    unavailable ? 503 : 429,
    unavailable
      ? "The serving provider account capacity is unavailable, so this request was not dispatched. Try again shortly."
      : refusal.reason === "concurrency"
        ? `The provider account is serving its maximum of ${refusal.limit} concurrent requests across every customer. Retry in ${refusal.retryAfterSeconds}s.`
        : `The provider account is limited to ${refusal.limit} requests per minute across every customer and billing mode. Retry in ${refusal.retryAfterSeconds}s.`,
    unavailable ? "insufficient_quota" : "rate_limit_error",
    {
      "Retry-After": String(refusal.retryAfterSeconds),
      "X-RateLimit-Scope": unavailable ? "provider_unavailable" : "provider",
      ...(refusal.limit === null
        ? {}
        : {
            "X-RateLimit-Limit": String(refusal.limit),
            "X-RateLimit-Remaining": String(refusal.remaining),
          }),
    },
  );
}

/** The public shape for a completion-bucket refusal, including store failure. */
export function completionRateError(rate: RateLimitDecision) {
  if (rate.unavailable) {
    return jsonError(
      503,
      "Admission state is unavailable; retry shortly.",
      "service_unavailable",
      { "Retry-After": String(rate.retryAfterSeconds) },
    );
  }

  return jsonError(
    429,
    rate.scope === "free"
      ? `Free traffic is limited to ${rate.limit} requests per minute across all keys. Retry in ${rate.retryAfterSeconds}s, or add credit for a dedicated limit.`
      : `This account is limited to ${rate.limit} requests per minute across its keys. Retry in ${rate.retryAfterSeconds}s.`,
    "rate_limit_error",
    {
      "Retry-After": String(rate.retryAfterSeconds),
      "X-RateLimit-Limit": String(rate.limit),
      "X-RateLimit-Remaining": String(rate.remaining),
      "X-RateLimit-Scope": rate.scope,
    },
  );
}

/**
 * Acquires the serving-account slot before any billing reservation exists.
 * The caller must hold the lease until settlement, or hand it to the stream.
 */
export async function beginProviderAdmission(input: {
  db: PostgresDatabase;
  provider: { baseUrl: string; keyEnvVar: string };
  observedRpm: number | null;
}) {
  const admission = await acquireSharedProviderAdmission(input.db, {
    provider: input.provider,
    observedRpm: input.observedRpm,
  });

  if (!admission.ok) {
    return { refused: admission, lease: null } as const;
  }

  const lease: ProviderAdmissionLease = { release: admission.release };

  return { refused: null, lease } as const;
}
