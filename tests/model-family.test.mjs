import assert from "node:assert/strict";
import test from "node:test";

import {
  familyFromModelId,
  normalizeFamilyName,
} from "../lib/model-family.ts";

test("family inference strips the free group prefix", () => {
  assert.equal(familyFromModelId("free/deepseek-v4-pro-0813"), "DeepSeek");
  assert.equal(familyFromModelId("free/gpt-6-luna"), "GPT");
  assert.equal(familyFromModelId("free/claude-opus-4.6"), "Claude");
  assert.equal(familyFromModelId("free/gemini-3.1-pro"), "Gemini");
  assert.equal(familyFromModelId("free/glm-4.6"), "GLM");
  assert.equal(familyFromModelId("free/kimi-k3"), "Kimi");
  assert.equal(familyFromModelId("free/grok-5"), "Grok");
});

test("family inference labels unknown families instead of returning a group", () => {
  assert.equal(familyFromModelId("free/acme-reasoner"), "Acme");
  assert.equal(familyFromModelId("free/"), "Other");
  assert.equal(familyFromModelId(""), "Other");
});

test("a group sentinel never becomes a family", () => {
  assert.equal(normalizeFamilyName("free/deepseek-v4-pro-0813", "Free"), "DeepSeek");
  assert.equal(normalizeFamilyName("free/gpt-6-luna", "free"), "GPT");
  assert.equal(normalizeFamilyName("free/claude-opus-4.6", "Subscription"), "Claude");
  assert.equal(normalizeFamilyName("free/gemini-3.1-pro", "Paid"), "Gemini");
});

test("a real upstream family label is preserved", () => {
  assert.equal(normalizeFamilyName("gpt-6.1-sol", "GPT"), "GPT");
  assert.equal(normalizeFamilyName("jev-model", "Jev Group"), "Jev Group");
  assert.equal(normalizeFamilyName("custom-model", "  Claude  "), "Claude");
});
