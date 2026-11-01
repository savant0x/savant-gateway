import type { PostgresDatabase } from "../pg-adapter.ts";
import type { AdminUsageSummary, UsageSummary } from "../../types.ts";
import type {
  AuthenticatedKey,
  FreePoolReservation,
  GatewayModel,
} from "../../projections.ts";
import type { UsageRow } from "../../projections.ts";

import { randomUUID } from "node:crypto";

import { toAdminUsageSummary, toUsageSummary } from "../../projections.ts";
import { usageLedgerEntry } from "../../usage-ledger.ts";
import { commitSettlement } from "../ledger/settlements.ts";

import { settleFreeReservation } from "./free-pool.ts";
import { settleSubscriptionHoldWithin } from "./subscription-access.ts";

/**
 * Usage settlement and reads on the async handle (FID-086, Batch B).
 *
 * `recordUsage` is the money path, and its whole job is to make one admitted
 * call settle exactly once, atomically. Three guards do that and none of them is
 * optional:
 *
 * 1. The durable settlement row is claimed first. A duplicate callback or a
 *    quarantined outcome stops here, so a replay cannot write a second usage
 *    row, debit twice, or release a hold twice.
 * 2. A free reservation whose trial row is already settled stops the same way.
 * 3. The recharge, its ledger row, the hold release, the subscription settle,
 *    the free-pool settle and the usage row all commit together — any failure
 *    rolls the whole settlement back, leaving the reservation for reconciliation.
 *
 * Two deliberate differences from the synchronous version:
 *
 * - The debit is unconditional and reports the resulting balance, exactly as
 *   SQLite's ``credit_micros - ?`` did. The hold is admission control, not a
 *   price ceiling: if the provider reports more tokens than estimated, the
 *   balance may go negative. `debitCredit` is *not* used here, because its
 *   `WHERE credit_micros >= ?` guard would silently drop a charge for work the
 *   upstream already performed.
 * - One timestamp is captured per settlement instead of calling the clock
 *   several times, so the commit time, the usage row and the ledger row agree.
 */

export type UsageSettlement = {
  auth: AuthenticatedKey;
  model: GatewayModel;
  inputTokens: number;
  outputTokens: number;
  status: "ok" | "error" | "cancelled";
  latencyMs: number;
  error?: string | null;
  chargedMicros: number;
  costMicros: number;
  estimated?: boolean;
  hold?: { id: string; holdMicros: number } | null;
  freeReservation?: FreePoolReservation | null;
  subscriptionHold?: { holdId: string } | null;
  subscriptionId?: string | null;
  subscriptionPeriodId?: string | null;
  includedWeightedTokens?: number;
  billingSource?: "free" | "subscription" | "credit";
  /** Provider-reported subsets; null means the provider did not report it. */
  cachedInputTokens?: number | null;
  cacheWriteInputTokens?: number | null;
  reasoningOutputTokens?: number | null;
  usageSource?: "reported" | "partial" | "estimated" | null;
  /** Durable admitted-call identity; a replay is a no-op. */
  settlementId?: string | null;
};

/**
 * Writes the usage row and, when a hold is present, releases it and debits the
 * actual charge in the same transaction.
 */
