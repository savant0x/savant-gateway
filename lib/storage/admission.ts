import type { PostgresDatabase } from "./pg-adapter.ts";

import { randomUUID } from "node:crypto";

import {
  evaluateProviderAdmission,
  readProviderAdmissionConfig,
  resolveProviderRpm,
  servingAccountId,
  type ProviderAdmissionConfig,
  type ProviderAdmissionGrant,
  type ProviderAdmissionRefusal,
  type ProviderAdmissionRefusalReason,
  type ProviderAdmissionState,
} from "../provider-admission.ts";
import {
  completionBucket,
  evaluateCompletionRate,
  readRateLimitConfig,
  type RateLimitConfig,
  type RateLimitDecision,
} from "../gateway-rate-limit.ts";

/**
 * Shared admission authority (FID-2026-1104-004).
 *
 * One transaction per decision. The bucket row is locked `FOR UPDATE`, so two
 * instances cannot both read the same token balance; the lease insert happens
 * in that same transaction, so two instances cannot both take the last
 * concurrency slot. Expired leases are deleted inside the acquire transaction:
 * expiry is the fence, not a sweeper dependency.
 *
 * `release` is best-effort because the lease already expires. A failed delete
 * cannot resurrect capacity, and surfacing it would turn a completed inference
 * into an error response.
 */

/** Covers the 300-second stream ceiling plus the settlement window. */
const LEASE_TTL_MS = 330_000;
const UNAVAILABLE_RETRY_SECONDS = 5;

export type ProviderAdmissionLease = ProviderAdmissionGrant & {
  leaseId: string;
  release: () => Promise<void>;
};

export type ProviderAdmissionResult =
  ProviderAdmissionLease | ProviderAdmissionRefusal;

type AdmissionTransaction =
  | { granted: ProviderAdmissionGrant & { leaseId: string } }
  | { refused: ProviderAdmissionRefusal };

function refusal(
  reason: ProviderAdmissionRefusalReason,
  accountId: string | null,
  limit: number | null,
  inFlight: number,
): ProviderAdmissionRefusal {
  return {
    ok: false,
    accountId,
    reason,
    limit,
    remaining: 0,
    inFlight,
    retryAfterSeconds: UNAVAILABLE_RETRY_SECONDS,
  };
}

