import type { CreditHold } from "../store/credit.ts";
import type { FreePoolReservation } from "../../projections.ts";
import type {
  GatewaySettlementContext,
  SubscriptionCallContext,
} from "./settle.ts";

import { randomUUID } from "node:crypto";

import {
  DEFAULT_OUTPUT_BUDGET,
  MAX_OUTPUT_BUDGET,
  estimatePromptTokens,
  estimateTokensFromText,
  readRequestedOutputBudget,
} from "../../pricing.ts";
import { completionText } from "../../gateway-usage.ts";
import {
  estimatedUsage,
  readProviderUsage,
  resolveUsage,
} from "../../usage.ts";
import { takeSharedCompletionRate } from "../admission.ts";
import {
  beginProviderAdmission,
  completionRateError,
  providerAdmissionError,
} from "../../gateway-provider-admission.ts";
import { markupSellMicros, subscriptionWeightedTokens } from "../../plans.ts";
import {
  CORS_HEADERS,
  extractApiKey,
  jsonError,
  upstreamUnavailable,
} from "../../http.ts";
import { readProviderError } from "../../providers/request.ts";
import {
  COMPLETION_BODY_BYTES,
  completionResourceProblem,
  readJsonObject,
  RequestBodyError,
} from "../../request-limits.ts";
import { getBannerConfig } from "../store/banner.ts";
import { authenticateApiKey } from "../store/keys.ts";
import { getAdmissionControl } from "../store/operations.ts";
import { getProvider } from "../store/providers.ts";
import { openCallSettlement } from "../store/settlements.ts";
import { resolveSubscriptionAccess } from "../store/subscription-access.ts";
import {
  ensureProviderObservation,
  refreshProviderRuntime,
} from "../../providers/runtime.ts";
import { getDatabase } from "../runtime.ts";

import { reservePaidCall } from "./paid.ts";
import { upstreamPayload } from "./payload.ts";
import { callProvider } from "./provider-call.ts";
import {
  failureStatus,
  isFreeCall,
  modelRefusal,
  resolveModel,
  retryHeaders,
  safeUpstreamMessage,
} from "./resolution.ts";
import { settleCall } from "./settle.ts";
import { streamCompletion } from "./stream.ts";
import { reserveTrialRoute } from "./trial.ts";

/**
 * The chat-completions entry, ported to the async handle (FID-086).
 *
 * This is a storage port, not a redesign: the order of decisions is the
 * synchronous module's, because each step is a rule rather than an
 * implementation detail.
 *
 * 1. **Authenticate, then validate, then resolve.** An unauthenticated caller
 *    learns nothing about the catalog.
 * 2. **Operator admission precedes every hold.** Pause and drain are admission
 *    only, so payment webhooks and in-flight streams keep working while no new
 *    inference is admitted.
 * 3. **Rate limiting precedes reservations.** A throttled call must not hold
 *    credit, a free-pool slot or a subscription allowance.
 * 4. **The serving-account ceiling precedes the billing reservation.** A provider
 *    refusal must not strand money or allowance, and the release is idempotent.
 * 5. **Durable admission precedes dispatch.** The settlement row is written
 *    before the provider is called, so a crash leaves an auditable claim rather
 *    than an unrecorded charge.
 *
 * The one deliberate behavioral change is that admission and settlement are now
 * awaited: a stream can only acknowledge `[DONE]` after accounting commits.
 */

