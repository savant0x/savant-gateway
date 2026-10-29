import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_COOKIE,
  ADMIN_TTL_SECONDS,
  createSessionToken,
  isSameOriginRequest,
  readAdminConfig,
  sessionCookieOptions,
  verifyAdminPassword,
  verifySessionToken,
} from "../lib/admin-session.ts";

const NOW = Date.UTC(2026, 9, 29, 6, 0, 0);
const CONFIG = readAdminConfig({
  ADMIN_PASSWORD: "correct horse battery",
  ADMIN_SESSION_SECRET: "s".repeat(48),
});

test("admin config requires both credentials", () => {
  assert.equal(CONFIG.configured, true);
  assert.equal(readAdminConfig({}).configured, false);
  assert.equal(
    readAdminConfig({ ADMIN_PASSWORD: "short" }).configured,
    false,
  );
  assert.equal(
    readAdminConfig({
      ADMIN_PASSWORD: "long enough password",
      ADMIN_SESSION_SECRET: "short",
    }).configured,
    false,
  );
});

test("session token round-trips and carries an expiry", () => {
  assert.equal(CONFIG.configured, true);

  const token = createSessionToken(CONFIG, 0, NOW);
  const parts = token.split(".");

  assert.equal(parts.length, 5);
  assert.equal(parts[0], "v1");
  assert.equal(Number(parts[1]), Math.floor(NOW / 1000) + ADMIN_TTL_SECONDS);
  assert.equal(parts[2], "0");
  assert.equal(verifySessionToken(token, CONFIG, 0, NOW), true);
  assert.equal(
    verifySessionToken(token, CONFIG, 0, NOW + ADMIN_TTL_SECONDS * 1000),
    false,
  );
  assert.equal(verifySessionToken(token, CONFIG, 1, NOW), false);
});

test("a tampered token or wrong secret fails", () => {
  const token = createSessionToken(CONFIG, 0, NOW);
  const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

  assert.equal(verifySessionToken(tampered, CONFIG, 0, NOW), false);
  assert.equal(
    verifySessionToken(
      token,
      readAdminConfig({
        ADMIN_PASSWORD: "correct horse battery",
        ADMIN_SESSION_SECRET: "x".repeat(48),
      }),
      0,
      NOW,
    ),
    false,
  );
});

test("rotating the password invalidates existing sessions", () => {
  const token = createSessionToken(CONFIG, 0, NOW);
  const rotated = readAdminConfig({
    ADMIN_PASSWORD: "a different long password",
    ADMIN_SESSION_SECRET: "s".repeat(48),
  });

  assert.equal(verifySessionToken(token, rotated, 0, NOW), false);
});

test("a token minted far in the future is rejected", () => {
  const token = createSessionToken(
    CONFIG,
    0,
    NOW + ADMIN_TTL_SECONDS * 2 * 1000,
  );

  assert.equal(verifySessionToken(token, CONFIG, 0, NOW), false);
});

test("password verification is exact and rejects empty input", () => {
  assert.equal(verifyAdminPassword("correct horse battery", CONFIG.password), true);
  assert.equal(verifyAdminPassword("correct horse batterY", CONFIG.password), false);
  assert.equal(verifyAdminPassword("", CONFIG.password), false);
  assert.equal(verifyAdminPassword(null, CONFIG.password), false);
});

test("cookie options are hardened", () => {
  assert.equal(ADMIN_COOKIE, "sg_admin");

  const secure = sessionCookieOptions(true);

  assert.equal(secure.httpOnly, true);
  assert.equal(secure.sameSite, "strict");
  assert.equal(secure.secure, true);
  assert.equal(secure.path, "/");
  assert.equal(secure.maxAge, ADMIN_TTL_SECONDS);
  assert.equal(sessionCookieOptions(false).secure, false);
});

test("origin checks compare the request host", () => {
  const request = (origin, host = "localhost:3000") =>
    new Request("http://localhost:3000/admin", {
      headers: {
        host,
        ...(origin === undefined ? {} : { origin }),
      },
    });

  assert.equal(isSameOriginRequest(request(undefined)), true);
  assert.equal(isSameOriginRequest(request("http://localhost:3000")), true);
  assert.equal(isSameOriginRequest(request("https://evil.example")), false);
  assert.equal(isSameOriginRequest(request("null")), false);
  assert.equal(
    isSameOriginRequest(request("http://localhost:3000", "localhost:4000")),
    false,
  );
});
