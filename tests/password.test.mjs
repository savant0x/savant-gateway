import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "../lib/password.ts";

const PASSWORD = "correct horse battery staple";

test("a scrypt hash verifies the original password", () => {
  const hash = hashPassword(PASSWORD);

  assert.match(
    hash,
    /^scrypt\$1\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
  );
  assert.equal(verifyPassword(PASSWORD, hash), true);
});

test("each hash uses a fresh salt", () => {
  const first = hashPassword(PASSWORD);
  const second = hashPassword(PASSWORD);

  assert.notEqual(first, second);
  assert.equal(verifyPassword(PASSWORD, first), true);
  assert.equal(verifyPassword(PASSWORD, second), true);
});

test("a wrong password or missing hash fails", () => {
  const hash = hashPassword(PASSWORD);

  assert.equal(verifyPassword("wrong password", hash), false);
  assert.equal(verifyPassword(PASSWORD, null), false);
  assert.equal(verifyPassword("", hash), false);
});

test("a malformed or unsupported hash fails closed", () => {
  assert.equal(verifyPassword(PASSWORD, ""), false);
  assert.equal(verifyPassword(PASSWORD, "plaintext"), false);
  assert.equal(
    verifyPassword(PASSWORD, "scrypt$2$16384$8$1$c2FsdA$a2V5"),
    false,
  );
  assert.equal(verifyPassword(PASSWORD, "scrypt$1$1$8$1$c2FsdA$a2V5"), false);
});

test("overlong passwords are rejected on both paths", () => {
  assert.throws(() => hashPassword("a".repeat(5000)), /too long/i);
  assert.equal(verifyPassword("a".repeat(5000), hashPassword(PASSWORD)), false);
});
