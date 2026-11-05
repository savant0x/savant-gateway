import assert from "node:assert/strict";
import test from "node:test";

import { descriptionEvidence } from "../lib/content/description-evidence.ts";
import { suggestModelLinks } from "../lib/content/linking.ts";
import { ingestSource } from "../lib/content/ingest-source.ts";
import { createSource } from "../lib/content/store/sources.ts";
import { listLinksForItem } from "../lib/content/store/links.ts";
import { saveAutomationPolicy } from "../lib/content/store/automation.ts";
import { runRematchBounded } from "../lib/content/store/rematch.ts";
import { saveMatchingPolicy } from "../lib/content/store/matching.ts";
import { listItems } from "../lib/content/store/items.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { decideLink } from "../lib/content/store/link-writes.ts";

const model = {
  id: "gpt-6-luna", name: "GPT-6 Luna", family: "GPT", upstreamId: "gpt-6-luna",
};
const sibling = {
  id: "gpt-6-luna-fast", name: "GPT-6 Luna Fast", family: "GPT",
  upstreamId: "gpt-6-luna-fast",
};

test("YouTube description matches require review and exclude URLs", () => {
  const description = descriptionEvidence(
    '<p>About GPT-6 Luna</p><p>https://example.test/claude-opus-4.6</p>', "",
  );
  const result = suggestModelLinks(
    { title: "A video", tags: [], kind: "video", sourceKind: "youtube", description },
    [model], { autoPublish: true },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].reviewed, false);
  assert.match(result[0].reason, /Description matches/);
  assert.doesNotMatch(description, /example\.test/);
  assert.doesNotMatch(descriptionEvidence("//example.test/gpt-6-luna", ""), /gpt-6-luna/);
  assert.equal(suggestModelLinks(
    { title: "A video", tags: [], kind: "video", sourceKind: "rss", description }, [model],
  ).length, 0);
  assert.equal(suggestModelLinks(
    { title: "A video", tags: [], kind: "video", sourceKind: "youtube", description },
    [model], { matchYouTubeDescriptions: false },
  ).length, 0);
});

test("description matches distinguish sibling names and retain separate mentions", () => {
  const input = { title: "Video", tags: [], kind: "video", sourceKind: "youtube" };
  const first = suggestModelLinks({ ...input, description: "GPT-6 Luna Fast" }, [model, sibling]);
  assert.deepEqual(first.map((item) => item.modelId), [sibling.id]);
  const second = suggestModelLinks(
    { ...input, description: "GPT-6 Luna Fast versus GPT-6 Luna" }, [model, sibling],
  );
  assert.deepEqual(second.map((item) => item.modelId).sort(), [model.id, sibling.id]);
});

test("description text respects markup boundaries, fallback, bounds and title precedence", () => {
  assert.match(descriptionEvidence("<p>GPT&#45;6</p><p>Luna</p>", ""), /GPT-6\s+Luna/);
  assert.match(descriptionEvidence(null, "GPT-6 Luna"), /GPT-6 Luna/);
  assert.equal(descriptionEvidence(null, "x".repeat(150000)).length, 120000);
  const result = suggestModelLinks(
    { title: "GPT-6 Luna", tags: ["gpt-6-luna"], kind: "video", sourceKind: "youtube", description: "GPT-6 Luna" },
    [model], { autoPublish: true },
  );
  assert.equal(result[0].confidence, 1);
  assert.equal(result[0].reviewed, true);
  assert.match(result[0].reason, /Title matches/);
});

test("ingestion and stored rematch find a model beyond the excerpt", async () => {
  const db = await createStorageDatabase({ env: {} });
  try {
    await db.prepare(
      `INSERT INTO models
       (id, upstream_id, name, provider, family, context_window, token_weight,
        input_price_micros, output_price_micros, allow_free, supports_tools,
        supports_vision, status, sort_order, synced_at, in_catalog)
       VALUES (?, ?, ?, 'GPT', 'GPT', '128000', 1, 0, 0, 1, 0, 0, 'active', 0, ?, 1)`,
    ).run(model.id, model.upstreamId, model.name, "2026-11-05T00:00:00.000Z");
    const source = await createSource(db, {
      kind: "youtube", label: "Fixture", url: "https://youtube.com/channel/UCabcdefghijklmnopqrstuv",
      config: { tags: [], channelId: "UCabcdefghijklmnopqrstuv" }, enabled: true,
      fetchIntervalMinutes: 60, maxItems: 5,
    });
    await saveAutomationPolicy(db, { expectedRevision: 0, enabled: true });
    await saveMatchingPolicy(db, { expectedRevision: 0, autoPublish: true });
    const xml = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
      <entry><title>Video overview</title><yt:videoId>vid123</yt:videoId>
      <link rel="alternate" href="https://www.youtube.com/watch?v=vid123" />
      <published>2026-11-05T00:00:00Z</published><media:group><media:description>${"text ".repeat(100)}GPT-6 Luna</media:description></media:group>
      </entry></feed>`;
    const result = await ingestSource(db, source, {
      fetchText: async () => xml, apiKey: null, models: [model],
    });
    assert.equal(result.ok, true);
    const item = (await listItems(db)).items[0];
    assert.equal(item.excerpt.includes("GPT-6 Luna"), false);
    let links = await listLinksForItem(db, item.id, { includeHidden: true });
    assert.equal(links[0].state, "suggested");
    assert.match(links[0].reason, /Description matches/);
    await db.prepare(
      "UPDATE content.model_links SET state = 'auto_published', reviewed = 1 WHERE item_id = ?",
    ).run(item.id);
    const run = await runRematchBounded(db, { trigger: "manual", deadlineMs: 60000 });
    assert.equal(run.status, "ok");
    links = await listLinksForItem(db, item.id, { includeHidden: true });
    assert.equal(links[0].state, "suggested");
    assert.match(links[0].reason, /Description matches/);
    await decideLink(db, { itemId: item.id, modelId: model.id, action: "accept" });
    await runRematchBounded(db, { trigger: "manual", deadlineMs: 60000 });
    links = await listLinksForItem(db, item.id, { includeHidden: true });
    assert.equal(links[0].state, "accepted");
    await decideLink(db, { itemId: item.id, modelId: model.id, action: "dismiss" });
    await runRematchBounded(db, { trigger: "manual", deadlineMs: 60000 });
    links = await listLinksForItem(db, item.id, { includeHidden: true });
    assert.equal(links[0].state, "dismissed");
  } finally {
    await db.close();
  }
});
