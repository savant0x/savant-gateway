import assert from "node:assert/strict";
import test from "node:test";

import {
  benchmarkSanityProblem,
  matchBenchmarks,
  normalizeModelKey,
  withoutBuildDate,
} from "../lib/benchmarks.ts";
import { parseAaBenchmarks } from "../lib/benchmarks-parse.ts";

const PAYLOAD = {
  status: "success",
  // Live shape: top level, and numeric in the real response.
  intelligence_index_version: "5.0",
  data: [
    {
      id: "aa-opus",
      slug: "claude-opus-4-6",
      name: "Claude Opus 4.6",
      model_creator: { name: "Anthropic" },
      evaluations: {
        artificial_analysis_intelligence_index: 62.9,
        artificial_analysis_coding_index: 58.1,
        artificial_analysis_agentic_index: 44.4,
      },
      performance: {
        median_output_tokens_per_second: 78.42,
        median_time_to_first_token_seconds: 1.235,
        median_end_to_end_response_time_seconds: 9.5,
      },
      evaluated_at: "2026-10-20",
    },
    {
      id: "aa-deepseek",
      slug: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      model_creator: { name: "DeepSeek" },
      evaluations: { artificial_analysis_intelligence_index: 41.2 },
      performance: { median_output_tokens_per_second: 120 },
    },
    {
      id: "aa-shared-a",
      slug: "family-a-shared",
      name: "Shared Name",
      model_creator: { name: "Family A" },
      evaluations: { artificial_analysis_intelligence_index: 30 },
    },
    {
      id: "aa-shared-b",
      slug: "family-b-shared",
      name: "Shared Name",
      model_creator: { name: "Family B" },
      evaluations: { artificial_analysis_intelligence_index: 31 },
    },
    {
      id: "aa-speed-only",
      slug: "speed-only",
      name: "Speed Only",
      performance: { median_output_tokens_per_second: 200 },
    },
    { id: "aa-empty", slug: "no-measurements", name: "No Measurements" },
    // A model measured only on the coding index is still a measurement: the
    // headline index is not the only number that counts.
    {
      id: "aa-coding-only",
      slug: "coding-only",
      name: "Coding Only",
      evaluations: { artificial_analysis_coding_index: 55.5 },
    },
  ],
};

test("ids normalise across the free prefix, dots, spaces and underscores", () => {
  assert.equal(normalizeModelKey("free/claude-opus-4.6"), "claude-opus-4-6");
  assert.equal(normalizeModelKey(" GPT 6 Luna "), "gpt-6-luna");
  assert.equal(normalizeModelKey("z-ai/glm-5.3"), "z-ai/glm-5-3");
  assert.equal(normalizeModelKey("a__b--c"), "a-b-c");
});

test("parsing keeps measurements, drops records that say nothing", () => {
  const parsed = parseAaBenchmarks(PAYLOAD);

  assert.equal(parsed.indexVersion, "5.0");
  // The empty record is dropped; the speed-only and coding-only ones are kept.
  assert.equal(parsed.candidates.length, 6);

  const opus = parsed.candidates[0];

  assert.equal(opus.slug, "claude-opus-4-6");
  assert.equal(opus.creator, "Anthropic");
  assert.equal(opus.intelligenceIndex, 62.9);
  assert.equal(opus.outputTokensPerSecond, 78.42);
  assert.equal(opus.ttftSeconds, 1.235);
  assert.equal(opus.codingIndex, 58.1);
  assert.equal(opus.agenticIndex, 44.4);
  assert.equal(opus.endToEndSeconds, 9.5);
  assert.equal(opus.measuredAt, "2026-10-20");

  const deepseek = parsed.candidates[1];

  assert.equal(deepseek.outputTokensPerSecond, 120);
  // A missing field is null, never zero.
  assert.equal(deepseek.ttftSeconds, null);
  assert.equal(deepseek.codingIndex, null);
  assert.equal(parsed.candidates[4].intelligenceIndex, null);
  // No headline index, but the coding measurement keeps the record alive.
  assert.equal(parsed.candidates[5].codingIndex, 55.5);
  assert.equal(parsed.candidates[5].intelligenceIndex, null);
});

test("a numeric index version keeps its major.minor form", () => {
  // The live response sends 5, not "5.0"; dropping it would strip every
  // score of its provenance.
  const numeric = parseAaBenchmarks({
    ...PAYLOAD,
    intelligence_index_version: 5,
  });

  assert.equal(numeric.indexVersion, "5.0");
  assert.equal(
    parseAaBenchmarks({ ...PAYLOAD, intelligence_index_version: 5.1 })
      .indexVersion,
    "5.1",
  );
});

test("a non-payload body parses as empty rather than throwing", () => {
  for (const body of [null, "html", { data: "nope" }, { data: [] }]) {
    const parsed = parseAaBenchmarks(body);

    assert.deepEqual(parsed.candidates, []);
    assert.equal(parsed.indexVersion, null);
  }
});

