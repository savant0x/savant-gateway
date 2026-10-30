import "server-only";

import { CORS_HEADERS, jsonError } from "./http";
import { estimateTokensFromChars } from "./pricing";
import {
  type GatewayCallContext,
  readUsage,
  settleCall,
  streamDeltaChars,
  type TokenUsage,
} from "./gateway-settle";

export function streamCompletion(
  upstream: Response,
  context: GatewayCallContext,
) {
  const reader = upstream.body?.getReader();

  if (!reader) {
    settleCall(context, { inputTokens: 0, outputTokens: 0 }, "error", {
      error: "Provider returned an empty stream",
    });

    return jsonError(
      502,
      "Provider returned an empty stream",
      "upstream_error",
    );
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let usage: TokenUsage | null = null;
  let outputChars = 0;
  let settled = false;
  let terminalLine: string | null = null;

  const finish = (status: "ok" | "error" | "cancelled", error?: string) => {
    if (settled) return;

    const inputTokens = usage?.inputTokens ?? context.promptTokens;
    const outputTokens =
      usage?.outputTokens ?? estimateTokensFromChars(outputChars);

    // One attempt per response. A failed transaction retains its reservation
    // for reconciliation; retrying here could hide a failed accounting write.
    settled = true;

    try {
      settleCall(
        context,
        { inputTokens, outputTokens },
        status,
        error ? { error, estimated: !usage } : { estimated: !usage },
      );
    } catch {
      // Fixed text and reservation identifiers only: upstream exceptions can
      // contain credentials, headers or customer content.
      // eslint-disable-next-line no-console
      console.error("[gateway.settlement] Usage write failed; reconcile reservation.", {
        userId: context.auth.userId,
        keyId: context.auth.keyId,
        modelId: context.model.id,
        creditHoldId: context.hold?.id ?? null,
        freeReservationId: context.freeReservation?.id ?? null,
        subscriptionHoldId:
          context.subscription?.kind === "included"
            ? context.subscription.holdId
            : null,
      });

      throw new Error("Usage settlement failed.");
    }
  };

  const processLine = (raw: string) => {
    const line = raw.replace(/\r$/, "");

    if (!line.startsWith("data:")) return;

    const payload = line.slice(5).trim();

    if (!payload || payload === "[DONE]") return;

    try {
      const parsed = JSON.parse(payload) as unknown;
      const next = readUsage(parsed);

      if (next) usage = next;

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
