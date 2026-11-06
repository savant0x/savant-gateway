import type { PostgresDatabase } from "../pg-adapter.ts";

import { quarantineHold } from "../ledger/settlements.ts";

import {
  lockOpenPeriod,
  lockPeriod,
  lockSettlementForHold,
  lockSubscription,
  lockSubscriptionHold,
  lockUser,
} from "./subscription-locks.ts";

const INCOMPLETE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Expired allowance holds are quarantined, not silently returned.
 *
 * Each hold is its own transaction so one slow account cannot hold a global
 * lock. The row is read without a lock only to learn its identifiers; the
 * decision is taken again after settlement -> user -> subscription -> period ->
 * hold are locked in order.
 */
async function quarantineExpiredHolds(db: PostgresDatabase, now: number) {
  const cutoff = new Date(now).toISOString();
  const expired = await db
    .prepare(
      `SELECT id FROM subscription_holds
        WHERE expires_at <= ?
        ORDER BY user_id, subscription_id, period_id, id`,
    )
    .all<{ id: string }>(cutoff);

  for (const candidate of expired) {
    const seed = await db
      .prepare(
        `SELECT id, subscription_id, period_id, user_id, api_key_id, model_id,
                weighted_tokens, created_at, expires_at
           FROM subscription_holds WHERE id = ?`,
      )
      .get<{
        id: string;
        subscription_id: string;
        period_id: string;
        user_id: string;
        api_key_id: string | null;
        model_id: string | null;
        weighted_tokens: number;
        created_at: string;
        expires_at: string;
      }>(candidate.id);

    if (!seed) continue;

    await db
      .transaction(async () => {
        await lockSettlementForHold(db, seed.id);

        if (!(await lockUser(db, seed.user_id))) return;
        if (!(await lockSubscription(db, seed.subscription_id))) return;
        if (!(await lockPeriod(db, seed.period_id))) return;

        const hold = await lockSubscriptionHold(db, seed.id);

        if (!hold) return;
        if (Date.parse(hold.expires_at) > now) return;

        await quarantineHold(db, {
          id: hold.id,
          kind: "subscription",
          userId: seed.user_id,
          keyId: seed.api_key_id,
          modelId: seed.model_id,
          periodId: seed.period_id,
          reserved: Number(hold.weighted_tokens),
          createdAt: seed.created_at,
          expiredAt: hold.expires_at,
        });

        await db
          .prepare("DELETE FROM subscription_holds WHERE id = ?")
          .run(hold.id);
      })
      .immediate();
  }
}

/**
 * Local safety net for missed Stripe events and manual grants.
 *
 * The former bulk updates took the period lock before the subscription lock,
 * the reverse of admission. Each candidate now gets the shared order and is
 * rechecked after its locks are held, so a renewed or revoked row cannot be
 * expired from a stale candidate read.
 */
export async function sweepSubscriptions(
  db: PostgresDatabase,
  now = Date.now(),
) {
  const stamp = new Date(now).toISOString();
  const incompleteCutoff = new Date(now - INCOMPLETE_TTL_MS).toISOString();

  await quarantineExpiredHolds(db, now);

  const candidates = await db
    .prepare(
      `SELECT id, user_id FROM subscriptions
        WHERE (status IN ('active', 'past_due') AND current_period_end <= ?)
           OR (status = 'incomplete' AND created_at <= ?)
        ORDER BY id`,
    )
    .all<{ id: string; user_id: string }>(stamp, incompleteCutoff);

  for (const candidate of candidates) {
    await db
      .transaction(async () => {
        if (!(await lockUser(db, candidate.user_id))) return;

        const subscription = await lockSubscription(db, candidate.id);

        if (!subscription) return;

        const ended =
          (subscription.status === "active" ||
            subscription.status === "past_due") &&
          Date.parse(subscription.current_period_end) <= now;
        const abandoned =
          subscription.status === "incomplete" &&
          Date.parse(subscription.created_at) <= now - INCOMPLETE_TTL_MS;

        if (!ended && !abandoned) return;

        const period = await lockOpenPeriod(db, subscription.id);

        if (period) {
          await db
            .prepare(
              `UPDATE subscription_periods SET status = 'closed'
                WHERE id = ? AND status = 'open'`,
            )
            .run(period.id);
        }

        await db
          .prepare(
            `UPDATE subscriptions SET status = 'expired', updated_at = ?
              WHERE id = ? AND status IN ('active', 'past_due', 'incomplete')`,
          )
          .run(stamp, subscription.id);
      })
      .immediate();
  }
}
