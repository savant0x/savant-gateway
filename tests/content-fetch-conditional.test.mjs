import assert from "node:assert/strict";
import test from "node:test";

import {
  createConditionalFeedFetcher,
  FetchError,
} from "../lib/content/ingest-fetch.ts";

function streamed(...chunks) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

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

test("a dishonest Content-Length neither bypasses nor rejects the byte ceiling", async () => {
  let length = "1";
  const fetchText = createConditionalFeedFetcher(
    async () =>
      new Response(streamed("0123456789"), {
        status: 200,
        headers: { "content-length": length },
      }),
    new Map(),
    8,
    { maxBytes: 10 },
  );

  assert.equal(await fetchText("https://example.com/feed"), "0123456789");

  length = "999";
  assert.equal(await fetchText("https://example.com/feed"), "0123456789");
});

test("a chunked body over the byte ceiling is refused", async () => {
  const fetchText = createConditionalFeedFetcher(
    async () => new Response(streamed("012345", "67890X"), { status: 200 }),
    new Map(),
    8,
    { maxBytes: 10 },
  );

  await assert.rejects(
    fetchText("https://example.com/feed"),
    /response ceiling/,
  );
});

test("a public redirect is followed and the final body is read", async () => {
  const calls = [];
  const fetchText = createConditionalFeedFetcher(async (url) => {
    calls.push(url);

    if (calls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: "/next" },
      });
    }

    return new Response("redirected feed", { status: 200 });
  });

  assert.equal(
    await fetchText("https://example.com/feed"),
    "redirected feed",
  );
  assert.deepEqual(calls, [
    "https://example.com/feed",
    "https://example.com/next",
  ]);
});

test("a redirect to a private address is refused before the second request", async () => {
  const calls = [];
  const fetchText = createConditionalFeedFetcher(async (url) => {
    calls.push(url);

    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/secret" },
    });
  });

  await assert.rejects(
    fetchText("https://example.com/feed"),
    /Redirect refused/,
  );
  assert.deepEqual(calls, ["https://example.com/feed"]);
});

test("decimal and mapped private literals are refused before a request", async () => {
  let calls = 0;
  const fetchText = createConditionalFeedFetcher(async () => {
    calls += 1;

    return new Response("unexpected", { status: 200 });
  });

  for (const url of [
    "http://2130706433/feed",
    "http://0177.0.0.1/feed",
    "http://[::ffff:127.0.0.1]/feed",
  ]) {
    await assert.rejects(fetchText(url), /Private|private/);
  }

  assert.equal(calls, 0);
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
