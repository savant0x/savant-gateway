import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTEXT_BANNER_MAX_CHARS,
  normalizeBannerText,
  validateBannerText,
  withContextBanner,
} from "../lib/context-banner.ts";

test("banner text is trimmed and control characters are dropped", () => {
  assert.equal(normalizeBannerText("  hello\r\nworld\u0007  "), "hello\nworld");
  assert.equal(normalizeBannerText("\u0000 \u0001"), "");
  assert.equal(normalizeBannerText("tab\tstays"), "tab\tstays");
});

test("banner validation rejects non-strings and overlong text", () => {
  assert.equal(validateBannerText(42).ok, false);
  assert.equal(validateBannerText(null).ok, false);
  assert.equal(
    validateBannerText("x".repeat(CONTEXT_BANNER_MAX_CHARS + 1)).ok,
    false,
  );

  const accepted = validateBannerText("  savant code  ");

  assert.deepEqual(accepted, { ok: true, text: "savant code" });
});

test("an enabled banner is one leading system message", () => {
  const messages = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
  ];
  const injected = withContextBanner(messages, "  Savant Code  ");

  assert.deepEqual(injected, [
    { role: "system", content: "Savant Code" },
    ...messages,
  ]);
  assert.equal(injected.length, 3);
  assert.equal(messages.length, 2);
  assert.equal(withContextBanner(messages, "   "), messages);
});
