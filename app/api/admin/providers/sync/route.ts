import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { sanitizeError } from "@/lib/http";
import { syncAllEnabled } from "@/lib/providers/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  try {
    const summary = await syncAllEnabled();

    return Response.json({ ok: true, ...summary }, { headers: NO_STORE });
  } catch (error) {
    return adminError(
      502,
      sanitizeError("admin.providers.sync", error, "Provider sync failed"),
    );
  }
}
