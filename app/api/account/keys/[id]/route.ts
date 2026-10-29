import {
  customerError,
  NO_STORE,
  requireCustomerApi,
} from "@/lib/customer-auth";
import { revokeCustomerApiKey } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  const { id } = await context.params;

  if (!revokeCustomerApiKey(customer.id, id)) {
    return customerError(404, "API key not found.");
  }

  return Response.json({ ok: true }, { headers: NO_STORE });
}
