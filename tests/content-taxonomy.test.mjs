import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTag,
  normalizeTags,
  parseSourceConfig,
  parseTagInput,
  serializeSourceConfig,
  tagLabel,
} from "../lib/content/taxonomy.ts";

test("publisher variants collapse to one canonical slug", () => {
  assert.equal(normalizeTag("OpenAI"), "openai");
  assert.equal(normalizeTag("open-ai"), "openai");
  assert.equal(normalizeTag("  #Open AI  "), "openai");
  assert.equal(normalizeTag("Large Language Models"), "llm");
  assert.equal(normalizeTag("Machine Learning"), "ml");
});

test("model-like tags keep dots and plus signs", () => {
  assert.equal(normalizeTag("GPT-6.1 Sol"), "gpt-6.1-sol");
  assert.equal(normalizeTag("C++"), "c++");
  assert.equal(normalizeTag("!!!"), "");
});

test("tag lists dedupe, drop empty values, and respect the cap", () => {
  assert.deepEqual(normalizeTags(["AI", "ai", "", "RAG", 4, null]), [
    "ai",
    "rag",
  ]);
  assert.equal(normalizeTags(Array.from({ length: 20 }, (_, index) => `tag-${index}`)).length, 12);
  assert.deepEqual(normalizeTags("not-an-array"), []);
  assert.deepEqual(parseTagInput("OpenAI, AI\nRAG"), ["openai", "ai", "rag"]);
});

test("source config survives malformed JSON and round-trips", () => {
  assert.deepEqual(parseSourceConfig("{bad"), { tags: [] });
  assert.deepEqual(parseSourceConfig('{"tags":["OpenAI"],"channelId":"UC123"}'), {
    tags: ["openai"],
    channelId: "UC123",
  });
  assert.deepEqual(
    parseSourceConfig(serializeSourceConfig({ tags: ["OpenAI"] })),
    { tags: ["openai"] },
  );
});

test("tag labels are display-only and do not re-alias", () => {
  assert.equal(tagLabel("gpt-6.1-sol"), "Gpt 6.1 Sol");
  assert.equal(tagLabel("openai"), "Openai");
});
