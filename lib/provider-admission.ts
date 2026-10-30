/**
 * Provider-wide admission.
 *
 * Customer fairness limits are not upstream capacity. One free bucket and one
 * bucket per paid key let a busy minute from any billing mode exceed what the
 * serving account actually allows, and an included subscription could pass its
 * allowance while the provider refuses the call.
 *
 * This gate sits above those buckets. Every dispatch passes the same RPM and
 * concurrency ceiling for the serving upstream account, and the slot is
 * acquired before any credit, free-pool or subscription hold exists.
 *
 * The identity is derived from public configuration only: the provider origin
 * and the name of the credential variable. Two registry rows that point at the
 * same origin with the same credential variable therefore share one ceiling;
 * no secret value is read, hashed or persisted.
 *
 * State is per process, matching the single-process SQLite deployment this
 * protects. A multi-instance deployment must move the same state into shared
 * storage or the ceiling multiplies by the process count (057/060).
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

export type ProviderAdmissionOutcome =
  | {
      ok: true;
      accountId: string;
      rpm: number;
      concurrency: number;
      /** Idempotent: the second and later calls are no-ops. */
      release: () => void;
    }
  | {
      ok: false;
      accountId: string | null;
      reason: "unknown_identity" | "unknown_ceiling" | "rpm" | "concurrency";
      /** Null when no ceiling could be trusted. */
      limit: number | null;
      remaining: number;
      inFlight: number;
      retryAfterSeconds: number;
    };

type AccountState = {
  bucket: BucketState | undefined;
  inFlight: number;
};

const accounts = new Map<string, AccountState>();

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

function stateFor(accountId: string) {
  const existing = accounts.get(accountId);

  if (existing) return existing;

  const created: AccountState = { bucket: undefined, inFlight: 0 };

  accounts.set(accountId, created);

  return created;
}

/**
 * Takes one serving-account slot. The concurrency cap is checked before the
 * RPM token so a refused call never spends allowance it cannot use.
 */
export function acquireProviderAdmission(input: {
  provider: { baseUrl: string; keyEnvVar: string };
  observedRpm: number | null;
  config?: ProviderAdmissionConfig;
  now?: number;
}): ProviderAdmissionOutcome {
  const config = input.config ?? readProviderAdmissionConfig();
  const now = input.now ?? Date.now();
  const accountId = servingAccountId(input.provider);
  const rpm = resolveProviderRpm({
    configuredRpm: config.configuredRpm,
    observedRpm: input.observedRpm,
  });
  const concurrency = Math.max(1, Math.floor(config.concurrency));
  const state = accountId ? stateFor(accountId) : null;

  if (!accountId || !state) {
    return {
      ok: false,
      accountId: null,
      reason: "unknown_identity",
      limit: null,
      remaining: 0,
      inFlight: 0,
      retryAfterSeconds: 5,
    };
  }

  if (rpm === null) {
    return {
      ok: false,
      accountId,
      reason: "unknown_ceiling",
      limit: null,
      remaining: 0,
      inFlight: state.inFlight,
      retryAfterSeconds: 5,
    };
  }

  if (state.inFlight >= concurrency) {
    return {
      ok: false,
      accountId,
      reason: "concurrency",
      limit: concurrency,
      remaining: 0,
      inFlight: state.inFlight,
      retryAfterSeconds: 1,
    };
  }

  const decision = takeToken(state.bucket, now, bucketConfig(rpm));

  if (!decision.allowed) {
    return {
      ok: false,
      accountId,
      reason: "rpm",
      limit: rpm,
      remaining: 0,
      inFlight: state.inFlight,
      retryAfterSeconds: retryAfterSeconds(decision.retryAfterMs),
    };
  }

  state.bucket = decision.state;
  state.inFlight += 1;

  let released = false;

  return {
    ok: true,
    accountId,
    rpm,
    concurrency,
    release: () => {
      if (released) return;

      released = true;
      state.inFlight = Math.max(0, state.inFlight - 1);
    },
  };
}

/** Observable state for one serving account; never invents capacity. */
export function providerAdmissionSnapshot(accountId: string) {
  const state = accounts.get(accountId);

  return {
    inFlight: state?.inFlight ?? 0,
    remainingTokens:
      state?.bucket === undefined ? null : Math.floor(state.bucket.tokens),
  };
}

/** Test and maintenance hook: forget every serving-account slot. */
export function resetProviderAdmission() {
  accounts.clear();
}
