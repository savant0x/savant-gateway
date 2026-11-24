import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { sanitizeError } from "@/lib/http";
import { previewProviderCatalog } from "@/lib/providers/preview";
import { providerPreviewFetch } from "@/lib/providers/request";
import { getDefaultProviderSlug, getProvider } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/**
 * Reads a provider's catalog and reports what an import would do, without
 * importing anything and without requiring a key. The import path keeps its hard
 * gate: this answers "what would I get", not "publish it".
 */
export async function POST(request: Request, context: Context) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const { slug } = await context.params;
  const provider = await getProvider(slug);

  if (!provider) return adminError(404, "Provider not found.");

  try {
    const preview = await previewProviderCatalog(provider, {
      request: providerPreviewFetch,
      defaultSlug: await getDefaultProviderSlug(),
    });

    return Response.json({ ok: true, ...preview }, { headers: NO_STORE });
  } catch (error) {
    return adminError(
      502,
      sanitizeError(
        "admin.provider.preview",
        error,
        "The provider catalog could not be read.",
      ),
    );
  }
}
