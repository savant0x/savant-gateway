import { guardLocalOrAdmin } from "@/lib/admin-auth";
import { createDevApiKey, listApiKeys } from "@/lib/store";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";

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
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const name = typeof body.name === "string" ? body.name : "";
  const created = createDevApiKey(name);

  return Response.json(created, { status: 201 });
}
