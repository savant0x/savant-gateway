import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import {
  countOpenSupportRequests,
  listSupportRequests,
  resolveSupportRequest,
} from "@/lib/store";
import { readResolutionNote } from "@/lib/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json(
    {
      requests: listSupportRequests(200),
      open: countOpenSupportRequests(),
    },
    { headers: NO_STORE },
  );
}

export async function PATCH(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: { id?: unknown; note?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";

  if (!id) return adminError(400, "A request id is required.");

  const note = readResolutionNote(body);

  if (!note.ok) return adminError(400, note.error);

  const resolved = resolveSupportRequest(id, note.value);

  if (!resolved) return adminError(404, "Support request not found.");

  return Response.json({ ok: true, request: resolved }, { headers: NO_STORE });
}
