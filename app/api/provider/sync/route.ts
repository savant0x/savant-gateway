import { ProviderConfigError, syncProvider } from "@/lib/provider";
import { localOnlyError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = localOnlyError(request);

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
