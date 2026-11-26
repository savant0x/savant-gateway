import type { ProviderRecord } from "@/lib/providers/types";

import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { sanitizeError } from "@/lib/http";
import { syncAfterSave } from "@/lib/providers/enable-sync";
import {
  providerElectionRefusal,
  providerEnableRefusal,
  providerKeyConfigured,
  readProviderInput,
} from "@/lib/providers/registry";
import { refreshEnabledProviderAccounts } from "@/lib/providers/runtime";
import { syncProvider } from "@/lib/providers/sync";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import {
  createProvider,
  getDefaultProviderSlug,
  getProvider,
  listProviders,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  await refreshEnabledProviderAccounts();

  return Response.json(
    { providers: await listProviders() },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: unknown;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const input = readProviderInput(body);

  if (!input.ok) return adminError(400, input.error);

  const refusal = providerEnableRefusal(input.value);

  if (refusal) return adminError(409, refusal);

  if (input.value.enabled) {
    const election = providerElectionRefusal(
      await getDefaultProviderSlug(),
      input.value.slug,
    );

    if (election) return adminError(409, election);
  }

  if (await getProvider(input.value.slug)) {
    return adminError(409, "A provider with that slug already exists.");
  }

  const provider = await createProvider(input.value);

  if (!provider) {
    return adminError(
      500,
      "The provider was written but could not be read back.",
    );
  }

  const sync = await syncCreatedProvider(provider);

  return Response.json(
    { ok: true, provider, ...sync },
    { status: 201, headers: NO_STORE },
  );
}

/**
 * A provider registered ready to serve reads its catalog once, so the page the
 * operator lands on shows models instead of a zero that looks like a bad key.
 * A failed read is reported and never fails the registration.
 */
async function syncCreatedProvider(provider: ProviderRecord) {
  const configured = providerKeyConfigured(provider.keyEnvVar);

  if (!syncAfterSave({ before: null, after: provider, configured })) return {};

  try {
    return { sync: await syncProvider(provider.slug) };
  } catch (error) {
    return {
      syncError: sanitizeError(
        "admin.provider.create-sync",
        error,
        "The catalog could not be read; the provider was saved. Retry with Sync.",
      ),
    };
  }
}
