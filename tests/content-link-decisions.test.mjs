import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { contentDecisionsSchema } from "../lib/storage/schema/content-decisions.ts";
import { createSource } from "../lib/content/store/sources.ts";
import { upsertItem } from "../lib/content/store/item-writes.ts";
import {
  decideLink,
  manualLink,
  replaceAutoLinks,
} from "../lib/content/store/link-writes.ts";
import {
  listContentForModel,
  listLinksForItem,
} from "../lib/content/store/links.ts";

const MODEL_ID = "free/gpt-6-luna";
const SECOND_MODEL_ID = "free/gpt-6-sol";

async function seed(db) {
  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, name, provider, family, context_window, token_weight,
         input_price_micros, output_price_micros, allow_free, supports_tools,
         supports_vision, status, sort_order, synced_at, in_catalog)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, 1)`,
    )
    .run(
      MODEL_ID,
      "gpt-6-luna",
      "GPT-6 Luna",
      "GPT",
      "GPT",
      "128000",
      1,
      0,
      0,
      1,
      0,
      0,
      "2026-11-02T00:00:00.000Z",
    );

  const source = await createSource(db, {
    kind: "rss",
    label: "Decision fixture",
    url: "https://example.com/decision.xml",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 5,
  });
  const itemId = await upsertItem(
    db,
    source,
    {
      externalId: "decision-1",
      kind: "article",
      title: "GPT-6 Luna release",
      url: "https://example.com/decision-post",
      excerpt: "A release.",
      bodyHtml: "<p>A release.</p>",
      author: null,
      publishedAt: "2026-11-02T10:00:00.000Z",
      thumbnailUrl: null,
      videoId: null,
      tags: [],
    },
    "2026-11-02T11:00:00.000Z",
  );

  return { itemId, source };
}

function suggestion(modelId, reviewed = false) {
  return {
    modelId,
    relation: "release",
    confidence: 1,
    reason: "Title matches the model alias",
    reviewed,
  };
}

test("suggestion decisions survive refetch, dismissal, restore and manual acceptance", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const { itemId } = await seed(db);

    await replaceAutoLinks(db, itemId, [suggestion(MODEL_ID)]);

    assert.equal((await listContentForModel(db, MODEL_ID)).total, 0);
    assert.equal((await listLinksForItem(db, itemId)).length, 0);

    const hidden = await listLinksForItem(db, itemId, { includeHidden: true });

    assert.equal(hidden[0].state, "suggested");
    assert.equal(hidden[0].revision, 0);

    const accepted = await decideLink(db, {
      itemId,
      modelId: MODEL_ID,
      action: "accept",
      expectedRevision: 0,
    });

    assert.equal(accepted.ok, true);

    if (!accepted.ok) return;

    assert.equal(accepted.state, "accepted");
    assert.equal(accepted.revision, 1);
    assert.equal((await listContentForModel(db, MODEL_ID)).total, 1);

    await replaceAutoLinks(db, itemId, [suggestion(MODEL_ID)]);

    const afterRefetch = await listLinksForItem(db, itemId, {
      includeHidden: true,
    });

    assert.equal(afterRefetch[0].state, "accepted");
    assert.equal(afterRefetch[0].revision, 1);

    await replaceAutoLinks(db, itemId, []);

    assert.equal((await listContentForModel(db, MODEL_ID)).total, 1);

    const dismissed = await decideLink(db, {
      itemId,
      modelId: MODEL_ID,
      action: "dismiss",
      expectedRevision: 1,
    });

    assert.equal(dismissed.ok, true);
    assert.equal((await listContentForModel(db, MODEL_ID)).total, 0);

    await replaceAutoLinks(db, itemId, [suggestion(MODEL_ID)]);

    const afterDismissalFetch = await listLinksForItem(db, itemId, {
      includeHidden: true,
    });

    assert.equal(afterDismissalFetch[0].state, "dismissed");
    assert.equal((await listContentForModel(db, MODEL_ID)).total, 0);

    const restored = await decideLink(db, {
      itemId,
      modelId: MODEL_ID,
      action: "restore",
      expectedRevision: 2,
    });

    assert.equal(restored.ok, true);

    if (!restored.ok) return;

    assert.equal(restored.state, "suggested");
    assert.equal((await listContentForModel(db, MODEL_ID)).total, 0);

    const acceptedAgain = await decideLink(db, {
      itemId,
      modelId: MODEL_ID,
      action: "accept",
      expectedRevision: 3,
    });

    assert.equal(acceptedAgain.ok, true);
    assert.equal((await listContentForModel(db, MODEL_ID)).total, 1);

    await decideLink(db, {
      itemId,
      modelId: MODEL_ID,
      action: "dismiss",
      expectedRevision: 4,
    });
    await manualLink(db, itemId, MODEL_ID, "mention", "Operator correction");
    assert.equal((await listContentForModel(db, MODEL_ID)).total, 1);

    const stale = await decideLink(db, {
      itemId,
      modelId: MODEL_ID,
      action: "dismiss",
      expectedRevision: 0,
    });

    assert.equal(stale.ok, false);
    assert.equal(stale.conflict, true);
  } finally {
    await db.close();
  }
});

test("no-match retires only undecided automatic rows and migration is honest", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const { itemId } = await seed(db);

    await replaceAutoLinks(db, itemId, [
      suggestion(MODEL_ID),
      suggestion(SECOND_MODEL_ID),
    ]);
    await decideLink(db, {
      itemId,
      modelId: MODEL_ID,
      action: "accept",
      expectedRevision: 0,
    });
    await replaceAutoLinks(db, itemId, [suggestion(SECOND_MODEL_ID)]);
    await replaceAutoLinks(db, itemId, []);

    const links = await listLinksForItem(db, itemId, { includeHidden: true });
    const byModel = new Map(links.map((link) => [link.modelId, link.state]));

    assert.equal(byModel.get(MODEL_ID), "accepted");
    assert.equal(byModel.get(SECOND_MODEL_ID), "retired");
    assert.equal((await listContentForModel(db, MODEL_ID)).total, 1);

    await db
      .prepare(
        `INSERT INTO content.model_links
          (item_id, model_id, relation, relation_source, confidence, reason,
           reviewed, state, decision_source, revision, created_at, updated_at)
         VALUES (?, 'free/legacy', 'mention', 'auto', 1, 'Legacy row', 1,
                 'suggested', NULL, 0, ?, ?)`,
      )
      .run(
        itemId,
        "2026-11-02T11:00:00.000Z",
        "2026-11-02T11:00:00.000Z",
      );

    await contentDecisionsSchema(db);

    const legacy = await db
      .prepare(
        `SELECT state, decision_source FROM content.model_links
          WHERE item_id = ? AND model_id = 'free/legacy'`,
      )
      .get(itemId);

    assert.equal(legacy.state, "auto_published");
    assert.equal(legacy.decision_source, "migration");

    const event = await db
      .prepare(
        `SELECT action, actor FROM content.link_decisions
          WHERE item_id = ? AND model_id = 'free/legacy'`,
      )
      .get(itemId);

    assert.equal(event.action, "auto_published");
    assert.equal(event.actor, "migration");
  } finally {
    await db.close();
  }
});
