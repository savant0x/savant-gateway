import assert from "node:assert/strict";
import test from "node:test";

import {
  rightsApproved,
  visualBuildsEnabled,
} from "../lib/visual-builds/types.ts";

const RIGHTS = {
  id: "rgt_publication",
  sourceId: "src_publication",
  state: "approved",
  evidenceUrl: "https://example.test/rights",
  evidenceNote: "Publication fixture.",
  evidenceSha256: "a".repeat(64),
  licenseText: "MIT License",
  licenseSha256: "b".repeat(64),
  attribution: "Fixture contributors",
  displayAllowed: true,
  cacheAllowed: true,
  redistributeAllowed: true,
  reviewer: "operator",
  reviewedAt: "2026-11-06T00:00:00.000Z",
  supersededBy: null,
  createdAt: "2026-11-06T00:00:00.000Z",
};

test("the public feature flag fails closed unless it is exactly true", () => {
  assert.equal(visualBuildsEnabled({}), false);
  assert.equal(visualBuildsEnabled({ VISUAL_BUILDS_ENABLED: "" }), false);
  assert.equal(visualBuildsEnabled({ VISUAL_BUILDS_ENABLED: "false" }), false);
  assert.equal(visualBuildsEnabled({ VISUAL_BUILDS_ENABLED: "1" }), false);
  assert.equal(visualBuildsEnabled({ VISUAL_BUILDS_ENABLED: "yes" }), false);
  assert.equal(visualBuildsEnabled({ VISUAL_BUILDS_ENABLED: "on" }), false);
  assert.equal(visualBuildsEnabled({ VISUAL_BUILDS_ENABLED: " TRUE " }), true);
});

test("publication requires an approved decision that permits all three uses", () => {
  assert.equal(rightsApproved(RIGHTS), true);
  assert.equal(rightsApproved({ ...RIGHTS, state: "pending" }), false);
  assert.equal(rightsApproved({ ...RIGHTS, state: "withdrawn" }), false);
  assert.equal(rightsApproved({ ...RIGHTS, displayAllowed: false }), false);
  assert.equal(rightsApproved({ ...RIGHTS, cacheAllowed: false }), false);
  assert.equal(rightsApproved({ ...RIGHTS, redistributeAllowed: false }), false);
  assert.equal(rightsApproved(null), false);
});
