import assert from "node:assert/strict";
import test from "node:test";

import { parseGithubJson } from "../lib/content/github.ts";
import {
  extractReadme,
  fetchGithubReadme,
  sanitizeReadmeHtml,
} from "../lib/content/github-readme.ts";
import { ensureGithubRepo } from "../lib/content/repo-reader.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { createSource } from "../lib/content/store/sources.ts";
import { getItem, upsertItem } from "../lib/content/store/items.ts";

const README = `<h1>Router</h1>
<p>Hello <strong>world</strong>.</p>
<script>alert("no")</script>
<img src="docs/logo.svg" alt="Router" onerror="alert(1)" />
<a href="./CONTRIBUTING.md">Contribute</a>
<a href="javascript:alert(1)">Not a link</a>`;

const REPO = {
  slug: "acme/router",
  description: "A router",
  stars: 42,
  forks: 7,
  language: "TypeScript",
  topics: ["routing"],
  license: "MIT",
  homepage: null,
  pushedAt: "2026-11-01T00:00:00.000Z",
  ogImageUrl: "https://opengraph.githubassets.com/1/acme/router",
  readmeHtml: null,
};

test("README sanitization resolves repository paths and removes active content", () => {
  const html = sanitizeReadmeHtml(README, "acme/router");

  assert.match(html, /<h2>Router<\/h2>/);
  assert.match(html, /<strong>world<\/strong>/);
  assert.doesNotMatch(html, /<script|onerror|javascript:/i);
  assert.match(
    html,
    /src="https:\/\/raw\.githubusercontent\.com\/acme\/router\/HEAD\/docs\/logo\.svg"/,
  );
  assert.match(
    html,
    /href="https:\/\/github\.com\/acme\/router\/blob\/HEAD\/CONTRIBUTING\.md"/,
  );
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<a[^>]+>Not a link<\/a>/);
});

test("README extraction takes the rendered markdown body, not the page chrome", () => {
  const page = `<div id="readme"><article class="markdown-body entry-content"><p>Inside</p></article></div>`;

  assert.equal(extractReadme(page), "<p>Inside</p>");
  assert.equal(extractReadme("<div>nothing</div>"), null);
});

test("README fetch uses GitHub's rendered HTML media type", async () => {
  let accept = "";
  const html = await fetchGithubReadme("acme/router", {
    token: null,
    fetchImpl: async (_url, init) => {
      accept = init.headers.Accept;

      return new Response(
        `<div id="readme"><article class="markdown-body"><p>Hello README</p></article></div>`,
        { status: 200 },
      );
    },
  });

  assert.equal(accept, "application/vnd.github.html+json");
  assert.match(html, /Hello README/);
});

test("a missing README is cached as an empty string", async () => {
  const html = await fetchGithubReadme("acme/router", {
    token: null,
    fetchImpl: async () => new Response("", { status: 404 }),
  });

  assert.equal(html, "");
});

test("github_json round-trips the README field", () => {
  const parsed = parseGithubJson(
    JSON.stringify({ ...REPO, readmeHtml: "<p>Stored README</p>" }),
  );

  assert.equal(parsed?.readmeHtml, "<p>Stored README</p>");
});

test("a legacy repository row is repaired once and persisted", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "rss",
      label: "Trendshift",
      url: "https://example.com/trendshift",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });
    const id = await upsertItem(
      db,
      source,
      {
        externalId: "acme/router",
        kind: "repo",
        title: "acme/router",
        url: "https://github.com/acme/router",
        excerpt: "A router",
        bodyHtml: null,
        author: "acme",
        publishedAt: "2026-11-02T00:00:00.000Z",
        thumbnailUrl: null,
        videoId: null,
        tags: ["repository"],
      },
      "2026-11-02T00:00:00.000Z",
    );
    const item = await getItem(db, id);
    let repoCalls = 0;
    let readmeCalls = 0;

    assert.equal(item.github, null);

    const first = await ensureGithubRepo(db, item, {
      fetchRepo: async () => {
        repoCalls += 1;

        return REPO;
      },
      fetchReadme: async () => {
        readmeCalls += 1;

        return "<p>Fetched README</p>";
      },
      now: () => "2026-11-02T12:00:00.000Z",
    });

    assert.equal(first.stars, 42);
    assert.equal(first.readmeHtml, "<p>Fetched README</p>");
    assert.equal(repoCalls, 1);
    assert.equal(readmeCalls, 1);

    const stored = await getItem(db, id);

    assert.equal(stored.github.stars, 42);
    assert.equal(stored.github.readmeHtml, "<p>Fetched README</p>");

    const again = await ensureGithubRepo(db, stored, {
      fetchRepo: async () => {
        throw new Error("must not fetch facts twice");
      },
      fetchReadme: async () => {
        throw new Error("must not fetch the README twice");
      },
    });

    assert.equal(again.readmeHtml, "<p>Fetched README</p>");
  } finally {
    await db.close();
  }
});
