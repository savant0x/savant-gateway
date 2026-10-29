import { guardLocalOrAdmin } from "@/lib/admin-auth";
import { listUsage } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardLocalOrAdmin(request);

  if (blocked) return blocked;

  return Response.json({ usage: listUsage(50) });
}
