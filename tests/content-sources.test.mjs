import assert from "node:assert/strict";
import test from "node:test";

import {
  extractGithubSlug,
  fetchGithubRepo,
  parseGithubJson,
  parseGithubRepo,
  repoSlugForItem,
} from "../lib/content/github.ts";
import { parseDailyPapers } from "../lib/content/huggingface.ts";
import { ingestSource } from "../lib/content/ingest.ts";
import {
  CONTENT_SOURCE_PRESETS,
  seedContentSources,
} from "../lib/content/presets.ts";
import { parseTrendshiftListing } from "../lib/content/trendshift.ts";
import { createSource, listItems } from "../lib/content/store.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { contentSchema } from "../lib/storage/schema/content.ts";

const PAPERS = JSON.stringify([
  {
    paper: {
      id: "2601.00001",
      title: "A paper about model routing",
      summary: "We route requests across models.",
      authors: [{ name: "Ada" }, { name: "Grace" }],
      publishedAt: "2026-11-01T00:00:00.000Z",
      upvotes: 12,
    },
  },
  { paper: { title: "missing id" } },
]);

const TRENDSHIFT = `
<main>
  <a href="/repositories/9001">acme/router</a>
  <span>2.4k views</span> <span>180 bookmarks</span>
  <span>#inference #llm</span>
  <a href="https://github.com/acme/router">github</a>
  <a href="/repositories/9002">other/tool</a>
  <span>900 views</span>
</main>`;

test("HuggingFace daily papers parse into stable paper items", () => {
  const items = parseDailyPapers(PAPERS, 10);

  assert.equal(items.length, 1);
  assert.equal(items[0].externalId, "2601.00001");
  assert.equal(items[0].kind, "paper");
  assert.equal(items[0].author, "Ada, Grace");
  assert.equal(
    items[0].url,
    "https://huggingface.co/papers/2601.00001",
  );
  assert.deepEqual(items[0].tags, ["huggingface", "daily-papers"]);
  assert.match(items[0].bodyHtml ?? "", /We route requests/);
});

test("HuggingFace rejects a malformed body instead of returning empty", () => {
  assert.throws(() => parseDailyPapers("<html>"), /invalid JSON/);
  assert.throws(() => parseDailyPapers("{}"), /unexpected shape/);
});

test("Trendshift listing yields repos with counts, tags, and GitHub identity", () => {
  const items = parseTrendshiftListing(
    TRENDSHIFT,
    10,
    "2026-11-02T00:00:00.000Z",
  );

  assert.equal(items.length, 2);
  assert.equal(items[0].title, "acme/router");
  assert.equal(items[0].kind, "repo");
  assert.equal(items[0].url, "https://github.com/acme/router");
  assert.equal(items[0].metrics.views, 2400);
  assert.equal(items[0].metrics.likes, 180);
  assert.deepEqual(items[0].tags, ["inference", "llm", "repository"]);
});

test("Trendshift refuses to call a zero-row parse healthy", () => {
  assert.throws(
    () => parseTrendshiftListing("<main>redesigned page</main>"),
    /zero entries/,
  );
});

test("repo slug discovery uses the URL, title, or feed body", () => {
  assert.equal(
    repoSlugForItem({
      url: "https://github.com/Acme/Router/tree/main",
      title: "ignored",
      bodyHtml: null,
    }),
    "acme/router",
  );
  assert.equal(
    repoSlugForItem({
      url: "https://trendshift.io/repositories/9",
      title: "Acme/Router",
      bodyHtml: null,
    }),
    "acme/router",
  );
  assert.equal(
    repoSlugForItem({
      url: "https://www.opensourceprojects.dev/post/router",
      title: "A write-up",
      bodyHtml:
        "<p>GitHub Repository: https://github.com/Acme/Router</p>",
    }),
    "acme/router",
  );
  assert.equal(
    repoSlugForItem({ url: "https://example.com/x", title: "A post", bodyHtml: null }),
    null,
  );
});

