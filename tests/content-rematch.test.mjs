import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptAutoLink,
  dismissAutoLink,
  replaceAutoLinks,
} from "../lib/content/store/link-writes.ts";
import {
  listContentForModel,
  listLinksForItem,
} from "../lib/content/store/links.ts";
import { saveAutomationPolicy } from "../lib/content/store/automation.ts";
import { saveMatchingPolicy } from "../lib/content/store/matching.ts";
import {
  latestRematchRun,
  runRematchBounded,
} from "../lib/content/store/rematch.ts";
import { createSource } from "../lib/content/store/sources.ts";
import { upsertItem } from "../lib/content/store/item-writes.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

const MODEL_ID = "free/gpt-6-luna";

async function seed(db) {
  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, name, provider, family, context_window, token_weight,
         input_price_micros, output_price_micros, allow_free, supports_tools,
         supports_vision, status, sort_order, synced_at, in_catalog)
       VALUES (?, 'gpt-6-luna', 'GPT-6 Luna', 'GPT', 'GPT', '128000', 1, 0, 0,
               1, 0, 0, 'active', 0, ?, 1)`,
    )
    .run(MODEL_ID, "2026-11-02T00:00:00.000Z");

  const source = await createSource(db, {
    kind: "rss",
    label: "Rematch fixture",
    url: "https://example.com/rematch.xml",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 5,
  });
  const ids = [];

  for (let index = 0; index < 3; index += 1) {
    ids.push(
      await upsertItem(
        db,
        source,
        {
          externalId: `rematch-${index}`,
          kind: "article",
          title: `Luna Prime story ${index}`,
          url: `https://example.com/rematch/${index}`,
          excerpt: "Stored content.",
          bodyHtml: "<p>Stored content.</p>",
          author: null,
          publishedAt: `2026-11-0${index + 1}T10:00:00.000Z`,
          thumbnailUrl: null,
          videoId: null,
          tags: [],
        },
        "2026-11-02T11:00:00.000Z",
      ),
    );
  }

  return { ids, source };
}

test("bounded rematch resumes over stored items and preserves decisions", async () => {
  const db = await createStorageDatabase({
    env: { CONTENT_INGEST_ENABLED: "true" },
  });

  try {
    const { ids } = await seed(db);
    const automation = await saveAutomationPolicy(db, {
      expectedRevision: 0,
      enabled: true,
      batchLimit: 10,
      heartbeatMinutes: 5,
    });

    assert.equal(automation.ok, true);

    const saved = await saveMatchingPolicy(db, {
      expectedRevision: 0,
      autoPublish: false,
      aliases: { [MODEL_ID]: ["Luna Prime"] },
    });

    assert.equal(saved.ok, true);

    await replaceAutoLinks(db, ids[0], [
      {
        modelId: MODEL_ID,
        relation: "release",
        confidence: 1,
        reason: "Operator accepted",
        reviewed: false,
      },
    ]);
    await acceptAutoLink(db, ids[0], MODEL_ID);
    await replaceAutoLinks(db, ids[1], [
      {
        modelId: MODEL_ID,
        relation: "release",
        confidence: 1,
        reason: "Operator dismissed",
        reviewed: false,
      },
    ]);
    await dismissAutoLink(db, ids[1], MODEL_ID);

    const first = await runRematchBounded(db, {
      trigger: "manual",
      limit: 1,
      deadlineMs: 60_000,
    });

    assert.equal(first.status, "paused");
    assert.equal(first.processed, 1);

    const second = await runRematchBounded(db, {
      trigger: "manual",
      limit: 1,
      deadlineMs: 60_000,
    });

    assert.equal(second.status, "paused");
    assert.equal(second.processed, 2);

    const third = await runRematchBounded(db, {
      trigger: "manual",
      limit: 5,
      deadlineMs: 60_000,
    });

    assert.equal(third.status, "ok");
    assert.equal(third.processed, 3);
    assert.ok(third.changed >= 3);

    const firstLink = await listLinksForItem(db, ids[0], {
      includeHidden: true,
    });
    const secondLink = await listLinksForItem(db, ids[1], {
      includeHidden: true,
    });
    const thirdLink = await listLinksForItem(db, ids[2], {
      includeHidden: true,
    });

    assert.equal(firstLink[0].state, "accepted");
    assert.equal(secondLink[0].state, "dismissed");
    assert.equal(thirdLink[0].state, "suggested");
    assert.equal(thirdLink[0].modelId, MODEL_ID);
    assert.equal((await listContentForModel(db, MODEL_ID)).total, 1);
    assert.equal((await latestRematchRun(db))?.id, third.id);
  } finally {
    await db.close();
  }
});
