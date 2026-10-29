import assert from "node:assert/strict";
import test from "node:test";

import {
  accessFromGroup,
  canDeleteGroup,
  defaultGroupSlug,
  GROUP_SLUG_PATTERN,
  pricesForGroup,
  readGroupCreateInput,
  readGroupReassignment,
  readGroupUpdateInput,
  SYSTEM_GROUP_DEFINITIONS,
} from "../lib/model-groups.ts";

const VALID = {
  slug: "starter",
  label: "Starter",
  billingMode: "paid",
  description: "Entry paid tier",
  sortOrder: 10,
};

test("system groups cover free, paid, and subscription with fixed modes", () => {
  assert.deepEqual(
    SYSTEM_GROUP_DEFINITIONS.map((group) => [group.slug, group.billingMode]),
    [
      ["free", "free"],
      ["paid", "paid"],
      ["subscription", "subscription"],
    ],
  );
  assert.ok(SYSTEM_GROUP_DEFINITIONS.every((group) => group.isSystem));
});

test("group creation normalizes a valid custom group", () => {
  const result = readGroupCreateInput({
    ...VALID,
    label: "  Starter  ",
    description: "  Entry paid tier  ",
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.slug, "starter");
  assert.equal(result.value.label, "Starter");
  assert.equal(result.value.description, "Entry paid tier");
  assert.equal(result.value.billingMode, "paid");
});

test("group creation rejects reserved slugs and invalid fields", () => {
  for (const patch of [
    { slug: "free" },
    { slug: "paid" },
    { slug: "Bad Slug" },
    { slug: "a" },
    { label: "" },
    { label: "x".repeat(41) },
    { billingMode: "enterprise" },
    { description: "x".repeat(201) },
    { sortOrder: 1.5 },
    { sortOrder: "10" },
  ]) {
    const result = readGroupCreateInput({ ...VALID, ...patch });

    assert.equal(result.ok, false, JSON.stringify(patch));
  }
});

test("slug rules accept lowercase dashed identifiers", () => {
  assert.equal(GROUP_SLUG_PATTERN.test("starter"), true);
  assert.equal(GROUP_SLUG_PATTERN.test("team-beta"), true);
  assert.equal(GROUP_SLUG_PATTERN.test("a1"), true);
  assert.equal(GROUP_SLUG_PATTERN.test("starter_plus"), false);
  assert.equal(GROUP_SLUG_PATTERN.test("Starter"), false);
});

test("group updates accept every system slug and required fields", () => {
  const result = readGroupUpdateInput({
    slug: "free",
    label: "Free pool",
    billingMode: "free",
    description: "",
    sortOrder: 0,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.description, null);
  assert.equal(result.value.sortOrder, 0);
});

test("a free group zeroes both prices and other groups preserve them", () => {
  assert.deepEqual(
    pricesForGroup({
      billingMode: "free",
      sellInputMicros: 500,
      sellOutputMicros: 900,
    }),
    { sellInputMicros: 0, sellOutputMicros: 0 },
  );
  assert.deepEqual(
    pricesForGroup({
      billingMode: "paid",
      sellInputMicros: 500,
      sellOutputMicros: 900,
    }),
    { sellInputMicros: 500, sellOutputMicros: 900 },
  );
});

test("the group billing mode wins over the provider-derived fallback", () => {
  assert.equal(accessFromGroup("paid", "free"), "paid");
  assert.equal(accessFromGroup("free", "paid"), "free");
  assert.equal(accessFromGroup(null, "subscription"), "subscription");
});

test("provider flags only decide the default group", () => {
  assert.equal(
    defaultGroupSlug({
      allowFree: true,
      tokenWeight: 3,
      upstreamId: "free/gpt-6-luna",
    }),
    "free",
  );
  assert.equal(
    defaultGroupSlug({
      allowFree: false,
      tokenWeight: 0,
      upstreamId: "free/claude-opus-4.6",
    }),
    "subscription",
  );
  assert.equal(
    defaultGroupSlug({
      allowFree: false,
      tokenWeight: 0,
      upstreamId: "gpt-6-luna",
    }),
    "paid",
  );
});

test("system groups are protected and custom groups can be deleted", () => {
  assert.equal(canDeleteGroup({ isSystem: true }), false);
  assert.equal(canDeleteGroup({ isSystem: false }), true);
});

test("reassignment requires a different existing destination", () => {
  const groups = [{ slug: "paid" }, { slug: "starter" }];

  assert.deepEqual(
    readGroupReassignment({
      slug: "starter",
      reassignTo: "paid",
      groups,
    }),
    { ok: true, value: "paid" },
  );
  assert.equal(
    readGroupReassignment({
      slug: "starter",
      reassignTo: "starter",
      groups,
    }).ok,
    false,
  );
  assert.equal(
    readGroupReassignment({
      slug: "starter",
      reassignTo: "missing",
      groups,
    }).ok,
    false,
  );
  assert.equal(
    readGroupReassignment({ slug: "starter", reassignTo: "", groups }).ok,
    false,
  );
});
