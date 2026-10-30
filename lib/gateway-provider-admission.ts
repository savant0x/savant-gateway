import "server-only";

import { jsonError } from "./http";
import {
  acquireProviderAdmission,
  type ProviderAdmissionOutcome,
} from "./provider-admission";

export type ProviderAdmissionLease = {
  release: (() => void) | null;
};

type ProviderRefusal = Extract<ProviderAdmissionOutcome, { ok: false }>;

/**
 * A provider-wide refusal is not a customer limit: it names the serving
 * account, the ceiling that bound it and when to retry. An unknown ceiling is
 * a 503 because no request may dispatch against capacity nobody can vouch for.
 */
export function providerAdmissionError(refusal: ProviderRefusal) {
  const unavailable =
    refusal.reason === "unknown_identity" ||
    refusal.reason === "unknown_ceiling";

  return jsonError(
    unavailable ? 503 : 429,
    unavailable
      ? "The serving provider account capacity is unknown, so this request was not dispatched. Try again shortly."
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

/**
 * Acquires the serving-account slot before any billing reservation exists.
 * The caller must hold the lease until settlement, or hand it to the stream.
 */
export function beginProviderAdmission(input: {
  provider: { baseUrl: string; keyEnvVar: string };
  observedRpm: number | null;
}) {
  const admission = acquireProviderAdmission(input);

  if (!admission.ok) {
    return { refused: admission, lease: null } as const;
  }

  const lease: ProviderAdmissionLease = { release: admission.release };

  return { refused: null, lease } as const;
}
