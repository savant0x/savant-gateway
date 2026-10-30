import "server-only";

import {
  DEFAULT_OUTPUT_BUDGET,
  MAX_OUTPUT_BUDGET,
  computeHoldMicros,
  estimatePromptTokens,
  estimateTokensFromText,
  readRequestedOutputBudget,
} from "./pricing";
import { withContextBanner } from "./context-banner";
import {
  completionText,
  type GatewayCallContext,
  readUsage,
  settleCall,
  type SubscriptionCallContext,
} from "./gateway-settle";
import { checkCompletionRate } from "./gateway-rate-limit";
import { markupSellMicros, subscriptionWeightedTokens } from "./plans";
import { streamCompletion } from "./gateway-stream";
import { reserveTrialRoute } from "./gateway-trial";
import {
  CORS_HEADERS,
  extractApiKey,
  jsonError,
  upstreamUnavailable,
} from "./http";
import { callProvider } from "./providers";
import { readProviderError } from "./providers/request";
import {
  authenticateApiKey,
  getProvider,
  resolveSubscriptionAccess,
  type FreePoolReservation,
  type GatewayModel,
} from "./store";
import {
  failureStatus,
  isFreeCall,
  resolveModel,
  retryHeaders,
  safeUpstreamMessage,
} from "./gateway-resolution";
import { getBannerConfig } from "./store/banner";
import { reserveCreditHold, type CreditHold } from "./store/billing";

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
  promptOverhead: number,
): PaidReservation {
  const requestedBudget = readRequestedOutputBudget(body);

  if (requestedBudget !== null && requestedBudget > MAX_OUTPUT_BUDGET) {
    return {
      blocked: jsonError(400, `max_tokens cannot exceed ${MAX_OUTPUT_BUDGET}.`),
    };
  }

  const outputBudget = requestedBudget ?? DEFAULT_OUTPUT_BUDGET;
  const promptTokens =
    estimatePromptTokens(body.messages, body.tools) + promptOverhead;
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
        "Insufficient credit balance for this request. Add credit in your account.",
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

  const provider = getProvider(model.upstreamSlug);

  if (model.status !== "active" || !provider?.enabled) {
    return jsonError(
      503,
      `Model ${model.id} is currently unavailable`,
      "model_unavailable",
    );
  }

  const banner = getBannerConfig();
  const bannerText = banner.enabled ? banner.text : "";
  const bannerTokens = bannerText ? estimateTokensFromText(bannerText) : 0;
  const free = isFreeCall(model);
  const requestedBudget = readRequestedOutputBudget(body);
  const initialOutputBudget = requestedBudget ?? DEFAULT_OUTPUT_BUDGET;

  if (requestedBudget !== null && requestedBudget > MAX_OUTPUT_BUDGET) {
    return jsonError(400, `max_tokens cannot exceed ${MAX_OUTPUT_BUDGET}.`);
  }

  // Rate limiting runs before any reservation: a throttled call must not hold
  // credit, a free-pool slot, or a subscription allowance.
  const rate = checkCompletionRate({ keyId: auth.keyId, free });

  if (!rate.allowed) {
    return jsonError(
      429,
      rate.scope === "free"
        ? `Free traffic is limited to ${rate.limit} requests per minute across all keys. Retry in ${rate.retryAfterSeconds}s, or add credit for a dedicated limit.`
        : `This key is limited to ${rate.limit} requests per minute. Retry in ${rate.retryAfterSeconds}s.`,
      "rate_limit_error",
      {
        "Retry-After": String(rate.retryAfterSeconds),
        "X-RateLimit-Limit": String(rate.limit),
        "X-RateLimit-Remaining": String(rate.remaining),
        "X-RateLimit-Scope": rate.scope,
      },
    );
  }

  let hold: CreditHold | null = null;
  let freeReservation: FreePoolReservation | null = null;
  let promptTokens =
    estimatePromptTokens(body.messages, body.tools) + bannerTokens;
  let outputBudget = initialOutputBudget;
  let subscription: SubscriptionCallContext | null = null;
  let settleModel = model;
  const access = resolveSubscriptionAccess({
    userId: auth.userId,
    keyId: auth.keyId,
    modelId: model.id,
    estimateWeightedTokens: subscriptionWeightedTokens(
      model.tokenWeight,
      promptTokens,
      initialOutputBudget,
    ),
  });

  if (access.kind === "blocked") {
    return jsonError(access.status, access.message, access.code);
  }

  if (access.kind === "included") {
    subscription = access;
  } else if (access.kind === "overage") {
    subscription = access;
    settleModel = {
      ...model,
      sellInputMicros: markupSellMicros(
        model.sellInputMicros,
        access.markupBps,
      ),
      sellOutputMicros: markupSellMicros(
        model.sellOutputMicros,
        access.markupBps,
      ),
    };
  }

  if (subscription?.kind === "included") {
    // Included usage has no credit hold; the subscription hold is the
    // admission control and settles against the open allowance period.
  } else if (access.kind === "none" && free) {
    const reservationBudget =
      readRequestedOutputBudget(body) ?? DEFAULT_OUTPUT_BUDGET;
    const admission = reserveTrialRoute({
      auth,
      model,
      promptTokens,
      outputBudget: reservationBudget,
    });

    if (admission.blocked) return admission.blocked;

    freeReservation = admission.freeReservation;
    hold = admission.hold;
    settleModel = admission.model;
    outputBudget = reservationBudget;
  } else if (access.kind === "none" && model.billingMode === "subscription") {
    return jsonError(
      403,
      `Model ${model.id} requires a subscription that includes it.`,
      "subscription_required",
    );
  } else {
    if (settleModel.sellInputMicros <= 0 && settleModel.sellOutputMicros <= 0) {
      return jsonError(
        503,
        `Model ${model.id} is not currently available for purchase.`,
        "model_unpriced",
      );
    }

    const reservation = reservePaidCall(settleModel, auth, body, bannerTokens);

    if (reservation.blocked) return reservation.blocked;

    hold = reservation.hold;
    promptTokens = reservation.promptTokens;
    outputBudget = reservation.outputBudget;
  }

  const payload: Record<string, unknown> = {
    ...body,
    model: settleModel.upstreamId,
  };
  const streaming = body.stream === true;

  if (bannerText) {
    payload.messages = withContextBanner(
      Array.isArray(body.messages) ? body.messages : [],
      bannerText,
    );
  }

  if (requestedBudget === null && outputBudget > 0) {
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
    model: settleModel,
    hold,
    freeReservation,
    subscription,
    startedAt: Date.now(),
    promptTokens,
  };

  let upstream: Response;

  try {
    upstream = await callProvider(
      settleModel,
      payload,
      AbortSignal.timeout(streaming ? 300_000 : 120_000),
    );
  } catch (error) {
    settleCall(context, { inputTokens: 0, outputTokens: 0 }, "error", {
      error: error instanceof Error ? error.message : "Provider unreachable",
    });

    return upstreamUnavailable(error);
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