export async function handleChatCompletions(request: Request) {
  const secret = extractApiKey(request);

  if (!secret) {
    return jsonError(
      401,
      "Missing API key (Bearer or x-api-key)",
      "authentication_error",
    );
  }

  const db = await getDatabase();
  const auth = await authenticateApiKey(db, secret);

  if (!auth) {
    return jsonError(401, "Invalid API key", "authentication_error");
  }

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request, COMPLETION_BODY_BYTES);
  } catch (error) {
    return jsonError(
      error instanceof RequestBodyError ? error.status : 400,
      error instanceof RequestBodyError ? error.message : "Invalid JSON body",
    );
  }

  if (typeof body.model !== "string" || !body.model.trim()) {
    return jsonError(400, "model is required");
  }

  const resourceProblem = completionResourceProblem(body);

  if (resourceProblem) return jsonError(400, resourceProblem);

  const model = await resolveModel(db, body.model.trim());

  if (!model || !model.inCatalog) {
    return jsonError(404, `Unknown model: ${body.model}`, "model_not_found");
  }

  const provider = await getProvider(db, model.upstreamSlug);

  if (model.status !== "active" || !provider?.enabled) {
    return jsonError(
      503,
      `Model ${model.id} is currently unavailable`,
      "model_unavailable",
    );
  }

  // Resolve, then refuse before admission: a direct id, alias, non-primary row
  // or subscription snapshot must not reach an unreviewed upstream row.
  if (modelRefusal(model) !== null) {
    return jsonError(
      503,
      `Model ${model.id} is currently unavailable`,
      "model_unavailable",
    );
  }

  const gatewayAdmission = await getAdmissionControl(db);

  if (gatewayAdmission.state !== "open") {
    return jsonError(
      503,
      gatewayAdmission.state === "paused"
        ? "The gateway is paused by the operator. No new inference is being admitted; payment fulfillment and the operator console remain available."
        : "The gateway is draining for maintenance. No new inference is being admitted; existing calls finish and settle normally.",
      "service_unavailable",
      { "Retry-After": "30" },
    );
  }

  const banner = await getBannerConfig(db);
  const bannerText = banner.enabled ? banner.text : "";
  const bannerTokens = bannerText ? estimateTokensFromText(bannerText) : 0;
  const free = isFreeCall(model);
  const requestedBudget = readRequestedOutputBudget(body);
  const initialOutputBudget = requestedBudget ?? DEFAULT_OUTPUT_BUDGET;

  if (requestedBudget !== null && requestedBudget > MAX_OUTPUT_BUDGET) {
    return jsonError(400, `max_tokens cannot exceed ${MAX_OUTPUT_BUDGET}.`);
  }

  const rate = await takeSharedCompletionRate(db, {
    keyId: auth.keyId,
    userId: auth.userId,
    free,
  });

  if (!rate.allowed) return completionRateError(rate);

  const status = await ensureProviderObservation(model.upstreamSlug);
  const admission = await beginProviderAdmission({
    db,
    provider,
    observedRpm: status.rpm,
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
    const access = await resolveSubscriptionAccess(db, {
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
      const trial = await reserveTrialRoute(db, {
        auth,
        model,
        promptTokens,
        outputBudget: reservationBudget,
        refreshProvider: refreshProviderRuntime,
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

      const reservation = await reservePaidCall(
        db,
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

    const settlementId = await openCallSettlement(db, {
      userId: auth.userId,
      keyId: auth.keyId,
      modelId: settleModel.id,
      providerSlug: settleModel.upstreamSlug,
      billingSource:
        subscription?.kind === "included"
          ? "subscription"
          : freeReservation
            ? "free"
            : "credit",
      creditHoldId: hold?.id ?? null,
      freeReservationId: freeReservation?.id ?? null,
      subscriptionHoldId:
        subscription?.kind === "included" ? subscription.holdId : null,
      estimatedMicros: hold?.holdMicros ?? 0,
    });

    const streaming = body.stream === true;
    const payload = upstreamPayload({
      body,
      upstreamId: settleModel.upstreamId,
      bannerText,
      requestedBudget,
      outputBudget,
    });

    const context: GatewaySettlementContext & { requestId: string } = {
      auth,
      model: settleModel,
      hold,
      freeReservation,
      subscription,
      settlementId,
      startedAt: Date.now(),
      promptTokens,
      requestId: randomUUID(),
    };

    let upstream: Response;

    try {
      upstream = await callProvider(
        db,
        settleModel,
        payload,
        AbortSignal.timeout(streaming ? 300_000 : 120_000),
      );
    } catch (error) {
      await settleCall(db, context, estimatedUsage(0, 0), "error", {
        error: error instanceof Error ? error.message : "Provider unreachable",
      });

      return upstreamUnavailable(error);
    }

    if (!upstream.ok) {
      const message = await readProviderError(upstream);

      await settleCall(db, context, estimatedUsage(0, 0), "error", {
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

      return streamCompletion(db, upstream, { ...context, releaseAdmission });
    }

    const data = await upstream.json().catch(() => null);

    if (!data) {
      await settleCall(db, context, estimatedUsage(0, 0), "error", {
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

    await settleCall(db, context, usage, "ok");

    return Response.json(data, { headers: CORS_HEADERS });
  } finally {
    await slot?.release?.();
  }
}
