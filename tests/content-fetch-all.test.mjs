import assert from "node:assert/strict";
import test from "node:test";

import {
  enabledFetchTargets,
  readFetchResult,
  runFetchAll,
  summarizeFetchAll,
} from "../lib/content/fetch-all.ts";

test("fetch all targets keep order and exclude disabled sources", () => {
  const targets = enabledFetchTargets([
    { id: "a", label: "Alpha", enabled: true },
    { id: "b", label: "Beta", enabled: false },
    { id: "c", label: "Gamma", enabled: true },
  ]);

  assert.deepEqual(targets, [
    { id: "a", label: "Alpha" },
    { id: "c", label: "Gamma" },
  ]);
});

test("fetch all runs sequentially and one failure does not stop the rest", async () => {
  const calls = [];
  const progress = [];
  const results = await runFetchAll(
    [
      { id: "a", label: "Alpha" },
      { id: "c", label: "Gamma" },
    ],
    async (id) => {
      calls.push(id);

      if (id === "a") throw new Error("upstream unavailable");

      return {
        sourceId: id,
        sourceLabel: "Gamma",
        ok: true,
        itemsSeen: 4,
        itemsUpserted: 3,
      };
    },
    (target, current, total) => {
      progress.push(`${current}/${total}:${target.label}`);
    },
  );

  assert.deepEqual(calls, ["a", "c"]);
  assert.deepEqual(progress, ["1/2:Alpha", "2/2:Gamma"]);
  assert.equal(results[0].ok, false);
  assert.match(results[0].error, /upstream unavailable/);
  assert.equal(results[1].ok, true);
  assert.equal(results[1].itemsUpserted, 3);
});

test("fetch all summary counts stored items and the first failure", async () => {
  const summary = summarizeFetchAll([
    {
      sourceId: "a",
      sourceLabel: "Alpha",
      ok: false,
      itemsSeen: 0,
      itemsUpserted: 0,
      error: "timeout",
    },
    {
      sourceId: "c",
      sourceLabel: "Gamma",
      ok: true,
      itemsSeen: 4,
      itemsUpserted: 3,
    },
  ]);

  assert.deepEqual(summary, {
    sources: 2,
    ok: 1,
    failed: 1,
    itemsStored: 3,
    firstFailure: {
      sourceId: "a",
      sourceLabel: "Alpha",
      ok: false,
      itemsSeen: 0,
      itemsUpserted: 0,
      error: "timeout",
    },
  });
});

test("an empty or non-JSON response is reported by status, not a parse error", async () => {
  await assert.rejects(
    readFetchResult(new Response("", { status: 504 })),
    /HTTP 504/,
  );
  await assert.rejects(
    readFetchResult(new Response("<html>gateway timeout</html>", { status: 504 })),
    /unreadable response \(HTTP 504\)/,
  );
  await assert.rejects(
    readFetchResult(
      new Response(JSON.stringify({ error: "Admin sign-in required." }), {
        status: 401,
      }),
    ),
    /Admin sign-in required/,
  );
});

test("a valid single-source response is read from the results array", async () => {
  const result = await readFetchResult(
    new Response(
      JSON.stringify({
        results: [
          {
            sourceId: "a",
            sourceLabel: "Alpha",
            ok: true,
            itemsSeen: 2,
            itemsUpserted: 1,
          },
        ],
      }),
      { status: 200 },
    ),
  );

  assert.equal(result.sourceLabel, "Alpha");
  assert.equal(result.itemsUpserted, 1);
});
