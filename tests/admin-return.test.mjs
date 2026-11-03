import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_LOGIN_PATH,
  adminLoginHref,
  safeAdminReturnTo,
} from "../lib/admin-return.ts";

test("a safe admin path and query round-trip", () => {
  assert.equal(
    safeAdminReturnTo("/admin/pricing?range=30d"),
    "/admin/pricing?range=30d",
  );
  assert.equal(safeAdminReturnTo("/admin"), "/admin");
  assert.equal(safeAdminReturnTo("/admin/customers?query=glm"), "/admin/customers?query=glm");
});

test("external, protocol-relative and malformed targets are rejected", () => {
  for (const value of [
    null,
    undefined,
    "",
    "https://evil.example/admin",
    "//evil.example/admin",
    "/\\evil.example/admin",
    "/admin/pricing\nLocation: https://evil.example",
    "/admin/pricing\u0000",
    "/administer",
    "/api/admin",
    "/dashboard",
    ADMIN_LOGIN_PATH,
    `${ADMIN_LOGIN_PATH}?returnTo=/admin`,
    "javascript:alert(1)",
    `/${"a".repeat(2_100)}`,
  ]) {
    assert.equal(safeAdminReturnTo(value), null, String(value));
  }
});

test("login href carries only a validated destination", () => {
  assert.equal(
    adminLoginHref("/admin/analytics?range=30d"),
    `${ADMIN_LOGIN_PATH}?returnTo=%2Fadmin%2Fanalytics%3Frange%3D30d&notice=session`,
  );
  assert.equal(
    adminLoginHref("https://evil.example/admin"),
    ADMIN_LOGIN_PATH,
    "an unsafe destination is dropped rather than encoded",
  );
  assert.equal(
    adminLoginHref("/admin/pricing", null),
    `${ADMIN_LOGIN_PATH}?returnTo=%2Fadmin%2Fpricing`,
  );
});
