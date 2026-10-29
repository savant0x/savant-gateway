import { localOnlyError } from "@/lib/http";
import { listUsage } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = localOnlyError(request);

  if (blocked) return blocked;

  return Response.json({ usage: listUsage(50) });
}
