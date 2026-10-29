import { guardLocalOrAdmin } from "@/lib/admin-auth";
import { sanitizeError } from "@/lib/http";
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
    if (error instanceof ProviderConfigError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json(
      { error: sanitizeError("provider.sync", error, "Provider sync failed") },
      { status: 502 },
    );
  }
}
