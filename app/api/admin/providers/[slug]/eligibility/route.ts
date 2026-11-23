import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { isEligibilityDecision } from "@/lib/providers/eligibility";
import { readRouterCheapEvidence } from "@/lib/providers/review-evidence-fetch";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import {
  listProviderReviewModels,
  setModelEligibility,
  setModelEligibilityBulk,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const { slug } = await context.params;
  const [models, evidence] = await Promise.all([
    listProviderReviewModels(slug),
    slug === "router-cheap" ? readRouterCheapEvidence() : Promise.resolve(null),
  ]);

  return Response.json({ models, evidence }, { headers: NO_STORE });
}

export async function PATCH(request: Request, context: Context) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const { slug } = await context.params;
  let body: {
    upstreamId?: unknown;
    upstreamIds?: unknown;
    decision?: unknown;
    source?: unknown;
    note?: unknown;
  };

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const upstreamId =
    typeof body.upstreamId === "string" ? body.upstreamId.trim() : "";
  const upstreamIds = Array.isArray(body.upstreamIds)
    ? body.upstreamIds.filter((id): id is string => typeof id === "string")
    : null;
  const decision = body.decision;
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!isEligibilityDecision(decision)) {
    return adminError(400, "decision must be chat, unsupported, or unknown.");
  }

  // A catalog review is a judgement about a whole list at once; recording it one
  // request at a time is what made a 277-model provider unreviewable in practice.
  if (upstreamIds) {
    const result = await setModelEligibilityBulk({
      providerSlug: slug,
      upstreamIds,
      decision,
      source,
      note,
    });

    if (result === "provider_not_found") {
      return adminError(404, "Provider not found.");
    }
    if (result === "empty") {
      return adminError(400, "At least one upstream model id is required.");
    }

    return Response.json(
      {
        ok: true,
        written: result.written,
        skipped: result.skipped,
        models: await listProviderReviewModels(slug),
      },
      { headers: NO_STORE },
    );
  }

  if (!upstreamId) return adminError(400, "An upstream model id is required.");

  const result = await setModelEligibility({
    providerSlug: slug,
    upstreamId,
    decision,
    source,
    note,
  });

  if (result === "provider_not_found") {
    return adminError(404, "Provider not found.");
  }
  if (result === "model_not_found") {
    return adminError(404, "Model not found for this provider.");
  }

  return Response.json(
    { ok: true, models: await listProviderReviewModels(slug) },
    { headers: NO_STORE },
  );
}
