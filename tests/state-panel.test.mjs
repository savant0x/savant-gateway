import assert from "node:assert/strict";
import test from "node:test";

import { SURFACE_STATE_LABELS } from "../lib/surface-state.ts";

test("empty, disabled, unavailable and loading have distinct labels", () => {
  const labels = Object.values(SURFACE_STATE_LABELS);

  assert.equal(new Set(labels).size, labels.length);
  assert.equal(SURFACE_STATE_LABELS.empty, "No data yet");
  assert.equal(SURFACE_STATE_LABELS.disabled, "Not available");
  assert.equal(SURFACE_STATE_LABELS.unavailable, "Temporarily unavailable");
  assert.equal(SURFACE_STATE_LABELS.loading, "Loading");
});
