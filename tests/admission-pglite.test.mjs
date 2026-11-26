import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  acquireSharedProviderAdmission,
  takeSharedCompletionRate,
} from "../lib/storage/admission.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const provider = {
  baseUrl: "https://shared.example.test/v1",
  keyEnvVar: "SHARED_KEY",
};

async function fixture() {
  const { pool } = await createPgliteDatabase();

  return createStorageDatabase({ env: {}, pool });
}

test("one provider bucket and one lease set hold the ceiling", async () => {
  const db = await fixture();

  try {
    const config = { configuredRpm: null, concurrency: 1 };
    const first = await acquireSharedProviderAdmission(db, {
      provider,
      observedRpm: 60,
      config,
      now: 0,
    });

    assert.equal(first.ok, true);
    if (!first.ok) return;

    const refused = await acquireSharedProviderAdmission(db, {
      provider,
      observedRpm: 60,
      config,
      now: 0,
    });

    assert.equal(refused.ok, false);
    if (refused.ok) return;
    assert.equal(refused.reason, "concurrency");
    assert.equal(refused.inFlight, 1);

    await first.release();
    await first.release();

    const reacquired = await acquireSharedProviderAdmission(db, {
      provider,
      observedRpm: 60,
      config,
      now: 0,
    });

    assert.equal(reacquired.ok, true);
    if (reacquired.ok) await reacquired.release();
  } finally {
    await db.close();
  }
});

test("an expired lease frees capacity without a sweeper", async () => {
  const db = await fixture();

  try {
    const config = { configuredRpm: null, concurrency: 1 };
    const first = await acquireSharedProviderAdmission(db, {
      provider,
      observedRpm: 60,
      config,
      now: 0,
    });

    assert.equal(first.ok, true);

    // Deliberately not released: the acquire at TTL + 1 must reclaim it.
    const later = await acquireSharedProviderAdmission(db, {
      provider,
      observedRpm: 60,
      config,
      now: 330_001,
    });

    assert.equal(later.ok, true);
    if (later.ok) await later.release();
  } finally {
    await db.close();
  }
});

test("paid completion tokens are per customer, not per key", async () => {
  const db = await fixture();

  try {
    const config = { paidKeyRpm: 1 };
    const alphaA = await takeSharedCompletionRate(db, {
      keyId: "a1",
      userId: "alpha",
      config,
      now: 0,
    });
    const alphaB = await takeSharedCompletionRate(db, {
      keyId: "a2",
      userId: "alpha",
      config,
      now: 0,
    });
    const beta = await takeSharedCompletionRate(db, {
      keyId: "b1",
      userId: "beta",
      config,
      now: 0,
    });

    assert.equal(alphaA.allowed, true);
    assert.equal(alphaB.allowed, false);
    assert.equal(beta.allowed, true);
  } finally {
    await db.close();
  }
});
