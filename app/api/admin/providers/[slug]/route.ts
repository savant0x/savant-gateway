import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import {
  providerEnableRefusal,
  readProviderInput,
} from "@/lib/providers/registry";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { deleteProvider, getProvider, updateProvider } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, context: Context) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const { slug } = await context.params;
  const existing = await getProvider(slug);

  if (!existing) return adminError(404, "Provider not found.");

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const input = readProviderInput({
    ...existing,
    ...body,
    slug: existing.slug,
  });

  if (!input.ok) return adminError(400, input.error);

  // Enabling is a runtime claim: this process must see the key that would
  // serve the call. A disabled save and a key fix remain available so an
  // already-broken record can be repaired.
  const refusal = providerEnableRefusal(input.value);

  if (refusal) return adminError(409, refusal);

  const provider = await updateProvider(slug, input.value);

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

  if (!(await deleteProvider(slug))) {
    return adminError(404, "Provider not found.");
  }

  return Response.json({ ok: true }, { headers: NO_STORE });
}
