import assert from "node:assert/strict";
import test from "node:test";

import { readCatalogGroups } from "../lib/providers/catalog-groups.ts";

/**
 * The vendor's prefix-group document.
 *
 * Two promises: a shape change is reported instead of silently stored as an
 * empty snapshot, and an absent capacity figure stays absent rather than
 * becoming "zero publishers", which would look like the opposite fact.
 */

const ENTRY = {
  slug: "qwencloud-alibaba",
  prefix: "alitp",
  label: "Alibaba Token Plan",
  status: "available",
  enabled: true,
  activeProviders: 18,
  systemPromptNote: null,
  models: [{ id: "a" }, { id: "b" }],
};

test("a bare array of groups is read", () => {
  const groups = readCatalogGroups([ENTRY]);

  assert.deepEqual(groups, [
    {
      prefix: "alitp",
      slug: "qwencloud-alibaba",
      label: "Alibaba Token Plan",
      status: "available",
      enabled: true,
      activeProviders: 18,
      systemPromptNote: null,
      modelCount: 2,
    },
  ]);
});

test("a wrapped list is read under any of the three keys", () => {
  for (const key of ["data", "groups", "catalog"]) {
    assert.equal(readCatalogGroups({ [key]: [ENTRY] }).length, 1, key);
  }
});

test("a duplicate prefix keeps the first entry", () => {
  const groups = readCatalogGroups([
    ENTRY,
    { ...ENTRY, label: "Second", activeProviders: 99 },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Alibaba Token Plan");
});

test("an entry without a prefix is skipped, not guessed", () => {
  const groups = readCatalogGroups([{ ...ENTRY, prefix: "  " }, {}, ENTRY]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].prefix, "alitp");
});

test("capacity that is not a count is absent, never zero", () => {
  for (const activeProviders of [null, undefined, -1, 1.5, "18", Number.NaN]) {
    const groups = readCatalogGroups([{ ...ENTRY, activeProviders }]);

    assert.equal(
      groups[0].activeProviders,
      null,
      String(activeProviders),
    );
  }
});

test("a system prompt note is trimmed and capped", () => {
  const groups = readCatalogGroups([
    { ...ENTRY, systemPromptNote: "   Prepends a client header.  " },
    { ...ENTRY, prefix: "long", systemPromptNote: "x".repeat(900) },
    { ...ENTRY, prefix: "blank", systemPromptNote: "   " },
  ]);

  assert.equal(groups[0].systemPromptNote, "Prepends a client header.");
  assert.equal(groups[1].systemPromptNote?.length, 500);
  assert.equal(groups[2].systemPromptNote, null);
});

test("a payload with no list is an error, so the sync reports a shape change", () => {
  for (const payload of [null, "text", 42, {}, { data: {} }, { groups: "no" }]) {
    assert.throws(
      () => readCatalogGroups(payload),
      /not a list/,
      JSON.stringify(payload),
    );
  }
});

test("an empty list is a valid snapshot", () => {
  assert.deepEqual(readCatalogGroups([]), []);
});

test("a missing models array counts zero rather than failing", () => {
  const groups = readCatalogGroups([{ ...ENTRY, models: undefined }]);

  assert.equal(groups[0].modelCount, 0);
});
