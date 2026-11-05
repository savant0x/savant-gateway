import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { ACTIVITY_KINDS, type ActivityKind } from "@/lib/activity";
import { getDatabase } from "@/lib/storage/runtime";
import { activityCounts } from "@/lib/storage/store/activity";
import { listActivity } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLimit(value: string | null) {
  if (!value) return 50;

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? Math.min(100, Math.max(1, parsed)) : 50;
}

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind")?.trim();
  const userId = url.searchParams.get("userId")?.trim();

  if (kindParam && !(ACTIVITY_KINDS as readonly string[]).includes(kindParam)) {
    return adminError(400, "Unknown activity kind.");
  }

  const until = new Date().toISOString();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const db = await getDatabase();

  return Response.json(
    {
      events: await listActivity(parseLimit(url.searchParams.get("limit")), {
        userId: userId || undefined,
        kind: (kindParam || undefined) as ActivityKind | undefined,
      }),
      summary: await activityCounts(db, { since, until }),
    },
    { headers: NO_STORE },
  );
}
