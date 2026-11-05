import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { isEligibilityDecision } from "@/lib/providers/eligibility";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { listProviderReviewModels, setModelEligibility } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const { slug } = await context.params;

  return Response.json(
    { models: await listProviderReviewModels(slug) },
    { headers: NO_STORE },
  );
}

export async function PATCH(request: Request, context: Context) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const { slug } = await context.params;
  let body: {
    upstreamId?: unknown;
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
  const decision = body.decision;
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!upstreamId) return adminError(400, "An upstream model id is required.");

  if (!isEligibilityDecision(decision)) {
    return adminError(400, "decision must be chat, unsupported, or unknown.");
  }

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