export async function acquireSharedProviderAdmission(
  db: PostgresDatabase,
  input: {
    provider: { baseUrl: string; keyEnvVar: string };
    observedRpm: number | null;
    config?: ProviderAdmissionConfig;
    now?: number;
  },
): Promise<ProviderAdmissionResult> {
  const now = input.now ?? Date.now();
  const config = input.config ?? readProviderAdmissionConfig();
  const accountId = servingAccountId(input.provider);

  if (!accountId) return refusal("unknown_identity", null, null, 0);

  const rpm = resolveProviderRpm({
    configuredRpm: config.configuredRpm,
    observedRpm: input.observedRpm,
  });

  if (rpm === null) return refusal("unknown_ceiling", accountId, null, 0);

  const concurrency = Math.max(1, Math.floor(config.concurrency));

  try {
    const outcome = await db.transaction<AdmissionTransaction>(async () => {
      // Creating the row and locking it in one transaction serializes every
      // acquire for this account, including the first one.
      await db
        .prepare(
          `INSERT INTO admission_buckets (scope, bucket_key, tokens, updated_at)
           VALUES ('provider', ?, ?, ?)
           ON CONFLICT (scope, bucket_key) DO NOTHING`,
        )
        .run(accountId, rpm, now);
      const bucket = await db
        .prepare(
          `SELECT tokens, updated_at FROM admission_buckets
           WHERE scope = 'provider' AND bucket_key = ?
           FOR UPDATE`,
        )
        .get<{ tokens: number | string; updated_at: number | string }>(
          accountId,
        );

      await db
        .prepare(
          `DELETE FROM admission_leases
           WHERE scope = 'provider' AND bucket_key = ? AND expires_at <= ?`,
        )
        .run(accountId, now);
      const active = await db
        .prepare(
          `SELECT COUNT(*)::int AS total FROM admission_leases
           WHERE scope = 'provider' AND bucket_key = ?`,
        )
        .get<{ total: number | string }>(accountId);
      const state: ProviderAdmissionState = {
        bucket: bucket
          ? {
              tokens: Number(bucket.tokens),
              updatedAt: Number(bucket.updated_at),
            }
          : undefined,
        inFlight: Number(active?.total ?? 0),
      };
      const evaluated = evaluateProviderAdmission({
        state,
        rpm,
        concurrency,
        now,
      });

      if (evaluated.state.bucket) {
        await db
          .prepare(
            `UPDATE admission_buckets SET tokens = ?, updated_at = ?
             WHERE scope = 'provider' AND bucket_key = ?`,
          )
          .run(
            evaluated.state.bucket.tokens,
            evaluated.state.bucket.updatedAt,
            accountId,
          );
      }

      if (!evaluated.decision.ok) {
        return {
          refused: {
            ok: false as const,
            accountId,
            reason: evaluated.decision.reason,
            limit: evaluated.decision.limit,
            remaining: evaluated.decision.remaining,
            inFlight: evaluated.decision.inFlight,
            retryAfterSeconds: evaluated.decision.retryAfterSeconds,
          },
        };
      }

      const leaseId = randomUUID();

      await db
        .prepare(
          `INSERT INTO admission_leases
            (lease_id, scope, bucket_key, expires_at)
           VALUES (?, 'provider', ?, ?)`,
        )
        .run(leaseId, accountId, now + LEASE_TTL_MS);

      return {
        granted: {
          ok: true as const,
          accountId,
          rpm,
          concurrency,
          inFlight: evaluated.state.inFlight,
          remaining: evaluated.decision.remaining,
          leaseId,
        },
      };
    })();

    if ("refused" in outcome) return outcome.refused;

    const granted = outcome.granted;
    let released = false;

    return {
      ...granted,
      release: () => {
        if (released) return Promise.resolve();

        released = true;

        return db
          .prepare("DELETE FROM admission_leases WHERE lease_id = ?")
          .run(granted.leaseId)
          .then(() => undefined)
          .catch(() => undefined);
      },
    };
  } catch {
    return refusal("store_unavailable", accountId, rpm, 0);
  }
}

/**
 * One completion token from the shared bucket. No lease is needed: a rate
 * limit is a token count, not an in-flight slot.
 */
export async function takeSharedCompletionRate(
  db: PostgresDatabase,
  input: {
    keyId: string;
    userId?: string;
    free: boolean;
    config?: RateLimitConfig;
    now?: number;
  },
): Promise<RateLimitDecision> {
  const config = input.config ?? readRateLimitConfig();
  const bucket = completionBucket({ ...input, config });
  const now = input.now ?? Date.now();

  try {
    return await db.transaction(async () => {
      await db
        .prepare(
          `INSERT INTO admission_buckets (scope, bucket_key, tokens, updated_at)
           VALUES ('completion', ?, ?, ?)
           ON CONFLICT (scope, bucket_key) DO NOTHING`,
        )
        .run(bucket.key, bucket.limit, now);
      const row = await db
        .prepare(
          `SELECT tokens, updated_at FROM admission_buckets
           WHERE scope = 'completion' AND bucket_key = ?
           FOR UPDATE`,
        )
        .get<{ tokens: number | string; updated_at: number | string }>(
          bucket.key,
        );
      const evaluated = evaluateCompletionRate({
        state: row
          ? { tokens: Number(row.tokens), updatedAt: Number(row.updated_at) }
          : undefined,
        now,
        limit: bucket.limit,
      });

      await db
        .prepare(
          `UPDATE admission_buckets SET tokens = ?, updated_at = ?
           WHERE scope = 'completion' AND bucket_key = ?`,
        )
        .run(evaluated.state.tokens, evaluated.state.updatedAt, bucket.key);

      return {
        allowed: evaluated.decision.allowed,
        scope: bucket.scope,
        limit: bucket.limit,
        remaining: evaluated.decision.remaining,
        retryAfterSeconds: evaluated.decision.retryAfterSeconds,
      };
    })();
  } catch {
    return {
      allowed: false,
      scope: bucket.scope,
      limit: bucket.limit,
      remaining: 0,
      retryAfterSeconds: UNAVAILABLE_RETRY_SECONDS,
      unavailable: true,
    };
  }
}
