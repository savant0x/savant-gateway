import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { createProvider, getProvider, listProviders } from "@/lib/store";
import {
  providerEnableRefusal,
  readProviderInput,
} from "@/lib/providers/registry";
import { refreshEnabledProviderAccounts } from "@/lib/providers/runtime";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";

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

  if (await getProvider(input.value.slug)) {
    return adminError(409, "A provider with that slug already exists.");
  }

  const provider = await createProvider(input.value);

  return Response.json(
    { ok: true, provider },
    { status: 201, headers: NO_STORE },
  );
}
