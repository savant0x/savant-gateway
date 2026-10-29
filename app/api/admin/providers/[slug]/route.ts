import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { readProviderInput } from "@/lib/providers/registry";
import { deleteProvider, getProvider, updateProvider } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, context: Context) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const { slug } = await context.params;
  const existing = getProvider(slug);

  if (!existing) return adminError(404, "Provider not found.");

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const input = readProviderInput({
    ...existing,
    ...body,
    slug: existing.slug,
  });

  if (!input.ok) return adminError(400, input.error);

  const provider = updateProvider(slug, input.value);

  if (!provider) return adminError(404, "Provider not found.");

  return Response.json({ ok: true, provider }, { headers: NO_STORE });
}

export async function DELETE(request: Request, context: Context) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const { slug } = await context.params;

  if (slug === "savant") {
    return adminError(400, "The default provider cannot be deleted.");
  }

  if (!deleteProvider(slug)) {
    return adminError(404, "Provider not found.");
  }

  return Response.json({ ok: true }, { headers: NO_STORE });
}
