import { guardLocalOrAdmin, NO_STORE } from "@/lib/admin-auth";
import { sanitizeError } from "@/lib/http";
import { refreshProviderRuntime } from "@/lib/providers/runtime";
import { quotaIsCurrent } from "@/lib/provider-quota";
import { getProvider, getProviderStatusBySlug } from "@/lib/store/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardLocalOrAdmin(request);

  if (blocked) return blocked;

  const slug = new URL(request.url).searchParams.get("slug") ?? "savant";

  if (!getProvider(slug)) {
    return Response.json(
      { error: "Unknown provider." },
      { status: 404, headers: NO_STORE },
    );
  }

  try {
    const result = await refreshProviderRuntime(slug);
    const provider = getProviderStatusBySlug(slug);
    const ok = result.warnings.length === 0 && quotaIsCurrent(provider);

    return Response.json(
      { ok, provider },
      { status: ok ? 200 : 503, headers: NO_STORE },
    );
  } catch (error) {
    return Response.json(
      {
        error: sanitizeError(
          "provider.runtime",
          error,
          "Provider account check unavailable.",
        ),
      },
      { status: 503, headers: NO_STORE },
    );
  }
}
