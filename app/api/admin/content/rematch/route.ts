import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import {
  cancelRematch,
  latestRematchRun,
  runRematchBounded,
} from "@/lib/content/store/rematch";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const db = await getDatabase();

  return Response.json(
    { run: await latestRematchRun(db) },
    { headers: NO_STORE },
  );
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

  if (body.action !== "cancel") {
    return adminError(400, "action must be cancel.");
  }

  const db = await getDatabase();
  const latest = await latestRematchRun(db);
  const runId =
    typeof body.runId === "string" && body.runId.trim()
      ? body.runId.trim()
      : latest?.id;

  if (!runId) return adminError(404, "No rematch run exists.");

  const run = await cancelRematch(db, runId);

  return run
    ? Response.json({ run }, { headers: NO_STORE })
    : adminError(409, "That rematch is no longer cancellable.");
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const requested =
    typeof body.limit === "number" && Number.isInteger(body.limit)
      ? body.limit
      : 50;

  if (requested < 1 || requested > 100) {
    return adminError(400, "limit must be between 1 and 100.");
  }

  const db = await getDatabase();
  const run = await runRematchBounded(db, {
    trigger: "manual",
    limit: requested,
    deadlineMs: 5_000,
  });

  return Response.json({ run }, { headers: NO_STORE });
}
