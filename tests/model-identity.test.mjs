import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalModelKey,
  isNamespacedModelId,
} from "../lib/model-identity.ts";

test("the group prefix and separators fold to one identity", () => {
  assert.equal(canonicalModelKey("free/gpt-6-luna"), "gpt-6-luna");
  assert.equal(canonicalModelKey("deepseek/deepseek-v4-flash"), "deepseek-v4-flash");
  assert.equal(canonicalModelKey("DeepSeek_V4.1_Flash"), "deepseek-v4-1-flash");
  assert.equal(canonicalModelKey("claude-opus-4.6"), "claude-opus-4-6");
  assert.equal(canonicalModelKey("claude-opus-4-6"), "claude-opus-4-6");
});

test("release stamps and backups are not part of the identity", () => {
  assert.equal(canonicalModelKey("deepseek-v4-pro-0813"), "deepseek-v4-pro");
  assert.equal(canonicalModelKey("deepseek-v4.1-flash-1017"), "deepseek-v4-1-flash");
  assert.equal(canonicalModelKey("gpt-4o-2024-08-06"), "gpt-4o");
  assert.equal(
    canonicalModelKey("glm5.3-flash-abliterated-backup"),
    "glm5-3-flash-abliterated",
  );
});

test("different models never share an identity", () => {
  assert.notEqual(
    canonicalModelKey("gpt-6"),
    canonicalModelKey("gpt-6-astra"),
  );
  assert.notEqual(
    canonicalModelKey("glm-5.3-flash"),
    canonicalModelKey("glm-5.3-flash-abliterated"),
  );
  assert.notEqual(
    canonicalModelKey("deepseek-v4-pro"),
    canonicalModelKey("deepseek-v4-pro-uncensored"),
  );
});

test("a version number is kept, only a build stamp is dropped", () => {
  assert.equal(canonicalModelKey("gpt-5.6-sol"), "gpt-5-6-sol");
  assert.equal(canonicalModelKey("mimo-v2.6-pro"), "mimo-v2-6-pro");
  assert.equal(canonicalModelKey("glm5.3"), "glm5-3");
});

test("namespaced ids are recognised only for their own provider", () => {
  assert.equal(isNamespacedModelId("apixo/gpt-6-astra", "apixo"), true);
  assert.equal(isNamespacedModelId("free/gpt-6-luna", "savant"), false);
  assert.equal(isNamespacedModelId("gpt-6-astra", "savant"), false);
});
