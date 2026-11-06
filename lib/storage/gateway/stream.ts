import type { PostgresDatabase } from "../pg-adapter.ts";

import { CORS_HEADERS, jsonError } from "../../http.ts";
import { estimateTokensFromChars } from "../../pricing.ts";
import {
  MAX_STREAM_BYTES,
  MAX_STREAM_FRAME_BYTES,
} from "../../request-limits.ts";
import {
  streamDeltaCounts,
  type StreamDeltaChars,
} from "../../gateway-usage.ts";
import {
  classifyStreamCancellation,
  createStreamTelemetryEvent,
  defaultStreamTelemetrySink,
  type StreamCancellationCause,
  type StreamCancellationPhase,
  type StreamTelemetrySink,
} from "../../stream-telemetry.ts";
import {
  estimatedUsage,
  mergeProviderUsage,
  readProviderUsage,
  resolveUsage,
  type ProviderUsage,
} from "../../usage.ts";

import { settleCall, type GatewaySettlementContext } from "./settle.ts";

/**
 * Streaming relay and its settlement, ported to the async handle (FID-086,
 * Batch B).
 *
 * Settlement used to happen synchronously inside the stream's `finish`. On the
 * async handle it must be awaited, which changes one thing that matters: the
 * `[DONE]` frame is only forwarded after the accounting transaction has
 * committed, and a settlement failure errors the stream instead of acknowledging
 * a completion that was never charged.
 *
 * Two rules are carried over unchanged because they are the reason this relay
 * exists at all:
 *
 * 1. **A stream that ends without `[DONE]` is a truncated source.** It settles as
 *    `error`, not `ok`, so a partial answer is never acknowledged or billed as a
 *    completed one.
 * 2. **One settlement attempt per response.** A failed transaction leaves the
 *    reservation for reconciliation; retrying inside the relay could hide a
 *    failed accounting write.
 */

export type StreamingGatewayContext = GatewaySettlementContext & {
  releaseAdmission?: (() => Promise<void>) | null;
  /** Internal identifier for correlation; never derived from customer input. */
  requestId?: string;
  /** Test seam; production uses the redacted console sink. */
  onStreamEvent?: StreamTelemetrySink;
};