test("GitHub reads work without a token and never send an empty bearer", async () => {
  const originalFetch = globalThis.fetch;
  let headers = null;

  globalThis.fetch = async (_url, init) => {
    headers = init?.headers;

    return new Response(
      JSON.stringify({
        description: "A public repo",
        stargazers_count: 12,
        forks_count: 2,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const repo = await fetchGithubRepo("acme/router", null);

    assert.equal(repo?.slug, "acme/router");
    assert.equal(repo?.stars, 12);
    assert.equal(headers?.Authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub URLs normalize and repo JSON survives a round trip", () => {
  assert.equal(
    extractGithubSlug("https://github.com/Acme/Router/tree/main"),
    "acme/router",
  );
  assert.equal(extractGithubSlug("https://example.com/acme/router"), null);

  const repo = parseGithubRepo("acme/router", {
    description: "A router",
    stargazers_count: 1200,
    forks_count: 40,
    language: "TypeScript",
    topics: ["llm", 7],
    license: { spdx_id: "MIT" },
    homepage: "https://router.example",
    pushed_at: "2026-11-01T00:00:00.000Z",
  });

  assert.equal(repo.stars, 1200);
  assert.deepEqual(repo.topics, ["llm"]);
  assert.equal(repo.license, "MIT");
  assert.equal(parseGithubJson(JSON.stringify(repo))?.slug, "acme/router");
  assert.equal(parseGithubJson("not json"), null);
});

test("the kind migration removes the legacy two-kind constraint", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    await db.exec(`
      ALTER TABLE content.sources
        DROP CONSTRAINT IF EXISTS content_sources_kind_check;
      ALTER TABLE content.sources
        ADD CONSTRAINT sources_kind_check CHECK (kind IN ('rss', 'youtube'));
    `);
    await contentSchema(db);

    const source = await createSource(db, {
      kind: "huggingface",
      label: "Legacy migration fixture",
      url: "https://huggingface.co/api/daily_papers",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });

    assert.equal(source.kind, "huggingface");
  } finally {
    await db.close();
  }
});

test("the content migration repairs an existing table before Signal reads it", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    await db.exec("ALTER TABLE content.items DROP COLUMN external_url");
    await assert.rejects(() => listItems(db), /external_url/);

    await contentSchema(db);

    const column = await db
      .prepare(
        `SELECT COUNT(*) AS present
           FROM information_schema.columns
          WHERE table_schema = 'content'
            AND table_name = 'items'
            AND column_name = 'external_url'`,
      )
      .get();

    assert.equal(Number(column?.present), 1);
    assert.deepEqual(await listItems(db), { items: [], total: 0 });
  } finally {
    await db.close();
  }
});

test("preset seeding adds each source once and keeps operator edits", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const first = await seedContentSources(db);
    const second = await seedContentSources(db);

    assert.equal(first.created.length, CONTENT_SOURCE_PRESETS.length);
    assert.equal(first.skipped.length, 0);
    assert.equal(second.created.length, 0);
    assert.equal(second.skipped.length, CONTENT_SOURCE_PRESETS.length);
  } finally {
    await db.close();
  }
});

test("ingestion fetches HuggingFace papers without a feed request", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "huggingface",
      label: "HuggingFace Daily Papers",
      url: "https://huggingface.co/api/daily_papers",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 10,
    });
    const requests = [];
    const result = await ingestSource(db, source, {
      fetchText: async (url) => {
        requests.push(url);

        return PAPERS;
      },
      now: () => "2026-11-02T12:00:00.000Z",
    });

    assert.equal(result.ok, true);
    assert.equal(result.itemsSeen, 1);
    assert.deepEqual(requests, ["https://huggingface.co/api/daily_papers"]);

    const page = await listItems(db, { kind: "paper" });

    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].github, null);

    const matched = await listItems(db, { search: "routing" });
    const missed = await listItems(db, { search: "quantum" });

    assert.equal(matched.total, 1);
    assert.equal(missed.total, 0);
  } finally {
    await db.close();
  }
});

test("ingestion enriches an Open Source Projects item from its body link", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "rss",
      label: "Open Source Projects",
      url: "https://www.opensourceprojects.dev/rss",
      config: { tags: ["repository"] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });
    const xml = `<rss><channel><item>
      <title>A desktop streaming app</title>
      <link>https://www.opensourceprojects.dev/post/desktop</link>
      <description><![CDATA[<p>A long write-up about the project.
      GitHub Repository: https://github.com/streamlabs/desktop</p>]]></description>
      <category>repository</category>
      <pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate>
    </item></channel></rss>`;

    const result = await ingestSource(db, source, {
      fetchText: async () => xml,
      now: () => "2026-11-02T12:00:00.000Z",
      fetchGithub: async (slug) => ({
        slug,
        description: "Open-source live streaming software",
        stars: 4200,
        forks: 900,
        language: "TypeScript",
        topics: ["electron", "streaming"],
        license: "MIT",
        homepage: "https://streamlabs.com",
        pushedAt: "2026-11-01T00:00:00.000Z",
        ogImageUrl: "https://opengraph.githubassets.com/1/streamlabs/desktop",
      }),
    });

    assert.equal(result.ok, true);

    const [item] = (await listItems(db, { kind: "repo" })).items;

    assert.equal(item.github?.slug, "streamlabs/desktop");
    assert.equal(item.github?.stars, 4200);
    assert.equal(item.excerpt, "Open-source live streaming software");
    assert.match(item.bodyHtml ?? "", /A long write-up/);
    assert.equal(
      item.thumbnailUrl,
      "https://opengraph.githubassets.com/1/streamlabs/desktop",
    );
  } finally {
    await db.close();
  }
});

test("ingestion enriches a repo item when GitHub data is available", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "trendshift",
      label: "Trendshift",
      url: "https://trendshift.io/?sort=views",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 10,
    });
    const result = await ingestSource(db, source, {
      fetchText: async () => TRENDSHIFT,
      now: () => "2026-11-02T12:00:00.000Z",
      fetchGithub: async () => ({
        slug: "acme/router",
        description: "A fast model router",
        stars: 1900,
        forks: 52,
        language: "TypeScript",
        topics: ["llm"],
        license: "MIT",
        homepage: null,
        pushedAt: "2026-11-01T00:00:00.000Z",
        ogImageUrl: "https://opengraph.githubassets.com/1/acme/router",
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.itemsUpserted, 2);

    const page = await listItems(db, { kind: "repo" });
    const enriched = page.items.find((entry) => entry.github);

    assert.equal(enriched?.github?.slug, "acme/router");
    assert.equal(enriched?.github?.stars, 1900);
    assert.equal(enriched?.github?.description, "A fast model router");
    assert.equal(enriched?.excerpt, "A fast model router");
  } finally {
    await db.close();
  }
});
