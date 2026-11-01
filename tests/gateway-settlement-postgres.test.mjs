import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { openCallSettlement } from "../lib/storage/store/settlements.ts";
import { settleCall } from "../lib/storage/gateway/settle.ts";
import { streamCompletion } from "../lib/storage/gateway/stream.ts";
import { usagePrices } from "../lib/gateway-usage.ts";
import { estimatedUsage, resolveUsage } from "../lib/usage.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";
const USER = "u1";
const KEY = "key_1";

/**
 * The money path on the target engine (FID-086, Batch B).
 *
 * These tests exist to prove the three promises settlement makes, because each
 * one failing costs real money:
 *
 * 1. One admitted call settles once — a replay writes nothing and debits nothing.
 * 2. The debit, its ledger row, the hold release, the allowance move and the
 *    usage row commit together, so the ledger's running balance always equals
 *    the balance the customer is shown.
 * 3. A stream that ends without its terminator is a failure, not a completed
 *    answer, and is settled as one.
 *
 * Every admission below takes the id `openCallSettlement` returns. Hard-coding
 * one would have made every settlement a replay of a row that does not exist.
 */
async function fixture(options = {}) {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at, credit_micros, held_micros)
       VALUES (?, 'u1@example.test', 'One', 'active', ?, ?, ?)`,
    )
    .run(USER, NOW, options.credit ?? 1_000_000, options.held ?? 0);
  await db
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES (?, ?, 'Key', 'sk_test', 'hash_1', 'active', ?)`,
    )
    .run(KEY, USER, NOW);

  return db;
}

function model(overrides = {}) {
  return {
    id: "m1",
    upstreamId: "upstream-m1",
    upstreamSlug: "savant",
    name: "Model",
    groupSlug: "paid",
    billingMode: "paid",
    tokenWeight: 1,
    inCatalog: true,
    status: "active",
    costSource: "manual",
    costInputMicros: 400,
    costOutputMicros: 800,
    sellInputMicros: 500,
    sellOutputMicros: 1_000,
    ...overrides,
  };
}

function context(settlementId, overrides = {}) {
  return {
    auth: { userId: USER, keyId: KEY },
    model: model(),
    hold: null,
    freeReservation: null,
    subscription: null,
    startedAt: Date.now(),
    promptTokens: 10,
    settlementId,
    ...overrides,
  };
}

async function admit(db, overrides = {}) {
  return openCallSettlement(
    db,
    {
      userId: USER,
      keyId: KEY,
      modelId: "m1",
      providerSlug: "savant",
      billingSource: "credit",
      creditHoldId: null,
      freeReservationId: null,
      subscriptionHoldId: null,
      estimatedMicros: 0,
      ...overrides,
    },
    NOW,
  );
}

const usage = (inputTokens, outputTokens) =>
  resolveUsage({
    usage: null,
    fallbackInputTokens: inputTokens,
    fallbackOutputTokens: outputTokens,
  });

test("a credit settlement debits once and keeps the ledger reconciled", async () => {
  const db = await fixture({ credit: 1_000_000, held: 5_000 });

  try {
    await db
      .prepare(
        `INSERT INTO credit_holds
          (id, user_id, api_key_id, model_id, hold_micros, created_at, expires_at)
         VALUES ('hold_1', ?, ?, 'm1', 5000, ?, ?)`,
      )
      .run(USER, KEY, NOW, "2026-10-31T12:15:00.000Z");
    const settlementId = await admit(db, {
      creditHoldId: "hold_1",
      estimatedMicros: 5_000,
    });

    const charged = await settleCall(
      db,
      context(settlementId, { hold: { id: "hold_1", holdMicros: 5_000 } }),
      usage(1_000, 500),
      "ok",
    );

    const expected = usagePrices(model(), 1_000, 500).chargedMicros;

    assert.equal(charged, expected);
    assert.ok(charged > 0);

    const user = await db
      .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
      .get(USER);

    assert.equal(Number(user.credit_micros), 1_000_000 - expected);
    assert.equal(Number(user.held_micros), 0, "the hold is released");

    const holds = await db.prepare("SELECT COUNT(*) AS n FROM credit_holds").get();

    assert.equal(Number(holds.n), 0);

    const ledger = await db
      .prepare("SELECT * FROM credit_ledger WHERE user_id = ?")
      .all(USER);

    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].kind, "usage");
    assert.equal(Number(ledger[0].amount_micros), -expected);
    assert.equal(
      Number(ledger[0].balance_after_micros),
      Number(user.credit_micros),
      "the ledger's running balance is the balance the customer sees",
    );

    const event = await db
      .prepare("SELECT * FROM usage_events WHERE user_id = ?")
      .get(USER);

    assert.equal(event.status, "ok");
    assert.equal(event.billing_source, "credit");
    assert.equal(Number(event.charged_micros), expected);
    assert.equal(Number(event.input_tokens), 1_000);

    const settlement = await db
      .prepare("SELECT status FROM settlements WHERE id = ?")
      .get(settlementId);

    assert.equal(settlement.status, "committed");
  } finally {
    await db.close();
  }
});

