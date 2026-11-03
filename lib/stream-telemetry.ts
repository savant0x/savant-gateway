/**
 * Stream cancellation telemetry (FID-2026-1103-131).
 *
 * A client closing a tab is not a provider incident. The relay used to report
 * both through one generic "upstream cancellation failed" warning, which made
 * an ordinary disconnect look like an outage and hid the real failures. This
 * module classifies the event, keeps every field bounded and redacted, and
 * gives expected disconnects a different level from genuine incidents.
 *
 * It deliberately carries identifiers only. Prompts, completions, keys,
 * headers and raw provider text never enter the event.
 */

export type StreamCancellationCause =
  | "client_abort"
  | "upstream_abort"
  | "timeout"
  | "already_closed"
  | "unexpected";

export type StreamCancellationPhase = "read" | "forward" | "settle" | "cancel";

export type StreamTelemetryEvent = {
  event: "stream.cancel";
  requestId: string;
  provider: string;
  model: string;
  phase: StreamCancellationPhase;
  cause: StreamCancellationCause;
  expected: boolean;
  level: "info" | "warn";
};

export type StreamTelemetrySink = (event: StreamTelemetryEvent) => void;

const MAX_FIELD = 120;

function field(value: string) {
  return value.replace(/[\r\n\t]/g, " ").slice(0, MAX_FIELD);
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

export function classifyStreamCancellation(
  error: unknown,
  fallback: Extract<StreamCancellationCause, "client_abort" | "upstream_abort">,
): StreamCancellationCause {
  const name = errorName(error);
  const message = errorMessage(error);

  if (name === "AbortError" || message.includes("aborted")) return fallback;
  if (name === "TimeoutError" || message.includes("timeout")) return "timeout";

  if (
    message.includes("already closed") ||
    message.includes("invalid state") ||
    message.includes("stream is locked") ||
    message.includes("already been read")
  ) {
    return "already_closed";
  }

  return "unexpected";
}

export function createStreamTelemetryEvent(input: {
  requestId: string;
  provider: string;
  model: string;
  phase: StreamCancellationPhase;
  cause: StreamCancellationCause;
}): StreamTelemetryEvent {
  const expected =
    input.cause === "client_abort" || input.cause === "already_closed";

  return {
    event: "stream.cancel",
    requestId: field(input.requestId),
    provider: field(input.provider),
    model: field(input.model),
    phase: input.phase,
    cause: input.cause,
    expected,
    level: expected ? "info" : "warn",
  };
}

export function defaultStreamTelemetrySink(event: StreamTelemetryEvent) {
  const line = JSON.stringify(event);

  if (event.level === "info") {
    // eslint-disable-next-line no-console
    console.info(`[gateway.stream] ${line}`);

    return;
  }

  // eslint-disable-next-line no-console
  console.warn(`[gateway.stream] ${line}`);
}
