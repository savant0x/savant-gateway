import assert from "node:assert/strict";
import test from "node:test";

import {
  extractApiKey,
  isLocalRequest,
  sanitizeError,
  upstreamUnavailable,
} from "../lib/http.ts";

function requestWith(headers = {}) {
  return new Request("http://localhost/v1/chat/completions", { headers });
}

test("extractApiKey accepts a bearer token", () => {
  assert.equal(
    extractApiKey(requestWith({ authorization: "Bearer sk-test" })),
    "sk-test",
  );
});

test("extractApiKey accepts x-api-key", () => {
  assert.equal(extractApiKey(requestWith({ "x-api-key": "sk-test" })), "sk-test");
});

test("extractApiKey prefers a bearer token", () => {
  assert.equal(
    extractApiKey(
      requestWith({ authorization: "Bearer bearer-key", "x-api-key": "other" }),
    ),
    "bearer-key",
  );
});

test("extractApiKey returns null without a key", () => {
  assert.equal(extractApiKey(requestWith()), null);
});

test("sanitizeError logs the detail and returns only the generic message", () => {
  const original = console.error;
  const logged = [];

  console.error = (...args) => logged.push(args);

  try {
    const message = sanitizeError(
      "test.scope",
      new Error("socket refused while calling upstream with sk-live-detail"),
      "Could not reach the provider",
    );

    assert.equal(message, "Could not reach the provider");
    assert.equal(logged.length, 1);
    assert.match(String(logged[0][0]), /test\.scope/);
    assert.match(String(logged[0][0]), /sk-live-detail/);
  } finally {
    console.error = original;
  }
});

test("sanitizeError handles non-Error throws without exposing them", () => {
  const original = console.error;

  console.error = () => {};

  try {
    assert.equal(
      sanitizeError("test.scope", { secret: "raw-object" }, "Provider sync failed"),
      "Provider sync failed",
    );
  } finally {
    console.error = original;
  }
});

test("a thrown provider error yields a generic 502 body", async () => {
  const original = console.error;

  console.error = () => {};

  try {
    const response = upstreamUnavailable(
      new Error("ECONNRESET while calling upstream with sk-live-detail"),
    );
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.error.message, "Could not reach the provider");
    assert.equal(body.error.type, "upstream_error");
    assert.equal(JSON.stringify(body).includes("sk-live-detail"), false);
  } finally {
    console.error = original;
  }
});

test("isLocalRequest accepts loopback hostnames", () => {
  assert.equal(isLocalRequest(requestWith({ host: "localhost:3000" })), true);
  assert.equal(isLocalRequest(requestWith({ host: "127.0.0.1:3000" })), true);
  assert.equal(isLocalRequest(requestWith({ host: "[::1]:3000" })), true);
});

test("isLocalRequest rejects non-loopback and lookalike hosts", () => {
  assert.equal(isLocalRequest(requestWith({ host: "example.com" })), false);
  assert.equal(isLocalRequest(requestWith({ host: "localhost.example.com" })), false);
});
