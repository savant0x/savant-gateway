import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOMER_COOKIE,
  CUSTOMER_SESSION_TTL_SECONDS,
  generateSessionToken,
  hashSessionToken,
  isSessionToken,
  sessionCookieOptions,
} from "../lib/customer-session.ts";

test("session tokens are 32 random bytes in base64url", () => {
  const first = generateSessionToken();
  const second = generateSessionToken();

  assert.equal(first.length, 43);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.equal(isSessionToken(first), true);
});

test("token shape validation rejects malformed values", () => {
  assert.equal(isSessionToken(null), false);
  assert.equal(isSessionToken(""), false);
  assert.equal(isSessionToken("a".repeat(42)), false);
  assert.equal(isSessionToken("a".repeat(44)), false);
  assert.equal(isSessionToken(`${"a".repeat(42)}+`), false);
});

test("only the token hash is deterministic", () => {
  const token = generateSessionToken();
  const hash = hashSessionToken(token);

  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hashSessionToken(token), hash);
  assert.notEqual(hashSessionToken(generateSessionToken()), hash);
});

test("session cookies are HttpOnly, SameSite lax, and scoped to the site", () => {
  const secure = sessionCookieOptions(true);

  assert.equal(CUSTOMER_COOKIE, "sg_session");
  assert.equal(secure.httpOnly, true);
  assert.equal(secure.sameSite, "lax");
  assert.equal(secure.secure, true);
  assert.equal(secure.path, "/");
  assert.equal(secure.maxAge, CUSTOMER_SESSION_TTL_SECONDS);
  assert.equal(sessionCookieOptions(false).secure, false);
});
