import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

import { insertActivity } from "../ledger/activity.ts";

import {
  availableCredit,
  quarantineExpiredHolds,
  releaseHold,
  reserveCredit,
} from "./credit.ts";

/**
 * Account credit store, ported to the async handle (FID-085 step 4).
 *
 * This is the target implementation of `lib/store/billing.ts`. The reserve,
 * release and quarantine paths are not restated here — they live in
 * `./credit.ts`, where the reservation guard is the `WHERE` clause of the update
 * itself. This module adds what the account page and the operator console read:
 * the summary, the ledger, and a grant.
 *
 * Two behaviours are carried over deliberately rather than improved:
 *
 * 1. A summary read first quarantines elapsed holds. That is a write on a read
 *    path, but it is what makes the balance the customer sees converge with the
 *    holds the gateway actually believes in.
 * 2. A grant sets an absolute balance computed from a locked read. Postgres
 *    gives that read its lock (`FOR UPDATE`), which the SQLite version got from
 *    being single-writer.
 */

export const DEFAULT_TENANT = "user_dev";

export type AccountSummary = {
  creditMicros: number;
  heldMicros: number;
  availableMicros: number;
};

export type CreditLedgerEntry = {
  id: string;
  kind: string;
  amountMicros: number;
  balanceAfterMicros: number;
  note: string | null;
  createdAt: string;
};

export async function getAccountSummary(
  db: PostgresDatabase,
  userId = DEFAULT_TENANT,
): Promise<AccountSummary> {
  await quarantineExpiredHolds(db, { userId });

  const balance = await availableCredit(db, userId);

  return balance ?? { creditMicros: 0, heldMicros: 0, availableMicros: 0 };
}

export async function listCreditLedger(
  db: PostgresDatabase,
  limit = 20,
  userId = DEFAULT_TENANT,
): Promise<CreditLedgerEntry[]> {
  const rows = await db
    .prepare(
      `SELECT id, kind, amount_micros, balance_after_micros, note, created_at
         FROM credit_ledger
        WHERE user_id = ?
        ORDER BY created_at::timestamptz DESC
        LIMIT ?`,
    )
    .all<{
      id: string;
      kind: string;
      amount_micros: number;
      balance_after_micros: number;
      note: string | null;
      created_at: string;
    }>(userId, limit);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    amountMicros: Number(row.amount_micros),
    balanceAfterMicros: Number(row.balance_after_micros),
    note: row.note,
    createdAt: row.created_at,
  }));
}

export async function grantCredit(
  db: PostgresDatabase,
  input: {
    amountMicros: number;
    note?: string | null;
    userId?: string;
    kind?: string;
    now?: string;
  },
): Promise<AccountSummary> {
  const userId = input.userId ?? DEFAULT_TENANT;
  const amount = Math.round(input.amountMicros);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Credit grants must be a positive amount.");
  }

  const now = input.now ?? new Date().toISOString();
  const ledgerKind = input.kind ?? "grant";

  await db
    .transaction(async () => {
      const before = await db
        .prepare("SELECT credit_micros FROM users WHERE id = ? FOR UPDATE")
        .get<{ credit_micros: number }>(userId);

      if (!before) throw new Error("Tenant not found.");

      const balanceAfter = Number(before.credit_micros) + amount;

      await db
        .prepare("UPDATE users SET credit_micros = ? WHERE id = ?")
        .run(balanceAfter, userId);

      await db
        .prepare(
          `INSERT INTO credit_ledger
            (id, user_id, kind, amount_micros, balance_after_micros, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `ledger_${randomUUID()}`,
          userId,
          ledgerKind,
          amount,
          balanceAfter,
          input.note?.slice(0, 300) ?? null,
          now,
        );

      await insertActivity(db, {
        userId,
        actor: "admin",
        kind: "credit.granted",
        entityType: "credit",
        entityId: userId,
        metadata: { amountMicros: amount, source: ledgerKind },
        now,
      });
    })
    .immediate();

  return getAccountSummary(db, userId);
}

export { quarantineExpiredHolds, releaseHold, reserveCredit };
