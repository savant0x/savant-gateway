import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyStreamCancellation,
  createStreamTelemetryEvent,
} from "../lib/stream-telemetry.ts";

test("abort, timeout, closed and unexpected errors classify apart", () => {
  const abort = new Error("The operation was aborted");
  abort.name = "AbortError";

  assert.equal(classifyStreamCancellation(abort, "client_abort"), "client_abort");
  assert.equal(
    classifyStreamCancellation(abort, "upstream_abort"),
    "upstream_abort",
  );

  const timeout = new Error("request timed out");
  timeout.name = "TimeoutError";

  assert.equal(classifyStreamCancellation(timeout, "upstream_abort"), "timeout");
  assert.equal(
    classifyStreamCancellation(
      new TypeError("Invalid state: stream is already closed"),
      "upstream_abort",
    ),
    "already_closed",
  );
  assert.equal(
    classifyStreamCancellation(new Error("socket reset"), "upstream_abort"),
    "unexpected",
  );
});

test("expected disconnects are informational and incidents are warnings", () => {
  const base = {
    requestId: "req_1",
    provider: "savant",
    model: "glm-5.3",
    phase: "cancel",
  };

  const client = createStreamTelemetryEvent({ ...base, cause: "client_abort" });
  const upstream = createStreamTelemetryEvent({
    ...base,
    phase: "read",
    cause: "upstream_abort",
  });
  const timeout = createStreamTelemetryEvent({
    ...base,
    phase: "read",
    cause: "timeout",
  });

  assert.equal(client.expected, true);
  assert.equal(client.level, "info");
  assert.equal(upstream.expected, false);
  assert.equal(upstream.level, "warn");
  assert.equal(timeout.expected, false);
});

test("identifiers are bounded and cannot inject new lines", () => {
  const event = createStreamTelemetryEvent({
    requestId: "req\ninjected",
    provider: `provider\t${"x".repeat(200)}`,
    model: "model",
    phase: "read",
    cause: "unexpected",
  });

  assert.equal(event.requestId.includes("\n"), false);
  assert.equal(event.provider.includes("\t"), false);
  assert.ok(event.provider.length <= 120);
});
