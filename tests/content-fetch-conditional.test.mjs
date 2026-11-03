import assert from "node:assert/strict";
import test from "node:test";

import {
  createConditionalFeedFetcher,
  FetchError,
} from "../lib/content/ingest-fetch.ts";

test("a changed feed stores validators and a 304 reuses the cached body", async () => {
  const calls = [];
  let mode = "fresh";
  const fetchImpl = async (url, options) => {
    calls.push({ url, headers: options.headers });

    if (mode === "fresh") {
      return new Response("feed body", {
        status: 200,
        headers: { etag: 'W/"v1"', "last-modified": "Mon, 02 Nov 2026 00:00:00 GMT" },
      });
    }

    return new Response(null, { status: 304 });
  };
  const fetchText = createConditionalFeedFetcher(fetchImpl);

  assert.equal(await fetchText("https://example.com/feed.xml"), "feed body");
  assert.equal(calls[0].headers["if-none-match"], undefined);

  mode = "unchanged";

  assert.equal(await fetchText("https://example.com/feed.xml"), "feed body");
  assert.equal(calls[1].headers["if-none-match"], 'W/"v1"');
  assert.equal(
    calls[1].headers["if-modified-since"],
    "Mon, 02 Nov 2026 00:00:00 GMT",
  );
});

test("a 304 without a cached body is an error, not an empty feed", async () => {
  const fetchText = createConditionalFeedFetcher(async () => {
    return new Response(null, { status: 304 });
  });

  await assert.rejects(
    fetchText("https://example.com/unknown.xml"),
    FetchError,
  );
});

test("the cache is bounded and an HTTP failure is surfaced", async () => {
  const fetchText = createConditionalFeedFetcher(
    async (url) => {
      if (url.endsWith("broken")) return new Response("no", { status: 500 });

      return new Response(`body:${url}`, { status: 200 });
    },
    new Map(),
    2,
  );

  await fetchText("https://example.com/one");
  await fetchText("https://example.com/two");
  await fetchText("https://example.com/three");
  await fetchText("https://example.com/one");

  await assert.rejects(
    fetchText("https://example.com/broken"),
    /HTTP 500/,
  );
});
