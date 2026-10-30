import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { createProvider, getProvider, listProviders } from "@/lib/store";
import { readProviderInput } from "@/lib/providers/registry";
import { refreshEnabledProviderAccounts } from "@/lib/providers/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  await refreshEnabledProviderAccounts();

  return Response.json({ providers: listProviders() }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const input = readProviderInput(body);

  if (!input.ok) return adminError(400, input.error);
  if (getProvider(input.value.slug)) {
    return adminError(409, "A provider with that slug already exists.");
  }

  const provider = createProvider(input.value);

  return Response.json(
    { ok: true, provider },
    { status: 201, headers: NO_STORE },
  );
}
