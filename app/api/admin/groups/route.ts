import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import {
  readGroupCreateInput,
  readGroupReassignment,
  readGroupUpdateInput,
} from "@/lib/model-groups";
import {
  createModelGroup,
  deleteModelGroup,
  getModelGroup,
  listModelGroups,
  updateModelGroup,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json({ groups: listModelGroups() }, { headers: NO_STORE });
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

  const parsed = readGroupCreateInput(body);

  if (!parsed.ok) return adminError(400, parsed.error);

  const result = createModelGroup(parsed.value);

  if (!result.ok) return adminError(result.status, result.error);

  return Response.json(
    { ok: true, group: result.group },
    { headers: NO_STORE },
  );
}

export async function PATCH(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const slug =
    body &&
    typeof body === "object" &&
    typeof (body as { slug?: unknown }).slug === "string"
      ? (body as { slug: string }).slug.trim()
      : "";

  if (!slug) return adminError(400, "A group slug is required.");

  const parsed = readGroupUpdateInput(body);

  if (!parsed.ok) return adminError(400, parsed.error);

  const result = updateModelGroup(slug, parsed.value);

  if (!result.ok) return adminError(result.status, result.error);

  return Response.json(
    { ok: true, group: result.group },
    { headers: NO_STORE },
  );
}

export async function DELETE(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: { slug?: unknown; reassignTo?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";

  if (!slug) return adminError(400, "A group slug is required.");

  if (!getModelGroup(slug)) return adminError(404, "Group not found.");

  const groups = listModelGroups();
  const reassignment = readGroupReassignment({
    slug,
    reassignTo: body.reassignTo,
    groups,
  });

  if (!reassignment.ok) return adminError(400, reassignment.error);

  const result = deleteModelGroup(slug, reassignment.value);

  if (!result.ok) return adminError(result.status, result.error);

  return Response.json({ ok: true }, { headers: NO_STORE });
}
