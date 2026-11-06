import assert from "node:assert/strict";
import test from "node:test";

import { contentEnabled } from "../lib/content/policy.ts";

test("content defaults on and only an explicit false disables it", () => {
  assert.equal(contentEnabled({}), true);
  assert.equal(contentEnabled({ CONTENT_ENABLED: "true" }), true);
  assert.equal(contentEnabled({ CONTENT_ENABLED: " FALSE " }), false);
});
