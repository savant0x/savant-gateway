import {
  customerError,
  NO_STORE,
  requireCustomerApi,
} from "@/lib/customer-auth";
import { POLICY_VERSION } from "@/lib/legal";
import { recordPolicyAcceptance } from "@/lib/store";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records that the signed-in customer accepted the current policy version.
 * Only the current version can be accepted; an older version stays readable at
 * its permanent route but is never the thing a customer agrees to.
 */
export async function POST(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  let body: unknown;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const version =
    typeof body === "object" && body !== null
      ? (body as { version?: unknown }).version
      : undefined;

  if (version !== POLICY_VERSION) {
    return customerError(400, "That policy version is not the current one.");
  }

  const acceptance = await recordPolicyAcceptance({
    userId: customer.id,
    version: POLICY_VERSION,
    source: "account",
  });

  return Response.json(
    {
      acceptance: {
        version: acceptance.version,
        source: acceptance.source,
        acceptedAt: acceptance.acceptedAt,
      },
    },
    { status: 201, headers: NO_STORE },
  );
}
