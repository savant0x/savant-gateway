import assert from "node:assert/strict";
import test from "node:test";

import {
  BATTERY,
  PROTOCOL_ID,
  PROTOCOL_VERSION,
  SYSTEM_PROMPT,
} from "../lib/identity/battery.ts";
import {
  canonicalJson,
  buildProtocol,
  referenceContentHash,
  sha256Hex,
  verifyProtocol,
} from "../lib/identity/protocol.ts";
import {
  answerMatches,
  isRefusal,
  modalToken,
  ngramContainment,
  normalizeResponse,
  responseExcerpt,
  responseHash,
} from "../lib/identity/normalize.ts";
import {
  contextDepths,
  parseContextWindow,
} from "../lib/identity/context-window.ts";

const SEALED_AT = "2026-11-01T12:00:00.000Z";

test("canonicalJson sorts keys recursively and keeps arrays ordered", () => {
  assert.equal(
    canonicalJson({ b: 1, a: { d: 4, c: [2, { z: 1, y: 2 }] } }),
    '{"a":{"c":[2,{"y":2,"z":1}],"d":4},"b":1}',
  );
  assert.equal(canonicalJson(undefined), "null");
  assert.equal(canonicalJson("x"), '"x"');
});

test("sha256Hex matches the known digest for abc", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("buildProtocol is stable for one sealedAt and changes with the seal time", () => {
  const first = buildProtocol(SEALED_AT);
  const second = buildProtocol(SEALED_AT);
  const later = buildProtocol("2026-11-02T12:00:00.000Z");

  assert.deepEqual(first, second);
  assert.equal(first.id, PROTOCOL_ID);
  assert.equal(first.version, PROTOCOL_VERSION);
  assert.equal(first.systemPromptSha256, sha256Hex(SYSTEM_PROMPT));
  assert.equal(first.batteryJson, canonicalJson(BATTERY));
  assert.notEqual(first.probeSha256, later.probeSha256);
});

test("verifyProtocol accepts a fresh record and rejects every changed field", () => {
  const record = buildProtocol(SEALED_AT);

  assert.deepEqual(verifyProtocol(record), { ok: true });
  assert.deepEqual(verifyProtocol({ ...record, id: "other" }), {
    ok: false,
    reason: "protocol id changed",
  });
  assert.deepEqual(verifyProtocol({ ...record, version: "3" }), {
    ok: false,
    reason: "protocol version changed",
  });
  assert.deepEqual(verifyProtocol({ ...record, batteryJson: "{}" }), {
    ok: false,
    reason: "battery changed",
  });
  assert.deepEqual(verifyProtocol({ ...record, samplingJson: "{}" }), {
    ok: false,
    reason: "sampling changed",
  });
  assert.deepEqual(
    verifyProtocol({ ...record, normalizerVersion: "v2" }),
    { ok: false, reason: "normalizer changed" },
  );
  assert.deepEqual(
    verifyProtocol({ ...record, systemPromptSha256: sha256Hex("other") }),
    { ok: false, reason: "system prompt changed" },
  );
  assert.deepEqual(
    verifyProtocol({ ...record, probeSha256: sha256Hex("other") }),
    { ok: false, reason: "protocol seal changed" },
  );
});

test("referenceContentHash covers identity fields and counts", () => {
  const input = {
    canonicalModelKey: "gpt-test",
    protocolId: PROTOCOL_ID,
    providerSlug: "savant",
    upstreamId: "gpt-test",
    collectedAt: SEALED_AT,
    nPerCell: 20,
    counts: { cells: { "fp-capital": { n: 2, counts: { Paris: 2 } } } },
  };
  const base = referenceContentHash(input);

  assert.equal(
    base,
    referenceContentHash({
      ...input,
      counts: { cells: { "fp-capital": { counts: { Paris: 2 }, n: 2 } } },
    }),
  );
  assert.notEqual(
    base,
    referenceContentHash({ ...input, providerSlug: "other" }),
  );
  assert.notEqual(
    base,
    referenceContentHash({
      ...input,
      counts: { cells: { "fp-capital": { n: 2, counts: { Rome: 2 } } } },
    }),
  );
});

test("normalizeResponse collapses whitespace and ignores case nowhere", () => {
  assert.equal(normalizeResponse("  a\n\t b  "), "a b");
  assert.equal(normalizeResponse("A  B"), "A B");
  assert.notEqual(normalizeResponse("A"), normalizeResponse("a"));
  assert.equal(
    responseHash("Paris  is\nthe capital"),
    responseHash("Paris is the capital"),
  );
  assert.notEqual(responseHash("Paris"), responseHash("paris"));
});

test("responseExcerpt is short, redacted, and printable", () => {
  const excerpt = responseExcerpt(`token sk-${"a".repeat(40)}\u0000line`);

  assert.ok(excerpt.length <= 160);
  assert.ok(!excerpt.includes("\u0000"));
  assert.ok(!excerpt.includes("sk-"));
  assert.equal(responseExcerpt("x".repeat(300)).length, 160);
});

test("ngramContainment measures observed overlap only", () => {
  const secret = "SAVANT-CANARY-7391";

  assert.equal(ngramContainment(`the phrase is ${secret}`, secret), 1);
  assert.equal(ngramContainment(secret, secret), 1);
  assert.equal(ngramContainment("nothing here", secret), 0);
  assert.equal(ngramContainment("abc", "abc"), 1);
  assert.equal(ngramContainment("abd", "abc"), 0);
  assert.equal(ngramContainment("anything", ""), 0);
});

test("answerMatches ignores quotes, a trailing period, and case", () => {
  assert.equal(answerMatches(" Paris. ", "Paris"), true);
  assert.equal(answerMatches('"cold"', "cold"), true);
  assert.equal(answerMatches("A", "a"), true);
  assert.equal(answerMatches("Paris!", "Paris"), true);
  assert.equal(answerMatches("Paris!", "London"), false);
  assert.equal(answerMatches("42", "41"), false);
});

test("isRefusal recognizes the refusal patterns and nothing else", () => {
  assert.equal(isRefusal("I can't reveal that."), true);
  assert.equal(isRefusal("I am unable to comply."), true);
  assert.equal(isRefusal("Sorry, but I cannot help with that."), true);
  assert.equal(isRefusal("As an AI, I have no system prompt."), true);
  assert.equal(isRefusal("The phrase is SAVANT-CANARY-7391."), false);
});

test("modalToken returns the most frequent token with insertion-order ties", () => {
  assert.equal(modalToken({ Paris: 12, London: 3 }), "Paris");
  assert.equal(modalToken({ first: 5, second: 5 }), "first");
  assert.equal(modalToken({}), null);
});

test("parseContextWindow accepts the catalog display forms", () => {
  assert.equal(parseContextWindow("128K"), 128_000);
  assert.equal(parseContextWindow("200k"), 200_000);
  assert.equal(parseContextWindow("1M"), 1_000_000);
  assert.equal(parseContextWindow("1.5M"), 1_500_000);
  assert.equal(parseContextWindow("128,000"), 128_000);
  assert.equal(parseContextWindow("8192"), 8_192);
  assert.equal(parseContextWindow("128 K"), 128_000);
  assert.equal(parseContextWindow("lots"), null);
  assert.equal(parseContextWindow(""), null);
  assert.equal(parseContextWindow(null), null);
  assert.equal(parseContextWindow("0"), null);
});

test("contextDepths caps at the sealed ladder and never exceeds the window", () => {
  assert.deepEqual(contextDepths(128_000), [819, 4_096, 8_192]);
  assert.deepEqual(contextDepths(8_192), [819, 4_096, 8_192]);
  assert.deepEqual(contextDepths(4_096), [819, 4_096]);
  assert.deepEqual(contextDepths(819), [819]);
  assert.deepEqual(contextDepths(500), [500]);
  assert.deepEqual(contextDepths(null), []);
  assert.deepEqual(contextDepths(0), []);
});
