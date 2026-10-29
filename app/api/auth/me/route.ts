import {
  customerError,
  getCustomerSession,
  NO_STORE,
} from "@/lib/customer-auth";
import { getAccountSummary } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getCustomerSession();

  if (!customer) return customerError(401, "Sign in to continue.");

  return Response.json(
    { customer, account: getAccountSummary(customer.id) },
    { headers: NO_STORE },
  );
}
