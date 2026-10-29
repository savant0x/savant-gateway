import "server-only";

import type { AdminUsageSummary, UsageSummary } from "../types";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";

import { settleFreeReservation } from "./free-pool";
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
    input.model.allowFree && input.model.tokenWeight > 0
      ? totalTokens * Math.max(1, input.model.tokenWeight)
      : 0;
  const chargedMicros = Math.max(0, Math.round(input.chargedMicros));

  db.transaction(() => {
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
      db.prepare(
        `UPDATE users
         SET credit_micros = credit_micros - ?
         WHERE id = ?`,
      ).run(chargedMicros, input.auth.userId);
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
        (id, user_id, api_key_id, model_id, input_tokens, output_tokens,
         weighted_tokens, cost_micros, charged_micros, estimated, status,
         latency_ms, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `usage_${randomUUID()}`,
      input.auth.userId,
      input.auth.keyId,
      input.model.id,
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
    );
  }).immediate();

  return chargedMicros;
}

const USAGE_COLUMNS = `
  u.id, u.model_id, m.name AS model_name, k.prefix AS key_prefix,
  u.input_tokens, u.output_tokens, u.weighted_tokens, u.charged_micros,
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
