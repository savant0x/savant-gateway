import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { createPostgresPool } from "../lib/storage/pg-pool.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";
import {
  claimPaymentEvent,
  CLAIM_GRACE_MS,
  completePaymentEvent,
  processPaymentEvent,
} from "../lib/storage/ledger/payment-events.ts";
import { activateSubscription } from "../lib/storage/store/subscription-lifecycle.ts";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const NOW_MS = Date.parse("2026-11-05T12:00:00.000Z");
const NOW = new Date(NOW_MS).toISOString();
const LATER = new Date(NOW_MS + CLAIM_GRACE_MS + 1).toISOString();

function handles(suffix) {
  return [
    createPostgresDatabase({
      pool: createPostgresPool({
        connectionString: TEST_DATABASE_URL,
        applicationName: `payment_claim_${suffix}_a`,
      }),
    }),
    createPostgresDatabase({
      pool: createPostgresPool({
        connectionString: TEST_DATABASE_URL,
        applicationName: `payment_claim_${suffix}_b`,
      }),
    }),
  ];
}

function claim(db, id, overrides = {}) {
  return claimPaymentEvent(db, {
    id,
    type: "checkout.session.completed",
    livemode: true,
    expectedLivemode: null,
    now: NOW_MS,
    ...overrides,
  });
}

test("two connections cannot both claim the same event", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip("TEST_DATABASE_URL is required for the payment claim race");

    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const [first, second] = handles(suffix);
  const eventId = `evt_${suffix}`;

  try {
    await migrateDatabase(first);

    const outcomes = await Promise.all([
      claim(first, eventId),
      claim(second, eventId),
    ]);
    const granted = outcomes.filter((outcome) => outcome.ok);

    assert.equal(granted.length, 1);
    assert.equal(granted[0].attempt, 1);
    assert.equal(granted[0].generation, 1);
    assert.deepEqual(
      outcomes.find((outcome) => !outcome.ok),
      { ok: false, reason: "in_flight" },
    );

    const row = await first
      .prepare(
        "SELECT status, attempts, claim_generation FROM billing_events WHERE id = ?",
      )
      .get(eventId);

    assert.equal(row.status, "claimed");
    assert.equal(Number(row.attempts), 1);
    assert.equal(Number(row.claim_generation), 1);
  } finally {
    await first.prepare("DELETE FROM billing_events WHERE id = ?").run(eventId).catch(() => undefined);
    await first.close();
    await second.close();
  }
});

test("a reclaimed generation fences the old owner from effects and state", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip("TEST_DATABASE_URL is required for the stale-owner proof");

    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const [first, second] = handles(suffix);
  const eventId = `evt_stale_${suffix}`;
  let oldWorkRan = false;

  try {
    await migrateDatabase(first);

    const original = await claim(first, eventId);

    assert.ok(original.ok);

    const reclaimed = await claim(second, eventId, {
      now: NOW_MS + CLAIM_GRACE_MS + 1,
    });

    assert.ok(reclaimed.ok);
    assert.equal(reclaimed.generation, 2);

    const stale = await processPaymentEvent(
      first,
      { id: eventId, generation: original.generation },
      async () => {
        oldWorkRan = true;

        return { value: "stale" };
      },
    );

    assert.deepEqual(stale, { ok: false, reason: "lost_ownership" });
    assert.equal(oldWorkRan, false);

    const current = await processPaymentEvent(
      second,
      { id: eventId, generation: reclaimed.generation, at: LATER },
      async () => ({ value: "current" }),
    );

    assert.deepEqual(current, {
      ok: true,
      value: "current",
      quarantined: false,
    });

    const row = await first
      .prepare(
        "SELECT status, claim_generation FROM billing_events WHERE id = ?",
      )
      .get(eventId);

    assert.equal(row.status, "processed");
    assert.equal(Number(row.claim_generation), 2);
    assert.equal(
      await completePaymentEvent(first, eventId, 1, LATER),
      false,
      "a stale completion cannot overwrite the processed row",
    );
  } finally {
    await first.prepare("DELETE FROM billing_events WHERE id = ?").run(eventId).catch(() => undefined);
    await first.close();
    await second.close();
  }
});