test("a replayed settlement writes nothing and debits nothing", async () => {
  const db = await fixture();

  try {
    const settlementId = await admit(db);
    // Large enough that the micro-dollar price rounds to a real charge.
    const first = await settleCall(
      db,
      context(settlementId),
      usage(10_000, 5_000),
      "ok",
    );
    const second = await settleCall(
      db,
      context(settlementId),
      usage(10_000, 5_000),
      "ok",
    );

    assert.ok(first > 0);
    assert.equal(second, 0, "a duplicate callback is a no-op");

    const events = await db.prepare("SELECT COUNT(*) AS n FROM usage_events").get();

    assert.equal(Number(events.n), 1);

    const user = await db
      .prepare("SELECT credit_micros FROM users WHERE id = ?")
      .get(USER);

    assert.equal(Number(user.credit_micros), 1_000_000 - first, "debited once");
  } finally {
    await db.close();
  }
});

test("a free reservation settles its weighted usage and charges nothing", async () => {
  const db = await fixture();
  const freeModel = model({
    billingMode: "free",
    tokenWeight: 2,
    sellInputMicros: 0,
    sellOutputMicros: 0,
  });
  const reservation = { id: "free_1", day: "2026-10-31", weightedTokens: 500 };

  try {
    await db
      .prepare(
        `INSERT INTO trial_grants (user_id, granted_tokens, used_tokens, issued_at)
         VALUES (?, 50000, 0, ?)`,
      )
      .run(USER, NOW);
    await db
      .prepare(
        `INSERT INTO free_pool_reservations
          (id, user_id, api_key_id, model_id, provider_slug, day,
           weighted_tokens, created_at, expires_at)
         VALUES ('free_1', ?, ?, 'm1', 'savant', '2026-10-31', 500, ?, ?)`,
      )
      .run(USER, KEY, NOW, "2026-10-31T12:15:00.000Z");
    await db
      .prepare(
        `INSERT INTO trial_reservations
          (id, user_id, reserved_tokens, created_at, expires_at)
         VALUES ('free_1', ?, 500, ?, ?)`,
      )
      .run(USER, NOW, "2026-10-31T12:15:00.000Z");
    const settlementId = await admit(db, {
      billingSource: "free",
      freeReservationId: "free_1",
    });

    const charged = await settleCall(
      db,
      context(settlementId, { model: freeModel, freeReservation: reservation }),
      usage(1_000, 500),
      "ok",
    );

    assert.equal(charged, 0, "a free call never touches the wallet");

    const pool = await db
      .prepare(
        "SELECT weighted_tokens FROM free_pool_usage WHERE user_id = ? AND day = '2026-10-31'",
      )
      .get(USER);

    assert.equal(Number(pool.weighted_tokens), 3_000, "(1000 + 500) × weight 2");

    const held = await db
      .prepare("SELECT COUNT(*) AS n FROM free_pool_reservations")
      .get();

    assert.equal(Number(held.n), 0);

    const trial = await db
      .prepare(
        "SELECT settled_at, actual_tokens FROM trial_reservations WHERE id = 'free_1'",
      )
      .get();

    assert.ok(trial.settled_at);
    assert.equal(Number(trial.actual_tokens), 3_000);

    const grant = await db
      .prepare("SELECT used_tokens FROM trial_grants WHERE user_id = ?")
      .get(USER);

    assert.equal(Number(grant.used_tokens), 3_000, "the grant counts the usage");

    const user = await db
      .prepare("SELECT credit_micros FROM users WHERE id = ?")
      .get(USER);

    assert.equal(Number(user.credit_micros), 1_000_000);

    const replay = await settleCall(
      db,
      context(settlementId, { model: freeModel, freeReservation: reservation }),
      usage(1_000, 500),
      "ok",
    );

    assert.equal(replay, 0);
  } finally {
    await db.close();
  }
});

