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
  let buffer = "";
  let usage: TokenUsage | null = null;
  let outputChars = 0;
  let settled = false;

  const finish = (status: "ok" | "error" | "cancelled", error?: string) => {
    if (settled) return;

    const inputTokens = usage?.inputTokens ?? context.promptTokens;
    const outputTokens =
      usage?.outputTokens ?? estimateTokensFromChars(outputChars);

    try {
      settleCall(
        context,
        { inputTokens, outputTokens },
        status,
        error ? { error, estimated: !usage } : { estimated: !usage },
      );
    } catch {
      // Settlement must never break a response that is already streaming.
    }

    settled = true;
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
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          controller.enqueue(value);
          buffer += decoder.decode(value, { stream: true });

          let newline = buffer.indexOf("\n");

          while (newline >= 0) {
            processLine(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
          }
        }

        if (buffer.trim()) processLine(buffer);

        controller.close();
        finish("ok");
      } catch (error) {
        if (!settled) {
          controller.error(error);
          finish(
            "error",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => {});
      finish("cancelled", "Client disconnected");
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
