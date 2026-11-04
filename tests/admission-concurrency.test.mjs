import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { createPostgresPool } from "../lib/storage/pg-pool.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";
import {
  acquireSharedProviderAdmission,
  takeSharedCompletionRate,
} from "../lib/storage/admission.ts";
import { servingAccountId } from "../lib/provider-admission.ts";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();

/**
 * The two-connection shared-admission proof (FID-2026-1104-004).
 *
 * PGlite has one connection, so the ordinary suite can only prove the decision
 * model. This file runs only when the mandatory `npm run test:postgres` gate
 * supplies a disposable database, and it fails closed there.
 */
function handles() {
  return [
    createPostgresDatabase({
      pool: createPostgresPool({
        connectionString: TEST_DATABASE_URL,
        applicationName: "admission_a",
      }),
    }),
    createPostgresDatabase({
      pool: createPostgresPool({
        connectionString: TEST_DATABASE_URL,
        applicationName: "admission_b",
      }),
    }),
  ];
}

test("two connections cannot both take the last provider slot", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip(
      "TEST_DATABASE_URL is required for the shared provider admission race",
    );

    return;
  }

  const [first, second] = handles();
  const provider = {
    baseUrl: `https://admission-${randomUUID()}.example.test/v1`,
    keyEnvVar: "ADMISSION_KEY",
  };
  const accountId = servingAccountId(provider);
  const config = { configuredRpm: null, concurrency: 1 };

  try {
    await migrateDatabase(first);

    const outcomes = await Promise.all([
      acquireSharedProviderAdmission(first, {
        provider,
        observedRpm: 1,
        config,
        now: 1_000,
      }),
      acquireSharedProviderAdmission(second, {
        provider,
        observedRpm: 1,
        config,
        now: 1_000,
      }),
    ]);
    const granted = outcomes.filter((outcome) => outcome.ok);
    const refused = outcomes.filter((outcome) => !outcome.ok);

    assert.equal(granted.length, 1, "exactly one provider slot may be granted");
    assert.equal(refused.length, 1, "the competing instance must be refused");
    assert.ok(
      ["rpm", "concurrency"].includes(refused[0].reason),
      `unexpected refusal: ${refused[0].reason}`,
    );

    for (const lease of granted) await lease.release();
  } finally {
    if (accountId) {
      await first
        .prepare(
          "DELETE FROM admission_leases WHERE scope = 'provider' AND bucket_key = ?",
        )
        .run(accountId)
        .catch(() => undefined);
      await first
        .prepare(
          "DELETE FROM admission_buckets WHERE scope = 'provider' AND bucket_key = ?",
        )
        .run(accountId)
        .catch(() => undefined);
    }
    await first.close();
    await second.close();
  }
});

test("two connections cannot both spend the last completion token", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip(
      "TEST_DATABASE_URL is required for the shared completion admission race",
    );

    return;
  }

  const [first, second] = handles();
  const userId = `admission_${randomUUID()}`;
  const bucketKey = `paid:${userId}`;
  const config = { freeSharedRpm: 10, paidKeyRpm: 1 };

  try {
    await migrateDatabase(first);

    const outcomes = await Promise.all([
      takeSharedCompletionRate(first, {
        keyId: "key-a",
        userId,
        free: false,
        config,
        now: 2_000,
      }),
      takeSharedCompletionRate(second, {
        keyId: "key-b",
        userId,
        free: false,
        config,
        now: 2_000,
      }),
    ]);

    assert.equal(
      outcomes.filter((outcome) => outcome.allowed).length,
      1,
      "exactly one completion token may be spent",
    );
    assert.equal(
      outcomes.filter((outcome) => !outcome.allowed).length,
      1,
      "the competing instance must be refused",
    );
  } finally {
    await first
      .prepare(
        "DELETE FROM admission_buckets WHERE scope = 'completion' AND bucket_key = ?",
      )
      .run(bucketKey)
      .catch(() => undefined);
    await first.close();
    await second.close();
  }
});