test("an included subscription call moves the hold into used and bills nothing", async () => {
  const db = await fixture();

  try {
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
        `INSERT INTO subscriptions
          (id, user_id, plan_id, status, source, plan_name_snapshot,
           price_micros_snapshot, currency_snapshot, interval_snapshot,
           included_weighted_tokens_snapshot, overage_mode_snapshot,
           overage_markup_bps_snapshot, current_period_start, current_period_end,
           created_at, updated_at)
         VALUES ('sub_1', ?, 'plan_1', 'active', 'manual', 'Starter', 9990000,
                 'usd', 'month', 10000, 'block', 0, ?, ?, ?, ?)`,
      )
      .run(USER, NOW, "2026-11-30T12:00:00.000Z", NOW, NOW);
    await db
      .prepare(
        `INSERT INTO subscription_periods
          (id, subscription_id, period_start, period_end,
           included_weighted_tokens, weighted_tokens_used,
           weighted_tokens_held, status, created_at)
         VALUES ('period_1', 'sub_1', ?, ?, 10000, 0, 300, 'open', ?)`,
      )
      .run(NOW, "2026-11-30T12:00:00.000Z", NOW);
    await db
      .prepare(
        `INSERT INTO subscription_holds
          (id, subscription_id, period_id, user_id, api_key_id, model_id,
           weighted_tokens, created_at, expires_at)
         VALUES ('subhold_1', 'sub_1', 'period_1', ?, ?, 'm1', 300, ?, ?)`,
      )
      .run(USER, KEY, NOW, "2026-10-31T12:15:00.000Z");
    const settlementId = await admit(db, {
      billingSource: "subscription",
      subscriptionHoldId: "subhold_1",
    });

    const charged = await settleCall(
      db,
      context(settlementId, {
        subscription: {
          kind: "included",
          subscriptionId: "sub_1",
          periodId: "period_1",
          holdId: "subhold_1",
          markupBps: 0,
        },
      }),
      usage(1_000, 500),
      "ok",
    );

    assert.equal(charged, 0, "included usage does not debit credit");

    const period = await db
      .prepare(
        "SELECT weighted_tokens_held, weighted_tokens_used FROM subscription_periods WHERE id = 'period_1'",
      )
      .get();

    assert.equal(Number(period.weighted_tokens_held), 0);
    assert.equal(Number(period.weighted_tokens_used), 1_500);

    const event = await db
      .prepare("SELECT billing_source, included_weighted_tokens FROM usage_events")
      .get();

    assert.equal(event.billing_source, "subscription");
    assert.equal(Number(event.included_weighted_tokens), 1_500);

    const holds = await db
      .prepare("SELECT COUNT(*) AS n FROM subscription_holds")
      .get();

    assert.equal(Number(holds.n), 0);
  } finally {
    await db.close();
  }
});

test("a stream settles on completion and bills the provider's usage", async () => {
  const db = await fixture();
  const encoder = new TextEncoder();

  try {
    const settlementId = await admit(db);
    const upstream = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: {"choices":[{"delta":{"content":"hello"}}]}\n\n`,
            ),
          );
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        },
      }),
      { status: 200 },
    );
    const response = streamCompletion(db, upstream, context(settlementId));
    const body = await response.text();

    assert.match(body, /\[DONE\]/, "the terminator is forwarded after settlement");

    const event = await db
      .prepare("SELECT status, output_tokens FROM usage_events")
      .get();

    assert.equal(event.status, "ok");
    assert.ok(Number(event.output_tokens) > 0, "the estimate covers the text");

    const settlement = await db
      .prepare("SELECT status FROM settlements WHERE id = ?")
      .get(settlementId);

    assert.equal(settlement.status, "committed");
  } finally {
    await db.close();
  }
});

test("a stream that ends without a terminator settles as an error", async () => {
  const db = await fixture();
  const encoder = new TextEncoder();

  try {
    const settlementId = await admit(db);
    const upstream = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: {"choices":[{"delta":{"content":"par"}}]}\n\n`,
            ),
          );
          controller.close();
        },
      }),
      { status: 200 },
    );
    const response = streamCompletion(db, upstream, context(settlementId));

    await assert.rejects(() => response.text());

    const event = await db
      .prepare("SELECT status, error FROM usage_events")
      .get();

    assert.equal(event.status, "error");
    assert.match(event.error, /interrupted/);

    const settlement = await db
      .prepare("SELECT status FROM settlements WHERE id = ?")
      .get(settlementId);

    assert.equal(
      settlement.status,
      "committed",
      "the failure is recorded, not left admitted",
    );
  } finally {
    await db.close();
  }
});

test("an empty estimated usage is not fabricated into a charge", async () => {
  const db = await fixture();

  try {
    const settlementId = await admit(db);
    const charged = await settleCall(
      db,
      context(settlementId),
      estimatedUsage(0, 0),
      "error",
      { error: "provider unreachable" },
    );

    assert.equal(charged, 0, "no tokens, no charge");

    const event = await db
      .prepare("SELECT status, charged_micros, usage_source FROM usage_events")
      .get();

    assert.equal(event.status, "error");
    assert.equal(Number(event.charged_micros), 0);
    assert.equal(
      event.usage_source,
      null,
      "a failure with no provider counts is not labelled",
    );

    const ledger = await db.prepare("SELECT COUNT(*) AS n FROM credit_ledger").get();

    assert.equal(Number(ledger.n), 0);
  } finally {
    await db.close();
  }
});
