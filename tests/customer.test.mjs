import assert from "node:assert/strict";
import test from "node:test";

import {
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  normalizeName,
  validateEmail,
  validateName,
  validateNewPassword,
} from "../lib/customer.ts";

test("email normalization trims and lowercases", () => {
  assert.equal(normalizeEmail("  Ada@Example.COM "), "ada@example.com");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail(42), "");
});

test("names collapse whitespace and reject non-strings", () => {
  assert.equal(normalizeName("  Ada   Lovelace "), "Ada Lovelace");
  assert.equal(normalizeName(undefined), "");
});

test("email validation rejects empty, malformed, and overlong values", () => {
  assert.equal(validateEmail(""), "Email is required.");
  assert.equal(validateEmail("not-an-email"), "Enter a valid email address.");
  assert.equal(validateEmail("a@b"), "Enter a valid email address.");
  assert.equal(validateEmail("a@b.c"), null);
  assert.equal(validateEmail(`${"a".repeat(250)}@b.co`), "Email is too long.");
});

test("name validation bounds the value", () => {
  assert.equal(validateName(""), "Name is required.");
  assert.equal(validateName("A".repeat(81)), "Name is too long.");
  assert.equal(validateName("Ada"), null);
});

test("new passwords enforce the minimum length", () => {
  assert.equal(
    validateNewPassword("short"),
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  );
  assert.equal(validateNewPassword("a".repeat(12)), null);
  assert.equal(validateNewPassword("a".repeat(257)), "Password is too long.");
});
