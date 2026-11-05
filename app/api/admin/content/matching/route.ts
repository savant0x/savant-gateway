import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import {
  readMatchingPolicy,
  saveMatchingPolicy,
} from "@/lib/content/store/matching";
import { startRematch } from "@/lib/content/store/rematch";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const db = await getDatabase();
  const matching = await readMatchingPolicy(db);

  return Response.json(matching, { headers: NO_STORE });
}

export async function PATCH(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  if (
    body.expectedRevision !== undefined &&
    (typeof body.expectedRevision !== "number" ||
      !Number.isInteger(body.expectedRevision) ||
      body.expectedRevision < 0)
  ) {
    return adminError(400, "expectedRevision must be a non-negative integer.");
  }

  const db = await getDatabase();
  const saved = await saveMatchingPolicy(db, body);

  if (!saved.ok) return adminError(saved.status, saved.error);

  const run = await startRematch(db, "policy");

  return Response.json({ policy: saved.policy, run }, { headers: NO_STORE });
}
