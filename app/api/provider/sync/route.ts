import { guardLocalOrAdmin } from "@/lib/admin-auth";
import { ProviderConfigError, syncProvider } from "@/lib/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = await guardLocalOrAdmin(request);

  if (blocked) return blocked;

  try {
    const summary = await syncProvider();

    return Response.json({ ok: true, ...summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Provider sync failed";
    const status = error instanceof ProviderConfigError ? 400 : 502;

    return Response.json({ error: message }, { status });
  }
}
