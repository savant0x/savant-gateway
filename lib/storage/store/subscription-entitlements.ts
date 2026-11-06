import type { PostgresDatabase } from "../pg-adapter.ts";

import { closeSubscriptionPeriod } from "./subscription-access.ts";

/**
 * Subscription entitlements and incomplete-checkout cleanup (FID-086 Batch A).
 *
 * Both helpers are used from the checkout path and from the lifecycle path, so
 * they live here rather than in either one. `ON CONFLICT DO NOTHING` replaces
 * `INSERT OR IGNORE`: the table's primary key is the pair, so re-inserting an
 * entitlement is a no-op rather than a duplicate.
 */

export async function insertEntitlements(
  db: PostgresDatabase,
  subscriptionId: string,
  modelIds: string[],
) {
  const insert = db.prepare(
    `INSERT INTO subscription_models (subscription_id, model_id)
     VALUES (?, ?)
     ON CONFLICT DO NOTHING`,
  );

  for (const modelId of modelIds) await insert.run(subscriptionId, modelId);
}

/**
 * Expires a customer's abandoned checkouts before a new one starts, closing
 * their periods. Without this, an incomplete row keeps a period open and the
 * allowance for the next checkout has two open periods to choose from.
 */
export async function expireIncompleteForUser(
  db: PostgresDatabase,
  userId: string,
) {
  const rows = await db
    .prepare(
      "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'incomplete'",
    )
    .all<{ id: string }>(userId);

  for (const row of rows) {
    // closeSubscriptionPeriod takes the subscription then period locks; the
    // caller holds the user lock, so the shared order is preserved.
    await closeSubscriptionPeriod(db, row.id);
    await db
      .prepare(
        `UPDATE subscriptions SET status = 'expired', updated_at = ?
          WHERE id = ? AND status = 'incomplete'`,
      )
      .run(new Date().toISOString(), row.id);
  }
}
