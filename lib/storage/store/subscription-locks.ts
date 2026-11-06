import type { PostgresDatabase } from "../pg-adapter.ts";
import type { PeriodRow, SubscriptionRow } from "./subscription-rows.ts";

/**
 * One explicit lock order for every subscription writer.
 *
 * PostgreSQL Read Committed does not serialize a prior decision just because
 * the later increment is atomic. Every path that can admit, settle, quarantine,
 * cancel or renew allowance locks rows in this order:
 *
 *   settlement -> user -> subscription -> period -> hold -> quarantine
 *
 * `FOR NO KEY UPDATE` is used for parents so an unrelated foreign-key key-share
 * check does not block them. A path may skip a class it does not touch, but it
 * must never acquire an earlier class after a later one.
 */

export async function lockUser(db: PostgresDatabase, userId: string) {
  return db
    .prepare("SELECT id FROM users WHERE id = ? FOR NO KEY UPDATE")
    .get<{ id: string }>(userId);
}

export async function lockSubscription(
  db: PostgresDatabase,
  subscriptionId: string,
) {
  return db
    .prepare("SELECT * FROM subscriptions WHERE id = ? FOR NO KEY UPDATE")
    .get<SubscriptionRow>(subscriptionId);
}

export async function lockActiveSubscriptionForUser(
  db: PostgresDatabase,
  userId: string,
) {
  return db
    .prepare(
      `SELECT * FROM subscriptions
        WHERE user_id = ? AND status IN ('active', 'past_due')
        ORDER BY created_at::timestamptz DESC
        LIMIT 1
        FOR NO KEY UPDATE`,
    )
    .get<SubscriptionRow>(userId);
}

export async function lockPeriod(db: PostgresDatabase, periodId: string) {
  return db
    .prepare(
      "SELECT * FROM subscription_periods WHERE id = ? FOR NO KEY UPDATE",
    )
    .get<PeriodRow>(periodId);
}

export async function lockOpenPeriod(
  db: PostgresDatabase,
  subscriptionId: string,
) {
  return db
    .prepare(
      `SELECT * FROM subscription_periods
        WHERE subscription_id = ? AND status = 'open'
        ORDER BY period_start::timestamptz DESC
        LIMIT 1
        FOR NO KEY UPDATE`,
    )
    .get<PeriodRow>(subscriptionId);
}

export async function lockSubscriptionHold(
  db: PostgresDatabase,
  holdId: string,
) {
  return db
    .prepare(
      `SELECT id, subscription_id, period_id, user_id, weighted_tokens,
              expires_at
         FROM subscription_holds WHERE id = ? FOR NO KEY UPDATE`,
    )
    .get<{
      id: string;
      subscription_id: string;
      period_id: string;
      user_id: string;
      weighted_tokens: number;
      expires_at: string;
    }>(holdId);
}

/**
 * The settlement row is locked before any account row. A quarantine that did
 * not find a settlement still proceeds; the lock is only an ordering point.
 */
export async function lockSettlementForHold(
  db: PostgresDatabase,
  holdId: string,
) {
  return db
    .prepare(
      `SELECT id FROM settlements
        WHERE credit_hold_id = ? OR free_reservation_id = ?
           OR subscription_hold_id = ?
        ORDER BY created_at::timestamptz
        LIMIT 1
        FOR NO KEY UPDATE`,
    )
    .get<{ id: string }>(holdId, holdId, holdId);
}

export async function lockQuarantinedHold(
  db: PostgresDatabase,
  holdId: string,
) {
  return db
    .prepare(
      `SELECT id, kind, user_id, period_id, reserved, status
         FROM quarantined_holds WHERE id = ? FOR NO KEY UPDATE`,
    )
    .get<{
      id: string;
      kind: "credit" | "subscription" | "free";
      user_id: string;
      period_id: string | null;
      reserved: number;
      status: string;
    }>(holdId);
}
