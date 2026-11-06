import assert from "node:assert/strict";
import test from "node:test";

import {
  bindingStillValid,
  matchVisualBuild,
} from "../lib/visual-builds/matching.ts";
import { catalogIdentityDigest } from "../lib/visual-builds/types.ts";

const MODEL = {
  id: "gpt-6.1-sol",
  upstreamId: "gpt-6.1-sol",
  name: "GPT-6.1 Sol",
  family: "OpenAI",
  inCatalog: true,
  status: "active",
};

test("exact normalized ids bind and a free SKU does not borrow the paid build", () => {
  const match = matchVisualBuild({
    originalModelId: "gpt-6.1-sol",
    models: [MODEL],
  });

  assert.equal(match.state, "matched");
  assert.equal(match.modelId, MODEL.id);
  assert.equal(match.method, "exact_id");

  const free = matchVisualBuild({
    originalModelId: "free/gpt-6.1-sol",
    models: [MODEL],
  });

  assert.equal(free.state, "unmatched");
  assert.equal(free.modelId, null);
});

test("an operator alias is exact evidence; a display-name hit is only a suggestion", () => {
  const alias = matchVisualBuild({
    originalModelId: "some-source-label",
    models: [MODEL],
    aliases: [{ externalModelId: "some-source-label", modelId: MODEL.id }],
  });

  assert.equal(alias.state, "matched");
  assert.equal(alias.method, "operator_alias");

  const suggestion = matchVisualBuild({
    originalModelId: "unknown-source-id",
    originalModelLabel: "GPT-6.1 Sol",
    models: [MODEL],
  });

  assert.equal(suggestion.state, "suggestion");
  assert.equal(suggestion.modelId, null);
  assert.deepEqual(suggestion.candidateIds, [MODEL.id]);
});

test("ambiguous ids and inactive targets are refused, not guessed", () => {
  const ambiguous = matchVisualBuild({
    originalModelId: "gpt-6.1-sol",
    models: [
      MODEL,
      {
        ...MODEL,
        id: "sk_gpt_free",
        upstreamId: "gpt-6.1-sol",
        name: "GPT-6.1 Sol Free",
      },
    ],
  });

  assert.equal(ambiguous.state, "ambiguous");
  assert.equal(ambiguous.modelId, null);

  const inactive = matchVisualBuild({
    originalModelId: "gpt-6.1-sol",
    models: [{ ...MODEL, status: "disabled" }],
  });

  assert.equal(inactive.state, "unmatched");
});

test("a binding is stale after a model rename or delisting", () => {
  const binding = {
    id: "b1",
    revisionId: "r1",
    modelId: MODEL.id,
    state: "accepted",
    method: "exact_id",
    reason: "exact",
    catalogDigest: catalogIdentityDigest(MODEL),
    reviewer: null,
    reviewedAt: null,
    createdAt: "2026-11-05T00:00:00.000Z",
  };

  assert.equal(
    bindingStillValid(binding, MODEL, catalogIdentityDigest(MODEL)).ok,
    true,
  );
  assert.equal(
    bindingStillValid(
      binding,
      { ...MODEL, name: "Renamed" },
      catalogIdentityDigest({ ...MODEL, name: "Renamed" }),
    ).ok,
    false,
  );
  assert.equal(
    bindingStillValid(
      binding,
      { ...MODEL, inCatalog: false },
      catalogIdentityDigest({ ...MODEL, inCatalog: false }),
    ).ok,
    false,
  );
});
