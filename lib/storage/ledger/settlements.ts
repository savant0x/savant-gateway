import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Durable settlement ledger, ported to the async handle (FID-085 step 3).
 *
 * Semantics are unchanged from `lib/settlement-ledger.ts`: one row names an
 * admitted call before dispatch, settlement claims that row monotonically, and
 * an expired reservation moves to quarantine with its capacity still reserved.
 *
 * Three statement-level differences the port forces:
 *
 * 1. `MAX(0, x - ?)` becomes `GREATEST(0, x - ?)`. Postgres `MAX` is an
 *    aggregate; the SQLite habit of using it as a scalar would silently change
 *    the query's shape rather than its arithmetic.
 * 2. `INSERT OR IGNORE` becomes `ON CONFLICT DO NOTHING`.
 * 3. `datetime(col)` becomes `col::timestamptz`, because timestamps are stored
 *    as ISO-8601 text (decision D-13) and need an explicit cast to sort as time.
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

export async function openSettlement(
  db: PostgresDatabase,
  input: SettlementInput,
  createdAt: string,
) {
  await db
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
 * Monotonic admission → committed. False when the row is missing, already
 * committed, or quarantined: a late or duplicate callback must not downgrade
 * or debit a decided outcome.
 */
export async function commitSettlement(
  db: PostgresDatabase,
  id: string,
  settledAt: string,
  detail?: string | null,
) {
  const result = await db
    .prepare(
      `UPDATE settlements
          SET status = 'committed', settled_at = ?, detail = ?
        WHERE id = ? AND status = 'admitted'`,
    )
    .run(settledAt, detail?.slice(0, 500) ?? null, id);

  return result.changes > 0;
}

export async function settlementStatus(db: PostgresDatabase, id: string) {
  const row = await db
    .prepare("SELECT status FROM settlements WHERE id = ?")
    .get<{ status: string }>(id);

  return row?.status ?? null;
}

/**
 * Moves one expired reservation into durable quarantine. The reserved amount
 * stays reserved: the caller does not refund anything.
 */
export async function quarantineHold(
  db: PostgresDatabase,
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
  const write = await db
    .prepare(
      `INSERT INTO quarantined_holds
        (id, kind, user_id, api_key_id, model_id, period_id, reserved,
         created_at, expired_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'quarantined')
       ON CONFLICT DO NOTHING`,
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
    await db
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

export async function listQuarantinedHolds(
  db: PostgresDatabase,
  limit = 50,
): Promise<QuarantinedHold[]> {
  const rows = await db
    .prepare(
      `SELECT id, kind, user_id, api_key_id, model_id, period_id, reserved,
              created_at, expired_at, status
         FROM quarantined_holds
        ORDER BY expired_at::timestamptz DESC
        LIMIT ?`,
    )
    .all<{
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
    }>(limit);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    userId: row.user_id,
    keyId: row.api_key_id,
    modelId: row.model_id,
    periodId: row.period_id,
    reserved: Number(row.reserved),
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
export async function releaseQuarantinedHold(
  db: PostgresDatabase,
  input: { id: string; releasedAt: string; note?: string | null },
) {
  return db
    .transaction(async () => {
      const row = await db
        .prepare(
          `SELECT kind, user_id, period_id, reserved FROM quarantined_holds
          WHERE id = ? AND status = 'quarantined'`,
        )
        .get<{
          kind: QuarantineKind;
          user_id: string;
          period_id: string | null;
          reserved: number;
        }>(input.id);

      if (!row) return false;

      if (row.kind === "credit") {
        await db
          .prepare(
            "UPDATE users SET held_micros = GREATEST(0, held_micros - ?) WHERE id = ?",
          )
          .run(row.reserved, row.user_id);
      } else if (row.kind === "subscription" && row.period_id) {
        await db
          .prepare(
            `UPDATE subscription_periods
              SET weighted_tokens_held = GREATEST(0, weighted_tokens_held - ?)
            WHERE id = ?`,
          )
          .run(row.reserved, row.period_id);
      }

      await db
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
export async function quarantinedWeight(
  db: PostgresDatabase,
  userId: string,
  kind: QuarantineKind,
) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(reserved), 0) AS total FROM quarantined_holds
        WHERE user_id = ? AND kind = ? AND status = 'quarantined'`,
    )
    .get<{ total: number }>(userId, kind);

  return Math.max(0, Number(row?.total ?? 0));
}

export async function listSettlements(db: PostgresDatabase, limit = 50) {
  return db
    .prepare(
      `SELECT id, user_id, api_key_id, model_id, provider_slug, billing_source,
              credit_hold_id, free_reservation_id, subscription_hold_id,
              estimated_micros, status, detail, created_at, settled_at
         FROM settlements
        ORDER BY created_at::timestamptz DESC
        LIMIT ?`,
    )
    .all(limit);
}

export type DebitOutcome =
  | { ok: true; balanceMicros: number }
  | { ok: false; reason: "insufficient_credit" };

/**
 * The double-spend guard, as one statement.
 *
 * PostgreSQL re-evaluates the `WHERE` clause against the row after taking the
 * write lock, so two competing debits of the same balance cannot both pass:
 * the second re-reads the committed value and finds insufficient credit. There
 * is no read-then-write window to race, which is why this is a conditional
 * update rather than `SELECT` followed by `UPDATE`.
 *
 * A refund of the whole balance is allowed; a debit below zero is not.
 */
export async function debitCredit(
  db: PostgresDatabase,
  input: { userId: string; micros: number },
): Promise<DebitOutcome> {
  const amount = Math.max(0, Math.floor(input.micros));

  if (amount === 0) {
    const row = await db
      .prepare("SELECT credit_micros FROM users WHERE id = ?")
      .get<{ credit_micros: number }>(input.userId);

    return row
      ? { ok: true, balanceMicros: Number(row.credit_micros) }
      : { ok: false, reason: "insufficient_credit" };
  }

  const statement = db.prepare(
    `UPDATE users
        SET credit_micros = credit_micros - ?
      WHERE id = ? AND credit_micros >= ?
      RETURNING credit_micros`,
  );
  const remaining = await statement.all<{ credit_micros: number }>(
    amount,
    input.userId,
    amount,
  );

  if (remaining.length === 0) {
    return { ok: false, reason: "insufficient_credit" };
  }

  return { ok: true, balanceMicros: Number(remaining[0].credit_micros) };
}

/** Credit granted by a paid top-up or an operator adjustment. */
export async function creditBalance(db: PostgresDatabase, userId: string) {
  const row = await db
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get<{ credit_micros: number; held_micros: number }>(userId);

  if (!row) return null;

  return {
    creditMicros: Number(row.credit_micros),
    heldMicros: Number(row.held_micros),
    availableMicros: Math.max(
      0,
      Number(row.credit_micros) - Number(row.held_micros),
    ),
  };
}