test("matching prefers an exact slug, then a name", () => {
  const parsed = parseAaBenchmarks(PAYLOAD);
  const outcome = matchBenchmarks(parsed.candidates, [
    {
      id: "free/claude-opus-4.6",
      upstreamId: "free/claude-opus-4.6",
      name: "Claude 4.6 Opus",
      family: "Claude",
    },
    {
      id: "deepseek-v4-flash-0731",
      upstreamId: "deepseek-v4-flash-0731",
      name: "DeepSeek V4 Flash",
      family: "DeepSeek",
    },
  ]);

  assert.equal(outcome.matched, 2);
  assert.equal(outcome.matches["free/claude-opus-4.6"].matchedBy, "slug");
  assert.equal(outcome.matches["free/claude-opus-4.6"].intelligenceIndex, 62.9);
  assert.equal(outcome.matches["free/claude-opus-4.6"].codingIndex, 58.1);
  assert.equal(outcome.matches["free/claude-opus-4.6"].agenticIndex, 44.4);
  assert.equal(outcome.matches["free/claude-opus-4.6"].endToEndSeconds, 9.5);
  // Its id carries a build date the source does not publish, so the id-derived
  // fallback settles it before the display name is consulted.
  assert.equal(
    outcome.matches["deepseek-v4-flash-0731"].matchedBy,
    "slug_without_build",
  );
  assert.equal(
    outcome.matches["deepseek-v4-flash-0731"].sourceSlug,
    "deepseek-v4-flash",
  );
});

test("a build date is not part of the identity", () => {
  assert.equal(withoutBuildDate("deepseek-v4-pro-0813"), "deepseek-v4-pro");
  assert.equal(withoutBuildDate("glm-5-3"), "glm-5-3");
  assert.equal(withoutBuildDate("claude-opus-4-6"), "claude-opus-4-6");
});

test("a dated id with no published base model still matches nothing", () => {
  const parsed = parseAaBenchmarks(PAYLOAD);
  const outcome = matchBenchmarks(parsed.candidates, [
    {
      id: "hy4-preview-2024",
      upstreamId: "hy4-preview-2024",
      name: "HY4 Preview",
      family: "HY",
    },
  ]);

  assert.equal(outcome.matched, 0);
  assert.equal(outcome.matches["hy4-preview-2024"], undefined);
});

test("a display name still matches when the id does not", () => {
  const parsed = parseAaBenchmarks(PAYLOAD);
  const outcome = matchBenchmarks(parsed.candidates, [
    {
      id: "z-ai/totally-different-id",
      upstreamId: "z-ai/totally-different-id",
      name: "Claude Opus 4.6",
      family: "Claude",
    },
  ]);

  assert.equal(outcome.matches["z-ai/totally-different-id"].matchedBy, "name");
  assert.equal(
    outcome.matches["z-ai/totally-different-id"].intelligenceIndex,
    62.9,
  );
});

test("a shared display name is settled by the creator, not by order", () => {
  const parsed = parseAaBenchmarks(PAYLOAD);
  const outcome = matchBenchmarks(parsed.candidates, [
    {
      id: "shared-from-a",
      upstreamId: "shared-from-a",
      name: "Shared Name",
      family: "Family A",
    },
    {
      id: "shared-from-z",
      upstreamId: "shared-from-z",
      name: "Shared Name",
      family: "Family Z",
    },
  ]);

  assert.equal(outcome.matches["shared-from-a"].matchedBy, "creator_name");
  assert.equal(outcome.matches["shared-from-a"].intelligenceIndex, 30);
  // The unresolved one is refused and reported, never guessed.
  assert.equal(outcome.matches["shared-from-z"], undefined);
  assert.deepEqual(outcome.ambiguous, ["shared-from-z"]);
});

test("an unmeasured model is absent, not zero", () => {
  const parsed = parseAaBenchmarks(PAYLOAD);
  const outcome = matchBenchmarks(parsed.candidates, [
    {
      id: "unlisted-model",
      upstreamId: "unlisted-model",
      name: "A Model Nobody Measured",
      family: "Nobody",
    },
  ]);

  assert.equal(outcome.matched, 0);
  assert.equal(outcome.matches["unlisted-model"], undefined);
  assert.deepEqual(outcome.ambiguous, []);
});

test("the sanity gate refuses a payload that collapsed", () => {
  const previous = { candidates: 200, matched: 20 };

  assert.equal(
    benchmarkSanityProblem(null, { candidates: 0, matched: 0 }),
    "The payload carried no benchmark records.",
  );
  assert.match(
    benchmarkSanityProblem(previous, { candidates: 40, matched: 20 }),
    /shrank from 200 to 40/,
  );
  assert.match(
    benchmarkSanityProblem(previous, { candidates: 200, matched: 5 }),
    /Matches fell from 20 to 5/,
  );
  assert.equal(
    benchmarkSanityProblem(previous, { candidates: 200, matched: 17 }),
    null,
  );
});

test("a first sync has no previous totals to compare against", () => {
  assert.equal(
    benchmarkSanityProblem(null, { candidates: 3, matched: 1 }),
    null,
  );
});
