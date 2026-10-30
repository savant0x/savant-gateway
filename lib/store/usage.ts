import "server-only";

import type { AdminUsageSummary, UsageSummary } from "../types";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";
import { usageLedgerEntry } from "../usage-ledger";

import { settleFreeReservation } from "./free-pool";
import { settleSubscriptionHoldWithin } from "./subscription-access";
import {
  type AuthenticatedKey,
  type FreePoolReservation,
  type GatewayModel,
  type UsageRow,
  toAdminUsageSummary,
  toUsageSummary,
} from "./shared";

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
};

/**
 * Writes the usage row and, when a hold is present, releases it and debits the
 * actual charge in the same transaction. The hold is admission control, not a
 * price ceiling: if the provider reports more tokens than estimated, the
 * tenant balance can go negative until the next grant.
 */
export function recordUsage(input: UsageSettlement) {
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
  let subscriptionPeriodId = input.subscriptionPeriodId ?? null;

  db.transaction(() => {
    if (input.freeReservation) {
      const settled = db
        .prepare(
          "SELECT settled_at FROM trial_reservations WHERE id = ? AND user_id = ?",
        )
        .get(input.freeReservation.id, input.auth.userId) as
        { settled_at: string | null } | undefined;

      if (settled?.settled_at) return;
    }
    if (input.hold) {
      const hold = db
        .prepare(
          `SELECT hold_micros FROM credit_holds
           WHERE id = ? AND user_id = ?`,
        )
        .get(input.hold.id, input.auth.userId) as
        { hold_micros: number } | undefined;

      if (hold) {
        db.prepare("DELETE FROM credit_holds WHERE id = ?").run(input.hold.id);
        db.prepare(
          `UPDATE users
           SET held_micros = MAX(0, held_micros - ?)
           WHERE id = ?`,
        ).run(hold.hold_micros, input.auth.userId);
      }
    }

    if (chargedMicros > 0) {
      // The debit and its ledger row commit together, so the ledger's running
      // balance always equals the balance the customer is shown. Without this
      // row a charged request changed credit_micros silently.
      const before = db
        .prepare("SELECT credit_micros FROM users WHERE id = ?")
        .get(input.auth.userId) as { credit_micros: number } | undefined;
      const entry = before
        ? usageLedgerEntry({
            balanceBeforeMicros: before.credit_micros,
            chargedMicros,
            modelId: input.model.id,
          })
        : null;

      db.prepare(
        `UPDATE users
         SET credit_micros = credit_micros - ?
         WHERE id = ?`,
      ).run(chargedMicros, input.auth.userId);

      if (entry) {
        db.prepare(
          `INSERT INTO credit_ledger
            (id, user_id, kind, amount_micros, balance_after_micros, note,
             created_at)
           VALUES (?, ?, 'usage', ?, ?, ?, ?)`,
        ).run(
          `ledger_${randomUUID()}`,
          input.auth.userId,
          entry.amountMicros,
          entry.balanceAfterMicros,
          entry.note,
          nowIso(),
        );
      }
    }

    if (input.subscriptionHold) {
      subscriptionPeriodId =
        settleSubscriptionHoldWithin(
          input.subscriptionHold.holdId,
          includedWeightedTokens,
        ) || subscriptionPeriodId;
    }

    if (input.freeReservation) {
      settleFreeReservation({
        reservation: input.freeReservation,
        userId: input.auth.userId,
        weightedTokens,
      });
    }

    db.prepare(
      `INSERT INTO usage_events
        (id, user_id, api_key_id, model_id, provider_slug, group_slug, serving_upstream_id,
         input_tokens, output_tokens, weighted_tokens, cost_micros,
         charged_micros, estimated, status, latency_ms, error, created_at,
         billing_source, subscription_id, subscription_period_id,
         included_weighted_tokens, cached_input_tokens,
         cache_write_input_tokens, reasoning_output_tokens, usage_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
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
      nowIso(),
      billingSource,
      input.subscriptionId ?? null,
      subscriptionPeriodId,
      includedWeightedTokens,
      component(input.cachedInputTokens),
      component(input.cacheWriteInputTokens),
      component(input.reasoningOutputTokens),
      input.usageSource ?? null,
    );
  }).immediate();

  return chargedMicros;
}

const USAGE_COLUMNS = `
  u.id, u.model_id, m.name AS model_name, k.prefix AS key_prefix,
  u.input_tokens, u.output_tokens, u.weighted_tokens, u.charged_micros,
  u.cached_input_tokens, u.cache_write_input_tokens,
  u.reasoning_output_tokens, u.usage_source,
  u.cost_micros, u.status, u.latency_ms, u.error, u.created_at
`;

export function listUsage(limit = 25): UsageSummary[] {
  const rows = db
    .prepare(
      `SELECT ${USAGE_COLUMNS}
       FROM usage_events u
       LEFT JOIN models m ON m.id = u.model_id
       LEFT JOIN api_keys k ON k.id = u.api_key_id
       ORDER BY datetime(u.created_at) DESC
       LIMIT ?`,
    )
    .all(limit) as UsageRow[];

  return rows.map(toUsageSummary);
}

export function listAdminUsage(limit = 25): AdminUsageSummary[] {
  const rows = db
    .prepare(
      `SELECT ${USAGE_COLUMNS}
       FROM usage_events u
       LEFT JOIN models m ON m.id = u.model_id
       LEFT JOIN api_keys k ON k.id = u.api_key_id
       ORDER BY datetime(u.created_at) DESC
       LIMIT ?`,
    )
    .all(limit) as UsageRow[];

  return rows.map(toAdminUsageSummary);
}
