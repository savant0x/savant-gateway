import assert from "node:assert/strict";
import test from "node:test";

import {
  completionResourceProblem,
  readBoundedText,
  readJsonObject,
} from "../lib/request-limits.ts";
import { clientKey } from "../lib/customer-rate-limit.ts";
import { createRateLimiter } from "../lib/admin-rate-limit.ts";
import {
  checkCompletionRate,
  resetCompletionRateLimits,
} from "../lib/gateway-rate-limit.ts";

const request = (body, headers = {}) => new Request("http://localhost/test", {
  method: "POST", body, headers,
});
const valid = { messages: [{ role: "user", content: "hello" }] };

test("bounded JSON rejects every non-object root and malformed UTF-8", async () => {
  for (const body of ["null", "[]", '"hello"', "2", "true", "{", ""]) {
    await assert.rejects(readJsonObject(request(body)), { status: 400 });
  }
  await assert.rejects(readJsonObject(request(new Uint8Array([255]))), { status: 400 });
  assert.deepEqual(await readJsonObject(request('{"a":1}')), { a: 1 });
});

test("byte limits count chunked UTF-8 and do not trust Content-Length", async () => {
  await assert.rejects(readJsonObject(request("{}", { "content-length": "999" }), 8), { status: 413 });
  await assert.rejects(readJsonObject(request('{"x":"💠"}', { "content-length": "1" }), 10), { status: 413 });
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("12345"));
      controller.enqueue(new TextEncoder().encode("67890"));
    },
    cancel() { cancelled = true; },
  });
  const chunked = new Request("http://localhost/test", { method: "POST", body: stream, duplex: "half" });
  await assert.rejects(readBoundedText(chunked, 8), { status: 413 });
  assert.equal(cancelled, true);
});

test("slow body times out even if cancellation never resolves", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() { cancelled = true; return new Promise(() => {}); },
  });
  const slow = new Request("http://localhost/test", { method: "POST", body: stream, duplex: "half" });
  await assert.rejects(readBoundedText(slow, 100, 20), { status: 408 });
  assert.equal(cancelled, true);
});

test("JSON depth and node count are bounded independently of bytes", async () => {
  let deep = {};
  for (let i = 0; i < 34; i++) deep = { nested: deep };
  await assert.rejects(readJsonObject(request(JSON.stringify(deep))), { status: 413 });
  await assert.rejects(readJsonObject(request(JSON.stringify({ many: Array(20001).fill(0) }))), { status: 413 });
});

test("all completion aliases are checked before defaults", () => {
  assert.equal(completionResourceProblem(valid), null);
  assert.equal(completionResourceProblem({ ...valid, n: 1, max_tokens: 65536 }), null);
  for (const value of [null, "10", 0, -1, 1.5, Infinity, NaN, 65537]) {
    for (const name of ["max_tokens", "max_completion_tokens"]) {
      assert.ok(completionResourceProblem({ ...valid, [name]: value }));
    }
  }
  assert.ok(completionResourceProblem({ ...valid, max_tokens: -1, max_completion_tokens: 10 }));
  for (const n of [0, 2, null, "1"]) assert.ok(completionResourceProblem({ ...valid, n }));
  assert.ok(completionResourceProblem({ ...valid, stream: "true" }));
});

test("message/tool counts and invalid message roots are refused", () => {
  for (const messages of [[], [null], [1], [{}], [{ role: "bogus" }], Array(257).fill(valid.messages[0])]) {
    assert.ok(completionResourceProblem({ messages }));
  }
  for (const name of ["tools", "functions"]) {
    assert.ok(completionResourceProblem({ ...valid, [name]: {} }));
    assert.ok(completionResourceProblem({ ...valid, [name]: Array(129).fill({}) }));
  }
});

test("forged forwarded headers cannot create a new client identity", () => {
  const forged = new Request("http://localhost", { headers: {
    "x-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2", "fly-client-ip": "198.51.100.3",
  } });
  assert.equal(clientKey(forged, {}), "untrusted-client");
  assert.equal(clientKey(forged, { GATEWAY_TRUSTED_IP_HEADER: "x-forwarded-for" }), "untrusted-client");
  assert.equal(clientKey(forged, { GATEWAY_TRUSTED_IP_HEADER: "fly-client-ip" }), "198.51.100.3");
  const list = new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.1, 198.51.100.2" } });
  assert.equal(clientKey(list, { GATEWAY_TRUSTED_IP_HEADER: "x-real-ip" }), "untrusted-client");
});

test("limiter saturation refuses new identities without evicting existing limits", () => {
  const limiter = createRateLimiter({ maxEntries: 2, limit: 1, windowMs: 100 });
  limiter.fail("a", 0);
  limiter.fail("b", 0);
  assert.equal(limiter.check("c", 1).allowed, false);
  limiter.fail("c", 1);
  assert.equal(limiter.check("a", 1).allowed, false);
  assert.equal(limiter.check("c", 100).allowed, true);
  limiter.fail("c", 100);
  assert.equal(limiter.check("c", 101).allowed, false);
});

test("paid keys belonging to one account cannot multiply dispatch capacity", () => {
  resetCompletionRateLimits();
  const config = { freeSharedRpm: 1, paidKeyRpm: 1 };
  const call = (userId, keyId) => checkCompletionRate({ userId, keyId, free: false, now: 0, config });
  assert.equal(call("alpha", "a1").allowed, true);
  assert.equal(call("alpha", "a2").allowed, false);
  assert.equal(call("beta", "b1").allowed, true);
});
