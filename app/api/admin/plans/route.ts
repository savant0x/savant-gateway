import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { createPlan, deletePlan, listPlans, updatePlan } from "@/lib/store";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json({ plans: await listPlans() }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: unknown;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const result = await createPlan(body);

  if (!result.ok) return adminError(result.status, result.error);

  return Response.json({ ok: true, plan: result.plan }, { headers: NO_STORE });
}

export async function PATCH(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: { id?: unknown };

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";

  if (!id) return adminError(400, "A plan id is required.");

  const result = await updatePlan(id, body);

  if (!result.ok) return adminError(result.status, result.error);

  return Response.json({ ok: true, plan: result.plan }, { headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: { id?: unknown };

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";

  if (!id) return adminError(400, "A plan id is required.");

  const result = await deletePlan(id);

  if (!result.ok) return adminError(result.status, result.error);

  return Response.json({ ok: true }, { headers: NO_STORE });
}
