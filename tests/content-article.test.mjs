import assert from "node:assert/strict";
import test from "node:test";

import {
  ArticleFetchError,
  extractArticle,
  fetchArticle,
  isMetadataTemplate,
  plainTextOf,
} from "../lib/content/article.ts";
import { ingestSource } from "../lib/content/ingest.ts";
import { bodyNeedsFetch, ensureArticleBody } from "../lib/content/reader.ts";
import { createSource } from "../lib/content/store.ts";
import { getItem, listItems } from "../lib/content/store/items.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

const ARTICLE_PAGE = `<!doctype html>
<html>
  <head><title>The full Oracle story</title></head>
  <body>
    <nav>Markets Business Tech</nav>
    <article>
      <h1>Oracle files to sell stock</h1>
      <p>${"Oracle filed plans to finance its artificial intelligence buildout. ".repeat(6)}</p>
      <p><a href="https://example.com/source">A link</a> and <strong>bold</strong> text.</p>
      <script>alert("no")</script>
      <img src="/images/oracle.png" alt="Oracle" onerror="alert(1)" />
    </article>
    <footer>Copyright</footer>
  </body>
</html>`;

const HN_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Hacker News</title>
  <item>
    <title>Oracle files to sell $20B in new stock</title>
    <link>https://example.com/oracle</link>
    <description><![CDATA[Article URL: https://example.com/oracle
Comments URL: https://news.ycombinator.com/item?id=1
Points: 11
# Comments: 0]]></description>
    <pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const SCRAPED_BODY = `<p>${"Oracle will sell stock and notes to fund its AI buildout. ".repeat(8)}</p>`;

function contentItem(overrides = {}) {
  return {
    id: "itm_article_test",
    sourceId: "src_test",
    sourceLabel: "Test",
    kind: "article",
    title: "Test",
    url: "https://example.com/story",
    excerpt: "",
    bodyHtml: null,
    author: null,
    publishedAt: "2026-11-02T00:00:00.000Z",
    fetchedAt: "2026-11-02T00:00:00.000Z",
    thumbnailUrl: null,
    videoId: null,
    externalId: null,
    tags: [],
    metrics: { views: 0, likes: 0, youtubeComments: 0, rating: null },
    github: null,
    ...overrides,
  };
}

test("article extraction keeps the body and removes unsafe markup", () => {
  const article = extractArticle(ARTICLE_PAGE, "https://example.com/story");

  assert.equal(article.sourceTitle, "The full Oracle story");
  assert.equal(article.sufficient, true);
  assert.ok(article.textLength >= 200);
  assert.match(article.html, /<p>Oracle filed plans/);
  assert.match(article.html, /<strong>bold<\/strong>/);
  assert.doesNotMatch(article.html, /<script|<a\b|onerror|javascript:/i);
  assert.match(article.html, /src="https:\/\/example\.com\/images\/oracle\.png"/);
  assert.doesNotMatch(article.html, /Markets Business Tech|Copyright/);
});

test("the metadata template guard catches only the full label shape", () => {
  assert.equal(
    isMetadataTemplate(
      "Article URL: https://example.com Comments URL: https://news.ycombinator.com Points: 2 # Comments: 0",
    ),
    true,
  );
  assert.equal(
    isMetadataTemplate("An article about Hacker News and Article URL: syntax."),
    false,
  );
  assert.equal(isMetadataTemplate(""), false);
});

test("a feed body is fetched only when it is missing, templated, or too short", () => {
  assert.equal(bodyNeedsFetch(contentItem({ bodyHtml: null })), true);
  assert.equal(
    bodyNeedsFetch(
      contentItem({
        bodyHtml:
          "<p>Article URL: x Comments URL: y Points: 1 # Comments: 0</p>",
      }),
    ),
    true,
  );
  assert.equal(
    bodyNeedsFetch(contentItem({ bodyHtml: "<p>Short preview.</p>" })),
    true,
  );
  assert.equal(
    bodyNeedsFetch(
      contentItem({ bodyHtml: `<p>${"A real body. ".repeat(30)}</p>` }),
    ),
    false,
  );
  assert.equal(
    bodyNeedsFetch(contentItem({ kind: "video", bodyHtml: "<p>Short.</p>" })),
    false,
  );
});

test("article fetches honor the public URL policy", async () => {
  await assert.rejects(
    fetchArticle("http://127.0.0.1/private"),
    /blocked|Private/,
  );
});

test("a publisher block is reported as a block, not an unreachable page", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const reader = await ensureArticleBody(
      db,
      contentItem({ bodyHtml: "<p>Short preview.</p>" }),
      {
        fetchPage: async () => {
          throw new ArticleFetchError(
            "Article request failed: HTTP 403 for https://www.ft.com/story",
            "http",
            403,
          );
        },
      },
    );

    assert.equal(reader.source, "feed");
    assert.match(reader.error, /refused automated access \(HTTP 403\)/);
    assert.doesNotMatch(reader.error, /could not be reached/);
  } finally {
    await db.close();
  }
});

test("an unusable feed body is scraped once and persisted", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "rss",
      label: "Hacker News",
      url: "https://example.com/feed",
      config: { tags: ["discussion"] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });

    const result = await ingestSource(db, source, {
      fetchText: async () => HN_RSS,
      models: [],
      now: () => "2026-11-02T12:00:00.000Z",
    });

    assert.equal(result.ok, true);

    const [parsed] = (await listItems(db, { sourceId: source.id })).items;

    assert.equal(parsed.bodyHtml, null);
    assert.equal(parsed.excerpt, "Oracle files to sell $20B in new stock");
    assert.equal(bodyNeedsFetch(parsed), true);

    const calls = [];
    const reader = await ensureArticleBody(db, parsed, {
      fetchPage: async (url) => {
        calls.push(url);

        return {
          html: SCRAPED_BODY,
          sufficient: true,
          textLength: plainTextOf(SCRAPED_BODY).length,
          sourceTitle: "Oracle",
        };
      },
    });

    assert.equal(reader.source, "scrape");
    assert.equal(reader.error, null);
    assert.equal(reader.html, SCRAPED_BODY);
    assert.deepEqual(calls, ["https://example.com/oracle"]);

    const stored = await getItem(db, parsed.id);

    assert.equal(stored.bodyHtml, SCRAPED_BODY);

    const again = await ensureArticleBody(db, stored, {
      fetchPage: async () => {
        throw new Error("must not fetch a stored body");
      },
    });

    assert.equal(again.source, "feed");
    assert.equal(again.html, SCRAPED_BODY);

    await ingestSource(db, source, {
      fetchText: async () => HN_RSS,
      models: [],
      now: () => "2026-11-02T13:00:00.000Z",
    });

    const afterRefresh = await getItem(db, parsed.id);

    assert.equal(afterRefresh.bodyHtml, SCRAPED_BODY);
  } finally {
    await db.close();
  }
});
