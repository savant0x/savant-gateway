import type { DatabaseHandle } from "./schema/columns";

/**
 * Durable settlement ledger.
 *
 * One row names an admitted call before dispatch. Settlement claims that row in
 * the same transaction that writes usage and money, so a replay finds
 * `committed` and stops. Expired reservations move to quarantine with their
 * capacity still reserved: an elapsed TTL is not proof that nothing ran.
 */

export type SettlementBillingSource = "free" | "subscription" | "credit";

export type SettlementInput = {
  id: string;
  userId: string;
  keyId: string;
  modelId: string;
  providerSlug: string;
  billingSource: SettlementBillingSource;
  creditHoldId: string | null;
  freeReservationId: string | null;
  subscriptionHoldId: string | null;
  estimatedMicros: number;
};

export type QuarantineKind = "credit" | "subscription" | "free";

export function openSettlement(
  database: DatabaseHandle,
  input: SettlementInput,
  createdAt: string,
) {
  database
    .prepare(
      `INSERT INTO settlements
        (id, user_id, api_key_id, model_id, provider_slug, billing_source,
         credit_hold_id, free_reservation_id, subscription_hold_id,
         estimated_micros, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admitted', ?)`,
    )
    .run(
      input.id,
      input.userId,
      input.keyId,
      input.modelId,
      input.providerSlug,
      input.billingSource,
      input.creditHoldId,
      input.freeReservationId,
      input.subscriptionHoldId,
      Math.max(0, Math.floor(input.estimatedMicros)),
      createdAt,
    );

  return input.id;
}

/**
 * Monotonic admission → committed. Returns false when the row is missing, was
 * already committed, or is quarantined: a late or duplicate callback must not
 * downgrade or debit a decided outcome.
 */
export function commitSettlement(
  database: DatabaseHandle,
  id: string,
  settledAt: string,
  detail?: string | null,
) {
  return (
    database
      .prepare(
        `UPDATE settlements
         SET status = 'committed', settled_at = ?, detail = ?
         WHERE id = ? AND status = 'admitted'`,
      )
      .run(settledAt, detail?.slice(0, 500) ?? null, id).changes > 0
  );
}

export function settlementStatus(database: DatabaseHandle, id: string) {
  const row = database
    .prepare("SELECT status FROM settlements WHERE id = ?")
    .get(id) as { status: string } | undefined;

  return row?.status ?? null;
}

/**
 * Moves one expired reservation into durable quarantine. The reserved amount
 * stays reserved: the caller does not refund anything.
 */
export function quarantineHold(
  database: DatabaseHandle,
  input: {
    id: string;
    kind: QuarantineKind;
    userId: string;
    keyId: string | null;
    modelId: string | null;
    periodId?: string | null;
    reserved: number;
    createdAt: string;
    expiredAt: string;
  },
) {
  const write = database
    .prepare(
      `INSERT OR IGNORE INTO quarantined_holds
        (id, kind, user_id, api_key_id, model_id, period_id, reserved,
         created_at, expired_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'quarantined')`,
    )
    .run(
      input.id,
      input.kind,
      input.userId,
      input.keyId,
      input.modelId,
      input.periodId ?? null,
      Math.max(0, Math.floor(input.reserved)),
      input.createdAt,
      input.expiredAt,
    );
  const inserted = write.changes > 0;

  if (inserted) {
    database
      .prepare(
        `UPDATE settlements SET status = 'quarantined'
         WHERE status = 'admitted'
           AND (credit_hold_id = ? OR free_reservation_id = ? OR subscription_hold_id = ?)`,
      )
      .run(input.id, input.id, input.id);
  }

  return inserted;
}

export type QuarantinedHold = {
  id: string;
  kind: QuarantineKind;
  userId: string;
  keyId: string | null;
  modelId: string | null;
  periodId: string | null;
  reserved: number;
  createdAt: string;
  expiredAt: string;
  status: string;
};

export function listQuarantinedHolds(
  database: DatabaseHandle,
  limit = 50,
): QuarantinedHold[] {
  const rows = database
    .prepare(
      `SELECT id, kind, user_id, api_key_id, model_id, period_id, reserved,
              created_at, expired_at, status
       FROM quarantined_holds
       ORDER BY datetime(expired_at) DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    kind: QuarantineKind;
    user_id: string;
    api_key_id: string | null;
    model_id: string | null;
    period_id: string | null;
    reserved: number;
    created_at: string;
    expired_at: string;
    status: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    userId: row.user_id,
    keyId: row.api_key_id,
    modelId: row.model_id,
    periodId: row.period_id,
    reserved: row.reserved,
    createdAt: row.created_at,
    expiredAt: row.expired_at,
    status: row.status,
  }));
}

/**
 * The only operator resolution: an audited release of the exact reserved
 * amount. Nothing is charged from an unknown outcome and nothing is refunded
 * without this call.
 */
export function releaseQuarantinedHold(
  database: DatabaseHandle,
  input: { id: string; releasedAt: string; note?: string | null },
) {
  return database
    .transaction(() => {
      const row = database
        .prepare(
          `SELECT kind, user_id, period_id, reserved FROM quarantined_holds
           WHERE id = ? AND status = 'quarantined'`,
        )
        .get(input.id) as
        | {
            kind: QuarantineKind;
            user_id: string;
            period_id: string | null;
            reserved: number;
          }
        | undefined;

      if (!row) return false;

      if (row.kind === "credit") {
        database
          .prepare(
            "UPDATE users SET held_micros = MAX(0, held_micros - ?) WHERE id = ?",
          )
          .run(row.reserved, row.user_id);
      } else if (row.kind === "subscription" && row.period_id) {
        database
          .prepare(
            `UPDATE subscription_periods
             SET weighted_tokens_held = MAX(0, weighted_tokens_held - ?)
             WHERE id = ?`,
          )
          .run(row.reserved, row.period_id);
      }

      database
        .prepare(
          `UPDATE quarantined_holds
           SET status = 'released', released_at = ?, note = ?
           WHERE id = ?`,
        )
        .run(input.releasedAt, input.note?.slice(0, 300) ?? null, input.id);

      return true;
    })
    .immediate();
}

/** Reserved weight still owed by an account, including unresolved quarantine. */
export function quarantinedWeight(
  database: DatabaseHandle,
  userId: string,
  kind: QuarantineKind,
) {
  const row = database
    .prepare(
      `SELECT COALESCE(SUM(reserved), 0) AS total FROM quarantined_holds
       WHERE user_id = ? AND kind = ? AND status = 'quarantined'`,
    )
    .get(userId, kind) as { total: number };

  return Math.max(0, row.total);
}

export function listSettlements(database: DatabaseHandle, limit = 50) {
  return database
    .prepare(
      `SELECT id, user_id, api_key_id, model_id, provider_slug, billing_source,
              credit_hold_id, free_reservation_id, subscription_hold_id,
              estimated_micros, status, detail, created_at, settled_at
       FROM settlements
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
    )
    .all(limit);
}
