import assert from "node:assert/strict";
import test from "node:test";

import {
  addPlanInterval,
  intervalEndIso,
  mapStripeSubscriptionStatus,
  planPriceUsd,
  readStripeSubscriptionSnapshot,
} from "../lib/plan-lifecycle.ts";
import {
  allowanceFor,
  decideAllowance,
  entitlementMatches,
  expandEntitlementIds,
  markupSellMicros,
  readPlanValues,
  subscriptionSnapshot,
  subscriptionWeightedTokens,
} from "../lib/plans.ts";

const VALID = {
  slug: "starter",
  name: "Starter",
  description: "Entry plan",
  status: "active",
  priceUsd: 5,
  interval: "month",
  includedWeightedTokens: 1_000_000,
  overageMode: "block",
  overageMarkupBps: 0,
  sortOrder: 10,
  groups: ["starter"],
  modelIds: ["openai/gpt-4o"],
};

test("plan validation accepts a complete USD plan", () => {
  const result = readPlanValues(VALID);

  assert.equal(result.ok, true);

  if (!result.ok) return;

  assert.equal(result.value.priceMicros, 5_000_000);
  assert.equal(result.value.currency, "usd");
  assert.deepEqual(result.value.groups, ["starter"]);
  assert.equal(result.value.description, "Entry plan");
});

test("plan validation rejects reserved slugs, bad prices, and bad inclusions", () => {
  assert.equal(readPlanValues({ ...VALID, slug: "free" }).ok, false);
  assert.equal(readPlanValues({ ...VALID, slug: "Starter" }).ok, false);
  assert.equal(readPlanValues({ ...VALID, name: "" }).ok, false);
  assert.equal(readPlanValues({ ...VALID, interval: "week" }).ok, false);
  assert.equal(readPlanValues({ ...VALID, overageMode: "auto" }).ok, false);
  assert.equal(readPlanValues({ ...VALID, priceUsd: 0.49 }).ok, false);
  const { priceUsd: _ignored, ...microsInput } = VALID;

  assert.equal(
    readPlanValues({ ...microsInput, priceMicros: 1_000 }).ok,
    false,
  );
  assert.equal(
    readPlanValues({ ...VALID, includedWeightedTokens: -1 }).ok,
    false,
  );
  assert.equal(
    readPlanValues({ ...VALID, overageMarkupBps: 100_001 }).ok,
    false,
  );
  assert.equal(readPlanValues({ ...VALID, groups: "starter" }).ok, false);
  assert.equal(
    readPlanValues({ ...VALID, groups: ["starter", " "] }).ok,
    false,
  );
  assert.equal(readPlanValues({ ...VALID, currency: "eur" }).ok, false);
});

test("draft plans may have a zero price", () => {
  const result = readPlanValues({ ...VALID, status: "draft", priceUsd: 0 });

  assert.equal(result.ok, true);
});

test("entitlements expand groups plus explicit models without duplicates", () => {
  const models = [
    { id: "a", groupSlug: "starter" },
    { id: "b", groupSlug: "starter" },
    { id: "c", groupSlug: "other" },
  ];

  assert.deepEqual(
    expandEntitlementIds({
      groups: ["starter"],
      modelIds: ["c", "a"],
      models,
    }),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    expandEntitlementIds({ groups: [], modelIds: ["c"], models }),
    ["c"],
  );
  assert.equal(entitlementMatches(["a", "b"], "b"), true);
  assert.equal(entitlementMatches(["a", "b"], "c"), false);
});

test("allowance math excludes used and held reservations", () => {
  const allowance = allowanceFor(1000, 400, 100);

  assert.equal(allowance.remainingWeightedTokens, 500);
  assert.equal(allowance.usedBps, 4000);
  assert.deepEqual(
    decideAllowance({
      includedWeightedTokens: 1000,
      usedWeightedTokens: 400,
      heldWeightedTokens: 100,
      estimateWeightedTokens: 500,
      overageMode: "block",
    }),
    { kind: "included", remaining: 500 },
  );
});

