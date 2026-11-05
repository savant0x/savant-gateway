import assert from "node:assert/strict";
import test from "node:test";

import {
  publicSourceState,
  publicSourceStateLabel,
  SOURCE_STATUS_POLICY,
} from "../lib/content/status.ts";
import {
  createSource,
  listPublicSources,
  recordSourceFailure,
} from "../lib/content/store.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

const SOURCE = {
  id: "src_status",
  label: "Status feed",
  kind: "rss",
  enabled: true,
  status: "active",
  failureStreak: 0,
  lastFetchedAt: "2026-11-03T10:00:00.000Z",
  lastSuccessAt: "2026-11-03T10:00:00.000Z",
  fetchIntervalMinutes: 60,
};

test("public source state has tested disabled, failure, delay, and current boundaries", () => {
  const justNow = new Date("2026-11-03T10:30:00.000Z");

  assert.equal(publicSourceState({ ...SOURCE, enabled: false }, justNow), "paused");
  assert.equal(
    publicSourceState(
      { ...SOURCE, enabled: true, status: "disabled" },
      justNow,
    ),
    "paused",
  );
  assert.equal(
    publicSourceState(
      {
        ...SOURCE,
        failureStreak: SOURCE_STATUS_POLICY.attentionAfterFailures,
      },
      justNow,
    ),
    "attention",
  );
  assert.equal(
    publicSourceState({ ...SOURCE, status: "error" }, justNow),
    "attention",
  );
  assert.equal(
    publicSourceState({ ...SOURCE, lastSuccessAt: null }, justNow),
    "delayed",
  );
  assert.equal(
    publicSourceState({ ...SOURCE, lastSuccessAt: "not-a-date" }, justNow),
    "delayed",
  );

  const limit = new Date(
    new Date(SOURCE.lastSuccessAt).getTime() +
      (SOURCE.fetchIntervalMinutes * SOURCE_STATUS_POLICY.delayedAfterIntervals +
        SOURCE_STATUS_POLICY.graceMinutes) *
        60 *
        1000,
  );

  assert.equal(publicSourceState(SOURCE, limit), "ok");
  assert.equal(
    publicSourceState(SOURCE, new Date(limit.getTime() + 1)),
    "delayed",
  );
  assert.equal(publicSourceStateLabel("attention"), "Needs attention");
});

test("the public projection never selects the URL, config, or last_error", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "rss",
      label: "Public status feed",
      url: "https://example.com/status.xml",
      config: { tags: ["openai"] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 10,
    });

    for (let index = 0; index < 3; index += 1) {
      await recordSourceFailure(
        db,
        source.id,
        `2026-11-03T10:0${index}:00.000Z`,
        "provider secret-looking internal text",
      );
    }

    const rows = await listPublicSources(db);

    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]).sort(), [
      "enabled",
      "failureStreak",
      "fetchIntervalMinutes",
      "id",
      "kind",
      "label",
      "lastFetchedAt",
      "lastSuccessAt",
      "status",
    ]);
    assert.equal(rows[0].failureStreak, 3);
    assert.equal(rows[0].status, "error");
    assert.equal(
      publicSourceState(rows[0], new Date("2026-11-03T10:30:00.000Z")),
      "attention",
    );

    const adminRow = await db
      .prepare("SELECT last_error, url, config_json FROM content.sources WHERE id = ?")
      .get(source.id);

    assert.match(adminRow.last_error, /provider secret/);
    assert.equal(adminRow.url, "https://example.com/status.xml");
    assert.match(adminRow.config_json, /openai/);
  } finally {
    await db.close();
  }
});