export async function recordUsage(
  db: PostgresDatabase,
  input: UsageSettlement,
): Promise<number> {
  const now = new Date().toISOString();
  const inputTokens = Math.max(0, Math.floor(input.inputTokens));
  const outputTokens = Math.max(0, Math.floor(input.outputTokens));
  const totalTokens = inputTokens + outputTokens;
  const weightedTokens =
    input.model.billingMode === "free"
      ? totalTokens * Math.max(1, input.model.tokenWeight)
      : 0;
  const chargedMicros = Math.max(0, Math.round(input.chargedMicros));
  const billingSource =
    input.billingSource ??
    (input.model.billingMode === "free" ? "free" : "credit");
  const includedWeightedTokens = Math.max(
    0,
    Math.floor(input.includedWeightedTokens ?? 0),
  );
  const component = (value: number | null | undefined) =>
    value === null || value === undefined
      ? null
      : Math.max(0, Math.floor(value));

  return db
    .transaction(async () => {
      let subscriptionPeriodId = input.subscriptionPeriodId ?? null;

      // One durable claim per admitted call. A duplicate or quarantined outcome
      // stops here: no second usage row, debit or hold release.
      if (
        input.settlementId &&
        !(await commitSettlement(db, input.settlementId, now, input.status))
      ) {
        return 0;
      }

      if (input.freeReservation) {
        const settled = await db
          .prepare(
            "SELECT settled_at FROM trial_reservations WHERE id = ? AND user_id = ?",
          )
          .get<{ settled_at: string | null }>(
            input.freeReservation.id,
            input.auth.userId,
          );

        if (settled?.settled_at) return 0;
      }

      if (input.hold) {
        const hold = await db
          .prepare(
            `SELECT hold_micros FROM credit_holds
              WHERE id = ? AND user_id = ?`,
          )
          .get<{ hold_micros: number | string }>(
            input.hold.id,
            input.auth.userId,
          );

        if (hold) {
          await db
            .prepare("DELETE FROM credit_holds WHERE id = ?")
            .run(input.hold.id);
          await db
            .prepare(
              `UPDATE users
                  SET held_micros = GREATEST(0, held_micros - ?)
                WHERE id = ?`,
            )
            .run(Number(hold.hold_micros), input.auth.userId);
        }
      }

      if (chargedMicros > 0) {
        // The debit and its ledger row commit together, so the ledger's running
        // balance always equals the balance the customer is shown. RETURNING
        // makes the resulting balance the one this statement produced, not a
        // value re-read after another settlement could have moved it.
        const debited = await db
          .prepare(
            `UPDATE users SET credit_micros = credit_micros - ?
              WHERE id = ?
              RETURNING credit_micros`,
          )
          .all<{ credit_micros: number | string }>(
            chargedMicros,
            input.auth.userId,
          );

        if (debited.length > 0) {
          const after = Number(debited[0].credit_micros);
          const entry = usageLedgerEntry({
            balanceBeforeMicros: after + chargedMicros,
            chargedMicros,
            modelId: input.model.id,
          });

          if (entry) {
            await db
              .prepare(
                `INSERT INTO credit_ledger
                  (id, user_id, kind, amount_micros, balance_after_micros,
                   note, created_at)
                 VALUES (?, ?, 'usage', ?, ?, ?, ?)`,
              )
              .run(
                `ledger_${randomUUID()}`,
                input.auth.userId,
                entry.amountMicros,
                entry.balanceAfterMicros,
                entry.note,
                now,
              );
          }
        }
      }

      if (input.subscriptionHold) {
        subscriptionPeriodId =
          (await settleSubscriptionHoldWithin(
            db,
            input.subscriptionHold.holdId,
            includedWeightedTokens,
          )) || subscriptionPeriodId;
      }

      if (input.freeReservation) {
        await settleFreeReservation(db, {
          reservation: input.freeReservation,
          userId: input.auth.userId,
          weightedTokens,
          settledAt: now,
        });
      }

      await db
        .prepare(
          `INSERT INTO usage_events
            (id, user_id, api_key_id, model_id, provider_slug, group_slug,
             serving_upstream_id, input_tokens, output_tokens, weighted_tokens,
             cost_micros, charged_micros, estimated, status, latency_ms, error,
             created_at, billing_source, subscription_id,
             subscription_period_id, included_weighted_tokens,
             cached_input_tokens, cache_write_input_tokens,
             reasoning_output_tokens, usage_source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                   ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `usage_${randomUUID()}`,
          input.auth.userId,
          input.auth.keyId,
          input.model.id,
          input.model.upstreamSlug,
          input.model.groupSlug,
          input.model.upstreamId,
          inputTokens,
          outputTokens,
          weightedTokens,
          Math.max(0, Math.round(input.costMicros)),
          chargedMicros,
          input.estimated ? 1 : 0,
          input.status,
          Math.max(0, Math.floor(input.latencyMs)),
          input.error?.slice(0, 500) ?? null,
          now,
          billingSource,
          input.subscriptionId ?? null,
          subscriptionPeriodId,
          includedWeightedTokens,
          component(input.cachedInputTokens),
          component(input.cacheWriteInputTokens),
          component(input.reasoningOutputTokens),
          input.usageSource ?? null,
        );

      return chargedMicros;
    })
    .immediate();
}

const USAGE_COLUMNS = `
  u.id, u.model_id, m.name AS model_name, k.prefix AS key_prefix,
  u.input_tokens, u.output_tokens, u.weighted_tokens, u.charged_micros,
  u.cached_input_tokens, u.cache_write_input_tokens,
  u.reasoning_output_tokens, u.usage_source,
  u.cost_micros, u.status, u.latency_ms, u.error, u.created_at
`;

function numeric(row: UsageRow): UsageRow {
  const count = (value: number | null) =>
    value === null ? null : Number(value);

  return {
    ...row,
    input_tokens: Number(row.input_tokens),
    output_tokens: Number(row.output_tokens),
    weighted_tokens: Number(row.weighted_tokens),
    charged_micros: Number(row.charged_micros),
    cost_micros: Number(row.cost_micros),
    latency_ms: Number(row.latency_ms),
    cached_input_tokens: count(row.cached_input_tokens),
    cache_write_input_tokens: count(row.cache_write_input_tokens),
    reasoning_output_tokens: count(row.reasoning_output_tokens),
  };
}

const USAGE_SELECT = `SELECT ${USAGE_COLUMNS}
     FROM usage_events u
     LEFT JOIN models m ON m.id = u.model_id
     LEFT JOIN api_keys k ON k.id = u.api_key_id
     ORDER BY u.created_at::timestamptz DESC
     LIMIT ?`;

export async function listUsage(
  db: PostgresDatabase,
  limit = 25,
): Promise<UsageSummary[]> {
  const rows = await db.prepare(USAGE_SELECT).all<UsageRow>(limit);

  return rows.map((row) => toUsageSummary(numeric(row)));
}

export async function listAdminUsage(
  db: PostgresDatabase,
  limit = 25,
): Promise<AdminUsageSummary[]> {
  const rows = await db.prepare(USAGE_SELECT).all<UsageRow>(limit);

  return rows.map((row) => toAdminUsageSummary(numeric(row)));
}
