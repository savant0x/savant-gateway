import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { listAllModels, setModelStatus } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["active", "disabled"]);

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json({ models: listAllModels() }, { headers: NO_STORE });
}

export async function PATCH(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: { id?: unknown; status?: unknown };

  try {
    body = (await request.json()) as { id?: unknown; status?: unknown };
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const id = typeof body.id === "string" ? body.id : "";
  const status = typeof body.status === "string" ? body.status : "";

  if (!id || !STATUSES.has(status)) {
    return adminError(400, "A model id and a valid status are required.");
  }

  if (!setModelStatus(id, status as "active" | "disabled")) {
    return adminError(404, "Model not found.");
  }

  return Response.json({ ok: true, id, status }, { headers: NO_STORE });
}
