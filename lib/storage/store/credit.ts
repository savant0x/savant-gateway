import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

import { quarantineHold } from "../ledger/settlements.ts";

/**
 * Async credit reserve path (FID-2026-1031-085, step 4 slice).
 *
 * This is the target implementation of `reserveCreditHold`,
 * `releaseCreditHold` and `quarantineExpiredHolds` from `lib/store/billing.ts`.
 * It is not wired into the live request path yet: `lib/store/*` is synchronous
 * and 71 files under `app/` and `components/` call it synchronously, so the
 * store flip and the caller flip are one cutover (steps 4 + 5).
 *
 * The important change from the SQLite version is the reservation guard. The
 * original reads the balance, compares it in JavaScript, then writes — a
 * read-then-write window that only a single-writer database keeps safe. Here
 * the comparison is the `WHERE` clause of the write, so PostgreSQL re-evaluates
 * it against the locked row and two competing reservations cannot both pass:
 *
 *   UPDATE users SET held_micros = held_micros + $1
 *    WHERE id = $2 AND credit_micros - held_micros >= $1
 *   RETURNING held_micros
 *
 * That is the same shape as `debitCredit` in the settlement ledger. They
 * compose as: reserve at admission (this file), debit on settlement
 * (`debitCredit`), release or quarantine on failure (below). A reservation
 * never moves `credit_micros`; only settlement does.
 */

export const HOLD_TTL_MS = 15 * 60 * 1000;

export type CreditHold = {
  id: string;
  holdMicros: number;
  expiresAt: string;
};

export type AvailableCredit = {
  creditMicros: number;
  heldMicros: number;
  availableMicros: number;
};

export async function availableCredit(
  db: PostgresDatabase,
  userId: string,
): Promise<AvailableCredit | null> {
  const row = await db
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get<{ credit_micros: number; held_micros: number }>(userId);

  if (!row) return null;

  const creditMicros = Number(row.credit_micros);
  const heldMicros = Math.max(0, Number(row.held_micros));

  return {
    creditMicros,
    heldMicros,
    availableMicros: Math.max(0, creditMicros - heldMicros),
  };
}

/**
 * Reserves credit for one call. Returns null when the available balance cannot
 * cover the hold — the same refusal the synchronous version signals.
 */
export async function reserveCredit(
  db: PostgresDatabase,
  input: {
    userId: string;
    keyId: string;
    modelId: string;
    holdMicros: number;
    ttlMs?: number;
    now?: number;
  },
): Promise<CreditHold | null> {
  const holdMicros = Math.max(1, Math.round(input.holdMicros));
  const ttlMs = input.ttlMs ?? HOLD_TTL_MS;
  const now = input.now ?? Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttlMs).toISOString();
  const id = `hold_${randomUUID()}`;

  return db
    .transaction(async () => {
      const reserved = await db
        .prepare(
          `UPDATE users
            SET held_micros = held_micros + ?
          WHERE id = ? AND credit_micros - held_micros >= ?
          RETURNING held_micros`,
        )
        .all<{ held_micros: number }>(holdMicros, input.userId, holdMicros);

      if (reserved.length === 0) return null;

      await db
        .prepare(
          `INSERT INTO credit_holds
          (id, user_id, api_key_id, model_id, hold_micros, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.userId,
          input.keyId,
          input.modelId,
          holdMicros,
          createdAt,
          expiresAt,
        );

      return { id, holdMicros, expiresAt };
    })
    .immediate();
}

/**
 * Frees exactly the reserved amount. Returns false when the hold is already
 * gone, so a double release cannot decrement `held_micros` twice.
 */
export async function releaseHold(
  db: PostgresDatabase,
  input: { holdId: string; userId: string },
) {
  return db
    .transaction(async () => {
      const row = await db
        .prepare(
          "SELECT hold_micros FROM credit_holds WHERE id = ? AND user_id = ?",
        )
        .get<{ hold_micros: number }>(input.holdId, input.userId);

      if (!row) return false;

      await db
        .prepare("DELETE FROM credit_holds WHERE id = ?")
        .run(input.holdId);

      await db
        .prepare(
          "UPDATE users SET held_micros = GREATEST(0, held_micros - ?) WHERE id = ?",
        )
        .run(row.hold_micros, input.userId);

      return true;
    })
    .immediate();
}

/**
 * Moves holds whose window elapsed into durable quarantine. The reserved money
 * stays reserved: an elapsed TTL is not evidence that no upstream work
 * happened, so only an audited operator release frees it.
 */
export async function quarantineExpiredHolds(
  db: PostgresDatabase,
  input: { userId: string; now?: number },
) {
  const cutoff = new Date(input.now ?? Date.now()).toISOString();
  const expired = await db
    .prepare(
      `SELECT id, api_key_id, model_id, hold_micros, created_at, expires_at
         FROM credit_holds
        WHERE user_id = ? AND expires_at <= ?`,
    )
    .all<{
      id: string;
      api_key_id: string | null;
      model_id: string | null;
      hold_micros: number;
      created_at: string;
      expires_at: string;
    }>(input.userId, cutoff);

  if (expired.length === 0) return 0;

  await db
    .transaction(async () => {
      for (const hold of expired) {
        await quarantineHold(db, {
          id: hold.id,
          kind: "credit",
          userId: input.userId,
          keyId: hold.api_key_id,
          modelId: hold.model_id,
          reserved: Number(hold.hold_micros),
          createdAt: hold.created_at,
          expiredAt: hold.expires_at,
        });

        await db.prepare("DELETE FROM credit_holds WHERE id = ?").run(hold.id);
      }
    })
    .immediate();

  return expired.reduce((total, row) => total + Number(row.hold_micros), 0);
}
