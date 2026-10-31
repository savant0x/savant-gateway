import assert from "node:assert/strict";
import test from "node:test";

import {
  compareCatalogRows,
  defaultSortDirection,
  sortCatalogRows,
} from "../lib/catalog-sort.ts";

function row(overrides = {}) {
  return {
    id: "gpt-example",
    name: "GPT Example",
    family: "GPT",
    groupLabel: "Paid",
    groupBillingMode: "paid",
    tokenWeight: 0,
    supportsTools: false,
    supportsVision: false,
    inputPricePer1M: 1,
    outputPricePer1M: 2,
    benchmarkIndex: null,
    comparisonBps: null,
    ...overrides,
  };
}

const ROWS = [
  row({
    id: "a",
    name: "Alpha",
    family: "GPT",
    groupLabel: "Paid",
    tokenWeight: 3,
    supportsTools: true,
    supportsVision: false,
    inputPricePer1M: 5,
    outputPricePer1M: 10,
    benchmarkIndex: 60,
    comparisonBps: 10,
  }),
  row({
    id: "b",
    name: "Bravo",
    family: "Claude",
    groupLabel: "Free",
    groupBillingMode: "free",
    tokenWeight: 0,
    supportsTools: true,
    supportsVision: true,
    inputPricePer1M: 0,
    outputPricePer1M: 0,
    benchmarkIndex: 80,
    comparisonBps: -20,
  }),
  row({
    id: "c",
    name: "Charlie",
    family: "DeepSeek",
    groupLabel: "Paid",
    tokenWeight: 1,
    inputPricePer1M: 1,
    outputPricePer1M: 1,
    benchmarkIndex: null,
    comparisonBps: null,
  }),
];

function ids(rows) {
  return rows.map((entry) => entry.id);
}

test("model sorts by name in both directions with a family tiebreak", () => {
  assert.deepEqual(ids(sortCatalogRows(ROWS, "model", "asc")), ["a", "b", "c"]);
  assert.deepEqual(ids(sortCatalogRows(ROWS, "model", "desc")), ["c", "b", "a"]);
});

test("group sorts by its label", () => {
  assert.deepEqual(ids(sortCatalogRows(ROWS, "group", "asc")), ["b", "a", "c"]);
});

test("weight sorts heavy first by default and missing weight last", () => {
  assert.equal(defaultSortDirection("weight"), "desc");
  assert.deepEqual(ids(sortCatalogRows(ROWS, "weight", "desc")), ["a", "c", "b"]);
  assert.deepEqual(ids(sortCatalogRows(ROWS, "weight", "asc")), ["c", "a", "b"]);
});

test("features sorts by how many capabilities a row has", () => {
  assert.deepEqual(ids(sortCatalogRows(ROWS, "features", "desc")), ["b", "a", "c"]);
});

test("benchmark sorts high first and never treats unmeasured as zero", () => {
  assert.equal(defaultSortDirection("benchmark"), "desc");
  assert.deepEqual(ids(sortCatalogRows(ROWS, "benchmark", "desc")), ["b", "a", "c"]);
  assert.deepEqual(ids(sortCatalogRows(ROWS, "benchmark", "asc")), ["a", "b", "c"]);
});

test("price sorts cheap first and breaks a tie on the output rate", () => {
  assert.equal(defaultSortDirection("price"), "asc");
  assert.deepEqual(ids(sortCatalogRows(ROWS, "price", "asc")), ["b", "c", "a"]);

  const tie = [
    row({ id: "cheap-output", name: "A", inputPricePer1M: 1, outputPricePer1M: 0 }),
    row({ id: "dear-output", name: "B", inputPricePer1M: 1, outputPricePer1M: 9 }),
  ];

  assert.deepEqual(ids(sortCatalogRows(tie, "price", "asc")), [
    "cheap-output",
    "dear-output",
  ]);
});

test("comparison sorts the biggest saving first with unmatched rows last", () => {
  assert.deepEqual(ids(sortCatalogRows(ROWS, "comparison", "asc")), ["b", "a", "c"]);
  assert.deepEqual(ids(sortCatalogRows(ROWS, "comparison", "desc")), ["a", "b", "c"]);
});

test("a full tie falls back to the name so the order is stable", () => {
  const tied = [
    row({ id: "z", name: "Zulu", benchmarkIndex: 70 }),
    row({ id: "y", name: "Yankee", benchmarkIndex: 70 }),
  ];

  assert.deepEqual(ids(sortCatalogRows(tied, "benchmark", "desc")), ["y", "z"]);
  assert.deepEqual(ids(sortCatalogRows(tied, "benchmark", "asc")), ["y", "z"]);
});

test("sorting does not mutate the input array", () => {
  const original = [...ROWS];

  sortCatalogRows(ROWS, "price", "asc");

  assert.deepEqual(ids(ROWS), ids(original));
});

test("a comparator is consistent in both argument orders", () => {
  const forward = compareCatalogRows(ROWS[0], ROWS[2], "price", "asc");
  const reverse = compareCatalogRows(ROWS[2], ROWS[0], "price", "asc");

  assert.equal(Math.sign(forward), -Math.sign(reverse));
});
