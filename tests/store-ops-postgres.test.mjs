import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  getPolicyAcceptance,
  hasAcceptedPolicy,
  recordPolicyAcceptance,
} from "../lib/storage/store/policies.ts";
import {
  listSettlementState,
  openCallSettlement,
  releaseQuarantined,
} from "../lib/storage/store/settlements.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-30T12:00:00.000Z";
const LATER = "2026-10-30T12:10:00.000Z";

/**
 * Settlements and policy acceptance on the target engine.
 *
 * Both stores are evidence stores: one records that a call was admitted before
 * it was dispatched, the other records that a customer agreed to a version of
 * the terms. In both cases the value is the timestamp, so the tests are about
 * preservation — a settled call is not admitted twice, a released hold is
 * released once, and a repeat acceptance does not overwrite the agreement.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('u1', 'u1@example.test', 'Customer', 'active', ?)`,
    )
    .run(NOW);

  return db;
}

test("an admitted call is recorded before it is dispatched", async () => {
  const db = await fixture();

  const id = await openCallSettlement(
    db,
    {
      userId: "u1",
      keyId: "key_1",
      modelId: "model_1",
      providerSlug: "savant",
      billingSource: "credit",
      creditHoldId: "hold_1",
      freeReservationId: null,
      subscriptionHoldId: null,
      estimatedMicros: 1_500,
    },
    NOW,
  );

  assert.match(id, /^stl_/);

  const state = await listSettlementState(db, 10);
  const settlement = state.settlements.find((row) => row.id === id);

  assert.ok(settlement);
  assert.equal(settlement.status, "admitted");
  assert.equal(Number(settlement.estimated_micros), 1_500);
  assert.equal(settlement.billing_source, "credit");
  assert.equal(settlement.created_at, NOW);
});

test("a quarantined hold is released once, with a note", async () => {
  const db = await fixture();

  await db
    .prepare(
      `INSERT INTO quarantined_holds
        (id, kind, user_id, reserved, created_at, expired_at, status)
       VALUES ('hold_q1', 'credit', 'u1', 900, ?, ?, 'quarantined')`,
    )
    .run(NOW, LATER);

  assert.equal(
    await releaseQuarantined(db, "hold_q1", "Confirmed no upstream work", LATER),
    true,
  );

  const row = await db
    .prepare(
      "SELECT status, released_at, note FROM quarantined_holds WHERE id = ?",
    )
    .get("hold_q1");

  assert.equal(row.status, "released");
  assert.equal(row.released_at, LATER);
  assert.equal(row.note, "Confirmed no upstream work");

  assert.equal(
    await releaseQuarantined(db, "hold_q1", "again", LATER),
    false,
    "a second release is refused, so the reservation cannot be freed twice",
  );
});

test("an accepted policy is recorded and found", async () => {
  const db = await fixture();

  assert.equal(await hasAcceptedPolicy(db, "u1", "2026-10"), false);

  const accepted = await recordPolicyAcceptance(db, {
    userId: "u1",
    version: "2026-10",
    source: "signup",
    now: NOW,
  });

  assert.equal(accepted.version, "2026-10");
  assert.equal(accepted.source, "signup");
  assert.equal(accepted.acceptedAt, NOW);
  assert.equal(await hasAcceptedPolicy(db, "u1", "2026-10"), true);

  const found = await getPolicyAcceptance(db, "u1", "2026-10");

  assert.equal(found.id, accepted.id);
});

test("a repeat acceptance keeps the first agreement time", async () => {
  const db = await fixture();

  const first = await recordPolicyAcceptance(db, {
    userId: "u1",
    version: "2026-10",
    source: "signup",
    now: NOW,
  });
  const second = await recordPolicyAcceptance(db, {
    userId: "u1",
    version: "2026-10",
    source: "account",
    now: LATER,
  });

  assert.equal(
    second.id,
    first.id,
    "the same row is returned instead of a second one",
  );
  assert.equal(
    second.acceptedAt,
    NOW,
    "the timestamp is when the customer agreed, not when the form was resubmitted",
  );
  assert.equal(second.source, "signup");

  const rows = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM policy_acceptances WHERE user_id = ? AND version = ?",
    )
    .get("u1", "2026-10");

  assert.equal(Number(rows.total), 1);
});

test("a new version requires a new acceptance", async () => {
  const db = await fixture();

  await recordPolicyAcceptance(db, {
    userId: "u1",
    version: "2026-10",
    source: "signup",
    now: NOW,
  });

  assert.equal(await hasAcceptedPolicy(db, "u1", "2026-11"), false);

  await recordPolicyAcceptance(db, {
    userId: "u1",
    version: "2026-11",
    source: "account",
    now: LATER,
  });

  assert.equal(await hasAcceptedPolicy(db, "u1", "2026-11"), true);
  assert.equal(await hasAcceptedPolicy(db, "u1", "2026-10"), true);
});
