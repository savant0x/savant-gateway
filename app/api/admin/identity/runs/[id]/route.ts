import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { actOnRun, isIdentityAction } from "@/lib/identity/actions";
import { readIdentityCaps } from "@/lib/identity/estimate";
import { startIdentityRuns } from "@/lib/identity/server-deps";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  if (!isIdentityAction(body.action)) {
    return adminError(
      400,
      "action must be start, publish, unpublish, cancel, or confirm_mismatch.",
    );
  }

  if (body.note !== undefined && typeof body.note !== "string") {
    return adminError(400, "note must be a string.");
  }

  const caps = readIdentityCaps();

  // Disabling the switch stops new probe traffic; it must not stop the
  // operator from publishing, unpublishing, cancelling, or correcting a result
  // that already exists.
  if (body.action === "start" && !caps.enabled) {
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

  const { id } = await context.params;
  const result = await actOnRun(
    db,
    id,
    body.action,
    typeof body.note === "string" ? body.note : "",
  );

  if (!result.ok) return adminError(result.status, result.error);

  if (result.dispatch) {
    startIdentityRuns(db, [result.run.id], caps);
  }

  return Response.json(
    {
      run: result.run,
      verdict: result.verdict,
      started: result.dispatch,
    },
    { status: result.status, headers: NO_STORE },
  );
}
