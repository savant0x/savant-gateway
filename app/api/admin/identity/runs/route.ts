import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { createIdentityRuns } from "@/lib/identity/create";
import { readIdentityCaps, sumEstimates } from "@/lib/identity/estimate";
import { startIdentityRuns } from "@/lib/identity/server-deps";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = ["baseline", "verify"] as const;

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const modelIds = body.modelIds;

  if (
    !Array.isArray(modelIds) ||
    modelIds.some((id) => typeof id !== "string" || id.trim() === "")
  ) {
    return adminError(400, "modelIds must be an array of non-empty strings.");
  }

  const mode = body.mode;

  if (typeof mode !== "string" || !MODES.includes(mode as never)) {
    return adminError(400, "mode must be baseline or verify.");
  }

  if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") {
    return adminError(400, "dryRun must be a boolean.");
  }

  const caps = readIdentityCaps();

  if (!caps.enabled) {
    return adminError(
      503,
      "Identity verification is disabled. Set IDENTITY_ENABLED=true.",
    );
  }

  let db;

  try {
    db = await getDatabase();
  } catch (error) {
    return adminError(
      503,
      `Identity storage is not configured: ${
        error instanceof Error ? error.message : "no database handle."
      }`,
    );
  }

  const result = await createIdentityRuns(
    db,
    {
      modelIds: modelIds as string[],
      mode: mode as (typeof MODES)[number],
      dryRun: body.dryRun === true,
    },
    caps,
  );

  if (!result.ok) return adminError(result.status, result.error);

  const estimate = sumEstimates(result.estimates);
  const runs = result.runIds.map((id, index) => ({
    id,
    modelId: result.modelIds[index],
    estimate: result.estimates[index],
  }));

  if (body.dryRun === true) {
    return Response.json(
      { dryRun: true, estimate, runs: [], estimates: result.estimates },
      { headers: NO_STORE },
    );
  }

  startIdentityRuns(db, result.runIds, caps);

  return Response.json(
    { dryRun: false, estimate, runs },
    { status: 202, headers: NO_STORE },
  );
}
