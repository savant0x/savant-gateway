import assert from "node:assert/strict";
import test from "node:test";

import {
  betterSide,
  isBetter,
  resolveComparePair,
} from "../lib/compare.ts";

function model(id, overrides = {}) {
  return {
    id,
    upstreamId: id,
    name: id,
    family: "Family",
    contextWindow: "1M",
    tokenWeight: 1,
    allowFree: false,
    access: "paid",
    groupSlug: "paid",
    groupLabel: "Paid",
    groupBillingMode: "paid",
    groupSource: "auto",
    requiresSubscription: false,
    inputPricePer1M: 1,
    outputPricePer1M: 2,
    supportsTools: true,
    supportsVision: false,
    health: null,
    status: "active",
    syncedAt: "2026-10-29T00:00:00.000Z",
    ...overrides,
  };
}

const MODELS = [
  model("claude-opus-4.7"),
  model("deepseek-v4-flash"),
  model("glm-5-air"),
];

test("resolves both sides from ids", () => {
  const pair = resolveComparePair(MODELS, "glm-5-air", "claude-opus-4.7");

  assert.equal(pair.left.id, "glm-5-air");
  assert.equal(pair.right.id, "claude-opus-4.7");
});

test("an unknown id falls back instead of failing the page", () => {
  const pair = resolveComparePair(MODELS, "gone-forever", "deepseek-v4-flash");

  assert.equal(pair.left.id, "claude-opus-4.7");
  assert.equal(pair.right.id, "deepseek-v4-flash");
});

test("no ids at all gives the first two catalog rows", () => {
  const pair = resolveComparePair(MODELS);

  assert.equal(pair.left.id, "claude-opus-4.7");
  assert.equal(pair.right.id, "deepseek-v4-flash");
});

test("comparing a model with itself moves the right side", () => {
  const pair = resolveComparePair(MODELS, "deepseek-v4-flash", "deepseek-v4-flash");

  assert.equal(pair.left.id, "deepseek-v4-flash");
  assert.notEqual(pair.right.id, pair.left.id);
});

test("the default pair prefers priced rows over free ones", () => {
  const pair = resolveComparePair([
    model("deepseek-v4-pro", { access: "free", groupSlug: "free" }),
    model("claude-opus-4.7"),
    model("glm-5-air"),
  ]);

  assert.equal(pair.left.id, "claude-opus-4.7");
  assert.equal(pair.right.id, "glm-5-air");
});

test("an explicit free model still gets a priced counterpart", () => {
  const pair = resolveComparePair(
    [
      model("deepseek-v4-pro", { access: "free", groupSlug: "free" }),
      model("claude-opus-4.7"),
    ],
    "deepseek-v4-pro",
    "missing-id",
  );

  assert.equal(pair.left.id, "deepseek-v4-pro");
  assert.equal(pair.right.id, "claude-opus-4.7");
});

test("one model is not a comparison", () => {
  assert.equal(resolveComparePair([model("only")]), null);
  assert.equal(resolveComparePair([]), null);
});

test("lower is better, and equal or missing values mark nothing", () => {
  assert.equal(betterSide(1, 2, "lower"), "left");
  assert.equal(betterSide(2, 1, "lower"), "right");
  assert.equal(betterSide(2, 2, "lower"), null);
  assert.equal(betterSide(null, 2, "lower"), null);
  assert.equal(betterSide(undefined, 2, "higher"), null);
  assert.equal(betterSide(Number.NaN, 2, "higher"), null);
});

test("higher is better for quality and speed scores", () => {
  assert.equal(betterSide(62.4, 27.8, "higher"), "left");
  assert.equal(betterSide(27.8, 62.4, "higher"), "right");
  assert.equal(betterSide(-1, -2, "higher"), "left");
});

test("a side only matches its own winner", () => {
  assert.equal(isBetter("left", "left"), true);
  assert.equal(isBetter("right", "left"), false);
  assert.equal(isBetter("left", null), false);
});
