import assert from "node:assert/strict";
import test from "node:test";

import { extractApiKey, isLocalRequest } from "../lib/http.ts";

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

test("isLocalRequest accepts loopback hostnames", () => {
  assert.equal(isLocalRequest(requestWith({ host: "localhost:3000" })), true);
  assert.equal(isLocalRequest(requestWith({ host: "127.0.0.1:3000" })), true);
  assert.equal(isLocalRequest(requestWith({ host: "[::1]:3000" })), true);
});

test("isLocalRequest rejects non-loopback and lookalike hosts", () => {
  assert.equal(isLocalRequest(requestWith({ host: "example.com" })), false);
  assert.equal(isLocalRequest(requestWith({ host: "localhost.example.com" })), false);
});