test("a terminal event is not overwritten by an environment mismatch", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip("TEST_DATABASE_URL is required for the terminal mismatch proof");

    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const [first, second] = handles(suffix);
  const eventId = `evt_terminal_${suffix}`;

  try {
    await migrateDatabase(first);

    const original = await claim(first, eventId);

    assert.ok(original.ok);
    assert.equal(
      await completePaymentEvent(first, eventId, original.generation, LATER),
      true,
    );

    const mismatch = await claim(second, eventId, {
      livemode: false,
      expectedLivemode: true,
    });

    assert.deepEqual(mismatch, { ok: false, reason: "processed" });

    const row = await second
      .prepare(
        "SELECT status, last_error, claim_generation FROM billing_events WHERE id = ?",
      )
      .get(eventId);

    assert.equal(row.status, "processed");
    assert.equal(row.last_error, null);
    assert.equal(Number(row.claim_generation), 1);
  } finally {
    await first.prepare("DELETE FROM billing_events WHERE id = ?").run(eventId).catch(() => undefined);
    await first.close();
    await second.close();
  }
});

test("distinct events for one invoice serialize on the subscription", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip("TEST_DATABASE_URL is required for the invoice race");

    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const [first, second] = handles(suffix);
  const userId = `invoice_user_${suffix}`;
  const planId = `invoice_plan_${suffix}`;
  const subscriptionId = `invoice_sub_${suffix}`;
  const eventA = `evt_invoice_a_${suffix}`;
  const eventB = `evt_invoice_b_${suffix}`;
  const invoiceId = `in_shared_${suffix}`;

  try {
    await migrateDatabase(first);

    await first
      .prepare(
        `INSERT INTO users (id, email, name, status, created_at)
         VALUES (?, ?, 'Invoice', 'active', ?)`,
      )
      .run(userId, `${userId}@example.test`, NOW);
    await first
      .prepare(
        `INSERT INTO plans
          (id, slug, name, status, price_micros, currency, interval,
           included_weighted_tokens, overage_mode, overage_markup_bps,
           sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 'active', 1000, 'usd', 'month', 100,
                 'block', 0, 0, ?, ?)`,
      )
      .run(planId, planId, `Invoice ${suffix}`, NOW, NOW);
    await first
      .prepare(
        `INSERT INTO subscriptions
          (id, user_id, plan_id, status, source, plan_name_snapshot,
           price_micros_snapshot, currency_snapshot, interval_snapshot,
           included_weighted_tokens_snapshot, overage_mode_snapshot,
           overage_markup_bps_snapshot, current_period_start, current_period_end,
           created_at, updated_at)
         VALUES (?, ?, ?, 'incomplete', 'stripe', 'Invoice', 1000, 'usd',
                 'month', 100, 'block', 0, ?, '2026-12-05T12:00:00.000Z', ?, ?)`,
      )
      .run(subscriptionId, userId, planId, NOW, NOW, NOW);

    const claimA = await claim(first, eventA);
    const claimB = await claim(second, eventB);

    assert.ok(claimA.ok);
    assert.ok(claimB.ok);

    const work = (db, eventId, generation, periodStart) =>
      processPaymentEvent(
        db,
        { id: eventId, generation, at: LATER },
        async () => {
          const subscription = await activateSubscription(db, {
            subscriptionId,
            periodStart,
            periodEnd: "2026-12-05T12:00:00.000Z",
            invoice: {
              providerInvoiceId: invoiceId,
              amountMicros: 1000,
              currency: "usd",
              status: "paid",
              periodStart,
              periodEnd: "2026-12-05T12:00:00.000Z",
              paidAt: LATER,
            },
          });

          return { value: subscription };
        },
      );

    const outcomes = await Promise.all([
      work(first, eventA, claimA.generation, NOW),
      work(second, eventB, claimB.generation, NOW),
    ]);

    assert.ok(outcomes.every((outcome) => outcome.ok));

    const periods = await first
      .prepare(
        "SELECT COUNT(*)::int AS total FROM subscription_periods WHERE subscription_id = ?",
      )
      .get(subscriptionId);
    const invoices = await first
      .prepare(
        "SELECT COUNT(*)::int AS total FROM subscription_invoices WHERE provider_invoice_id = ?",
      )
      .get(invoiceId);
    const events = await first
      .prepare(
        "SELECT COUNT(*)::int AS total FROM billing_events WHERE id IN (?, ?) AND status = 'processed'",
      )
      .get(eventA, eventB);
    const subscription = await first
      .prepare("SELECT status FROM subscriptions WHERE id = ?")
      .get(subscriptionId);

    assert.equal(Number(periods.total), 1);
    assert.equal(Number(invoices.total), 1);
    assert.equal(Number(events.total), 2);
    assert.equal(subscription.status, "active");
  } finally {
    await first
      .prepare("DELETE FROM users WHERE id = ?")
      .run(userId)
      .catch(() => undefined);
    await first
      .prepare("DELETE FROM billing_events WHERE id IN (?, ?)")
      .run(eventA, eventB)
      .catch(() => undefined);
    await first.close();
    await second.close();
  }
});
