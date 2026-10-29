import { guardLocalOrAdmin } from "@/lib/admin-auth";
import { createDevApiKey, listApiKeys } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardLocalOrAdmin(request);

  if (blocked) return blocked;

  return Response.json({ keys: listApiKeys() });
}

export async function POST(request: Request) {
  const blocked = await guardLocalOrAdmin(request);

  if (blocked) return blocked;

  let body: { name?: unknown } = {};

  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    // An empty body is fine; the key gets a default name.
  }

  const name = typeof body.name === "string" ? body.name : "";
  const created = createDevApiKey(name);

  return Response.json(created, { status: 201 });
}
