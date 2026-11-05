import assert from "node:assert/strict";
import test from "node:test";

import {
  isModelEligible,
  modelAdmissionRefusal,
} from "../lib/providers/eligibility.ts";
import { isServableRoute, planModelRoutes } from "../lib/model-routing.ts";
import {
  MODEL_SELECT,
  PUBLIC_MODEL_SCOPE,
} from "../lib/storage/store/model-sql.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { listModels } from "../lib/storage/store/catalog.ts";
import {
  listProviderReviewModels,
  setModelEligibility,
} from "../lib/storage/store/eligibility.ts";
import { replaceModels } from "../lib/storage/store/model-sync.ts";
import {
  getModelForGateway,
  setModelStatus,
} from "../lib/storage/store/models.ts";
import { setProviderEnabled } from "../lib/storage/store/providers.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = Date.now();
const RECENT = new Date(NOW - 60_000).toISOString();
const OLD = new Date(NOW - 31 * 24 * 60 * 60 * 1000).toISOString();

function candidate(overrides = {}) {
  return {
    id: "router-cheap/test-chat",
    namespaced: true,
    providerSlug: "router-cheap",
    upstreamId: "test-chat",
    protocol: "chat",
    costInputMicros: 1_000_000,
    costOutputMicros: 2_000_000,
    costSource: "manual",
    allowFree: false,
    status: "active",
    inCatalog: true,
    providerEnabled: true,
    providerSortOrder: 40,
    sellInputMicros: 1_250_000,
    sellOutputMicros: 2_500_000,
    groupBillingMode: "paid",
    requiresReview: true,
    decision: "chat",
    costObservedAt: RECENT,
    ...overrides,
  };
}

function syncedModel(overrides = {}) {
  return {
    id: "router-cheap/test-chat",
    upstreamId: "test-chat",
    upstreamSlug: "router-cheap",
    routeGroup: "test-chat",
    name: "Test Chat",
    family: "Test",
    protocol: "chat",
    costSource: "synced",
    contextWindow: "8k",
    tokenWeight: 0,
    costInputMicros: 1_000_000,
    costOutputMicros: 2_000_000,
    allowFree: false,
    supportsTools: false,
    supportsVision: false,
    health: null,
    sortOrder: 10,
    ...overrides,
  };
}

async function fixture() {
  const { pool } = await createPgliteDatabase();

  return createStorageDatabase({ env: {}, pool });
}

test("review flag off preserves existing providers; unknown is denied only when reviewing", () => {
  assert.equal(
    isModelEligible({ requiresReview: false, decision: "unknown" }),
    true,
  );
  assert.equal(isModelEligible({ requiresReview: true, decision: null }), false);
  assert.equal(
    isModelEligible({ requiresReview: true, decision: "unsupported" }),
    false,
  );
  assert.equal(
    isModelEligible({ requiresReview: true, decision: "chat" }),
    true,
  );
});

test("a paid review row needs both costs, both sell prices and fresh manual evidence", () => {
  const base = {
    requiresReview: true,
    decision: "chat",
    billingMode: "paid",
    costSource: "manual",
    costInputMicros: 1_000_000,
    costOutputMicros: 2_000_000,
    sellInputMicros: 1_250_000,
    sellOutputMicros: 2_500_000,
    costObservedAt: RECENT,
  };

  assert.equal(modelAdmissionRefusal(base, NOW), null);
  assert.equal(
    modelAdmissionRefusal({ ...base, decision: "unknown" }, NOW),
    "eligibility",
  );
  assert.equal(
    modelAdmissionRefusal({ ...base, costOutputMicros: 0 }, NOW),
    "cost_unknown",
  );
  assert.equal(
    modelAdmissionRefusal({ ...base, sellOutputMicros: 0 }, NOW),
    "unpriced",
  );
  assert.equal(
    modelAdmissionRefusal({ ...base, costObservedAt: OLD }, NOW),
    "cost_stale",
  );
  assert.equal(
    modelAdmissionRefusal(
      { ...base, costObservedAt: OLD },
      NOW,
      0,
    ),
    null,
    "0 disables the freshness guard",
  );
  assert.equal(
    modelAdmissionRefusal(
      { ...base, requiresReview: false, costInputMicros: 0 },
      NOW,
    ),
    null,
    "non-review providers keep their current behavior",
  );
});

test("an ineligible namespaced row cannot become the published fallback", () => {
  const plan = planModelRoutes([candidate({ decision: "unknown" })]);

  assert.deepEqual(plan, {
    publishedId: null,
    servingId: null,
    ranking: [],
  });
});

test("an eligible secondary can publish alone, but an ineligible stable name is not promoted", () => {
  const onlySecondary = planModelRoutes([candidate()]);

  assert.equal(onlySecondary.publishedId, "router-cheap/test-chat");
  assert.equal(onlySecondary.servingId, "router-cheap/test-chat");

  const stable = candidate({
    id: "test-chat",
    namespaced: false,
    providerSlug: "savant",
    requiresReview: true,
    decision: "unknown",
    costSource: "synced",
    costObservedAt: null,
  });
  const blocked = planModelRoutes([stable, candidate()]);

  assert.equal(blocked.publishedId, "test-chat");
  assert.equal(blocked.servingId, null, "the group hides instead of promoting");
  assert.deepEqual(blocked.ranking, ["router-cheap/test-chat"]);
});

