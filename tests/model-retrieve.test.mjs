import assert from "node:assert/strict";
import test from "node:test";

import {
  findPublishedModel,
  guardModelRead,
  modelNotFound,
  openAiModelObject,
} from "../lib/openai-model.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { bindStoreRuntime } from "../lib/store-facade/runtime.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const MODEL = {
  id: "free/luna-1",
  upstreamId: "luna-1",
  upstreamSlug: "savant",
  name: "Luna 1",
  provider: "Luna",
  family: "Luna",
  access: "free",
  groupSlug: "free",
  groupLabel: "Free",
  groupBillingMode: "free",
  requiresSubscription: false,
  contextWindow: "128000",
  tokenWeight: 1,
  allowFree: true,
  inputPricePer1M: 0,
  outputPricePer1M: 0,
  supportsTools: true,
  supportsVision: false,
  health: "healthy",
  sortOrder: 0,
};

test("model retrieve returns the same public object shape as the list", async () => {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  bindStoreRuntime(async () => db);

  try {
    const object = await openAiModelObject(MODEL);

    assert.equal(object.object, "model");
    assert.equal(object.id, "free/luna-1");
    assert.equal(object.name, "Luna 1 (Free)");
    assert.equal(object.owned_by, "savant-gateway");
    assert.equal(object.group, "free");
    assert.equal(object.group_billing_mode, "free");
    assert.equal(object.trial_paid_transition, null);
    assert.equal("upstream_id" in object, false);
    assert.equal("cost_input_micros" in object, false);
  } finally {
    await db.close();
  }
});

test("model retrieve resolves only published rows and 404s otherwise", async () => {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  bindStoreRuntime(async () => db);

  try {
    assert.equal(await findPublishedModel("free/luna-1"), null);

    const missing = await modelNotFound("free/luna-1");
    const body = await missing.json();

    assert.equal(missing.status, 404);
    assert.equal(body.error.code, "model_not_found");
    assert.equal(body.error.type, "invalid_request_error");
    assert.equal(missing.headers.get("access-control-allow-origin"), "*");
  } finally {
    await db.close();
  }
});

test("model endpoints require a credential before any catalog read", async () => {
  const missing = await guardModelRead(new Request("https://example.com/v1/models/x"));

  assert.ok(missing);
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error.type, "authentication_error");

  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  bindStoreRuntime(async () => db);

  try {
    const invalid = await guardModelRead(
      new Request("https://example.com/v1/models/x", {
        headers: { authorization: "Bearer sk_not_a_real_key" },
      }),
    );

    assert.ok(invalid);
    assert.equal(invalid.status, 401);
  } finally {
    await db.close();
  }
});
