import assert from "node:assert/strict";
import test from "node:test";

import { syncAfterSave } from "../lib/providers/enable-sync.ts";

/**
 * When a save reads the catalog.
 *
 * The rule exists because the operator's first question after adding a key is
 * "did it work", and a model count is the answer. The risk it trades against is
 * a vendor round trip on every save: a rename must not cost one, and a provider
 * this runtime has no key for cannot answer at all.
 */

const BASE = {
  enabled: true,
  keyEnvVar: "INFERHUB_API_KEY",
  baseUrl: "https://api.inferhub.dev/v1",
  catalogUrl: "https://inferhub.dev/api/catalog",
  balanceUrl: "https://inferhub.dev/api/me",
  defaultHeaders: { "X-InferHub-No-Queue": "1" },
};

test("enabling a provider reads its catalog", () => {
  assert.equal(
    syncAfterSave({
      before: { ...BASE, enabled: false },
      after: BASE,
      configured: true,
    }),
    true,
  );
});

test("creating a provider that is ready to serve reads its catalog", () => {
  assert.equal(
    syncAfterSave({ before: null, after: BASE, configured: true }),
    true,
  );
});

test("a save with no key in this runtime reads nothing", () => {
  assert.equal(
    syncAfterSave({
      before: null,
      after: BASE,
      configured: false,
    }),
    false,
  );
  assert.equal(
    syncAfterSave({
      before: { ...BASE, enabled: false },
      after: BASE,
      configured: false,
    }),
    false,
  );
});

test("a disabled provider reads nothing, however it changed", () => {
  assert.equal(
    syncAfterSave({
      before: BASE,
      after: { ...BASE, enabled: false, baseUrl: "https://other.test/v1" },
      configured: true,
    }),
    false,
  );
});

test("an unrelated edit of an enabled provider reads nothing", () => {
  for (const after of [
    { ...BASE },
    { ...BASE, keyEnvVar: BASE.keyEnvVar },
    { ...BASE, defaultHeaders: { "X-InferHub-No-Queue": "1" } },
  ]) {
    assert.equal(
      syncAfterSave({ before: BASE, after, configured: true }),
      false,
      JSON.stringify(after),
    );
  }
});

test("moving the address re-reads, because the catalog moved with it", () => {
  for (const after of [
    { ...BASE, keyEnvVar: "OTHER_KEY" },
    { ...BASE, baseUrl: "https://api.other.test/v1" },
    { ...BASE, catalogUrl: "https://other.test/api/catalog" },
    { ...BASE, balanceUrl: "https://other.test/api/me" },
    { ...BASE, defaultHeaders: { "X-InferHub-No-Queue": "0" } },
    { ...BASE, defaultHeaders: { "X-InferHub-No-Queue": "1", extra: "yes" } },
  ]) {
    assert.equal(
      syncAfterSave({ before: BASE, after, configured: true }),
      true,
      JSON.stringify(after),
    );
  }
});

test("header order is not a change", () => {
  const headers = { a: "1", b: "2" };

  assert.equal(
    syncAfterSave({
      before: { ...BASE, defaultHeaders: { b: "2", a: "1" } },
      after: { ...BASE, defaultHeaders: headers },
      configured: true,
    }),
    false,
  );
});

test("dropping a document URL is a change, not an absence", () => {
  assert.equal(
    syncAfterSave({
      before: BASE,
      after: { ...BASE, catalogUrl: null, balanceUrl: null },
      configured: true,
    }),
    true,
  );
});
