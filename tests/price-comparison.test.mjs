import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCatalogComparison,
  deltaBps,
  parseOpenRouterModels,
  summarizeComparison,
  upstreamSlug,
} from "../lib/price-comparison.ts";

const OPENROUTER = {
  data: [
    {
      id: "openai/gpt-6-luna",
      name: "OpenAI: GPT-6 Luna",
      pricing: { prompt: "0.0000001", completion: "0.0000005" },
    },
    {
      id: "openai/gpt-6-luna:batch",
      name: "OpenAI: GPT-6 Luna (batch)",
      pricing: { prompt: "0.00000005", completion: "0.00000025" },
    },
    {
      id: "openai/gpt-6-luna-pro",
      name: "OpenAI: GPT-6 Luna Pro",
      pricing: { prompt: "0.000001", completion: "0.000005" },
    },
    {
      id: "~openai/gpt-luna-latest",
      name: "OpenAI: Luna Latest",
      pricing: { prompt: "0.0000002", completion: "0.000001" },
    },
    {
      id: "z-ai/glm-5.3",
      name: "Z.AI: GLM 5.3",
      pricing: { prompt: "0.0000000699", completion: "0.0000014" },
    },
    { id: "broken/no-pricing", name: "Broken", pricing: {} },
  ],
};

test("per-token strings become USD per 1M and variants are skipped", () => {
  const models = parseOpenRouterModels(OPENROUTER);

  assert.equal(models.length, 3);
  assert.deepEqual(
    models.map((model) => model.id),
    ["openai/gpt-6-luna", "openai/gpt-6-luna-pro", "z-ai/glm-5.3"],
  );

  const luna = models[0];

  assert.equal(luna.inputPer1M, 0.1);
  assert.equal(luna.outputPer1M, 0.5);

  const glm = models[2];

  assert.equal(glm.inputPer1M, 0.0699);
  assert.equal(glm.outputPer1M, 1.4);
  assert.deepEqual(parseOpenRouterModels(null), []);
  assert.deepEqual(parseOpenRouterModels({ data: "nope" }), []);
});

test("the free pool prefix is not part of the match key", () => {
  assert.equal(upstreamSlug("free/gpt-6-luna"), "gpt-6-luna");
  assert.equal(upstreamSlug(" GPT-6-Luna "), "gpt-6-luna");
});

test("only an exact slug matches, never a revision guess", () => {
  const result = buildCatalogComparison(
    [
      {
        id: "free/gpt-6-luna",
        upstreamId: "free/gpt-6-luna",
        inputPricePer1M: 0.25,
        outputPricePer1M: 1.25,
      },
      {
        id: "gpt-6-luna",
        upstreamId: "gpt-6-luna",
        inputPricePer1M: 0.1,
        outputPricePer1M: 0.5,
      },
      {
        id: "gpt-6-luna-pro",
        upstreamId: "gpt-6-luna-pro",
        inputPricePer1M: 1,
        outputPricePer1M: 5,
      },
      {
        id: "unlisted-model",
        upstreamId: "unlisted-model",
        inputPricePer1M: 1,
        outputPricePer1M: 1,
      },
    ],
    parseOpenRouterModels(OPENROUTER),
  );

  assert.equal(result.matched, 3);
  assert.equal(result.total, 4);
  assert.equal(result.comparisons["unlisted-model"], undefined);
  assert.equal(result.comparisons["gpt-6-luna"].openRouterId, "openai/gpt-6-luna");
  assert.equal(
    result.comparisons["free/gpt-6-luna"].openRouterId,
    "openai/gpt-6-luna",
  );
  // A distinct revision with its own listing matches its own listing only.
  assert.equal(
    result.comparisons["gpt-6-luna-pro"].openRouterId,
    "openai/gpt-6-luna-pro",
  );
});

test("delta basis points are negative when Savant is cheaper", () => {
  assert.equal(deltaBps(0.5, 1), -5_000);
  assert.equal(deltaBps(1.25, 1), 2_500);
  assert.equal(deltaBps(1, 0), null);
  assert.equal(deltaBps(1, Number.NaN), null);
});

test("a matched comparison carries both deltas", () => {
  const result = buildCatalogComparison(
    [
      {
        id: "glm-5.3",
        upstreamId: "glm-5.3",
        inputPricePer1M: 0.195,
        outputPricePer1M: 0.65,
      },
    ],
    parseOpenRouterModels(OPENROUTER),
  );
  const row = result.comparisons["glm-5.3"];

  assert.equal(row.inputDeltaBps, Math.round(((0.195 - 0.0699) / 0.0699) * 10_000));
  assert.equal(row.outputDeltaBps, Math.round(((0.65 - 1.4) / 1.4) * 10_000));
});

test("summary ignores missing deltas and reports the median", () => {
  const summary = summarizeComparison([
    { inputDeltaBps: -5000, outputDeltaBps: -9000 },
    { inputDeltaBps: -1000, outputDeltaBps: 2000 },
    { inputDeltaBps: null, outputDeltaBps: null },
    { inputDeltaBps: 0, outputDeltaBps: -500 },
  ]);

  assert.equal(summary.rows, 4);
  // The null row is excluded, so the median is over [-5000, -1000, 0].
  assert.equal(summary.input.medianBps, -1000);
  assert.equal(summary.input.cheaper, 2);
  assert.equal(summary.input.pricier, 0);
  assert.equal(summary.input.level, 1);
  assert.equal(summary.output.medianBps, -500);
  assert.equal(summary.output.cheaper, 2);
  assert.equal(summary.output.pricier, 1);
});

test("summary is empty rather than zero when nothing is comparable", () => {
  const summary = summarizeComparison([{ inputDeltaBps: null, outputDeltaBps: null }]);

  assert.equal(summary.rows, 1);
  assert.equal(summary.input.medianBps, null);
  assert.equal(summary.output.medianBps, null);
});

test("summary rounds an even-length median instead of picking a side", () => {
  const summary = summarizeComparison([
    { inputDeltaBps: -3000, outputDeltaBps: -3000 },
    { inputDeltaBps: -2000, outputDeltaBps: -2000 },
    { inputDeltaBps: -1000, outputDeltaBps: -1000 },
    { inputDeltaBps: 0, outputDeltaBps: 0 },
  ]);

  assert.equal(summary.input.medianBps, -1500);
});
