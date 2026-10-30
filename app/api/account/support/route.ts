import {
  customerError,
  NO_STORE,
  requireCustomerApi,
} from "@/lib/customer-auth";
import { supportLimiter } from "@/lib/customer-rate-limit";
import { createSupportRequest, listSupportRequestsForUser } from "@/lib/store";
import { readSupportRequest } from "@/lib/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  return Response.json(
    { requests: listSupportRequestsForUser(customer.id) },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  const decision = supportLimiter.check(customer.id);

  if (!decision.allowed) {
    return customerError(
      429,
      `Too many support requests. Retry in ${decision.retryAfterSeconds}s.`,
      { "Retry-After": String(decision.retryAfterSeconds) },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return customerError(400, "Invalid JSON body.");
  }

  const parsed = readSupportRequest(body);

  if (!parsed.ok) return customerError(400, parsed.error);

  supportLimiter.fail(customer.id);

  const created = createSupportRequest({
    userId: customer.id,
    ...parsed.value,
  });

  return Response.json(
    {
      request: {
        id: created.id,
        kind: created.kind,
        subject: created.subject,
        status: created.status,
        createdAt: created.createdAt,
      },
    },
    { status: 201, headers: NO_STORE },
  );
}
