import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { sanitizeError } from "@/lib/http";
import { syncAfterSave } from "@/lib/providers/enable-sync";
import { syncProvider } from "@/lib/providers/sync";
import {
  providerElectionRefusal,
  providerEnableRefusal,
  providerKeyConfigured,
  readProviderInput,
} from "@/lib/providers/registry";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import {
  deleteProvider,
  getDefaultProviderSlug,
  getProvider,
  setDefaultProvider,
  updateProvider,
} from "@/lib/store";

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

  if (input.value.enabled) {
    const election = providerElectionRefusal(
      await getDefaultProviderSlug(),
      slug,
    );

    if (election) return adminError(409, election);
  }

  const provider = await updateProvider(slug, input.value);

  if (!provider) return adminError(404, "Provider not found.");

  const configured = providerKeyConfigured(provider.keyEnvVar);
  const sync = syncAfterSave({ before: existing, after: provider, configured })
    ? await readCatalogOnce(slug)
    : {};

  return Response.json({ ok: true, provider, ...sync }, { headers: NO_STORE });
}

/**
 * The save that makes a provider able to serve also reads its catalog, so the
 * operator sees the models that prove the key took. A vendor failure is
 * reported beside the saved configuration instead of undoing it.
 */
async function readCatalogOnce(slug: string) {
  try {
    return { sync: await syncProvider(slug) };
  } catch (error) {
    return {
      syncError: sanitizeError(
        "admin.provider.update-sync",
        error,
        "The catalog could not be read; the configuration was saved. Retry with Sync.",
      ),
    };
  }
}

/**
 * Moves the default provider.
 *
 * The default owns the unprefixed public id namespace, so this is the one action
 * in the registry that changes what a future sync publishes. It answers with the
 * measured number of published rows on each side, and the UI states them before
 * the operator confirms instead of leaving the consequence to be discovered after
 * a sync.
 */
export async function POST(request: Request, context: Context) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const { slug } = await context.params;

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  if (body.action !== "make-default") {
    return adminError(400, 'action must be "make-default".');
  }

  const change = await setDefaultProvider(slug);

  if (!change) return adminError(404, "Provider not found.");

  return Response.json({ ok: true, ...change }, { headers: NO_STORE });
}

export async function DELETE(request: Request, context: Context) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const { slug } = await context.params;

  if (slug === (await getDefaultProviderSlug())) {
    return adminError(
      400,
      "The default provider cannot be deleted: it owns the published catalog identity. Make another provider the default first, then delete this one.",
    );
  }

  if (!(await deleteProvider(slug))) {
    return adminError(404, "Provider not found.");
  }

  return Response.json({ ok: true }, { headers: NO_STORE });
}
