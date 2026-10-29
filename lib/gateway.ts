import "server-only";

import {
  DEFAULT_OUTPUT_BUDGET,
  MAX_OUTPUT_BUDGET,
  computeHoldMicros,
  estimatePromptTokens,
  estimateTokensFromText,
  readRequestedOutputBudget,
} from "./pricing";
import {
  completionText,
  type GatewayCallContext,
  readUsage,
  settleCall,
} from "./gateway-settle";
import { streamCompletion } from "./gateway-stream";
import { CORS_HEADERS, extractApiKey, jsonError } from "./http";
import { providerChatCompletion, readProviderError } from "./provider";
import {
  authenticateApiKey,
  getModelForGateway,
  type GatewayModel,
} from "./store";
import { reserveCreditHold, type CreditHold } from "./store/billing";

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

function isFreeCall(model: GatewayModel) {
  return model.allowFree && model.tokenWeight > 0;
}

type PaidReservation =
  | { blocked: Response }
  | {
      blocked: null;
      hold: CreditHold;
      promptTokens: number;
      outputBudget: number;
      requestedBudget: number | null;
    };

function reservePaidCall(
  model: GatewayModel,
  auth: { keyId: string; userId: string },
  body: Record<string, unknown>,
): PaidReservation {
  const requestedBudget = readRequestedOutputBudget(body);

  if (requestedBudget !== null && requestedBudget > MAX_OUTPUT_BUDGET) {
    return {
      blocked: jsonError(400, `max_tokens cannot exceed ${MAX_OUTPUT_BUDGET}.`),
    };
  }

  const outputBudget = requestedBudget ?? DEFAULT_OUTPUT_BUDGET;
  const promptTokens = estimatePromptTokens(body.messages, body.tools);
  const holdMicros = computeHoldMicros({
    inputTokens: promptTokens,
    outputTokens: outputBudget,
    sellInputMicros: model.sellInputMicros,
    sellOutputMicros: model.sellOutputMicros,
  });
  const hold = reserveCreditHold({
    userId: auth.userId,
    keyId: auth.keyId,
    modelId: model.id,
    holdMicros,
  });

  if (!hold) {
    return {
      blocked: jsonError(
        402,
        "Insufficient credit balance for this request. Add credit in the operator console.",
        "insufficient_quota",
      ),
    };
  }

  return {
    blocked: null,
    hold,
    promptTokens,
    outputBudget,
    requestedBudget,
  };
}

function failureStatus(status: number) {
  return status === 400 || status === 402 || status === 429 ? status : 502;
}

function retryHeaders(upstream: Response): Record<string, string> {
  const retryAfter = upstream.headers.get("retry-after");

  if (!retryAfter) return {};

  return { "Retry-After": retryAfter };
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

  if (!model || !model.inCatalog) {
    return jsonError(404, `Unknown model: ${body.model}`, "model_not_found");
  }

  if (model.status !== "active") {
    return jsonError(
      503,
      `Model ${model.id} is currently unavailable`,
      "model_unavailable",
    );
  }

  const free = isFreeCall(model);
  let hold: CreditHold | null = null;
  let promptTokens = estimatePromptTokens(body.messages, body.tools);
  let outputBudget = 0;
  let requestedBudget: number | null = null;

  if (!free) {
    if (model.sellInputMicros <= 0 && model.sellOutputMicros <= 0) {
      return jsonError(
        503,
        `Model ${model.id} is not priced yet. Set a sell price in the operator console.`,
        "model_unpriced",
      );
    }

    const reservation = reservePaidCall(model, auth, body);

    if (reservation.blocked) return reservation.blocked;

    hold = reservation.hold;
    promptTokens = reservation.promptTokens;
    outputBudget = reservation.outputBudget;
    requestedBudget = reservation.requestedBudget;
  }

  const payload: Record<string, unknown> = {
    ...body,
    model: model.upstreamId,
  };
  const streaming = body.stream === true;

  if (!free && requestedBudget === null) {
    payload.max_tokens = outputBudget;
  }

  if (streaming) {
    const existing =
      body.stream_options && typeof body.stream_options === "object"
        ? (body.stream_options as Record<string, unknown>)
        : {};

    payload.stream_options = { ...existing, include_usage: true };
  }

  const context: GatewayCallContext = {
    auth,
    model,
    hold,
    startedAt: Date.now(),
    promptTokens,
  };

  let upstream: Response;

  try {
    upstream = await providerChatCompletion(
      payload,
      AbortSignal.timeout(streaming ? 300_000 : 120_000),
    );
  } catch (error) {
    settleCall(context, { inputTokens: 0, outputTokens: 0 }, "error", {
      error: error instanceof Error ? error.message : "Provider unreachable",
    });

    return jsonError(
      502,
      error instanceof Error ? error.message : "Could not reach the provider",
      "upstream_error",
    );
  }

  if (!upstream.ok) {
    const message = await readProviderError(upstream);

    settleCall(context, { inputTokens: 0, outputTokens: 0 }, "error", {
      error: message,
    });

    return jsonError(
      failureStatus(upstream.status),
      safeUpstreamMessage(upstream.status, message),
      "upstream_error",
      retryHeaders(upstream),
    );
  }

  if (streaming) return streamCompletion(upstream, context);

  const data = await upstream.json().catch(() => null);

  if (!data) {
    settleCall(context, { inputTokens: 0, outputTokens: 0 }, "error", {
      error: "Provider returned invalid JSON",
    });

    return jsonError(
      502,
      "Provider returned an invalid response",
      "upstream_error",
    );
  }

  const usage = readUsage(data);
  const estimated = usage === null;
  const inputTokens = usage?.inputTokens ?? promptTokens;
  const outputTokens =
    usage?.outputTokens ?? estimateTokensFromText(completionText(data));

  settleCall(
    context,
    { inputTokens, outputTokens },
    "ok",
    estimated ? { estimated: true } : {},
  );

  return Response.json(data, { headers: CORS_HEADERS });
}
