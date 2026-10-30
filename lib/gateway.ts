import "server-only";

import type { CreditHold } from "./store/billing";

import {
  DEFAULT_OUTPUT_BUDGET,
  MAX_OUTPUT_BUDGET,
  estimatePromptTokens,
  estimateTokensFromText,
  readRequestedOutputBudget,
} from "./pricing";
import { withContextBanner } from "./context-banner";
import {
  completionText,
  estimatedUsage,
  type GatewayCallContext,
  settleCall,
  type SubscriptionCallContext,
} from "./gateway-settle";
import { readProviderUsage, resolveUsage } from "./usage";
import { checkCompletionRate } from "./gateway-rate-limit";
import {
  beginProviderAdmission,
  providerAdmissionError,
} from "./gateway-provider-admission";
import { markupSellMicros, subscriptionWeightedTokens } from "./plans";
import { streamCompletion } from "./gateway-stream";
import { reserveTrialRoute } from "./gateway-trial";
import {
  CORS_HEADERS,
  extractApiKey,
  isJsonObject,
  jsonError,
  upstreamUnavailable,
} from "./http";
import { callProvider } from "./providers";
import { readProviderError } from "./providers/request";
import {
  authenticateApiKey,
  getProvider,
  getProviderStatusBySlug,
  resolveSubscriptionAccess,
  type FreePoolReservation,
} from "./store";
import {
  failureStatus,
  isFreeCall,
  resolveModel,
  retryHeaders,
  safeUpstreamMessage,
} from "./gateway-resolution";
import { getBannerConfig } from "./store/banner";
import { reservePaidCall } from "./gateway-paid";

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
    const parsed: unknown = await request.json();

    if (!isJsonObject(parsed)) {
      return jsonError(400, "Request body must be a JSON object.");
    }

    body = parsed;
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

  // One serving-account ceiling covers every billing mode. It is acquired
  // before the subscription, free-pool or credit reservation below, so a
  // provider refusal never strands a financial or allowance hold. The release
  // is idempotent and the streaming path takes ownership of it.
  const admission = beginProviderAdmission({
    provider,
    observedRpm: getProviderStatusBySlug(model.upstreamSlug).rpm,
  });

  if (admission.refused) return providerAdmissionError(admission.refused);

  const slot = admission.lease;

  try {
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
      const trial = await reserveTrialRoute({
        auth,
        model,
        promptTokens,
        outputBudget: reservationBudget,
      });

      if (trial.blocked) return trial.blocked;

      freeReservation = trial.freeReservation;
      hold = trial.hold;
      settleModel = trial.model;
      outputBudget = reservationBudget;
    } else if (access.kind === "none" && model.billingMode === "subscription") {
      return jsonError(
        403,
        `Model ${model.id} requires a subscription that includes it.`,
        "subscription_required",
      );
    } else {
      if (
        settleModel.sellInputMicros <= 0 &&
        settleModel.sellOutputMicros <= 0
      ) {
        return jsonError(
          503,
          `Model ${model.id} is not currently available for purchase.`,
          "model_unpriced",
        );
      }

      const reservation = reservePaidCall(
        settleModel,
        auth,
        body,
        bannerTokens,
      );

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
      settleCall(context, estimatedUsage(0, 0), "error", {
        error: error instanceof Error ? error.message : "Provider unreachable",
      });

      return upstreamUnavailable(error);
    }

    if (!upstream.ok) {
      const message = await readProviderError(upstream);

      settleCall(context, estimatedUsage(0, 0), "error", {
        error: message,
      });

      return jsonError(
        failureStatus(upstream.status),
        safeUpstreamMessage(upstream.status, message),
        "upstream_error",
        retryHeaders(upstream),
      );
    }

    if (streaming) {
      const releaseAdmission = slot.release;

      slot.release = null;

      return streamCompletion(upstream, { ...context, releaseAdmission });
    }

    const data = await upstream.json().catch(() => null);

    if (!data) {
      settleCall(context, estimatedUsage(0, 0), "error", {
        error: "Provider returned invalid JSON",
      });

      return jsonError(
        502,
        "Provider returned an invalid response",
        "upstream_error",
      );
    }

    const usage = resolveUsage({
      usage: readProviderUsage(data),
      fallbackInputTokens: promptTokens,
      fallbackOutputTokens: estimateTokensFromText(completionText(data)),
    });

    settleCall(context, usage, "ok");

    return Response.json(data, { headers: CORS_HEADERS });
  } finally {
    slot.release?.();
  }
}
