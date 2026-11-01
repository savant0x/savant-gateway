import type { PostgresDatabase } from "../pg-adapter.ts";
import type { TopupSummary } from "../../types.ts";

import { randomUUID } from "node:crypto";

import { insertActivity } from "../ledger/activity.ts";

/**
 * Top-up store, ported to the async handle (FID-2026-1031-086, Batch A).
 *
 * The fulfilment path is the reason this module exists. In the SQLite version
 * the balance was read, adjusted in JavaScript and written back — safe only
 * because the database admitted one writer. Here the credit is the assignment
 * itself:
 *
 *   UPDATE users SET credit_micros = credit_micros + $1
 *    WHERE id = $2 RETURNING credit_micros
 *
 * so the returned balance is the post-credit balance even if another top-up
 * lands at the same moment, and no customer is credited from a stale read.
 *
 * Idempotency is unchanged and still comes from the state transition: a webhook
 * replay finds `status = 'paid'` and returns `already_paid` without touching the
 * ledger. `provider_ref` stays unique, so a second top-up cannot claim a
 * reference that is already in use.
 *
 * `BIGINT` money arrives as a string from the driver, so amounts are coerced at
 * this boundary rather than leaking `"2500000"` into a summary.
 */

type TopupRow = {
  id: string;
  user_id: string;
  customer_name: string | null;
  customer_email: string | null;
  provider: string;
  provider_ref: string;
  amount_micros: number | string;
  currency: string;
  status: string;
  created_at: string;
  paid_at: string | null;
};

const TOPUP_COLUMNS = `
  t.id, t.user_id, u.name AS customer_name, u.email AS customer_email,
  t.provider, t.provider_ref, t.amount_micros, t.currency, t.status,
  t.created_at, t.paid_at
`;

