import "server-only";

import type { TopupSummary } from "../types";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";

type TopupRow = {
  id: string;
  user_id: string;
  customer_name: string | null;
  customer_email: string | null;
  provider: string;
  provider_ref: string;
  amount_micros: number;
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
    amountMicros: row.amount_micros,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

export function createTopup(input: {
  userId: string;
  amountMicros: number;
  provider?: string;
  currency?: string;
}) {
  const id = `topup_${randomUUID()}`;
  const createdAt = nowIso();

  db.prepare(
    `INSERT INTO topups
      (id, user_id, provider, provider_ref, amount_micros, currency, status,
       created_at, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`,
  ).run(
    id,
    input.userId,
    input.provider ?? "stripe",
    `pending_${id}`,
    input.amountMicros,
    input.currency ?? "usd",
    createdAt,
  );

  return { id, createdAt };
}

export function setTopupProviderRef(
  topupId: string,
  providerRef: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE topups SET provider_ref = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .run(providerRef, topupId);

  return result.changes > 0;
}

export function markTopupFailed(topupId: string) {
  const result = db
    .prepare(
      `UPDATE topups SET status = 'failed'
       WHERE id = ? AND status = 'pending'`,
    )
    .run(topupId);

  return result.changes > 0;
}

export type FulfillResult = "paid" | "already_paid" | "missing";

/**
 * Credits a customer exactly once for a paid checkout. The status transition
 * and the ledger row happen in one transaction, and `provider_ref` is unique,
 * so Stripe replay cannot double-credit.
 */
export function fulfillTopup(input: {
  topupId: string;
  providerRef: string;
  paidAt?: string;
  expectedAmountMicros?: number;
  expectedCurrency?: string;
}): FulfillResult {
  return db
    .transaction((): FulfillResult => {
      const row = db
        .prepare(
          `SELECT id, user_id, amount_micros, currency, status
           FROM topups WHERE id = ?`,
        )
        .get(input.topupId) as
        | {
            id: string;
            user_id: string;
            amount_micros: number;
            currency: string;
            status: string;
          }
        | undefined;

      if (!row) return "missing";
      if (row.status === "paid") return "already_paid";
      if (row.status !== "pending") return "missing";
      if (row.amount_micros <= 0) return "missing";

      if (
        input.expectedAmountMicros !== undefined &&
        input.expectedAmountMicros !== row.amount_micros
      ) {
        return "missing";
      }

      if (
        input.expectedCurrency !== undefined &&
        input.expectedCurrency.toLowerCase() !== row.currency.toLowerCase()
      ) {
        return "missing";
      }

      const conflicting = db
        .prepare("SELECT id FROM topups WHERE provider_ref = ? AND id <> ?")
        .get(input.providerRef, input.topupId) as { id: string } | undefined;

      if (conflicting) return "missing";

      const paidAt = input.paidAt ?? nowIso();
      const balance = db
        .prepare("SELECT credit_micros FROM users WHERE id = ?")
        .get(row.user_id) as { credit_micros: number } | undefined;

      if (!balance) return "missing";

      const balanceAfter = balance.credit_micros + row.amount_micros;

      db.prepare(
        `UPDATE topups
         SET status = 'paid', provider_ref = ?, paid_at = ?
         WHERE id = ?`,
      ).run(input.providerRef, paidAt, row.id);

      db.prepare("UPDATE users SET credit_micros = ? WHERE id = ?").run(
        balanceAfter,
        row.user_id,
      );

      db.prepare(
        `INSERT INTO credit_ledger
          (id, user_id, kind, amount_micros, balance_after_micros, note,
           created_at)
         VALUES (?, ?, 'topup', ?, ?, ?, ?)`,
      ).run(
        `ledger_${randomUUID()}`,
        row.user_id,
        row.amount_micros,
        balanceAfter,
        `Credit top-up ${row.id}`,
        nowIso(),
      );

      return "paid";
    })
    .immediate();
}

export function listTopups(limit = 50): TopupSummary[] {
  const rows = db
    .prepare(
      `SELECT ${TOPUP_COLUMNS}
       FROM topups t
       LEFT JOIN users u ON u.id = t.user_id
       ORDER BY datetime(t.created_at) DESC
       LIMIT ?`,
    )
    .all(limit) as TopupRow[];

  return rows.map(toSummary);
}

export function listCustomerTopups(userId: string, limit = 20): TopupSummary[] {
  const rows = db
    .prepare(
      `SELECT ${TOPUP_COLUMNS}
       FROM topups t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE t.user_id = ?
       ORDER BY datetime(t.created_at) DESC
       LIMIT ?`,
    )
    .all(userId, limit) as TopupRow[];

  return rows.map(toSummary);
}

export function getCustomerPurchasedMicros(userId: string) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount_micros), 0) AS total
       FROM topups WHERE user_id = ? AND status = 'paid'`,
    )
    .get(userId) as { total: number };

  return row.total;
}
