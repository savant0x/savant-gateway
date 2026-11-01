import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  accountEmailStatus,
} from "../lib/storage/store/account-email.ts";
import {
  createCustomerApiKey,
  getCustomerAccount,
  listCustomerApiKeys,
  revokeCustomerApiKey,
} from "../lib/storage/store/account.ts";
import {
  createCustomer,
  createCustomerSession,
  findCustomerByEmail,
  listCustomerSummaries,
  resolveCustomerSession,
  revokeCustomerSession,
} from "../lib/storage/store/customer.ts";
import {
  grantManualSubscription,
  extendSubscription,
  refreshSubscriptionEntitlements,
} from "../lib/storage/store/subscription-admin.ts";
import {
  revokeSubscription,
  setSubscriptionCancellation,
} from "../lib/storage/store/subscriptions.ts";
import {
  entitlementCount,
  openPeriodRow,
} from "../lib/storage/store/subscription-rows.ts";
import {
  createTopup,
  fulfillTopup,
  getCustomerPurchasedMicros,
  getTopupById,
  listCustomerTopups,
  markTopupFailed,
  setTopupProviderRef,
} from "../lib/storage/store/topups.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);

/**
 * Batch A on the target engine (FID-2026-1031-086).
 *
 * The subject is the money path, not the SQL translation: a top-up must credit
 * exactly once and record the balance it produced, a plan grant must open
 * exactly one period, and a session or key must stop working the moment it is
 * revoked. Those are the properties whose failure costs money or access.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO users
        (id, email, name, status, created_at, password_hash)
       VALUES ('cust_1', 'one@example.test', 'One', 'active', ?, 'hash_1'),
              ('cust_2', 'two@example.test', 'Two', 'active', ?, 'hash_2')`,
    )
    .run(NOW, NOW);

  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, upstream_slug, name, provider, context_window,
         token_weight, in_catalog, group_slug, status, sort_order, synced_at)
       VALUES ('m1', 'm1', 'savant', 'Covered', 'Family', '8k', 1, 1,
               'subscription', 'active', 0, ?)`,
    )
    .run(NOW);

  await db
    .prepare(
      `INSERT INTO plans
        (id, slug, name, status, price_micros, currency, interval,
         included_weighted_tokens, overage_mode, overage_markup_bps,
         sort_order, created_at, updated_at)
       VALUES ('plan_1', 'starter', 'Starter', 'active', 9990000, 'usd',
               'month', 10000, 'block', 0, 0, ?, ?)`,
    )
    .run(NOW, NOW);

  await db
    .prepare(
      "INSERT INTO plan_models (plan_id, model_id) VALUES ('plan_1', 'm1')",
    )
    .run();

  return db;
}

test("a top-up credits once, and the ledger records the balance it produced", async () => {
  const db = await fixture();
  const topup = await createTopup(db, {
    userId: "cust_1",
    amountMicros: 250_000,
  });

  assert.equal(await setTopupProviderRef(db, topup.id, "np_ref_1"), true);
  assert.equal(
    await fulfillTopup(db, { topupId: topup.id, providerRef: "np_ref_1" }),
    "paid",
  );
  assert.equal(
    await fulfillTopup(db, { topupId: topup.id, providerRef: "np_ref_1" }),
    "already_paid",
  );

  const user = await db
    .prepare("SELECT credit_micros FROM users WHERE id = ?")
    .get("cust_1");
  const ledger = await db
    .prepare(
      `SELECT amount_micros, balance_after_micros
         FROM credit_ledger WHERE user_id = ?`,
    )
    .all("cust_1");

  assert.equal(Number(user.credit_micros), 250_000);
  assert.equal(ledger.length, 1, "a replay must not add a second ledger row");
  assert.equal(Number(ledger[0].amount_micros), 250_000);
  assert.equal(Number(ledger[0].balance_after_micros), 250_000);

  const summary = await getTopupById(db, topup.id);

  assert.equal(summary.status, "paid");
  assert.equal(summary.amountMicros, 250_000);
  assert.equal(await getCustomerPurchasedMicros(db, "cust_1"), 250_000);
  assert.equal((await listCustomerTopups(db, "cust_1")).length, 1);
});

test("a top-up whose amount disagrees with the payment is refused untouched", async () => {
  const db = await fixture();
  const topup = await createTopup(db, {
    userId: "cust_1",
    amountMicros: 250_000,
  });

  assert.equal(
    await fulfillTopup(db, {
      topupId: topup.id,
      providerRef: "np_ref_2",
      expectedAmountMicros: 1,
    }),
    "mismatch",
  );

  const user = await db
    .prepare("SELECT credit_micros FROM users WHERE id = ?")
    .get("cust_1");

  assert.equal(Number(user.credit_micros), 0);
  assert.equal((await getTopupById(db, topup.id)).status, "pending");
});

test("a failed top-up cannot be fulfilled afterwards", async () => {
  const db = await fixture();
  const topup = await createTopup(db, {
    userId: "cust_1",
    amountMicros: 100_000,
  });

  assert.equal(await markTopupFailed(db, topup.id), true);
  assert.equal(
    await fulfillTopup(db, { topupId: topup.id, providerRef: "np_ref_3" }),
    "mismatch",
  );
});

test("a customer can hold at most ten active keys", async () => {
  const db = await fixture();
  const created = [];

  for (let index = 0; index < 10; index += 1) {
    created.push(await createCustomerApiKey(db, "cust_1", `Key ${index}`));
  }

  assert.equal(created.every((entry) => entry !== null), true);
  assert.equal(await createCustomerApiKey(db, "cust_1", "Eleventh"), null);

  const first = created[0];

  assert.equal(await revokeCustomerApiKey(db, "cust_1", first.key.id), true);
  assert.equal(await revokeCustomerApiKey(db, "cust_1", first.key.id), false);
  assert.equal((await listCustomerApiKeys(db, "cust_1")).length, 10);
  assert.notEqual(await createCustomerApiKey(db, "cust_1", "Replacement"), null);
});

test("a session resolves until it is revoked", async () => {
  const db = await fixture();
  const session = await createCustomerSession(db, "cust_1", NOW_MS);

  assert.equal((await resolveCustomerSession(db, session.token)).id, "cust_1");
  assert.equal(await revokeCustomerSession(db, session.token), true);
  assert.equal(await resolveCustomerSession(db, session.token), null);
  assert.equal(await revokeCustomerSession(db, session.token), false);
});

test("customer signup and lookup are case-insensitive on email", async () => {
  const db = await fixture();
  const customer = await createCustomer(db, {
    email: "New@Example.test",
    name: "New",
    passwordHash: "hash_new",
  });

  assert.equal(
    (await findCustomerByEmail(db, "new@example.TEST")).id,
    customer.id,
  );
  assert.equal((await accountEmailStatus(db, customer.id)).verified, false);
});

test("a manual grant entitles the plan's models and opens one period", async () => {
  const db = await fixture();
  const granted = await grantManualSubscription(db, {
    userId: "cust_2",
    planId: "plan_1",
  });

  assert.equal(granted.ok, true);
  assert.equal(granted.subscription.entitlementCount, 1);
  assert.equal(await entitlementCount(db, granted.subscription.id), 1);

  const period = await openPeriodRow(db, granted.subscription.id);

  assert.equal(Number(period.included_weighted_tokens), 10_000);
  assert.equal(Number(period.weighted_tokens_held), 0);
});

test("a second active subscription is refused with 409", async () => {
  const db = await fixture();

  assert.equal(
    (await grantManualSubscription(db, { userId: "cust_2", planId: "plan_1" }))
      .ok,
    true,
  );

  const second = await grantManualSubscription(db, {
    userId: "cust_2",
    planId: "plan_1",
  });

  assert.equal(second.ok, false);
  assert.equal(second.status, 409);
});

test("extending moves the period forward and leaves exactly one open", async () => {
  const db = await fixture();
  const granted = await grantManualSubscription(db, {
    userId: "cust_2",
    planId: "plan_1",
  });
  const extended = await extendSubscription(db, {
    subscriptionId: granted.subscription.id,
  });

  assert.equal(extended.ok, true);
  assert.ok(
    Date.parse(extended.subscription.currentPeriodEnd) >
      Date.parse(granted.subscription.currentPeriodEnd),
  );

  const open = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM subscription_periods
        WHERE subscription_id = ? AND status = 'open'`,
    )
    .get(granted.subscription.id);

  assert.equal(Number(open.count), 1);
});

test("refresh restores the plan's entitlements the subscription lost", async () => {
  const db = await fixture();
  const granted = await grantManualSubscription(db, {
    userId: "cust_2",
    planId: "plan_1",
  });

  await db
    .prepare("DELETE FROM subscription_models WHERE subscription_id = ?")
    .run(granted.subscription.id);

  const refreshed = await refreshSubscriptionEntitlements(
    db,
    granted.subscription.id,
  );

  assert.equal(refreshed.ok, true);
  assert.equal(await entitlementCount(db, granted.subscription.id), 1);
});

test("cancellation is flagged, and revocation cancels immediately", async () => {
  const db = await fixture();
  const granted = await grantManualSubscription(db, {
    userId: "cust_2",
    planId: "plan_1",
  });

  const flagged = await setSubscriptionCancellation(
    db,
    granted.subscription.id,
    true,
  );

  assert.equal(flagged.cancelAtPeriodEnd, true);

  const revoked = await revokeSubscription(db, granted.subscription.id);

  assert.equal(revoked.status, "canceled");
  assert.equal(revoked.cancelAtPeriodEnd, false);
  assert.equal(await openPeriodRow(db, granted.subscription.id), undefined);
});

test("the account read model reports usage, keys and purchased credit", async () => {
  const db = await fixture();
  const topup = await createTopup(db, {
    userId: "cust_1",
    amountMicros: 250_000,
  });
  const key = await createCustomerApiKey(db, "cust_1", "Live");

  await fulfillTopup(db, { topupId: topup.id, providerRef: "np_ref_4" });
  await db
    .prepare(
      `INSERT INTO usage_events
        (id, user_id, api_key_id, model_id, input_tokens, output_tokens,
         weighted_tokens, charged_micros, status, latency_ms, created_at)
       VALUES ('use_1', 'cust_1', ?, 'm1', 100, 50, 1, 40, 'ok', 12, ?)`,
    )
    .run(key.key.id, NOW);

  const account = await getCustomerAccount(db, {
    id: "cust_1",
    email: "one@example.test",
    name: "One",
    status: "active",
    createdAt: NOW,
  });

  assert.equal(account.account.creditMicros, 250_000);
  assert.equal(account.totalPurchasedMicros, 250_000);
  assert.equal(account.totalRequests, 1);
  assert.equal(account.totalTokens, 150);
  assert.equal(account.keys.length, 1);
  assert.equal(account.usage.length, 1);
  assert.equal(account.usage[0].chargedMicros, 40);
  assert.equal(account.topups.length, 1);
  assert.equal(account.ledger.length, 1);

  const summaries = await listCustomerSummaries(db);

  assert.equal(summaries.length, 2);
  assert.equal(
    summaries.find((row) => row.id === "cust_1").requestCount,
    1,
  );
  assert.equal(summaries.find((row) => row.id === "cust_1").keyCount, 1);
});