function toSummary(row: TopupRow): TopupSummary {
  return {
    id: row.id,
    userId: row.user_id,
    customerName: row.customer_name ?? "Unknown customer",
    customerEmail: row.customer_email ?? "",
    provider: row.provider,
    providerRef: row.provider_ref,
    amountMicros: Number(row.amount_micros),
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

export async function createTopup(
  db: PostgresDatabase,
  input: {
    userId: string;
    amountMicros: number;
    provider?: string;
    currency?: string;
  },
) {
  const id = `topup_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const provider = input.provider ?? "stripe";

  await db
    .transaction(async () => {
      await db
        .prepare(
          `INSERT INTO topups
            (id, user_id, provider, provider_ref, amount_micros, currency,
             status, created_at, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`,
        )
        .run(
          id,
          input.userId,
          provider,
          `pending_${id}`,
          Math.round(input.amountMicros),
          input.currency ?? "usd",
          createdAt,
        );

      await insertActivity(db, {
        userId: input.userId,
        actor: "customer",
        kind: "topup.created",
        entityType: "topup",
        entityId: id,
        metadata: {
          topupId: id,
          amountMicros: Math.round(input.amountMicros),
          provider,
        },
        now: createdAt,
      });
    })
    .immediate();

  return { id, createdAt };
}

export async function setTopupProviderRef(
  db: PostgresDatabase,
  topupId: string,
  providerRef: string,
) {
  const updated = await db
    .prepare(
      `UPDATE topups SET provider_ref = ?
        WHERE id = ? AND status = 'pending'
       RETURNING id`,
    )
    .all(providerRef, topupId);

  return updated.length > 0;
}

export async function markTopupFailed(db: PostgresDatabase, topupId: string) {
  const updated = await db
    .prepare(
      `UPDATE topups SET status = 'failed'
        WHERE id = ? AND status = 'pending'
       RETURNING id`,
    )
    .all(topupId);

  return updated.length > 0;
}

export type FulfillResult = "paid" | "already_paid" | "missing" | "mismatch";

/**
 * Credits a customer exactly once for a paid checkout. The status transition,
 * the balance update and the ledger row share one transaction, and the top-up
 * row is locked for the duration, so two webhook deliveries cannot both observe
 * `pending`.
 */
export async function fulfillTopup(
  db: PostgresDatabase,
  input: {
    topupId: string;
    providerRef: string;
    paidAt?: string;
    expectedAmountMicros?: number;
    expectedCurrency?: string;
    /** Metadata user; the top-up must belong to this customer. */
    expectedUserId?: string;
  },
): Promise<FulfillResult> {
  return db
    .transaction(async (): Promise<FulfillResult> => {
      const row = await db
        .prepare(
          `SELECT id, user_id, amount_micros, currency, status
             FROM topups WHERE id = ? FOR UPDATE`,
        )
        .get<{
          id: string;
          user_id: string;
          amount_micros: number | string;
          currency: string;
          status: string;
        }>(input.topupId);

      if (!row) return "missing";
      if (row.status === "paid") return "already_paid";
      if (row.status !== "pending") return "mismatch";

      const amountMicros = Number(row.amount_micros);

      if (amountMicros <= 0) return "mismatch";

      if (
        input.expectedAmountMicros !== undefined &&
        input.expectedAmountMicros !== amountMicros
      ) {
        return "mismatch";
      }

      if (
        input.expectedCurrency !== undefined &&
        input.expectedCurrency.toLowerCase() !== row.currency.toLowerCase()
      ) {
        return "mismatch";
      }

      if (
        input.expectedUserId !== undefined &&
        input.expectedUserId !== row.user_id
      ) {
        return "mismatch";
      }

      const conflicting = await db
        .prepare("SELECT id FROM topups WHERE provider_ref = ? AND id <> ?")
        .get<{ id: string }>(input.providerRef, input.topupId);

      if (conflicting) return "mismatch";

      const paidAt = input.paidAt ?? new Date().toISOString();

      // The addition and the read are one statement, so the balance written to
      // the ledger is the balance the customer actually holds afterwards.
      const credited = await db
        .prepare(
          `UPDATE users SET credit_micros = credit_micros + ?
            WHERE id = ? RETURNING credit_micros`,
        )
        .all<{ credit_micros: number | string }>(amountMicros, row.user_id);

      if (credited.length === 0) return "missing";

      const balanceAfter = Number(credited[0].credit_micros);

      await db
        .prepare(
          `UPDATE topups
              SET status = 'paid', provider_ref = ?, paid_at = ?
            WHERE id = ?`,
        )
        .run(input.providerRef, paidAt, row.id);

      await db
        .prepare(
          `INSERT INTO credit_ledger
            (id, user_id, kind, amount_micros, balance_after_micros, note,
             created_at)
           VALUES (?, ?, 'topup', ?, ?, ?, ?)`,
        )
        .run(
          `ledger_${randomUUID()}`,
          row.user_id,
          amountMicros,
          balanceAfter,
          `Credit top-up ${row.id}`,
          paidAt,
        );

      await insertActivity(db, {
        userId: row.user_id,
        actor: "system",
        kind: "topup.paid",
        entityType: "topup",
        entityId: row.id,
        metadata: { topupId: row.id, amountMicros },
        now: paidAt,
      });

      return "paid";
    })
    .immediate();
}

export async function getTopupById(
  db: PostgresDatabase,
  topupId: string,
): Promise<TopupSummary | null> {
  const row = await db
    .prepare(
      `SELECT ${TOPUP_COLUMNS}
         FROM topups t
         LEFT JOIN users u ON u.id = t.user_id
        WHERE t.id = ?`,
    )
    .get<TopupRow>(topupId);

  return row ? toSummary(row) : null;
}

export async function listTopups(
  db: PostgresDatabase,
  limit = 50,
): Promise<TopupSummary[]> {
  const rows = await db
    .prepare(
      `SELECT ${TOPUP_COLUMNS}
         FROM topups t
         LEFT JOIN users u ON u.id = t.user_id
        ORDER BY t.created_at::timestamptz DESC
        LIMIT ?`,
    )
    .all<TopupRow>(limit);

  return rows.map(toSummary);
}

export async function listCustomerTopups(
  db: PostgresDatabase,
  userId: string,
  limit = 20,
): Promise<TopupSummary[]> {
  const rows = await db
    .prepare(
      `SELECT ${TOPUP_COLUMNS}
         FROM topups t
         LEFT JOIN users u ON u.id = t.user_id
        WHERE t.user_id = ?
        ORDER BY t.created_at::timestamptz DESC
        LIMIT ?`,
    )
    .all<TopupRow>(userId, limit);

  return rows.map(toSummary);
}

export async function getCustomerPurchasedMicros(
  db: PostgresDatabase,
  userId: string,
) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_micros), 0) AS total
         FROM topups WHERE user_id = ? AND status = 'paid'`,
    )
    .get<{ total: number | string }>(userId);

  return Number(row?.total ?? 0);
}
