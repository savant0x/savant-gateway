import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

import { insertActivity } from "../ledger/activity.ts";
import {
  normalizePromoCode,
  promoCodeHash,
  readPromoPolicy,
} from "../../promo-codes.ts";

import { isUniqueViolation } from "./promo-shared.ts";

/**
 * Promo redemption, ported to the async handle (FID-2026-1031-086, Batch B).
 *
 * A promo is free money into a prepaid balance, so the port keeps the three
 * guards that make redemption safe and changes the one SQLite made unnecessary:
 *
 * 1. **The claim is conditional.** `UPDATE ... WHERE redeemed_count <
 *    max_redemptions` reports whether this redemption is the one that fits; a
 *    read-then-write would let two customers take the last slot.
 * 2. **A customer cannot redeem twice.** The unique index on
 *    `(promo_code_id, user_id)` is the durable guard; the preselect returns a
 *    precise answer for the ordinary second submission, and the constraint
 *    catch covers the race the preselect cannot see.
 * 3. **The credit is an assignment, not a write-back.** The SQLite version read
 *    the balance, added the amount and wrote an absolute value, which was safe
 *    only because SQLite admitted one writer. Here the increment and the balance
 *    it returns are one statement, so two different codes redeemed at the same
 *    moment cannot lose one of the grants.
 *
 * The claim, the credit, the ledger row, the redemption row and the activity
 * entry share one transaction: a crash between any two of them would either
 * charge a slot for nothing or grant credit with no explanation.
 */

export type RedeemPromoResult =
  | {
      ok: true;
      promoId: string;
      amountMicros: number;
      codePrefix: string;
      balanceAfter: number;
    }
  | {
      ok: false;
      reason:
        | "disabled"
        | "invalid_code"
        | "inactive"
        | "not_started"
        | "expired"
        | "already_redeemed"
        | "exhausted"
        | "unknown_user";
    };

export async function redeemPromoCode(
  db: PostgresDatabase,
  input: {
    userId: string;
    code: string;
    now?: string;
    enabled?: boolean;
  },
): Promise<RedeemPromoResult> {
  const enabled = input.enabled ?? readPromoPolicy().enabled;

  if (!enabled) return { ok: false, reason: "disabled" };

  const normalized = normalizePromoCode(input.code);

  if (!normalized) return { ok: false, reason: "invalid_code" };

  const hash = promoCodeHash(normalized);
  const now = input.now ?? new Date().toISOString();

  try {
    return await db
      .transaction(async (): Promise<RedeemPromoResult> => {
        const row = (await db
          .prepare(
            `SELECT id, code_prefix, label, amount_micros, max_redemptions,
                    redeemed_count, status, starts_at, expires_at
               FROM promo_codes WHERE code_hash = ?`,
          )
          .get(hash)) as
          | {
              id: string;
              code_prefix: string;
              label: string;
              amount_micros: number | string;
              max_redemptions: number | string;
              redeemed_count: number | string;
              status: string;
              starts_at: string | null;
              expires_at: string | null;
            }
          | undefined;

        if (!row) return { ok: false, reason: "invalid_code" };
        if (row.status !== "active") return { ok: false, reason: "inactive" };
        if (row.starts_at && now < row.starts_at)
          return { ok: false, reason: "not_started" };
        if (row.expires_at && now >= row.expires_at)
          return { ok: false, reason: "expired" };

        const existing = await db
          .prepare(
            `SELECT id FROM promo_redemptions
              WHERE promo_code_id = ? AND user_id = ?`,
          )
          .get(row.id, input.userId);

        if (existing) return { ok: false, reason: "already_redeemed" };
        if (Number(row.redeemed_count) >= Number(row.max_redemptions))
          return { ok: false, reason: "exhausted" };

        const user = await db
          .prepare("SELECT id FROM users WHERE id = ?")
          .get(input.userId);

        if (!user) return { ok: false, reason: "unknown_user" };

        const amountMicros = Number(row.amount_micros);
        const claim = await db
          .prepare(
            `UPDATE promo_codes
                SET redeemed_count = redeemed_count + 1
              WHERE id = ? AND redeemed_count < max_redemptions`,
          )
          .run(row.id);

        if (claim.changes !== 1) return { ok: false, reason: "exhausted" };

        const credited = (await db
          .prepare(
            `UPDATE users SET credit_micros = credit_micros + ?
              WHERE id = ? RETURNING credit_micros`,
          )
          .get(amountMicros, input.userId)) as {
          credit_micros: number | string;
        };

        const balanceAfter = Number(credited.credit_micros);
        const redemptionId = `promo_redemption_${randomUUID()}`;
        const ledgerId = `ledger_promo_${randomUUID()}`;

        await db
          .prepare(
            `INSERT INTO promo_redemptions
              (id, promo_code_id, user_id, amount_micros, ledger_id, redeemed_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(redemptionId, row.id, input.userId, amountMicros, ledgerId, now);

        await db
          .prepare(
            `INSERT INTO credit_ledger
              (id, user_id, kind, amount_micros, balance_after_micros, note,
               created_at, reference)
             VALUES (?, ?, 'promo', ?, ?, ?, ?, ?)`,
          )
          .run(
            ledgerId,
            input.userId,
            amountMicros,
            balanceAfter,
            `Promo: ${row.label}`,
            now,
            `promo:${row.id}:${input.userId}`,
          );

        await insertActivity(db, {
          userId: input.userId,
          actor: "customer",
          kind: "promo.redeemed",
          entityType: "promo",
          entityId: row.id,
          metadata: {
            promoId: row.id,
            amountMicros,
            codePrefix: row.code_prefix,
          },
          now,
        });

        return {
          ok: true,
          promoId: row.id,
          amountMicros,
          codePrefix: row.code_prefix,
          balanceAfter,
        };
      })
      .immediate();
  } catch (error) {
    // The unique index caught a race the preselect could not see; the claim
    // rolled back with the transaction, so the slot is still available.
    if (isUniqueViolation(error)) {
      return { ok: false, reason: "already_redeemed" };
    }

    throw error;
  }
}
