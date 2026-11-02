import assert from "node:assert/strict";
import test from "node:test";

import {
  inferRelation,
  modelAliases,
  suggestModelLinks,
} from "../lib/content/linking.ts";

const MODELS = [
  {
    id: "free/gpt-6-luna",
    name: "GPT-6 Luna",
    family: "GPT",
    upstreamId: "gpt-6-luna",
  },
  {
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    family: "GPT",
    upstreamId: "gpt-6.1-sol",
  },
  {
    id: "claude-opus-4.6",
    name: "Claude Opus 4.6",
    family: "Claude",
    upstreamId: "claude-opus-4.6",
  },
];

test("aliases require a version token and dedupe", () => {
  const aliases = modelAliases(MODELS[0]);

  assert.deepEqual(
    aliases.map((alias) => alias.tokens.join(" ")),
    ["gpt 6 luna"],
  );
  assert.deepEqual(modelAliases({ id: "gpt", name: "GPT", family: "GPT", upstreamId: "gpt" }), []);
});

test("title punctuation variants match the same model", () => {
  const suggestions = suggestModelLinks(
    { title: "GPT-6 Luna launch notes", tags: [], kind: "article" },
    MODELS,
  );

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].modelId, "free/gpt-6-luna");
  assert.equal(suggestions[0].confidence, 1);
  assert.equal(suggestions[0].relation, "release");
  assert.match(suggestions[0].reason, /Title matches/);
});

test("a bare family or a longer sibling does not match", () => {
  assert.deepEqual(
    suggestModelLinks({ title: "GPT is useful", tags: [], kind: "article" }, MODELS),
    [],
  );
  assert.deepEqual(
    suggestModelLinks({ title: "GPT-4o is fast", tags: [], kind: "article" }, MODELS),
    [],
  );
  assert.deepEqual(
    suggestModelLinks({ title: "GPT-61 Sol is fast", tags: [], kind: "article" }, MODELS),
    [],
  );
});

test("an exact publisher tag matches at lower confidence than a title", () => {
  const suggestions = suggestModelLinks(
    { title: "Weekly roundup", tags: ["gpt-6-luna"], kind: "discussion" },
    MODELS,
  );

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].confidence, 0.85);
  assert.equal(suggestions[0].relation, "discussion");
  assert.match(suggestions[0].reason, /Tag matches/);
});

test("one article can link several models", () => {
  const suggestions = suggestModelLinks(
    {
      title: "Claude Opus 4.6 vs GPT-6.1 Sol",
      tags: [],
      kind: "benchmark",
    },
    MODELS,
  );

  assert.deepEqual(
    suggestions.map((suggestion) => suggestion.modelId),
    ["claude-opus-4.6", "gpt-6.1-sol"],
  );
  assert.ok(suggestions.every((suggestion) => suggestion.relation === "mention"));
});

test("relation inference follows kind before keywords", () => {
  assert.equal(inferRelation("repo", "Launch notes", []), "repository");
  assert.equal(inferRelation("paper", "A new benchmark", []), "paper");
  assert.equal(inferRelation("article", "How to build with Luna", []), "hands_on");
  assert.equal(inferRelation("article", "A quiet update", []), "mention");
});
