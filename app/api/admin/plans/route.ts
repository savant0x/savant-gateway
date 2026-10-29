import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { createPlan, deletePlan, listPlans, updatePlan } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json({ plans: listPlans() }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const result = createPlan(body);

  if (!result.ok) return adminError(result.status, result.error);

  return Response.json({ ok: true, plan: result.plan }, { headers: NO_STORE });
}

export async function PATCH(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: { id?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";

  if (!id) return adminError(400, "A plan id is required.");

  const result = updatePlan(id, body);

  if (!result.ok) return adminError(result.status, result.error);

  return Response.json({ ok: true, plan: result.plan }, { headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: { id?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";

  if (!id) return adminError(400, "A plan id is required.");

  const result = deletePlan(id);

  if (!result.ok) return adminError(result.status, result.error);

  return Response.json({ ok: true }, { headers: NO_STORE });
}
