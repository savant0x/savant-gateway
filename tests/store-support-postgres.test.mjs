import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  countOpenSupportRequests,
  createSupportRequest,
  getSupportRequest,
  listSupportRequests,
  listSupportRequestsForUser,
  resolveSupportRequest,
} from "../lib/storage/store/support.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-30T12:00:00.000Z";
const EARLIER = "2026-10-30T10:00:00.000Z";

/**
 * Support on the target engine.
 *
 * The ordering rules are the point: the operator queue surfaces open requests
 * first so an unresolved customer is never buried under resolved history, while
 * a customer's own list stays chronological. Both rely on `created_at` being
 * treated as a timestamp rather than text, which is what the explicit cast
 * guarantees.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('u1', 'u1@example.test', 'Customer One', 'active', ?),
              ('u2', 'u2@example.test', 'Customer Two', 'active', ?)`,
    )
    .run(NOW, NOW);

  return db;
}

test("a new request is open and joins its customer", async () => {
  const db = await fixture();

  const created = await createSupportRequest(db, {
    userId: "u1",
    kind: "billing",
    subject: "Charged twice",
    message: "Two holds appeared for one call.",
    now: NOW,
  });

  assert.ok(created);
  assert.equal(created.status, "open");
  assert.equal(created.customerName, "Customer One");
  assert.equal(created.customerEmail, "u1@example.test");
  assert.equal(created.resolvedAt, null);
  assert.equal(created.resolutionNote, null);
  assert.match(created.id, /^support_/);
});

test("an unknown request reads as null", async () => {
  const db = await fixture();

  assert.equal(await getSupportRequest(db, "support_missing"), null);
  assert.equal(await resolveSupportRequest(db, "support_missing", "done"), null);
});

test("a customer's own history is newest first", async () => {
  const db = await fixture();

  await createSupportRequest(db, {
    userId: "u1",
    kind: "billing",
    subject: "Older",
    message: "First",
    now: EARLIER,
  });
  await createSupportRequest(db, {
    userId: "u1",
    kind: "api",
    subject: "Newer",
    message: "Second",
    now: NOW,
  });
  await createSupportRequest(db, {
    userId: "u2",
    kind: "account",
    subject: "Theirs",
    message: "Not mine",
    now: NOW,
  });

  const mine = await listSupportRequestsForUser(db, "u1");

  assert.deepEqual(
    mine.map((request) => request.subject),
    ["Newer", "Older"],
  );
});

test("the operator queue lists open requests before resolved ones", async () => {
  const db = await fixture();

  const oldOpen = await createSupportRequest(db, {
    userId: "u1",
    kind: "billing",
    subject: "Still open",
    message: "Waiting",
    now: EARLIER,
  });
  const recentResolved = await createSupportRequest(db, {
    userId: "u1",
    kind: "api",
    subject: "Already resolved",
    message: "Done",
    now: NOW,
  });

  assert.ok(oldOpen);
  assert.ok(recentResolved);
  await resolveSupportRequest(db, recentResolved.id, "Explained", NOW);

  const queue = await listSupportRequests(db, 10);

  assert.deepEqual(
    queue.map((request) => request.status),
    ["open", "resolved"],
    "an open request outranks a more recent resolved one",
  );
});

test("resolving records the note and the time", async () => {
  const db = await fixture();
  const created = await createSupportRequest(db, {
    userId: "u1",
    kind: "billing",
    subject: "Charged twice",
    message: "Two holds.",
    now: EARLIER,
  });

  const resolved = await resolveSupportRequest(
    db,
    created.id,
    "Refunded the duplicate hold",
    NOW,
  );

  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolutionNote, "Refunded the duplicate hold");
  assert.equal(resolved.resolvedAt, NOW);
  assert.equal(resolved.updatedAt, NOW);
});

test("only open requests are counted", async () => {
  const db = await fixture();

  const first = await createSupportRequest(db, {
    userId: "u1",
    kind: "billing",
    subject: "One",
    message: "…",
    now: EARLIER,
  });
  await createSupportRequest(db, {
    userId: "u2",
    kind: "api",
    subject: "Two",
    message: "…",
    now: NOW,
  });

  assert.equal(await countOpenSupportRequests(db), 2);

  await resolveSupportRequest(db, first.id, "Handled", NOW);

  assert.equal(await countOpenSupportRequests(db), 1);
});
