import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultMatchingPolicy,
  formatAliasLines,
  parseAliasLines,
  parseMatchingPolicy,
  validateMatchingPatch,
} from "../lib/content/matching-policy.ts";
import { suggestModelLinks } from "../lib/content/linking.ts";
import { listLinkInventory } from "../lib/content/store/link-inventory.ts";
import {
  readMatchingPolicy,
  saveMatchingPolicy,
} from "../lib/content/store/matching.ts";
import { createSource } from "../lib/content/store/sources.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

const MODEL = {
  id: "free/gpt-6-luna",
  name: "GPT-6 Luna",
  family: "GPT",
  upstreamId: "gpt-6-luna",
};

test("matching policy rejects malformed rows and stale revisions", () => {
  assert.deepEqual(parseMatchingPolicy(null), {
    ok: true,
    policy: defaultMatchingPolicy(),
  });
  assert.equal(parseMatchingPolicy("{").ok, false);
  assert.equal(
    parseMatchingPolicy(JSON.stringify({ ...defaultMatchingPolicy(), version: 2 }))
      .ok,
    false,
  );

  const policy = defaultMatchingPolicy();
  const stale = validateMatchingPatch(policy, { expectedRevision: 2 });

  assert.equal(stale.ok, false);
  assert.equal(stale.status, 409);

  const bad = validateMatchingPatch(policy, {
    aliases: { [MODEL.id]: ["x"] },
  });

  assert.equal(bad.ok, false);
  assert.match(bad.error, /2–80/);

  assert.deepEqual(
    parseAliasLines("free/gpt-6-luna = Luna Prime | Luna-6\n# comment"),
    { [MODEL.id]: ["Luna Prime", "Luna-6"] },
  );
  assert.equal(
    formatAliasLines({ [MODEL.id]: ["Luna Prime"] }),
    "free/gpt-6-luna = Luna Prime",
  );
});

test("operator aliases match exact phrases and autoPublish marks the result", () => {
  const input = {
    title: "Luna Prime launch notes",
    tags: [],
    kind: "article",
  };

  assert.equal(suggestModelLinks(input, [MODEL]).length, 0);

  const reviewed = suggestModelLinks(input, [MODEL], {
    aliases: { [MODEL.id]: ["Luna Prime"] },
    autoPublish: false,
  });
  const unversioned = suggestModelLinks(input, [MODEL], {
    aliases: { [MODEL.id]: ["Luna Prime"] },
    autoPublish: true,
  });
  const versioned = suggestModelLinks(
    { ...input, title: "Luna 6 launch notes" },
    [MODEL],
    {
      aliases: { [MODEL.id]: ["Luna 6"] },
      autoPublish: true,
    },
  );

  assert.equal(reviewed.length, 1);
  assert.equal(reviewed[0].reviewed, false);
  assert.equal(reviewed[0].modelId, MODEL.id);
  assert.match(reviewed[0].reason, /Luna Prime/);
  assert.equal(unversioned[0].reviewed, false);
  assert.equal(versioned[0].reviewed, true);
});

test("matching policy persists with one revisioned writer", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const initial = await readMatchingPolicy(db);

    assert.equal(initial.policy.revision, 0);
    assert.equal(initial.policy.autoPublish, false);

    const saved = await saveMatchingPolicy(db, {
      expectedRevision: 0,
      autoPublish: true,
      aliases: { [MODEL.id]: ["Luna Prime"] },
    });

    assert.equal(saved.ok, true);

    if (!saved.ok) return;

    assert.equal(saved.policy.revision, 1);

    const reread = await readMatchingPolicy(db);

    assert.equal(reread.policy.autoPublish, true);
    assert.deepEqual(reread.policy.aliases, { [MODEL.id]: ["Luna Prime"] });

    const stale = await saveMatchingPolicy(db, { expectedRevision: 0 });

    assert.equal(stale.ok, false);
    assert.equal(stale.status, 409);
  } finally {
    await db.close();
  }
});

test("inventory pages every association beyond the recent preview", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "rss",
      label: "Inventory fixture",
      url: "https://example.com/inventory.xml",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });
    const now = "2026-11-02T12:00:00.000Z";

    for (let index = 0; index < 105; index += 1) {
      const itemId = `itm_inventory_${String(index).padStart(3, "0")}`;

      await db
        .prepare(
          `INSERT INTO content.items
            (id, source_id, kind, title, url, published_at, fetched_at,
             content_hash, created_at, updated_at)
           VALUES (?, ?, 'article', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          itemId,
          source.id,
          `Inventory story ${index}`,
          `https://example.com/inventory/${index}`,
          now,
          now,
          `hash-${index}`,
          now,
          now,
        );
      await db
        .prepare(
          `INSERT INTO content.model_links
            (item_id, model_id, relation, relation_source, confidence, reason,
             reviewed, state, decision_source, revision, created_at, updated_at)
           VALUES (?, ?, 'mention', 'auto', 0.5, 'Inventory fixture', 0,
                   'suggested', 'system', 0, ?, ?)`,
        )
        .run(itemId, `free/inventory-${index % 3}`, now, now);
    }

    const first = await listLinkInventory(db, { limit: 100 });
    const second = await listLinkInventory(db, {
      limit: 100,
      cursor: first.nextCursor,
    });
    const filtered = await listLinkInventory(db, {
      search: "Inventory story 104",
    });
    const scoped = await listLinkInventory(db, {
      sourceId: source.id,
      kind: "article",
      relation: "mention",
      since: "2026-01-01",
      until: "2027-01-01",
    });

    assert.equal(first.total, 105);
    assert.equal(first.links.length, 100);
    assert.ok(first.nextCursor);
    assert.equal(second.links.length, 5);
    assert.equal(second.total, 105);
    assert.equal(filtered.total, 1);
    assert.equal(filtered.links[0].itemTitle, "Inventory story 104");
    assert.equal(scoped.total, 105);
    assert.equal(first.counts.suggested, 105);
  } finally {
    await db.close();
  }
});
