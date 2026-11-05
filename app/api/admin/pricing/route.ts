import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { priceToMicros, readMarkupInput, readPriceInput } from "@/lib/pricing";
import { readPricingVersion } from "@/lib/pricing-command";
import { recommendPrices } from "@/lib/price-recommendation";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import {
  applyCatalogMarkup,
  approvePricingRecommendation,
  getPricingSummary,
  listAllModels,
  listPricingDecisions,
  saveMarkupBps,
  setModelPricing,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REASON_LENGTH = 500;
const MAX_TARGET_MARGIN_BPS = 9_900;

function readReason(value: unknown) {
  if (typeof value !== "string") return null;

  const reason = value.trim().slice(0, MAX_REASON_LENGTH);

  return reason.length >= 3 ? reason : null;
}

function readTargetMargin(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const bps = Math.round(value);

  return bps >= 0 && bps <= MAX_TARGET_MARGIN_BPS ? bps : null;
}

function readRounding(value: unknown) {
  return value === "cent" ? "cent" : "micro";
}

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const models = await listAllModels();

  return Response.json(
    {
      models,
      summary: await getPricingSummary(models),
      decisions: await listPricingDecisions(100),
    },
    { headers: NO_STORE },
  );
}

export async function PATCH(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: {
    id?: unknown;
    inputPricePer1M?: unknown;
    outputPricePer1M?: unknown;
    mode?: unknown;
    targetMarginBps?: unknown;
    rounding?: unknown;
    reason?: unknown;
    expected?: unknown;
  };

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const id = typeof body.id === "string" ? body.id : "";

  if (!id) return adminError(400, "A model id is required.");

  const model = (await listAllModels()).find((row) => row.id === id);

  if (!model) return adminError(404, "Model not found.");

  if (model.access === "free") {
    return adminError(
      400,
      "This model is in a free group. Move it to a paid or subscription group before setting a sell price.",
    );
  }

  const reason = readReason(body.reason);
  const costInputMicros = priceToMicros(model.costInputPer1M);
  const costOutputMicros = priceToMicros(model.costOutputPer1M);

  if (body.mode === "recommendation") {
    const targetMarginBps = readTargetMargin(body.targetMarginBps);

    if (targetMarginBps === null) {
      return adminError(
        400,
        "targetMarginBps must be an integer between 0 and 9900.",
      );
    }

    if (!reason) {
      return adminError(
        400,
        "A reason of at least 3 characters is required to approve a recommendation.",
      );
    }

    const recommendation = recommendPrices({
      access: model.access,
      costInputMicros,
      costOutputMicros,
      currentInputMicros: priceToMicros(model.inputPricePer1M),
      currentOutputMicros: priceToMicros(model.outputPricePer1M),
      costSource: model.costSource,
      costObservedAt: model.costObservedAt,
      targetMarginBps,
      rounding: readRounding(body.rounding),
    });

    if (!recommendation.eligible) {
      return adminError(409, recommendation.reason);
    }

    const expected = readPricingVersion(body.expected);

    if (!expected) {
      return adminError(
        400,
        "The approval is missing the price and cost version it was previewed against. Reload the pricing page and review the current numbers.",
      );
    }

    const approved = await approvePricingRecommendation(
      id,
      recommendation.inputMicros,
      recommendation.outputMicros,
      expected,
      {
        actor: "admin-session",
        reason,
        modelName: model.name,
        costSource: model.costSource,
        costInputMicros,
        costOutputMicros,
        targetMarginBps,
        rounding: recommendation.rounding,
        recommendationJson: JSON.stringify(recommendation),
      },
    );

    if (approved.status === "not_found") {
      return adminError(404, "Model not found.");
    }

    if (approved.status === "free") {
      return adminError(
        400,
        "This model is in a free group. Move it to a paid or subscription group before setting a sell price.",
      );
    }

    if (approved.status === "stale") {
      return adminError(
        409,
        "The sell price or the serving cost changed since this recommendation was previewed. Reload the page and approve the current numbers.",
      );
    }

    return Response.json(
      {
        ok: true,
        recommendation,
        model: (await listAllModels()).find((row) => row.id === id),
      },
      { headers: NO_STORE },
    );
  }

  const inputMicros = readPriceInput(body.inputPricePer1M);
  const outputMicros = readPriceInput(body.outputPricePer1M);

  if (inputMicros === null || outputMicros === null) {
    return adminError(
      400,
      "Non-negative input/output prices (USD per 1M) are required.",
    );
  }

  if (
    !(await setModelPricing(id, inputMicros, outputMicros, {
      actor: "admin-session",
      reason: reason ?? "Manual price edit.",
      modelName: model.name,
      costSource: model.costSource,
      costInputMicros,
      costOutputMicros,
      targetMarginBps: null,
      rounding: null,
      recommendationJson: JSON.stringify({ mode: "manual" }),
    }))
  ) {
    return adminError(404, "Model not found.");
  }

  return Response.json(
    { ok: true, model: (await listAllModels()).find((row) => row.id === id) },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: { markupBps?: unknown; applyToAll?: unknown };

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const markupBps = readMarkupInput(body.markupBps);

  if (markupBps === null) {
    return adminError(400, "markupBps must be between 0 and 100000.");
  }

  const applyToAll = body.applyToAll === true;

  await saveMarkupBps(markupBps);
  const changed = await applyCatalogMarkup(markupBps, applyToAll);

  return Response.json(
    { ok: true, markupBps, changed, applyToAll },
    { headers: NO_STORE },
  );
}
