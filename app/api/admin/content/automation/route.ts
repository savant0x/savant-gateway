import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { automationHealth } from "@/lib/content/automation";
import { contentCronSecret } from "@/lib/content/policy";
import {
  automationSnapshot,
  saveAutomationPolicy,
} from "@/lib/content/store/automation";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const db = await getDatabase();
  const snapshot = await automationSnapshot(db);
  const secretConfigured = Boolean(contentCronSecret());
  const health = automationHealth(
    snapshot.policy,
    snapshot.lastRun,
    secretConfigured,
    snapshot.dueCount,
  );

  return Response.json(
    { ...snapshot, secretConfigured, health },
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

  const db = await getDatabase();
  const saved = await saveAutomationPolicy(db, body);

  if (!saved.ok) return adminError(saved.status, saved.error);

  return Response.json({ policy: saved.policy }, { headers: NO_STORE });
}
