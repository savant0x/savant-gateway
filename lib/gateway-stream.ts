import "server-only";

import { CORS_HEADERS, jsonError } from "./http";
import { estimateTokensFromChars } from "./pricing";
import {
  estimatedUsage,
  type GatewayCallContext,
  settleCall,
  streamDeltaChars,
} from "./gateway-settle";
import {
  mergeProviderUsage,
  readProviderUsage,
  resolveUsage,
  type ProviderUsage,
} from "./usage";

export function streamCompletion(
  upstream: Response,
  context: GatewayCallContext,
) {
  const reader = upstream.body?.getReader();

  if (!reader) {
    settleCall(context, estimatedUsage(0, 0), "error", {
      error: "Provider returned an empty stream",
    });
    context.releaseAdmission?.();

    return jsonError(
      502,
      "Provider returned an empty stream",
      "upstream_error",
    );
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let usage: ProviderUsage | null = null;
  let outputChars = 0;
  let settled = false;
  let terminalLine: string | null = null;

  const finish = (status: "ok" | "error" | "cancelled", error?: string) => {
    if (settled) return;

    const resolved = resolveUsage({
      usage,
      fallbackInputTokens: context.promptTokens,
      fallbackOutputTokens: estimateTokensFromChars(outputChars),
    });

    // One attempt per response. A failed transaction retains its reservation
    // for reconciliation; retrying here could hide a failed accounting write.
    settled = true;

    const releaseAdmission = context.releaseAdmission;

    try {
      settleCall(context, resolved, status, error ? { error } : {});
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
      releaseAdmission?.();
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
      outputChars += streamDeltaChars(parsed);
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

          buffer += decoder.decode(value, { stream: true });

          let newline = buffer.indexOf("\n");

          while (newline >= 0) {
            forwardLine(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
          }
        }

        buffer += decoder.decode();

        if (buffer.trim()) forwardLine(buffer);

        finish("ok");

        // Completion is acknowledged only after the accounting transaction.
        if (terminalLine !== null) {
          controller.enqueue(encoder.encode(`${terminalLine}\n\n`));
        }

        controller.close();
      } catch {
        try {
          finish("error", "Provider stream interrupted.");
        } catch (error) {
          controller.error(error);

          return;
        }

        controller.error(new Error("Provider stream interrupted."));
      }
    },
    cancel(reason) {
      const cancellation = reader.cancel(reason).catch(() => {
        // eslint-disable-next-line no-console
        console.error("[gateway.stream] Upstream cancellation failed.");
      });

      finish("cancelled", "Client disconnected");

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
