import assert from "node:assert/strict";
import test from "node:test";

import {
  readResolutionNote,
  readSupportRequest,
  SUPPORT_KINDS,
  SUPPORT_KIND_LABELS,
} from "../lib/support.ts";

const VALID = {
  kind: "billing",
  subject: "  Charge looks wrong  ",
  message: "The receipt shows a different amount.\nPlease check it.",
};

test("every supported request kind is accepted", () => {
  for (const kind of SUPPORT_KINDS) {
    const parsed = readSupportRequest({ ...VALID, kind });

    assert.equal(parsed.ok, true, kind);
    assert.equal(parsed.value.kind, kind);
  }
});

test("every kind has a customer-facing label", () => {
  for (const kind of SUPPORT_KINDS) {
    assert.equal(typeof SUPPORT_KIND_LABELS[kind], "string");
    assert.ok(SUPPORT_KIND_LABELS[kind].length > 3);
  }
});

test("a valid request is trimmed and keeps its line breaks", () => {
  const parsed = readSupportRequest(VALID);

  assert.equal(parsed.ok, true);

  if (!parsed.ok) return;

  assert.equal(parsed.value.subject, "Charge looks wrong");
  assert.equal(parsed.value.message.includes("\n"), true);
});

test("unknown kinds and malformed bodies are refused", () => {
  for (const input of [
    null,
    [],
    "billing",
    {},
    { ...VALID, kind: "legal" },
    { ...VALID, kind: "" },
    { ...VALID, kind: 7 },
  ]) {
    assert.equal(readSupportRequest(input).ok, false, JSON.stringify(input));
  }
});

test("short and oversized fields are refused", () => {
  assert.equal(readSupportRequest({ ...VALID, subject: "hi" }).ok, false);
  assert.equal(
    readSupportRequest({ ...VALID, subject: "x".repeat(121) }).ok,
    false,
  );
  assert.equal(readSupportRequest({ ...VALID, message: "short" }).ok, false);
  assert.equal(
    readSupportRequest({ ...VALID, message: "x".repeat(4001) }).ok,
    false,
  );
});

test("a message may be exactly at the bounds", () => {
  assert.equal(
    readSupportRequest({ ...VALID, subject: "abc", message: "x".repeat(10) })
      .ok,
    true,
  );
  assert.equal(
    readSupportRequest({
      ...VALID,
      subject: "x".repeat(120),
      message: "x".repeat(4000),
    }).ok,
    true,
  );
});

test("NUL bytes cannot reach storage", () => {
  const parsed = readSupportRequest({
    ...VALID,
    message: "hello\u0000 world, this is a message",
  });

  assert.equal(parsed.ok, true);

  if (!parsed.ok) return;

  assert.equal(parsed.value.message.includes("\u0000"), false);
});

test("resolution notes are bounded and optional", () => {
  assert.equal(readResolutionNote({ note: "" }).ok, true);
  assert.equal(readResolutionNote({}).ok, true);
  assert.equal(readResolutionNote({ note: "x".repeat(1000) }).ok, true);
  assert.equal(readResolutionNote({ note: "x".repeat(1001) }).ok, false);
});