export function streamCompletion(
  db: PostgresDatabase,
  upstream: Response,
  context: StreamingGatewayContext,
) {
  const reader = upstream.body?.getReader();

  if (!reader) {
    void settleCall(db, context, estimatedUsage(0, 0), "error", {
      error: "Provider returned an empty stream",
    }).finally(() => {
      void context.releaseAdmission?.();
    });

    return jsonError(
      502,
      "Provider returned an empty stream",
      "upstream_error",
    );
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const report = (
    cause: StreamCancellationCause,
    phase: StreamCancellationPhase,
  ) => {
    const sink = context.onStreamEvent ?? defaultStreamTelemetrySink;

    sink(
      createStreamTelemetryEvent({
        requestId: context.requestId ?? "unassigned",
        provider: context.model.upstreamSlug,
        model: context.model.id,
        phase,
        cause,
      }),
    );
  };
  let buffer = "";
  let usage: ProviderUsage | null = null;
  const outputChars: StreamDeltaChars = { text: 0, modern: 0, legacy: 0 };
  let settled = false;
  let terminalLine: string | null = null;
  let responseBytes = 0;

  const finish = async (
    status: "ok" | "error" | "cancelled",
    error?: string,
  ) => {
    if (settled) return;

    const fallbackChars =
      outputChars.text +
      (outputChars.modern > 0 ? outputChars.modern : outputChars.legacy);
    const resolved = resolveUsage({
      usage,
      fallbackInputTokens: context.promptTokens,
      fallbackOutputTokens: estimateTokensFromChars(fallbackChars),
    });

    settled = true;

    const releaseAdmission = context.releaseAdmission;

    try {
      await settleCall(db, context, resolved, status, error ? { error } : {});
    } catch {
      // Fixed text and reservation identifiers only: upstream exceptions can
      // contain credentials, headers or customer content.
      // eslint-disable-next-line no-console
      console.error(
        "[gateway.settlement] Usage write failed; reconcile reservation.",
        {
          userId: context.auth.userId,
          keyId: context.auth.keyId,
          modelId: context.model.id,
          creditHoldId: context.hold?.id ?? null,
          freeReservationId: context.freeReservation?.id ?? null,
          subscriptionHoldId:
            context.subscription?.kind === "included"
              ? context.subscription.holdId
              : null,
        },
      );

      throw new Error("Usage settlement failed.");
    } finally {
      // The stream owns the serving slot once the response is handed back; it
      // must not outlive the response on completion, error or cancellation.
      await releaseAdmission?.();
    }
  };

  const processLine = (raw: string) => {
    const line = raw.replace(/\r$/, "");

    if (!line.startsWith("data:")) return;

    const payload = line.slice(5).trim();

    if (!payload || payload === "[DONE]") return;

    try {
      const parsed = JSON.parse(payload) as unknown;

      // Usage can arrive split across frames; merging keeps a later frame that
      // carries one component from erasing the other.
      usage = mergeProviderUsage(usage, readProviderUsage(parsed));
      const delta = streamDeltaCounts(parsed);

      outputChars.text += delta.text;
      outputChars.modern += delta.modern;
      outputChars.legacy += delta.legacy;
    } catch {
      // Keep forwarding malformed provider chunks; only accounting is best-effort.
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const forwardLine = (line: string) => {
        if (line.startsWith("data:") && line.slice(5).trim() === "[DONE]") {
          terminalLine = line;

          return;
        }

        processLine(line);
        controller.enqueue(encoder.encode(`${line}\n`));
      };

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (settled) return;
          if (done) break;

          responseBytes += value.byteLength;

          if (responseBytes > MAX_STREAM_BYTES) {
            throw new Error("Provider stream exceeded the response limit.");
          }

          buffer += decoder.decode(value, { stream: true });

          let newline = buffer.indexOf("\n");

          while (newline >= 0) {
            if (
              encoder.encode(buffer.slice(0, newline)).byteLength >
              MAX_STREAM_FRAME_BYTES
            ) {
              throw new Error("Provider stream frame exceeded the limit.");
            }

            forwardLine(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
          }

          if (encoder.encode(buffer).byteLength > MAX_STREAM_FRAME_BYTES) {
            throw new Error("Provider stream frame exceeded the limit.");
          }
        }

        buffer += decoder.decode();

        if (buffer.trim()) forwardLine(buffer);

        // A clean transport close without the protocol terminator is a
        // truncated source, not a completed completion. Settling it as `ok`
        // would acknowledge a partial answer and charge an estimate for it.
        if (terminalLine === null) {
          throw new Error("Provider stream ended without a completion marker.");
        }

        try {
          await finish("ok");
        } catch (error) {
          report("unexpected", "settle");
          controller.error(error);

          return;
        }

        // Completion is acknowledged only after the accounting transaction.
        if (terminalLine !== null) {
          controller.enqueue(encoder.encode(`${terminalLine}\n\n`));
        }

        controller.close();
      } catch (error) {
        report(classifyStreamCancellation(error, "upstream_abort"), "read");

        void reader.cancel().catch((cancellationError) => {
          const cause = classifyStreamCancellation(
            cancellationError,
            "upstream_abort",
          );

          if (cause !== "already_closed") report(cause, "cancel");
        });

        try {
          await finish("error", "Provider stream interrupted.");
        } catch (settlementError) {
          controller.error(settlementError);

          return;
        }

        controller.error(new Error("Provider stream interrupted."));
      }
    },
    async cancel(reason) {
      report("client_abort", "cancel");

      const cancellation = reader.cancel(reason).catch((error) => {
        const cause = classifyStreamCancellation(error, "upstream_abort");

        if (cause !== "already_closed") report(cause, "cancel");
      });

      await finish("cancelled", "Client disconnected");

      return cancellation;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
