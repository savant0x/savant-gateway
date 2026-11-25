import assert from "node:assert/strict";
import test from "node:test";

import { displayModelId } from "../lib/model-identity.ts";

test("a publisher path is dropped from the display id", () => {
  assert.equal(displayModelId("cx/gpt-5.6-luna", "savant"), "gpt-5.6-luna");
  assert.equal(displayModelId("cc/claude-fable-5", "savant"), "claude-fable-5");
});

test("a provider scope is dropped before the publisher path", () => {
  assert.equal(
    displayModelId("inferhub/cc/claude-fable-5", "inferhub"),
    "claude-fable-5",
  );
  assert.equal(displayModelId("inferhub/glm-5.3", null), "glm-5.3");
});

test("the free billing tier stays visible so both SKUs read apart", () => {
  assert.equal(displayModelId("free/gpt-6-luna", "savant"), "free/gpt-6-luna");
});

test("an unscoped id is already its own display name", () => {
  assert.equal(displayModelId("gpt-6-luna", "savant"), "gpt-6-luna");
});
