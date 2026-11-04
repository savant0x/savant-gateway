/**
 * Provider-wide admission.
 *
 * Customer fairness limits are not upstream capacity. One free bucket and one
 * bucket per paid key let a busy minute from any billing mode exceed what the
 * serving account actually allows, and an included subscription could pass its
 * allowance while the provider refuses the call.
 *
 * This module keeps the pure half: identity, ceiling selection and the decision
 * over one observed state. The state itself lives in PostgreSQL
 * (`lib/storage/admission.ts`) so two application instances share one ceiling
 * (FID-2026-1104-004). Keeping the arithmetic pure is what lets the unit suite
 * test the ordering without a database.
 *
 * The identity is derived from public configuration only: the provider origin
 * and the name of the credential variable. Two registry rows that point at the
 * same origin with the same credential variable therefore share one ceiling;
 * no secret value is read, hashed or persisted.
 */
import {
  retryAfterSeconds,
  takeToken,
  type BucketConfig,
  type BucketState,
} from "./token-bucket.ts";

/** Local safety cap when the operator has not configured concurrency. */
export const DEFAULT_PROVIDER_CONCURRENCY = 4;

export type ProviderAdmissionConfig = {
  /** Operator-declared ceiling used only when upstream reports none. */
  configuredRpm: number | null;
  concurrency: number;
};

export type ProviderAdmissionState = {
  bucket: BucketState | undefined;
  inFlight: number;
};

export type ProviderAdmissionRefusalReason =
  | "unknown_identity"
  | "unknown_ceiling"
  | "rpm"
  | "concurrency"
  | "store_unavailable";

export type ProviderAdmissionRefusal = {
  ok: false;
  accountId: string | null;
  reason: ProviderAdmissionRefusalReason;
  /** Null when no ceiling could be trusted. */
  limit: number | null;
  remaining: number;
  inFlight: number;
  retryAfterSeconds: number;
};

export type ProviderAdmissionGrant = {
  ok: true;
  accountId: string;
  rpm: number;
  concurrency: number;
  inFlight: number;
  remaining: number;
};

export type ProviderAdmissionDecision =
  | { ok: true; remaining: number }
  | {
      ok: false;
      reason: "rpm" | "concurrency";
      limit: number;
      remaining: 0;
      inFlight: number;
      retryAfterSeconds: number;
    };

function optionalPositiveInteger(value: unknown) {
  const parsed = Number(value);

  return value !== undefined &&
    value !== null &&
    value !== "" &&
    Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

function positiveInteger(value: unknown, fallback: number) {
  return optionalPositiveInteger(value) ?? fallback;
}

export function readProviderAdmissionConfig(
  env: Record<string, string | undefined> = process.env,
): ProviderAdmissionConfig {
  return {
    configuredRpm: optionalPositiveInteger(env.PROVIDER_SHARED_RPM),
    concurrency: positiveInteger(
      env.PROVIDER_SHARED_CONCURRENCY,
      DEFAULT_PROVIDER_CONCURRENCY,
    ),
  };
}

/**
 * Stable, secret-free identity for the account a registry row spends. The
 * credential is referenced by environment variable name, never by value.
 */
export function servingAccountId(provider: {
  baseUrl: string;
  keyEnvVar: string;
}): string | null {
  const keyName = provider.keyEnvVar.trim();

  if (!keyName) return null;

  try {
    const url = new URL(provider.baseUrl);

    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    // `origin` lowercases host and drops the path, so two rows naming the same
    // host but different `/v1` paths share one account.
    return `${url.origin}|${keyName}`;
  } catch {
    return null;
  }
}

/**
 * A fresh upstream observation is the account's own statement and wins. The
 * configured value is an explicit fallback for providers that publish none.
 * Neither means the ceiling is unknown, and unknown is never unlimited.
 */
export function resolveProviderRpm(input: {
  configuredRpm: number | null;
  observedRpm: number | null;
}): number | null {
  for (const candidate of [input.observedRpm, input.configuredRpm]) {
    if (candidate !== null && Number.isSafeInteger(candidate) && candidate > 0)
      return candidate;
  }

  return null;
}

function bucketConfig(rpm: number): BucketConfig {
  return { capacity: rpm, refillPerMinute: rpm };
}

/**
 * Applies one request to an observed account state. The concurrency cap is
 * checked before the RPM token so a refused call never spends allowance it
 * cannot use. A concurrency refusal leaves the bucket untouched.
 */
export function evaluateProviderAdmission(input: {
  state: ProviderAdmissionState;
  rpm: number;
  concurrency: number;
  now: number;
}): {
  decision: ProviderAdmissionDecision;
  state: ProviderAdmissionState;
} {
  const concurrency = Math.max(1, Math.floor(input.concurrency));

  if (input.state.inFlight >= concurrency) {
    return {
      decision: {
        ok: false,
        reason: "concurrency",
        limit: concurrency,
        remaining: 0,
        inFlight: input.state.inFlight,
        retryAfterSeconds: 1,
      },
      state: input.state,
    };
  }

  const decision = takeToken(
    input.state.bucket,
    input.now,
    bucketConfig(input.rpm),
  );

  if (!decision.allowed) {
    return {
      decision: {
        ok: false,
        reason: "rpm",
        limit: input.rpm,
        remaining: 0,
        inFlight: input.state.inFlight,
        retryAfterSeconds: retryAfterSeconds(decision.retryAfterMs),
      },
      state: { bucket: decision.state, inFlight: input.state.inFlight },
    };
  }

  return {
    decision: { ok: true, remaining: decision.remaining },
    state: { bucket: decision.state, inFlight: input.state.inFlight + 1 },
  };
}