test("a stale or unpriced review candidate is not servable", () => {
  assert.equal(isServableRoute(candidate({ costObservedAt: OLD }), NOW), false);
  assert.equal(isServableRoute(candidate({ sellOutputMicros: 0 }), NOW), false);
  assert.equal(
    isServableRoute(candidate({ costOutputMicros: 0 }), NOW),
    false,
  );
  assert.equal(isServableRoute(candidate({ decision: "chat" }), NOW), true);
});

test("the public scope and gateway projection carry the review state", () => {
  assert.match(PUBLIC_MODEL_SCOPE, /model_eligibility/);
  assert.match(PUBLIC_MODEL_SCOPE, /served_cost_output_micros/);
  assert.match(PUBLIC_MODEL_SCOPE, /reviewRouteFresh|served_provider_slug/);
  assert.match(MODEL_SELECT, /served_requires_model_review/);
  assert.match(MODEL_SELECT, /served_eligibility_decision/);
});

test("router.cheap seeds disabled, review-required and without a reseller customer", async () => {
  const db = await fixture();

  try {
    const row = await db
      .prepare("SELECT * FROM providers WHERE slug = 'router-cheap'")
      .get();

    assert.equal(row.label, "router.cheap");
    assert.equal(row.kind, "openai");
    assert.equal(row.base_url, "https://router.cheap/v1");
    assert.equal(row.key_env_var, "ROUTER_CHEAP_API_KEY");
    assert.equal(Number(row.requires_model_review), 1);
    assert.equal(Number(row.enabled), 0);
    assert.equal(row.status, "unconfigured");

    const table = await db
      .prepare(
        "SELECT to_regclass('public.model_eligibility') AS name",
      )
      .get();

    assert.equal(table.name, "model_eligibility");
  } finally {
    await db.close();
  }
});

test("a decision survives a refetch and a delisting", async () => {
  const db = await fixture();

  try {
    const model = syncedModel();

    await replaceModels(db, [model], 2_500, "router-cheap");

    assert.equal(
      await setModelEligibility(db, {
        providerSlug: "router-cheap",
        upstreamId: "test-chat",
        decision: "chat",
        source: "operator",
      }),
      "ok",
    );

    await replaceModels(db, [model], 2_500, "router-cheap");

    let decision = await db
      .prepare(
        "SELECT decision FROM model_eligibility WHERE provider_slug = 'router-cheap' AND upstream_id = 'test-chat'",
      )
      .get();

    assert.equal(decision.decision, "chat", "a refetch preserves the decision");

    await replaceModels(db, [], 2_500, "router-cheap");

    decision = await db
      .prepare(
        "SELECT decision FROM model_eligibility WHERE provider_slug = 'router-cheap' AND upstream_id = 'test-chat'",
      )
      .get();

    assert.equal(decision.decision, "chat", "a delisting preserves the decision");

    const row = await db
      .prepare("SELECT in_catalog FROM models WHERE id = 'router-cheap/test-chat'")
      .get();

    assert.equal(Number(row.in_catalog), 0);
  } finally {
    await db.close();
  }
});

test("activation and publication wait for an explicit chat decision", async () => {
  const db = await fixture();

  try {
    await replaceModels(db, [syncedModel()], 2_500, "router-cheap");

    assert.equal(
      await setModelStatus(db, "router-cheap/test-chat", "active"),
      "not_eligible",
    );

    assert.equal(
      await setModelEligibility(db, {
        providerSlug: "router-cheap",
        upstreamId: "test-chat",
        decision: "chat",
        source: "operator",
      }),
      "ok",
    );

    await setProviderEnabled(db, "router-cheap", true);

    assert.equal(
      await setModelStatus(db, "router-cheap/test-chat", "active"),
      "ok",
    );

    let ids = (await listModels(db)).map((model) => model.id);

    assert.ok(ids.includes("router-cheap/test-chat"));

    const gateway = await getModelForGateway(db, "router-cheap/test-chat");

    assert.equal(gateway.requiresModelReview, true);
    assert.equal(gateway.decision, "chat");
    assert.equal(
      modelAdmissionRefusal({
        requiresReview: gateway.requiresModelReview,
        decision: gateway.decision,
        billingMode: gateway.billingMode,
        costSource: gateway.costSource,
        costInputMicros: gateway.costInputMicros,
        costOutputMicros: gateway.costOutputMicros,
        sellInputMicros: gateway.sellInputMicros,
        sellOutputMicros: gateway.sellOutputMicros,
        costObservedAt: gateway.costObservedAt,
      }),
      null,
    );

    await    setModelEligibility(db, {
        providerSlug: "router-cheap",
      upstreamId: "test-chat",
      decision: "unsupported",
      source: "operator",
    });

    ids = (await listModels(db)).map((model) => model.id);

    assert.ok(!ids.includes("router-cheap/test-chat"));

    const refused = await getModelForGateway(db, "router-cheap/test-chat");

    assert.equal(
      modelAdmissionRefusal({
        requiresReview: refused.requiresModelReview,
        decision: refused.decision,
        billingMode: refused.billingMode,
        costSource: refused.costSource,
        costInputMicros: refused.costInputMicros,
        costOutputMicros: refused.costOutputMicros,
        sellInputMicros: refused.sellInputMicros,
        sellOutputMicros: refused.sellOutputMicros,
        costObservedAt: refused.costObservedAt,
      }),
      "eligibility",
    );

    const review = await listProviderReviewModels(db, "router-cheap");

    assert.equal(review.length, 1);
    assert.equal(review[0].decision, "unsupported");
    assert.equal(review[0].source, "operator");
  } finally {
    await db.close();
  }
});
