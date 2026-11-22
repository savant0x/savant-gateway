import assert from "node:assert/strict";
import test from "node:test";

import { readStreamFailure } from "../lib/stream-failure.ts";

/**
 * Failure frames inside a streamed completion (FID-2026-1122-002).
 *
 * A marketplace provider reports failures as stream events and can still close
 * the response with the protocol terminator, so the terminator cannot be the only
 * completion signal. The reader must recognise the documented shapes and must
 * ignore the placeholders that appear on clean frames.
 */
test("a documented error event is a failure", () => {
  assert.equal(
    readStreamFailure({
      error: { message: "no capacity", error_class: "rate_limit", source: "inferhub" },
    }),
    "no capacity",
  );
  assert.equal(readStreamFailure({ error: "upstream exploded" }), "upstream exploded");
  assert.equal(
    readStreamFailure({ error: { error_class: "no_capacity" } }),
    "no_capacity",
  );
});

test("a failure with no readable text still fails", () => {
  assert.equal(
    readStreamFailure({ error: { detail: { nested: true } } }),
    "Provider reported an error mid-stream",
  );
});

test("clean frames and placeholders are not failures", () => {
  assert.equal(readStreamFailure(null), null);
  assert.equal(readStreamFailure({}), null);
  assert.equal(readStreamFailure({ error: null }), null);
  assert.equal(readStreamFailure({ error: false }), null);
  assert.equal(readStreamFailure({ error: "" }), null);
  assert.equal(readStreamFailure({ error: {} }), null);
  assert.equal(readStreamFailure({ error: [] }), null);
  assert.equal(
    readStreamFailure({ choices: [{ delta: { content: "hello" } }] }),
    null,
  );
  assert.equal(readStreamFailure("[DONE]"), null);
  assert.equal(readStreamFailure("plain text"), null);
});
