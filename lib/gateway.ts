import "server-only";

import {
  authenticateApiKey,
  getModelForGateway,
  recordUsage,
  type AuthenticatedKey,
  type GatewayModel,
} from "./store";
import { providerChatCompletion, readProviderError } from "./provider";
import { CORS_HEADERS, extractApiKey, jsonError } from "./http";

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

function toTokenCount(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function readUsage(value: unknown): TokenUsage | null {
  if (!value || typeof value !== "object") return null;

  const usage = (value as Record<string, unknown>).usage;

  if (!usage || typeof usage !== "object") return null;

  const record = usage as Record<string, unknown>;
  const inputTokens = toTokenCount(record.prompt_tokens ?? record.input_tokens);
  const outputTokens = toTokenCount(
    record.completion_tokens ?? record.output_tokens,
  );

  return { inputTokens, outputTokens };
}

function resolveModel(publicId: string) {
  const exact = getModelForGateway(publicId);

  if (exact) return exact;

  const candidates: string[] = [];

  if (publicId.startsWith("free-"))
    candidates.push(`free/${publicId.slice(5)}`);
  if (publicId.endsWith("-free"))
    candidates.push(`free/${publicId.slice(0, -5)}`);

  if (!publicId.includes("/")) {
    const dash = publicId.indexOf("-");

    if (dash > 0)
      candidates.push(`${publicId.slice(0, dash)}/${publicId.slice(dash + 1)}`);
  }

  for (const candidate of candidates) {
    const model = getModelForGateway(candidate);

    if (model) return model;
  }

  return undefined;
}

function safeUpstreamMessage(status: number, message: string) {
  if (status >= 500 || status === 401 || status === 403)
    return "Provider request failed";

  return message || "Provider request failed";
}

function streamCompletion(
  upstream: Response,
  auth: AuthenticatedKey,
  model: GatewayModel,
  startedAt: number,
) {
  const reader = upstream.body?.getReader();

  if (!reader) {
    recordUsage({
      auth,
      model,
      inputTokens: 0,
      outputTokens: 0,
      status: "error",
      latencyMs: Date.now() - startedAt,
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
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let settled = false;

  const finish = (status: "ok" | "error" | "cancelled", error?: string) => {
    if (settled) return;
    settled = true;

    try {
      recordUsage({
        auth,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        status,
        latencyMs: Date.now() - startedAt,
        error,
      });
    } catch {
      // Usage recording must never break a response that is already streaming.
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
            const line = buffer.slice(0, newline).replace(/\r$/, "");

            buffer = buffer.slice(newline + 1);

            if (line.startsWith("data:")) {
              const raw = line.slice(5).trim();

              if (raw && raw !== "[DONE]") {
                try {
                  const parsed = JSON.parse(raw) as Record<string, unknown>;
                  const next = readUsage(parsed);

                  if (next) usage = next;
                } catch {
                  // Keep forwarding malformed provider chunks; only usage parsing is best-effort.
                }
              }
            }

            newline = buffer.indexOf("\n");
          }
        }

        controller.close();
        finish("ok");
      } catch (error) {
        if (settled) return;

        controller.error(error);
        finish("error", error instanceof Error ? error.message : String(error));
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

export async function handleChatCompletions(request: Request) {
  const secret = extractApiKey(request);

  if (!secret) {
    return jsonError(
      401,
      "Missing API key (Bearer or x-api-key)",
      "authentication_error",
    );
  }

  const auth = authenticateApiKey(secret);

  if (!auth) {
    return jsonError(401, "Invalid API key", "authentication_error");
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (typeof body.model !== "string" || !body.model.trim()) {
    return jsonError(400, "model is required");
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError(400, "messages must be a non-empty array");
  }

  const model = resolveModel(body.model.trim());

  if (!model) {
    return jsonError(404, `Unknown model: ${body.model}`, "model_not_found");
  }

  if (model.status !== "active") {
    return jsonError(
      503,
      `Model ${model.id} is currently unavailable`,
      "model_unavailable",
    );
  }

  const isFree = model.allowFree && model.tokenWeight > 0;

  if (!isFree) {
    const subscriptionOnly =
      model.provider.toLowerCase() === "free" || model.id.startsWith("free/");

    return jsonError(
      402,
      subscriptionOnly
        ? "This model requires a provider subscription and is not included in the free pool."
        : "Paid model billing is not implemented yet. Use a free model for now.",
      "insufficient_quota",
    );
  }

  const payload: Record<string, unknown> = { ...body, model: model.upstreamId };
  const streaming = body.stream === true;

  if (streaming) {
    const existing =
      body.stream_options && typeof body.stream_options === "object"
        ? (body.stream_options as Record<string, unknown>)
        : {};

    payload.stream_options = { ...existing, include_usage: true };
  }

  const startedAt = Date.now();
  let upstream: Response;

  try {
    upstream = await providerChatCompletion(
      payload,
      AbortSignal.timeout(streaming ? 300_000 : 120_000),
    );
  } catch (error) {
    return jsonError(
      502,
      error instanceof Error ? error.message : "Could not reach the provider",
      "upstream_error",
    );
  }

  if (!upstream.ok) {
    const message = await readProviderError(upstream);
    const status =
      upstream.status === 400 ||
      upstream.status === 402 ||
      upstream.status === 429
        ? upstream.status
        : 502;

    return jsonError(
      status,
      safeUpstreamMessage(upstream.status, message),
      "upstream_error",
    );
  }

  if (streaming) {
    return streamCompletion(upstream, auth, model, startedAt);
  }

  const data = await upstream.json().catch(() => null);

  if (!data) {
    recordUsage({
      auth,
      model,
      inputTokens: 0,
      outputTokens: 0,
      status: "error",
      latencyMs: Date.now() - startedAt,
      error: "Provider returned invalid JSON",
    });

    return jsonError(
      502,
      "Provider returned an invalid response",
      "upstream_error",
    );
  }

  const usage = readUsage(data) ?? { inputTokens: 0, outputTokens: 0 };

  recordUsage({
    auth,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    status: "ok",
    latencyMs: Date.now() - startedAt,
  });

  return Response.json(data, { headers: CORS_HEADERS });
}
