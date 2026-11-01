import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { reserveCredit } from "../lib/storage/store/credit.ts";
import { openCallSettlement } from "../lib/storage/store/settlements.ts";
import { streamCompletion } from "../lib/storage/gateway/stream.ts";
import { usagePrices } from "../lib/gateway-usage.ts";
import { balanceAudit } from "../lib/storage/ledger/invariants.ts";
import { reconcileDatabase } from "../lib/storage/ledger/reconciliation.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";
const USER = "u1";
const KEY = "key_1";
const MODEL_ID = "m1";

/**
 * End-to-end gateway money path on the target engine (FID-086, Batch B).
 *
 * This composes the real pieces in the order the route uses them — reserve
 * credit, open the durable settlement, relay the stream, settle — and then asks
 * the project's own reconciliation what the database thinks. Nothing here writes
 * a usage row or a ledger row by hand: if admission, settlement and
 * reconciliation disagree, the disagreement is in the code, not the fixture.
 *
 * Two calls are made on purpose. The first is billed from the provider's
 * reported usage, the second from the local estimate, so the reconciliation
 * covers both cost paths. The model's prices are whole numbers of micros per
 * token pair so the expected charge is exact rather than approximate.
 */

const MODEL = {
  id: MODEL_ID,
  upstreamId: "upstream-m1",
  upstreamSlug: "savant",
  name: "Model",
  groupSlug: "paid",
  billingMode: "paid",
  tokenWeight: 1,
  inCatalog: true,
  status: "active",
  costSource: "manual",
  costInputMicros: 600_000,
  costOutputMicros: 900_000,
  sellInputMicros: 1_000_000,
  sellOutputMicros: 2_000_000,
};

const HOLD_MICROS = 50_000;
const OPENING_CREDIT = 2_000_000;

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at, credit_micros, held_micros)
       VALUES (?, 'u1@example.test', 'One', 'active', ?, ?, 0)`,
    )
    .run(USER, NOW, OPENING_CREDIT);
  // Credit never appears without a ledger row that explains it, so the opening
  // balance is seeded the way a real grant writes it. Without this the audit is
  // correct to report a mismatch.
  await db
    .prepare(
      `INSERT INTO credit_ledger
        (id, user_id, kind, amount_micros, balance_after_micros, note, created_at)
       VALUES ('ledger_opening', ?, 'grant', ?, ?, 'Opening grant', ?)`,
    )
    .run(USER, OPENING_CREDIT, OPENING_CREDIT, NOW);
  await db
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES (?, ?, 'Key', 'sk_test', 'hash_1', 'active', ?)`,
    )
    .run(KEY, USER, NOW);
  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, upstream_slug, name, provider, context_window,
         token_weight, in_catalog, group_slug, status, sort_order, synced_at,
         sell_input_micros, sell_output_micros, input_price_micros,
         output_price_micros)
       VALUES (?, 'upstream-m1', 'savant', 'Model', 'Family', '8k', 1, 1,
               'paid', 'active', 0, ?, ?, ?, ?, ?)`,
    )
    .run(MODEL_ID, NOW, 1_000_000n.toString(), 2_000_000n.toString(), "600000", "900000");

  return db;
}

function sse(...lines) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${line}\n\n`));
        }

        controller.close();
      },
    }),
    { status: 200 },
  );
}

function context(settlementId, hold) {
  return {
    auth: { userId: USER, keyId: KEY },
    model: MODEL,
    hold,
    freeReservation: null,
    subscription: null,
    startedAt: Date.now(),
    promptTokens: 10,
    settlementId,
  };
}

/** One admitted, streamed call. Returns the settlement id and its hold. */
async function streamedCall(db, upstream) {
  const hold = await reserveCredit(db, {
    userId: USER,
    keyId: KEY,
    modelId: MODEL_ID,
    holdMicros: HOLD_MICROS,
  });

  assert.ok(hold, "the balance must cover the hold");

  const settlementId = await openCallSettlement(
    db,
    {
      userId: USER,
      keyId: KEY,
      modelId: MODEL_ID,
      providerSlug: "savant",
      billingSource: "credit",
      creditHoldId: hold.id,
      freeReservationId: null,
      subscriptionHoldId: null,
      estimatedMicros: hold.holdMicros,
    },
    NOW,
  );

  const response = streamCompletion(db, upstream, context(settlementId, hold));
  const body = await response.text();

  assert.match(body, /\[DONE\]/, "the terminator is forwarded after settlement");

  return { settlementId, hold };
}