test("exhausted block plans block and credit plans fall through", () => {
  const base = {
    includedWeightedTokens: 1000,
    usedWeightedTokens: 900,
    heldWeightedTokens: 100,
    estimateWeightedTokens: 1,
  };

  assert.deepEqual(decideAllowance({ ...base, overageMode: "block" }), {
    kind: "block",
    remaining: 0,
  });
  assert.deepEqual(decideAllowance({ ...base, overageMode: "credit" }), {
    kind: "credit",
    remaining: 0,
  });
});

test("overage markup applies to sell prices and weighted tokens respect a floor", () => {
  assert.equal(markupSellMicros(1000, 0), 1000);
  assert.equal(markupSellMicros(1000, 2500), 1250);
  assert.equal(markupSellMicros(1000, 100_000), 11_000);
  assert.equal(markupSellMicros(-10, 3000), 0);
  assert.equal(subscriptionWeightedTokens(0, 100, 20), 120);
  assert.equal(subscriptionWeightedTokens(3, 100, 20), 360);
});

test("snapshots copy purchased values", () => {
  assert.deepEqual(
    subscriptionSnapshot({
      name: "Starter",
      priceMicros: 5_000_000,
      currency: "usd",
      interval: "month",
      includedWeightedTokens: 1_000_000,
      overageMode: "block",
      overageMarkupBps: 0,
    }),
    {
      name: "Starter",
      priceMicros: 5_000_000,
      currency: "usd",
      interval: "month",
      includedWeightedTokens: 1_000_000,
      overageMode: "block",
      overageMarkupBps: 0,
    },
  );
  assert.equal(planPriceUsd(5_000_000), 5);
});

test("calendar intervals clamp month ends", () => {
  assert.equal(
    intervalEndIso("2026-01-31T00:00:00.000Z", "month"),
    "2026-02-28T00:00:00.000Z",
  );
  assert.equal(
    intervalEndIso("2024-02-29T00:00:00.000Z", "year"),
    "2025-02-28T00:00:00.000Z",
  );
  assert.equal(
    addPlanInterval(
      new Date("2026-12-15T00:00:00.000Z"),
      "month",
    ).toISOString(),
    "2027-01-15T00:00:00.000Z",
  );
});

test("Stripe status maps to local lifecycle and expired access", () => {
  assert.equal(mapStripeSubscriptionStatus("active"), "active");
  assert.equal(mapStripeSubscriptionStatus("trialing"), "active");
  assert.equal(mapStripeSubscriptionStatus("past_due"), "past_due");
  assert.equal(mapStripeSubscriptionStatus("unpaid"), "past_due");
  assert.equal(mapStripeSubscriptionStatus("incomplete_expired"), "expired");
  assert.equal(mapStripeSubscriptionStatus("canceled"), "canceled");
  assert.equal(
    mapStripeSubscriptionStatus(
      "active",
      true,
      "2026-01-01T00:00:00.000Z",
      Date.parse("2026-02-01T00:00:00.000Z"),
    ),
    "canceled",
  );
});

test("Stripe snapshots never invent a billing period", () => {
  const bare = readStripeSubscriptionSnapshot({
    id: "sub_bare",
    status: "active",
    customer: "cus_bare",
    items: { data: [{}] },
  });

  assert.equal(bare.periodStart, null);
  assert.equal(bare.periodEnd, null);
  assert.equal(bare.stripeCustomerId, "cus_bare");
  assert.equal(bare.status, "active");

  const itemDated = readStripeSubscriptionSnapshot({
    id: "sub_item",
    status: "trialing",
    customer: { id: "cus_item" },
    items: {
      data: [
        {
          current_period_start: 1_767_225_600,
          current_period_end: 1_769_817_600,
        },
      ],
    },
  });

  assert.equal(
    itemDated.periodStart,
    new Date(1_767_225_600 * 1000).toISOString(),
  );
  assert.equal(
    itemDated.periodEnd,
    new Date(1_769_817_600 * 1000).toISOString(),
  );

  const topDated = readStripeSubscriptionSnapshot({
    id: "sub_top",
    status: "active",
    customer: "cus_top",
    current_period_start: 1_767_225_600,
    current_period_end: 1_769_817_600,
    cancel_at_period_end: true,
    items: { data: [{}] },
  });

  assert.equal(topDated.cancelAtPeriodEnd, true);
  assert.equal(
    topDated.periodEnd,
    new Date(1_769_817_600 * 1000).toISOString(),
  );
});
