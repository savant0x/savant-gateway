import assert from "node:assert/strict";
import test from "node:test";

import { applySourceTags } from "../lib/content/taxonomy.ts";

test("source tags join the publisher tags on an item", () => {
  assert.deepEqual(applySourceTags(["openai"], ["release", "ai"]), [
    "openai",
    "release",
    "ai",
  ]);
});

test("publisher tags stay first so a long source list cannot crowd them out", () => {
  const publisher = ["gpt-6-luna"];
  const source = ["ai", "llm", "release", "model", "gateway", "openai"];

  const merged = applySourceTags(publisher, source);

  assert.equal(merged[0], "gpt-6-luna");
  assert.equal(merged.length, 7);
});

test("a tag on both the item and the source appears once", () => {
  assert.deepEqual(applySourceTags(["openai"], ["OpenAI", "AI"]), [
    "openai",
    "ai",
  ]);
});