test("an admitted, streamed call settles and the database reconciles", async () => {
  const db = await fixture();

  try {
    // 1. Billed from the provider's own usage report.
    const reported = await streamedCall(
      db,
      sse(
        `data: {"choices":[{"delta":{"content":"hello"}}]}`,
        `data: {"choices":[],"usage":{"prompt_tokens":1200,"completion_tokens":450}}`,
        "data: [DONE]",
      ),
    );

    // 2. Billed from the local estimate, because the provider reported nothing.
    const estimated = await streamedCall(
      db,
      sse(
        `data: {"choices":[{"delta":{"content":"hello world"}}]}`,
        "data: [DONE]",
      ),
    );

    const events = await db
      .prepare(
        `SELECT status, charged_micros, billing_source, estimated, usage_source
           FROM usage_events ORDER BY created_at ASC, id ASC`,
      )
      .all();

    assert.equal(events.length, 2, "one usage row per admitted call");
    assert.ok(events.every((event) => event.status === "ok"));
    assert.ok(events.every((event) => event.billing_source === "credit"));

    const expectedReported = usagePrices(MODEL, 1_200, 450).chargedMicros;

    assert.equal(
      Number(events[0].charged_micros),
      expectedReported,
      "the reported usage sets the charge",
    );
    assert.ok(
      Number(events[1].charged_micros) > 0,
      "the estimate is still billed",
    );
    assert.equal(Number(events[1].estimated), 1);
    assert.equal(events[1].usage_source, "estimated");

    const totalCharged =
      Number(events[0].charged_micros) + Number(events[1].charged_micros);

    // Admission released both holds; only settlement moves credit.
    const holds = await db.prepare("SELECT COUNT(*) AS n FROM credit_holds").get();
    const user = await db
      .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
      .get(USER);

    assert.equal(Number(holds.n), 0);
    assert.equal(Number(user.held_micros), 0);
    assert.equal(
      Number(user.credit_micros),
      OPENING_CREDIT - totalCharged,
      "credit moved by exactly the charged total",
    );

    const settled = await db
      .prepare(
        "SELECT id, status FROM settlements ORDER BY created_at ASC, id ASC",
      )
      .all();

    assert.equal(settled.length, 2);
    assert.ok(settled.every((row) => row.status === "committed"));
    assert.deepEqual(
      settled.map((row) => row.id).sort(),
      [reported.settlementId, estimated.settlementId].sort(),
      "each admitted call has its own committed settlement",
    );

    // The ledger's shape: one negative row per call, and its sum is the debits.
    const ledger = await db
      .prepare(
        `SELECT kind, SUM(amount_micros) AS amount
           FROM credit_ledger WHERE user_id = ? GROUP BY kind`,
      )
      .all(USER);

    const usageRows = ledger.filter((row) => row.kind === "usage");

    assert.equal(usageRows.length, 1);
    assert.equal(Number(usageRows[0].amount), -totalCharged);

    const audit = await balanceAudit(db);

    assert.deepEqual(audit.mismatches, [], "balances reconstruct from the ledger");

    // The project's own reconciliation, not a re-implementation of it.
    const report = await reconcileDatabase(db);
    const account = report.accounts.find((entry) => entry.userId === USER);

    assert.ok(account);
    assert.equal(account.balanceMicros, OPENING_CREDIT - totalCharged);
    assert.equal(
      account.ledgerMicros,
      OPENING_CREDIT - totalCharged,
      "the ledger column sums every entry, including the opening grant",
    );
    assert.equal(account.differenceMicros, 0);
    assert.equal(account.balanced, true);
    assert.equal(report.totals.usageDebitsMicros, totalCharged);
    assert.equal(report.totals.heldMicros, 0);
    assert.equal(report.totals.balanced, true, "no account disagrees");
  } finally {
    await db.close();
  }
});

test("a stream that fails mid-flight still reconciles", async () => {
  const db = await fixture();
  const encoder = new TextEncoder();

  try {
    const hold = await reserveCredit(db, {
      userId: USER,
      keyId: KEY,
      modelId: MODEL_ID,
      holdMicros: HOLD_MICROS,
    });

    assert.ok(hold);

    const settlementId = await openCallSettlement(
      db,
      {
        userId: USER,
        keyId: KEY,
        modelId: MODEL_ID,
        providerSlug: "savant",
        billingSource: "credit",
        creditHoldId: hold.id,
        freeReservationId: null,
        subscriptionHoldId: null,
        estimatedMicros: hold.holdMicros,
      },
      NOW,
    );

    const upstream = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: {"choices":[{"delta":{"content":"partial"}}]}\n\n`,
            ),
          );
          controller.error(new Error("upstream reset"));
        },
      }),
      { status: 200 },
    );
    const response = streamCompletion(db, upstream, context(settlementId, hold));

    await assert.rejects(() => response.text());

    const event = await db
      .prepare("SELECT status, charged_micros, error FROM usage_events")
      .get();

    assert.equal(event.status, "error");
    assert.match(event.error, /interrupted/);

    const settlement = await db
      .prepare("SELECT status FROM settlements WHERE id = ?")
      .get(settlementId);

    assert.equal(settlement.status, "committed");

    const user = await db
      .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
      .get(USER);

    assert.equal(Number(user.held_micros), 0, "the failed call's hold is freed");
    assert.equal(
      Number(user.credit_micros),
      OPENING_CREDIT - Number(event.charged_micros),
    );

    const report = await reconcileDatabase(db);

    assert.equal(report.totals.balanced, true);
    assert.equal(
      report.totals.usageDebitsMicros,
      Number(event.charged_micros),
      "the failed call's partial usage is the only debit",
    );
  } finally {
    await db.close();
  }
});
