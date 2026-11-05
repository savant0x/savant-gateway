import assert from "node:assert/strict";
import test from "node:test";

import { claimDueSource } from "../lib/content/store/claims.ts";
import { createSource } from "../lib/content/store/sources.ts";
import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { createPostgresPool } from "../lib/storage/pg-pool.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();

/**
 * Two real connections must not both own one source. PGlite cannot show this
 * race; the dedicated gate supplies TEST_DATABASE_URL and fails closed.
 */
test("two connections cannot claim one due source twice", async (context) => {
  if (!TEST_DATABASE_URL) {
    if (process.env.CONTENT_CONCURRENCY_REQUIRED === "1") {
      assert.fail(
        "CONTENT_CONCURRENCY_REQUIRED is set but TEST_DATABASE_URL is missing",
      );
    }

    context.skip("TEST_DATABASE_URL is required for the content claim race");

    return;
  }

  const first = createPostgresDatabase({
    pool: createPostgresPool({ connectionString: TEST_DATABASE_URL }),
  });
  const second = createPostgresDatabase({
    pool: createPostgresPool({ connectionString: TEST_DATABASE_URL }),
  });
  let sourceId = null;

  try {
    await migrateDatabase(first);

    const fixture = await createSource(first, {
      kind: "rss",
      label: "Concurrent claim probe",
      url: "https://example.com/concurrent-claim.xml",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });
    sourceId = fixture.id;
    const at = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    const outcomes = await Promise.all([
      claimDueSource(first, {
        sourceId,
        owner: "owner-a",
        at,
        expiresAt,
        sourceRevision: fixture.configRevision,
        allowNotDue: true,
      }),
      claimDueSource(second, {
        sourceId,
        owner: "owner-b",
        at,
        expiresAt,
        sourceRevision: fixture.configRevision,
        allowNotDue: true,
      }),
    ]);

    assert.equal(
      outcomes.filter(Boolean).length,
      1,
      "exactly one connection may hold the source",
    );

    const held = await first
      .prepare(
        `SELECT owner_token FROM content.ingest_claims WHERE source_id = ?`,
      )
      .get(sourceId);

    assert.ok(["owner-a", "owner-b"].includes(held.owner_token));
  } finally {
    if (sourceId) {
      await first
        .prepare("DELETE FROM content.sources WHERE id = ?")
        .run(sourceId)
        .catch(() => undefined);
    }

    await first.close();
    await second.close();
  }
});
