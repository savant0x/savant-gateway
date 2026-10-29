import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { sanitizeError } from "@/lib/http";
import { syncProvider } from "@/lib/providers/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Context) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const { slug } = await context.params;

  try {
    const summary = await syncProvider(slug);

    return Response.json({ ok: true, ...summary }, { headers: NO_STORE });
  } catch (error) {
    return adminError(
      502,
      sanitizeError("admin.provider.sync", error, "Provider sync failed"),
    );
  }
}
