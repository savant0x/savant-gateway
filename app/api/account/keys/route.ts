import {
  customerError,
  NO_STORE,
  requireCustomerApi,
} from "@/lib/customer-auth";
import { createCustomerApiKey, listCustomerApiKeys } from "@/lib/store";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  return Response.json(
    { keys: listCustomerApiKeys(customer.id) },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  let body: { name?: unknown } = {};

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const name = typeof body.name === "string" ? body.name : "";

  if (name.length > 80) {
    return customerError(400, "Key names are limited to 80 characters.");
  }

  const created = createCustomerApiKey(customer.id, name);

  if (!created) {
    return customerError(
      429,
      "At most 10 active keys and 20 new keys per hour are allowed.",
      {
        "Retry-After": "3600",
      },
    );
  }

  return Response.json(created, { status: 201, headers: NO_STORE });
}
