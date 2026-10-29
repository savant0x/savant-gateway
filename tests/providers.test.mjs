import assert from "node:assert/strict";
import test from "node:test";

import { authHeaders } from "../lib/providers/auth-headers.ts";
import {
  inferModelProtocol,
  normalizeBaseUrl,
  providerKeyConfigured,
  publicModelId,
  readProviderInput,
} from "../lib/providers/registry.ts";

const VALID = {
  slug: "commandcode",
  label: "CommandCode",
  kind: "both",
  baseUrl: "https://api.commandcode.ai/provider/v1/",
  keyEnvVar: "COMMANDCODE_API_KEY",
  defaultHeaders: { "x-test": "1" },
  capabilities: { balance: false, subscription: false, pricing: false },
};

test("provider input normalizes and accepts a valid registry row", () => {
  const result = readProviderInput(VALID);

  assert.equal(result.ok, true);
  assert.equal(result.value.slug, "commandcode");
  assert.equal(result.value.baseUrl, "https://api.commandcode.ai/provider/v1");
  assert.deepEqual(result.value.defaultHeaders, { "x-test": "1" });
  assert.equal(result.value.enabled, true);
  assert.equal(result.value.capabilities.balance, false);
});

test("provider input rejects unsafe slugs, kinds, URLs, and key names", () => {
  for (const patch of [
    { slug: "Bad Slug" },
    { kind: "responses" },
    { baseUrl: "ftp://example.com" },
    { keyEnvVar: "lowercase" },
  ]) {
    const result = readProviderInput({ ...VALID, ...patch });

    assert.equal(result.ok, false, JSON.stringify(patch));
  }
});

test("provider input rejects non-string header values", () => {
  const result = readProviderInput({
    ...VALID,
    defaultHeaders: { "x-test": 1 },
  });

  assert.equal(result.ok, false);
});

test("normalizeBaseUrl removes trailing slashes", () => {
  assert.equal(
    normalizeBaseUrl("https://example.com/v1///"),
    "https://example.com/v1",
  );
});

test("public model ids are scoped for non-default providers", () => {
  assert.equal(publicModelId("savant", "free/gpt-6-luna"), "free/gpt-6-luna");
  assert.equal(
    publicModelId("commandcode", "claude-sonnet-4-6"),
    "commandcode/claude-sonnet-4-6",
  );
});

test("protocol routing follows provider kind and supported endpoints", () => {
  assert.equal(
    inferModelProtocol({
      kind: "openai",
      upstreamId: "deepseek/deepseek-v4-flash",
      family: "DeepSeek",
    }),
    "chat",
  );
  assert.equal(
    inferModelProtocol({
      kind: "anthropic",
      upstreamId: "claude-sonnet-4-6",
      family: "Claude",
    }),
    "messages",
  );
  assert.equal(
    inferModelProtocol({
      kind: "both",
      upstreamId: "claude-sonnet-4-6",
      family: "Claude",
      supportedEndpoints: ["https://api.commandcode.ai/provider/v1/messages"],
    }),
    "messages",
  );
  assert.equal(
    inferModelProtocol({
      kind: "both",
      upstreamId: "deepseek/deepseek-v4-flash",
      family: "DeepSeek",
      supportedEndpoints: [
        "https://api.commandcode.ai/provider/v1/chat/completions",
        "https://api.commandcode.ai/provider/v1/responses",
      ],
    }),
    "chat",
  );
  assert.equal(
    inferModelProtocol({
      kind: "both",
      upstreamId: "responses-only",
      family: "Other",
      supportedEndpoints: ["https://api.commandcode.ai/provider/v1/responses"],
    }),
    null,
  );
  assert.equal(
    inferModelProtocol({
      kind: "both",
      upstreamId: "claude-opus-4-6",
      family: "Claude",
    }),
    "messages",
  );
});

test("a dual-format provider authenticates both wire formats", () => {
  const headers = authHeaders("both", "sk-test", { src: "gate" });

  assert.equal(headers.Authorization, "Bearer sk-test");
  assert.equal(headers["x-api-key"], "sk-test");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal(headers.src, "gate");
  assert.equal(headers.Accept, "application/json");
});

test("single-format providers send only their own credential", () => {
  const openai = authHeaders("openai", "sk-test");
  const anthropic = authHeaders("anthropic", "sk-test");

  assert.equal(openai.Authorization, "Bearer sk-test");
  assert.equal(openai["x-api-key"], undefined);
  assert.equal(anthropic["x-api-key"], "sk-test");
  assert.equal(anthropic.Authorization, undefined);
});

test("key configuration reads only the named environment variable", () => {
  assert.equal(
    providerKeyConfigured("COMMANDCODE_API_KEY", {
      COMMANDCODE_API_KEY: "sk-value",
    }),
    true,
  );
  assert.equal(providerKeyConfigured("COMMANDCODE_API_KEY", {}), false);
});
